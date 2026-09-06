import { tierForPoints } from '@withergate/shared';
import type { RomanceState, Tier } from '@withergate/shared';
import { evaluate } from './conditions';
import type { Ctx } from './ctx';
import { activeTags, domainLean, villagerState } from './state';

export const TIER_LABELS: Record<Tier, string> = {
  enemy: 'Enemy',
  disliked: 'Disliked',
  stranger: 'Stranger',
  acquaintance: 'Acquaintance',
  friend: 'Friend',
  best_friend: 'Best Friend',
};
export const ROMANCE_LABELS: Record<RomanceState, string> = {
  neutral: '',
  interest: 'Interested',
  lover: 'Lover',
};

const FRIENDSHIP_MIN = -100;
const FRIENDSHIP_MAX = 250;
const DEFAULT_INTEREST = { romance_min: 25, tier: 'acquaintance+' } as const;

export function tierOf(ctx: Ctx, id: string): Tier {
  return tierForPoints(villagerState(ctx.state, ctx.content, id).friendship);
}

/** Multiplier applied to positive friendship gains for this character right now. */
export function growthMultiplier(ctx: Ctx, id: string): number {
  const profile = ctx.content.villagers[id]?.profile;
  if (!profile) return 1;
  let m = 1;
  for (const tag of activeTags(ctx.state)) {
    const aff = profile.tag_affinity?.[tag];
    if (aff?.growth) m *= aff.growth;
  }
  const lean = domainLean(ctx.state);
  if (lean !== 'none') {
    const aff = profile.domain_affinity?.[lean];
    if (aff?.growth) m *= aff.growth;
  }
  const charisma = ctx.state.player.stats.charisma;
  if (charisma > 5) m *= 1 + 0.05 * (charisma - 5);
  return m;
}

/** Mark a character as met and apply starting bonuses from tags and leanings. */
export function introduce(ctx: Ctx, id: string): boolean {
  const v = villagerState(ctx.state, ctx.content, id);
  if (v.met) return false;
  v.met = true;
  const profile = ctx.content.villagers[id]?.profile;
  if (profile) {
    let bonus = 0;
    for (const tag of activeTags(ctx.state)) bonus += profile.tag_affinity?.[tag]?.start_bonus ?? 0;
    const lean = domainLean(ctx.state);
    if (lean !== 'none') bonus += profile.domain_affinity?.[lean]?.start_bonus ?? 0;
    if (bonus !== 0) v.friendship = clamp(v.friendship + bonus, FRIENDSHIP_MIN, FRIENDSHIP_MAX);
    ctx.notify(`You met ${profile.name}.`);
  }
  updateRomanceState(ctx, id);
  return true;
}

export function changeFriendship(ctx: Ctx, id: string, delta: number): number {
  const v = villagerState(ctx.state, ctx.content, id);
  const before = tierForPoints(v.friendship);
  let applied = delta;
  if (delta > 0) applied = Math.max(1, Math.round(delta * growthMultiplier(ctx, id)));
  v.friendship = clamp(v.friendship + applied, FRIENDSHIP_MIN, FRIENDSHIP_MAX);
  const after = tierForPoints(v.friendship);
  const name = ctx.content.villagers[id]?.profile.name ?? id;
  if (after !== before) ctx.notify(`${name}: ${TIER_LABELS[after]}`);
  updateRomanceState(ctx, id);
  return applied;
}

export function changeRomance(ctx: Ctx, id: string, delta: number): number {
  const profile = ctx.content.villagers[id]?.profile;
  if (!profile?.romanceable) return 0;
  const v = villagerState(ctx.state, ctx.content, id);
  v.romance = Math.max(0, v.romance + delta);
  updateRomanceState(ctx, id);
  return delta;
}

export function setRomanceState(ctx: Ctx, id: string, state: RomanceState): void {
  const profile = ctx.content.villagers[id]?.profile;
  if (!profile?.romanceable) return;
  const v = villagerState(ctx.state, ctx.content, id);
  if (v.romanceState === state) return;
  v.romanceState = state;
  if (state === 'lover') ctx.notify(`${profile.name} is now your lover.`);
}

/** Neutral -> Interest happens automatically; Lover is set by content (set_romance). */
export function updateRomanceState(ctx: Ctx, id: string): void {
  const profile = ctx.content.villagers[id]?.profile;
  if (!profile?.romanceable) return;
  const v = villagerState(ctx.state, ctx.content, id);
  if (v.romanceState !== 'neutral') return;
  const req = profile.romance?.interest_requires ?? DEFAULT_INTEREST;
  if (evaluate(req, { ...ctx, speaker: id })) {
    v.romanceState = 'interest';
    ctx.notify(`${profile.name} seems to have taken an interest in you.`);
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
