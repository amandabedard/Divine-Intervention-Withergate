// The corruption's cadence (Phase 8; decided G3, H1, F4): days without fighting it
// bring a warning, then someone unprotected is taken; a corruption expedition pauses
// the countdown while it lasts and resets it when finished. Also its slow spread
// and incursions on Withergate. Pure rules; the daily tick calls corruptionTick().
import type { Region, Resource } from '@withergate/shared';
import type { Ctx } from './ctx';
import { residents, townBonuses, villagerState } from './state';
import type { GameState } from './state';

export interface CorruptionClock {
  /** Day the corruption was last pushed back (or the game began). */
  lastCleared: number;
  /** Day the corruption last rose on its own (or was cleared). */
  lastRise: number;
  /** Days spent fighting it since then; they do not count as idle. */
  pausedDays: number;
  /** Day the warning was given, or null. */
  warnedDay: number | null;
  /** A corruption expedition is under way: the countdown is paused. */
  inDungeon: boolean;
  /** A dungeon was started since the warning, so nobody is taken this cycle. */
  startedSinceWarning: boolean;
  /** Villagers the corruption has taken, in order. */
  taken: string[];
}

export function newClock(day: number): CorruptionClock {
  return { lastCleared: day, lastRise: day, pausedDays: 0, warnedDay: null, inDungeon: false, startedSinceWarning: false, taken: [] };
}

/** A region counts as a corruption dungeon when it crosses corrupted ground. */
export const isCorruptionRegion = (region: Region | undefined): boolean => !!region?.biomes.includes('corrupted');

/** Days without fighting the corruption. */
export function idleDays(state: GameState): number {
  const c = state.world.clock;
  return Math.max(0, state.time.day - c.lastCleared - c.pausedDays);
}

const fill = (text: string, vars: Record<string, string>): string => text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

/** Villagers the corruption could claim: not living here, not protected, still around. */
export function claimable(ctx: Ctx): string[] {
  return Object.values(ctx.content.villagers)
    .filter((v) => !v.profile.protected)
    .map((v) => v.profile.id)
    .filter((id) => {
      const v = villagerState(ctx.state, ctx.content, id);
      return !v.resident && !v.gone;
    })
    .sort();
}

function takeSomeone(ctx: Ctx): string | null {
  const pool = claimable(ctx);
  if (!pool.length) return null;
  const id = ctx.rng.pick(pool);
  const profile = ctx.content.villagers[id]!.profile;
  villagerState(ctx.state, ctx.content, id).gone = true;
  ctx.state.world.clock.taken.push(id);
  const town = profile.home_town === 'none' ? 'the road' : profile.home_town.charAt(0).toUpperCase() + profile.home_town.slice(1);
  ctx.state.notices.push(fill(ctx.content.progression.corruption.taken, { name: profile.name, town }));
  ctx.requests.push({ kind: 'flash', text: ctx.content.progression.corruption.flash, color: 'purple' });
  ctx.requests.push({ kind: 'npc_refresh' });
  return id;
}

/** Corrupted things at the walls: the militia holds, or the stores suffer. */
export function incursion(ctx: Ctx): { repelled: boolean; lost: Partial<Record<Resource, number>> } {
  const s = ctx.state;
  const cfg = ctx.content.progression.corruption;
  const warriors = residents(s).filter((id) => ctx.content.villagers[id]?.profile.profession === 'warrior').length;
  const defense = townBonuses(s, ctx.content).incursion_defense + warriors;
  const threat = s.world.corruption - cfg.incursion_from + 1;
  if (defense >= threat) {
    s.notices.push(cfg.incursion_repelled);
    s.player.faith += 1;
    return { repelled: true, lost: {} };
  }
  const lost: Partial<Record<Resource, number>> = {};
  for (const [r, n] of Object.entries(s.town.resources) as [Resource, number][]) {
    if (r === 'gold' || n < 2) continue;
    const gone = Math.max(1, Math.floor(n * 0.15));
    s.town.resources[r] = n - gone;
    lost[r] = gone;
  }
  const text = Object.entries(lost).map(([r, n]) => `${n} ${r}`).join(', ') || 'nothing worth taking';
  s.notices.push(fill(cfg.incursion_hit, { lost: text }));
  return { repelled: false, lost };
}

/** Every morning. */
export function corruptionTick(ctx: Ctx): void {
  const s = ctx.state;
  const cfg = ctx.content.progression.corruption;
  const c = s.world.clock;
  if (c.inDungeon) {
    c.pausedDays += 1;
    return;
  }
  const idle = idleDays(s);
  const rise = () => {
    if (s.world.corruption < 10) s.world.corruption += 1;
    c.lastRise = s.time.day;
    s.notices.push(cfg.spread);
  };
  if (cfg.rise_every_days > 0 && s.time.day - c.lastRise >= cfg.rise_every_days) rise();
  if (c.warnedDay === null) {
    if (idle >= cfg.warning_days) {
      c.warnedDay = s.time.day;
      s.notices.push(cfg.warning);
    }
  } else if (!c.startedSinceWarning && s.time.day - c.warnedDay >= cfg.grace_days) {
    // nobody left to take: the corruption takes ground instead
    if (!takeSomeone(ctx)) rise();
    c.lastCleared = s.time.day;
    c.pausedDays = 0;
    c.warnedDay = null;
  }
  if (s.world.corruption >= cfg.incursion_from && ctx.rng.chance((s.world.corruption - cfg.incursion_from + 1) * 0.1)) incursion(ctx);
}

/** A corruption expedition begins: the countdown pauses, and the warning's grace is met. */
export function dungeonStarted(ctx: Ctx, region: Region | undefined): void {
  if (!isCorruptionRegion(region)) return;
  const c = ctx.state.world.clock;
  c.inDungeon = true;
  c.startedSinceWarning = true;
}

/** Its last checkpoint reached: the corruption is pushed back and the clock starts over. */
export function dungeonFinished(ctx: Ctx, region: Region | undefined): void {
  if (!isCorruptionRegion(region)) return;
  const c = ctx.state.world.clock;
  c.inDungeon = false;
  c.lastCleared = ctx.state.time.day;
  c.lastRise = ctx.state.time.day;
  c.pausedDays = 0;
  c.warnedDay = null;
  c.startedSinceWarning = false;
  ctx.state.notices.push(ctx.content.progression.corruption.cleared);
}

/** Turned back or died before the end: the countdown resumes, with a fresh grace if the warning stood. */
export function dungeonAbandoned(ctx: Ctx, region: Region | undefined): void {
  if (!isCorruptionRegion(region)) return;
  const c = ctx.state.world.clock;
  if (!c.inDungeon) return;
  c.inDungeon = false;
  c.startedSinceWarning = false;
  if (c.warnedDay !== null) c.warnedDay = ctx.state.time.day;
}
