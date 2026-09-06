import {
  DOMAINS,
  FIXED_FACILITIES,
  PHASES,
  RESOURCES,
  STATS,
  TAGS_BLOCKING_EXPEDITIONS,
  faithLevelFor,
  mapEntities,
} from '@withergate/shared';
import type { BattleState } from './combat/battle';
import type {
  ContentBundle,
  Domain,
  FlagValue,
  Form,
  Label,
  Phase,
  QuestStatus,
  Relation,
  Resource,
  RomanceState,
  Stat,
} from '@withergate/shared';

export const SAVE_VERSION = 1;

export interface PlayerState {
  name: string;
  form: Form;
  label: Label;
  stats: Record<Stat, number>;
  level: number;
  xp: number;
  hp: number;
  grace: number;
  energy: number;
  weaponId: string | null;
  /** Weapons the player owns; one is equipped at a time (chosen at Quarters). */
  weapons: string[];
  powers: string[];
  equippedPowers: string[];
  skillPoints: number;
  domainPoints: Record<Domain, number>;
  faith: number;
  tags: string[];
  /** Temporary tags: tag -> absolute phase index at which it expires. */
  tempTags: Record<string, number>;
  satchel: string[];
}

export interface VillagerState {
  met: boolean;
  friendship: number;
  romance: number;
  romanceState: RomanceState;
  resident: boolean;
  /** Left the game for good. */
  gone: boolean;
  energy: number;
  recoveryUntilDay: number;
  topicsDone: string[];
  eventsSeen: string[];
  recentChat: string[];
  giftedDay: number;
  chattedDay: number;
  flirtedDay: number;
  recruitAttempts: number;
  unhappy: { reason: string; daysLeft: number } | null;
}

export interface QuestState {
  status: QuestStatus;
  stage: string;
  startedDay: number;
}

export interface GameState {
  version: number;
  meta: { seed: number; created: string; playedPhases: number };
  player: PlayerState;
  time: { day: number; phase: Phase };
  where: { map: string; x: number; facing: 'left' | 'right' };
  town: {
    /** Completed facilities (the four fixed ones plus what was built). */
    facilities: string[];
    buildQueue: { facility: string; slot: string; daysLeft: number }[];
    /** Map slot id -> facility built there. */
    slots: Record<string, string>;
    resources: Record<Resource, number>;
    storage: Record<string, number>;
  };
  villagers: Record<string, VillagerState>;
  quests: Record<string, QuestState>;
  flags: Record<string, FlagValue>;
  choicesMade: string[];
  world: { corruption: number; relations: Record<string, Relation>; unlockedMaps: string[] };
  scheduleOverrides: Record<string, { map: string; spot: string; untilPhase: number }>;
  /** Companions travelling with you (up to 2). Chosen properly in Phase 7; the debug panel sets it until then. */
  party: string[];
  /** The fight in progress, or null. Never persisted across a save. */
  battle: BattleState | null;
  /** Messages that arrived overnight (messenger warnings, completed buildings), shown after sleeping. */
  notices: string[];
  log: string[];
  rng: number;
}

export interface NewGameOptions {
  name: string;
  form: Form;
  label: Label;
  stats: Record<Stat, number>;
  seed?: number;
  startMap?: string;
  startSpawn?: string;
}

export function defaultStats(content: ContentBundle): Record<Stat, number> {
  const s = content.progression.stats.start;
  return Object.fromEntries(STATS.map((k) => [k, s])) as Record<Stat, number>;
}

export function newGame(content: ContentBundle, opts: NewGameOptions): GameState {
  const seed = opts.seed ?? (Date.now() % 2147483647);
  const startMap = opts.startMap ?? (content.maps.withergate ? 'withergate' : Object.keys(content.maps)[0] ?? 'withergate');
  const map = content.maps[startMap];
  const spawn = map ? mapEntities(map, 'spawn').find((s) => s.id === (opts.startSpawn ?? 'default')) ?? mapEntities(map, 'spawn')[0] : undefined;
  const startingWeapons = Object.values(content.weapons)
    .filter((w) => w.source?.starting)
    .map((w) => w.id);
  const startingWeapon = startingWeapons[0] ?? null;
  const prog = content.progression;

  const state: GameState = {
    version: SAVE_VERSION,
    meta: { seed, created: new Date().toISOString(), playedPhases: 0 },
    player: {
      name: opts.name,
      form: opts.form,
      label: opts.label,
      stats: { ...opts.stats },
      level: 1,
      xp: 0,
      hp: prog.base.hp,
      grace: prog.grace.base + prog.grace.per_divinity * prog.base.divinity,
      energy: prog.energy.player_max,
      weaponId: startingWeapon,
      weapons: startingWeapons,
      powers: [],
      equippedPowers: [],
      skillPoints: 0,
      domainPoints: Object.fromEntries(DOMAINS.map((d) => [d, 0])) as Record<Domain, number>,
      faith: 0,
      tags: [opts.label],
      tempTags: {},
      satchel: [],
    },
    time: { day: 1, phase: 'morning' },
    where: { map: startMap, x: spawn?.x ?? 300, facing: spawn?.facing ?? 'right' },
    town: {
      facilities: [...FIXED_FACILITIES],
      buildQueue: [],
      slots: {},
      resources: { ...(Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>), gold: 50, wood: 20 },
      // DEV DEFAULT: two sample gifts so the gift menu can be tested before storage exists.
      storage: { whetstone: 1, hearty_stew: 1 },
    },
    villagers: {},
    quests: {},
    flags: {},
    choicesMade: [],
    world: { corruption: 1, relations: {}, unlockedMaps: [] },
    scheduleOverrides: {},
    party: [],
    battle: null,
    notices: [],
    log: [],
    rng: seed >>> 0,
  };
  return state;
}

/** Numeric bonuses granted by completed facilities (their `effects` lists). */
export interface TownBonuses {
  resource_income: Partial<Record<Resource, number>>;
  store_rates: number;
  energy_max: number;
  recovery_speed: number;
  caravan_safety: number;
  preview_nodes: number;
  incursion_defense: number;
  faith_gain: number;
  tavern_quality: number;
  actions: string[];
}

export function townBonuses(state: GameState, content: ContentBundle): TownBonuses {
  const t: TownBonuses = {
    resource_income: {},
    store_rates: 0,
    energy_max: 0,
    recovery_speed: 0,
    caravan_safety: 0,
    preview_nodes: 0,
    incursion_defense: 0,
    faith_gain: 0,
    tavern_quality: 0,
    actions: [],
  };
  const num = (v: unknown, fallback = 0) => (typeof v === 'number' ? v : fallback);
  for (const id of state.town.facilities) {
    for (const e of content.facilities[id]?.effects ?? []) {
      switch (e.type) {
        case 'resource_income': {
          const r = e.resource as Resource;
          t.resource_income[r] = (t.resource_income[r] ?? 0) + num(e.amount);
          break;
        }
        case 'store_rates': t.store_rates += num(e.percent); break;
        case 'energy_max': t.energy_max += num(e.amount); break;
        case 'recovery_speed': t.recovery_speed += num(e.days); break;
        case 'caravan_safety': t.caravan_safety += num(e.percent); break;
        case 'preview_nodes': t.preview_nodes += num(e.columns); break;
        case 'incursion_defense': t.incursion_defense += num(e.amount); break;
        case 'faith_gain': t.faith_gain += num(e.percent); break;
        case 'tavern_quality': t.tavern_quality += num(e.amount); break;
        case 'unlock_action': if (typeof e.action === 'string') t.actions.push(e.action); break;
        default: break;
      }
    }
  }
  return t;
}

export interface CombatStats {
  attack: number;
  defense: number;
  speed: number;
  divinity: number;
}

/** Attack / Defense / Speed / Divinity from level and the current leaning's growth. */
export function combatStats(state: GameState, content: ContentBundle): CombatStats {
  const p = content.progression;
  const lvl = state.player.level - 1;
  const lean = domainLean(state);
  const g = lean === 'none' ? {} : (p.lean_growth[lean] ?? {});
  return {
    attack: p.base.attack + (p.per_level.attack + (g.attack ?? 0)) * lvl,
    defense: p.base.defense + (p.per_level.defense + (g.defense ?? 0)) * lvl,
    speed: p.base.speed + (p.per_level.speed + (g.speed ?? 0)) * lvl,
    divinity: p.base.divinity + (p.per_level.divinity + (g.divinity ?? 0)) * lvl,
  };
}

/** Why an expedition cannot start right now, or null when it can. */
export function expeditionBlocker(state: GameState): string | null {
  const tags = activeTags(state);
  const blocking = TAGS_BLOCKING_EXPEDITIONS.find((t) => tags.includes(t));
  if (blocking) return `You are ${blocking}. Sleep it off first.`;
  if (state.player.energy <= 0) return 'You are too exhausted to travel.';
  return null;
}

export function villagerState(state: GameState, content: ContentBundle, id: string): VillagerState {
  let v = state.villagers[id];
  if (!v) {
    const profile = content.villagers[id]?.profile;
    v = {
      met: false,
      friendship: 0,
      romance: 0,
      romanceState: 'neutral',
      resident: false,
      gone: false,
      energy: profile?.energy ?? 6,
      recoveryUntilDay: 0,
      topicsDone: [],
      eventsSeen: [],
      recentChat: [],
      giftedDay: 0,
      chattedDay: 0,
      flirtedDay: 0,
      recruitAttempts: 0,
      unhappy: null,
    };
    state.villagers[id] = v;
  }
  return v;
}

export function phaseAbs(state: GameState): number {
  return state.time.day * PHASES.length + PHASES.indexOf(state.time.phase);
}

export function activeTags(state: GameState): string[] {
  const now = phaseAbs(state);
  const temp = Object.entries(state.player.tempTags)
    .filter(([, until]) => until > now)
    .map(([t]) => t);
  return [...new Set([...state.player.tags, ...temp])];
}

export function domainLean(state: GameState): Domain | 'none' {
  let best: Domain | 'none' = 'none';
  let bestPts = 0;
  let tie = false;
  for (const d of DOMAINS) {
    const p = state.player.domainPoints[d];
    if (p > bestPts) {
      best = d;
      bestPts = p;
      tie = false;
    } else if (p === bestPts && p > 0) {
      tie = true;
    }
  }
  return tie ? 'none' : best;
}

export function faithLevel(state: GameState, content: ContentBundle): number {
  return faithLevelFor(state.player.faith, content.progression.faith_levels);
}

export function maxHp(state: GameState, content: ContentBundle): number {
  const p = content.progression;
  const lean = domainLean(state);
  const extra = lean === 'none' ? 0 : (p.lean_growth[lean]?.hp ?? 0);
  return Math.round(p.base.hp + (p.per_level.hp + extra) * (state.player.level - 1));
}

export function maxGrace(state: GameState, content: ContentBundle): number {
  const p = content.progression;
  const divinity = p.base.divinity + p.per_level.divinity * (state.player.level - 1);
  return Math.round(p.grace.base + p.grace.per_divinity * divinity);
}

export function maxEnergy(state: GameState, content: ContentBundle): number {
  return content.progression.energy.player_max + townBonuses(state, content).energy_max;
}

export function residents(state: GameState): string[] {
  return Object.entries(state.villagers)
    .filter(([, v]) => v.resident && !v.gone)
    .map(([id]) => id);
}
