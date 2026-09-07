import { z } from 'zod';
import { ConditionSchema, FlagValueSchema, ID, ID_RE } from './condition.ts';
import type { Condition, FlagValue } from './condition.ts';
import {
  DOMAINS,
  FACILITY_IDS,
  PHASES,
  RELATIONS,
  RESOURCES,
  ROMANCE_STATES,
  STATS,
  TIERS,
  TOWNS,
} from './ids.ts';
import type { Domain, FacilityId, Phase, Relation, Resource, RomanceState, Stat, Tier, Town } from './ids.ts';

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export interface RawBattle {
  enemy: string;
  on_win?: RawStep[];
  on_lose?: RawStep[];
}

/** Effects exactly as written in YAML (docs/content/conditions-and-effects.md). */
export interface RawEffects {
  friendship?: number | Record<string, number>;
  /** Friendship change for every current resident of Withergate (tavern gatherings). */
  friendship_residents?: number;
  romance?: number | Record<string, number>;
  set_tier?: Record<string, Tier>;
  set_romance?: RomanceState | Record<string, RomanceState>;
  introduce?: string[];
  tags?: string[];
  remove_tags?: string[];
  /** Temporary tags: tag -> duration in phases (e.g. drunk: 2 lasts evening and night). */
  temp_tags?: Record<string, number>;
  xp?: number;
  hp?: number;
  energy?: number;
  grace?: number;
  domain_points?: Partial<Record<Domain, number>>;
  faith?: number;
  skill_points?: number;
  unlock_power?: string;
  /** Weapons added to what the player owns (chosen at Quarters). */
  weapons?: string[];
  stat_check_bonus?: { stat: Stat; amount: number; until?: 'day_end' | 'expedition_end' };
  flags?: Record<string, FlagValue>;
  increment?: Record<string, number>;
  clear_flags?: string[];
  quest_start?: string;
  quest_advance?: string | { id: string; to?: string };
  quest_complete?: string;
  quest_fail?: string;
  resources?: Partial<Record<Resource, number>>;
  items?: Record<string, number>;
  relations?: { between: [Town, Town]; set: Relation };
  corruption?: number;
  recruit?: string;
  dismiss?: string;
  /** A character who travels with you without living in Withergate (Aldric on the way to Aboridge). */
  guest?: string;
  unguest?: string;
  build?: { facility: FacilityId; instant?: boolean };
  time?: number | Phase;
  teleport?: { map: string; spawn: string };
  schedule_override?: { villager: string; map: string; spot: string; until?: 'phase_end' | 'day_end' };
  battle?: RawBattle;
  start_cutscene?: string;
  start_event?: string;
  notify?: string;
  unlock_map?: string;
}

/** Effects after normalisation: identical except nested scripts are normalised Steps. */
export interface Effects extends Omit<RawEffects, 'battle'> {
  battle?: { enemy: string; on_win?: Step[]; on_lose?: Step[] };
}

const numOrPerVillager = z.union([z.number(), z.record(ID, z.number())]);

export const RawEffectsSchema: z.ZodType<RawEffects> = z.lazy(() =>
  z.strictObject({
    friendship: numOrPerVillager.optional(),
    friendship_residents: z.number().optional(),
    romance: numOrPerVillager.optional(),
    set_tier: z.record(ID, z.enum(TIERS)).optional(),
    set_romance: z.union([z.enum(ROMANCE_STATES), z.record(ID, z.enum(ROMANCE_STATES))]).optional(),
    introduce: z.array(ID).optional(),
    tags: z.array(ID).optional(),
    remove_tags: z.array(ID).optional(),
    temp_tags: z.record(ID, z.number().int().positive()).optional(),
    xp: z.number().optional(),
    hp: z.number().optional(),
    energy: z.number().optional(),
    grace: z.number().optional(),
    domain_points: z.partialRecord(z.enum(DOMAINS), z.number()).optional(),
    faith: z.number().optional(),
    skill_points: z.number().int().optional(),
    unlock_power: ID.optional(),
    weapons: z.array(ID).optional(),
    stat_check_bonus: z
      .strictObject({
        stat: z.enum(STATS),
        amount: z.number(),
        until: z.enum(['day_end', 'expedition_end']).optional(),
      })
      .optional(),
    flags: z.record(z.string(), FlagValueSchema).optional(),
    increment: z.record(z.string(), z.number()).optional(),
    clear_flags: z.array(z.string()).optional(),
    quest_start: ID.optional(),
    quest_advance: z.union([ID, z.strictObject({ id: ID, to: ID.optional() })]).optional(),
    quest_complete: ID.optional(),
    quest_fail: ID.optional(),
    resources: z.partialRecord(z.enum(RESOURCES), z.number()).optional(),
    items: z.record(ID, z.number()).optional(),
    relations: z
      .strictObject({ between: z.tuple([z.enum(TOWNS), z.enum(TOWNS)]), set: z.enum(RELATIONS) })
      .optional(),
    corruption: z.number().optional(),
    recruit: ID.optional(),
    dismiss: ID.optional(),
    guest: ID.optional(),
    unguest: ID.optional(),
    build: z.strictObject({ facility: z.enum(FACILITY_IDS), instant: z.boolean().optional() }).optional(),
    time: z.union([z.number().int(), z.enum(PHASES)]).optional(),
    teleport: z.strictObject({ map: ID, spawn: ID }).optional(),
    schedule_override: z
      .strictObject({
        villager: ID,
        map: ID,
        spot: ID,
        until: z.enum(['phase_end', 'day_end']).optional(),
      })
      .optional(),
    battle: RawBattleSchema.optional(),
    start_cutscene: ID.optional(),
    start_event: ID.optional(),
    notify: z.string().optional(),
    unlock_map: ID.optional(),
  }),
);

// ---------------------------------------------------------------------------
// Steps (raw)
// ---------------------------------------------------------------------------

export const STAGE_OPS = [
  'move',
  'face',
  'emote',
  'wait',
  'fade',
  'camera',
  'place',
  'anim',
  'sfx',
  'music',
] as const;
export type StageOp = (typeof STAGE_OPS)[number];

/** Keys that mean something in a script and therefore cannot be character ids. */
export const STEP_KEYWORDS: readonly string[] = [
  'say',
  'choice',
  'if',
  'select',
  'check',
  'effects',
  'goto',
  'run',
  'random',
  'end',
  'battle',
  'you',
  'narrate',
  'player',
  ...STAGE_OPS,
];

export const SPEAKER_KEY_RE = /^([a-z][a-z0-9_]*)(?:\(([a-z][a-z0-9_]*)\))?$/;

/** A step as written in YAML. Validated structurally by RawStepSchema. */
export type RawStep = string | Record<string, unknown>;
export type RawScript = RawStep[] | { nodes: Record<string, RawStep[]> };
/** A pool line: a bare string, a shorthand line, or a short exchange. */
export type RawLineEntry = string | Record<string, unknown> | RawStep[];

export interface CheckSpec {
  stat: Stat;
  dc: number;
}
export const CheckSpecSchema = z.strictObject({ stat: z.enum(STATS), dc: z.number().int() });

const RawStepList: z.ZodType<RawStep[]> = z.lazy(() => z.array(RawStepSchema));

const RawBattleSchema: z.ZodType<RawBattle> = z.lazy(() =>
  z.strictObject({ enemy: ID, on_win: RawStepList.optional(), on_lose: RawStepList.optional() }),
);

export const RawOptionSchema = z.lazy(() =>
  z.strictObject({
    text: z.string().min(1),
    requires: ConditionSchema.optional(),
    show_locked: z.boolean().optional(),
    locked_text: z.string().optional(),
    check: CheckSpecSchema.optional(),
    effects: RawEffectsSchema.optional(),
    then: RawStepList.optional(),
    success: RawStepList.optional(),
    fail: RawStepList.optional(),
    crit_success: RawStepList.optional(),
    crit_fail: RawStepList.optional(),
    once: z.boolean().optional(),
  }),
);

const SHORTHAND_SPEAKER_OK = (speaker: string): boolean =>
  speaker === 'you' || speaker === 'narrate' || !STEP_KEYWORDS.includes(speaker);

const ShorthandLineSchema = z
  .record(z.string(), z.string())
  .refine(
    (o) => {
      const keys = Object.keys(o);
      if (keys.length !== 1) return false;
      const m = SPEAKER_KEY_RE.exec(keys[0]!);
      return !!m && SHORTHAND_SPEAKER_OK(m[1]!);
    },
    {
      message:
        'a dialog line is written  speaker: "text"  or  speaker(mood): "text"  (speaker = character id, you, or narrate)',
    },
  );

export const RawStepSchema: z.ZodType<RawStep> = z.lazy(() =>
  z.union([
    z.string(),
    z.strictObject({
      say: z.string().regex(ID_RE),
      mood: ID.optional(),
      text: z.string(),
      portrait: z.boolean().optional(),
      sfx: ID.optional(),
      speed: z.enum(['slow', 'normal', 'fast']).optional(),
    }),
    z.strictObject({ choice: z.array(RawOptionSchema).min(1) }),
    z.strictObject({ if: ConditionSchema, then: RawStepList, else: RawStepList.optional() }),
    z.strictObject({
      select: z
        .array(
          z.union([
            z.strictObject({ when: ConditionSchema, then: RawStepList }),
            z.strictObject({ else: RawStepList }),
          ]),
        )
        .min(1),
    }),
    z.strictObject({
      check: CheckSpecSchema,
      success: RawStepList.optional(),
      fail: RawStepList.optional(),
      crit_success: RawStepList.optional(),
      crit_fail: RawStepList.optional(),
    }),
    z.strictObject({ effects: RawEffectsSchema }),
    z.strictObject({ goto: ID }),
    z.strictObject({ run: z.string().regex(/^[a-z][a-z0-9_]*(\/[a-z][a-z0-9_]*)*$/) }),
    z.strictObject({
      random: z
        .array(
          z.union([
            RawStepList,
            z.strictObject({ weight: z.number().positive().optional(), then: RawStepList }),
          ]),
        )
        .min(1),
    }),
    z.strictObject({ end: z.enum(['menu', 'close', 'scene']) }),
    z.strictObject({ battle: RawBattleSchema }),
    z.strictObject({
      move: z.strictObject({
        who: ID,
        to: ID,
        speed: z.enum(['walk', 'run']).optional(),
        wait: z.boolean().optional(),
      }),
    }),
    z.strictObject({
      face: z.strictObject({ who: ID, dir: z.enum(['left', 'right']).optional(), toward: ID.optional() }),
    }),
    z.strictObject({
      emote: z.strictObject({
        who: ID,
        icon: z.enum(['!', '?', 'heart', 'anger', 'sweat', 'note', 'zzz']),
      }),
    }),
    z.strictObject({ anim: z.strictObject({ who: ID, play: ID }) }),
    z.strictObject({ wait: z.number().nonnegative() }),
    z.strictObject({
      fade: z.union([
        z.enum(['in', 'out']),
        z.strictObject({
          dir: z.enum(['in', 'out']).optional(),
          to: z.string().optional(),
          seconds: z.number().nonnegative().optional(),
        }),
      ]),
    }),
    z.strictObject({
      camera: z.strictObject({ focus: ID.optional(), shake: z.number().optional(), pan: ID.optional() }),
    }),
    z.strictObject({ place: z.strictObject({ who: ID, at: ID }) }),
    z.strictObject({ sfx: ID }),
    z.strictObject({
      music: z.union([z.literal('stop'), ID, z.strictObject({ play: ID, fade: z.number().optional() })]),
    }),
    ShorthandLineSchema,
  ]),
);

export const RawScriptSchema: z.ZodType<RawScript> = z.lazy(() =>
  z.union([
    z.array(RawStepSchema),
    z
      .strictObject({ nodes: z.record(ID, z.array(RawStepSchema)) })
      .refine((o) => 'start' in o.nodes, { message: 'nodes must include a "start" node' }),
  ]),
);

export const RawLineEntrySchema: z.ZodType<RawLineEntry> = z.lazy(() =>
  z.union([z.string(), ShorthandLineSchema, z.array(RawStepSchema).min(1)]),
);

// ---------------------------------------------------------------------------
// Steps (normalised, what the game consumes)
// ---------------------------------------------------------------------------

export interface LineStep {
  kind: 'line';
  speaker: string; // character id, 'you', or 'narrate'
  mood?: string;
  text: string;
  portrait?: boolean;
  sfx?: string;
  speed?: 'slow' | 'normal' | 'fast';
  loc?: string;
}
export interface ChoiceOption {
  id: string;
  text: string;
  requires?: Condition;
  show_locked?: boolean;
  locked_text?: string;
  check?: CheckSpec;
  effects?: Effects;
  then?: Step[];
  success?: Step[];
  fail?: Step[];
  crit_success?: Step[];
  crit_fail?: Step[];
  once?: boolean;
}
export interface ChoiceStep {
  kind: 'choice';
  options: ChoiceOption[];
  loc?: string;
}
export interface IfStep {
  kind: 'if';
  cond: Condition;
  then: Step[];
  else?: Step[];
  loc?: string;
}
export interface SelectStep {
  kind: 'select';
  branches: { when?: Condition; then: Step[] }[];
  loc?: string;
}
export interface CheckStep {
  kind: 'check';
  stat: Stat;
  dc: number;
  success?: Step[];
  fail?: Step[];
  crit_success?: Step[];
  crit_fail?: Step[];
  loc?: string;
}
export interface EffectsStep {
  kind: 'effects';
  effects: Effects;
  loc?: string;
}
export interface GotoStep {
  kind: 'goto';
  node: string;
  loc?: string;
}
export interface RunStep {
  kind: 'run';
  script: string;
  loc?: string;
}
export interface RandomStep {
  kind: 'random';
  options: { weight: number; then: Step[] }[];
  loc?: string;
}
export interface EndStep {
  kind: 'end';
  mode: 'menu' | 'close' | 'scene';
  loc?: string;
}
export interface BattleStep {
  kind: 'battle';
  enemy: string;
  on_win?: Step[];
  on_lose?: Step[];
  loc?: string;
}
export interface StageStep {
  kind: 'stage';
  op: StageOp;
  args: Record<string, unknown>;
  loc?: string;
}
export type Step =
  | LineStep
  | ChoiceStep
  | IfStep
  | SelectStep
  | CheckStep
  | EffectsStep
  | GotoStep
  | RunStep
  | RandomStep
  | EndStep
  | BattleStep
  | StageStep;

export interface Script {
  nodes: Record<string, Step[]>;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

export type PathSeg = string | number;

export interface NormalizeCtx {
  /** Speaker used for bare string lines ("..."). The villager for their files, 'narrate' elsewhere. */
  defaultSpeaker: string;
  /** Prefix for generated option ids, unique per file. */
  idPrefix: string;
  /** Returns "file:line" for a YAML path, when available. */
  locate?: (path: PathSeg[]) => string | undefined;
  /** Mutable counter shared across one file. */
  counter: { n: number };
}

function loc(ctx: NormalizeCtx, path: PathSeg[]): string | undefined {
  return ctx.locate?.(path);
}

export function normalizeScript(raw: RawScript, ctx: NormalizeCtx, path: PathSeg[]): Script {
  if (Array.isArray(raw)) {
    return { nodes: { start: normalizeSteps(raw, ctx, path) } };
  }
  const nodes: Record<string, Step[]> = {};
  for (const [name, steps] of Object.entries(raw.nodes)) {
    nodes[name] = normalizeSteps(steps, ctx, [...path, 'nodes', name]);
  }
  return { nodes };
}

export function normalizeSteps(raw: RawStep[], ctx: NormalizeCtx, path: PathSeg[]): Step[] {
  return raw.map((s, i) => normalizeStep(s, ctx, [...path, i]));
}

export function normalizeLineEntry(raw: RawLineEntry, ctx: NormalizeCtx, path: PathSeg[]): Step[] {
  if (Array.isArray(raw)) return normalizeSteps(raw, ctx, path);
  return [normalizeStep(raw, ctx, path)];
}

function optSteps(v: unknown, ctx: NormalizeCtx, path: PathSeg[]): Step[] | undefined {
  return v === undefined ? undefined : normalizeSteps(v as RawStep[], ctx, path);
}

export function normalizeEffects(raw: RawEffects, ctx: NormalizeCtx, path: PathSeg[]): Effects {
  const { battle, ...rest } = raw;
  const out: Effects = { ...rest };
  if (battle) {
    out.battle = {
      enemy: battle.enemy,
      on_win: optSteps(battle.on_win, ctx, [...path, 'battle', 'on_win']),
      on_lose: optSteps(battle.on_lose, ctx, [...path, 'battle', 'on_lose']),
    };
  }
  return out;
}

function normalizeOption(raw: Record<string, unknown>, ctx: NormalizeCtx, path: PathSeg[]): ChoiceOption {
  const r = raw as z.output<typeof RawOptionSchema>;
  ctx.counter.n += 1;
  return {
    id: `${ctx.idPrefix}#${ctx.counter.n}`,
    text: r.text,
    requires: r.requires,
    show_locked: r.show_locked,
    locked_text: r.locked_text,
    check: r.check,
    effects: r.effects ? normalizeEffects(r.effects, ctx, [...path, 'effects']) : undefined,
    then: optSteps(r.then, ctx, [...path, 'then']),
    success: optSteps(r.success, ctx, [...path, 'success']),
    fail: optSteps(r.fail, ctx, [...path, 'fail']),
    crit_success: optSteps(r.crit_success, ctx, [...path, 'crit_success']),
    crit_fail: optSteps(r.crit_fail, ctx, [...path, 'crit_fail']),
    once: r.once,
  };
}

export function normalizeStep(raw: RawStep, ctx: NormalizeCtx, path: PathSeg[]): Step {
  const at = loc(ctx, path);
  if (typeof raw === 'string') {
    if (raw === 'end') return { kind: 'end', mode: 'menu', loc: at };
    return { kind: 'line', speaker: ctx.defaultSpeaker, text: raw, loc: at };
  }
  const o = raw as Record<string, any>;
  if ('say' in o) {
    return {
      kind: 'line',
      speaker: o.say,
      mood: o.mood,
      text: o.text,
      portrait: o.portrait,
      sfx: o.sfx,
      speed: o.speed,
      loc: at,
    };
  }
  if ('choice' in o) {
    const options = (o.choice as Record<string, unknown>[]).map((opt, i) =>
      normalizeOption(opt, ctx, [...path, 'choice', i]),
    );
    return { kind: 'choice', options, loc: at };
  }
  if ('if' in o) {
    return {
      kind: 'if',
      cond: o.if,
      then: normalizeSteps(o.then, ctx, [...path, 'then']),
      else: optSteps(o.else, ctx, [...path, 'else']),
      loc: at,
    };
  }
  if ('select' in o) {
    const branches = (o.select as Record<string, unknown>[]).map((b, i) =>
      'else' in b
        ? { then: normalizeSteps(b.else as RawStep[], ctx, [...path, 'select', i, 'else']) }
        : {
            when: b.when as Condition,
            then: normalizeSteps(b.then as RawStep[], ctx, [...path, 'select', i, 'then']),
          },
    );
    return { kind: 'select', branches, loc: at };
  }
  if ('check' in o) {
    return {
      kind: 'check',
      stat: o.check.stat,
      dc: o.check.dc,
      success: optSteps(o.success, ctx, [...path, 'success']),
      fail: optSteps(o.fail, ctx, [...path, 'fail']),
      crit_success: optSteps(o.crit_success, ctx, [...path, 'crit_success']),
      crit_fail: optSteps(o.crit_fail, ctx, [...path, 'crit_fail']),
      loc: at,
    };
  }
  if ('effects' in o) {
    return { kind: 'effects', effects: normalizeEffects(o.effects, ctx, [...path, 'effects']), loc: at };
  }
  if ('goto' in o) return { kind: 'goto', node: o.goto, loc: at };
  if ('run' in o) return { kind: 'run', script: o.run, loc: at };
  if ('random' in o) {
    const options = (o.random as unknown[]).map((entry, i) =>
      Array.isArray(entry)
        ? { weight: 1, then: normalizeSteps(entry as RawStep[], ctx, [...path, 'random', i]) }
        : {
            weight: ((entry as any).weight as number | undefined) ?? 1,
            then: normalizeSteps((entry as any).then as RawStep[], ctx, [...path, 'random', i, 'then']),
          },
    );
    return { kind: 'random', options, loc: at };
  }
  if ('end' in o) return { kind: 'end', mode: o.end, loc: at };
  if ('battle' in o) {
    return {
      kind: 'battle',
      enemy: o.battle.enemy,
      on_win: optSteps(o.battle.on_win, ctx, [...path, 'battle', 'on_win']),
      on_lose: optSteps(o.battle.on_lose, ctx, [...path, 'battle', 'on_lose']),
      loc: at,
    };
  }
  for (const op of STAGE_OPS) {
    if (op in o) {
      const v = o[op];
      const args: Record<string, unknown> =
        v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : { value: v };
      return { kind: 'stage', op, args, loc: at };
    }
  }
  // shorthand:  speaker(mood): "text"
  const keys = Object.keys(o);
  const key = keys[0] ?? '';
  const m = SPEAKER_KEY_RE.exec(key);
  if (keys.length === 1 && m) {
    return { kind: 'line', speaker: m[1]!, mood: m[2], text: String(o[key]), loc: at };
  }
  throw new Error(`unrecognised step at ${path.join('.')}: ${JSON.stringify(raw)}`);
}

/** Visit every step in a tree, including nested blocks. */
export function forEachStep(
  steps: Step[],
  fn: (step: Step, parents: Step[]) => void,
  parents: Step[] = [],
): void {
  for (const s of steps) {
    fn(s, parents);
    const next = [...parents, s];
    switch (s.kind) {
      case 'choice':
        for (const opt of s.options) {
          for (const k of ['then', 'success', 'fail', 'crit_success', 'crit_fail'] as const) {
            if (opt[k]) forEachStep(opt[k]!, fn, next);
          }
          if (opt.effects?.battle) {
            if (opt.effects.battle.on_win) forEachStep(opt.effects.battle.on_win, fn, next);
            if (opt.effects.battle.on_lose) forEachStep(opt.effects.battle.on_lose, fn, next);
          }
        }
        break;
      case 'if':
        forEachStep(s.then, fn, next);
        if (s.else) forEachStep(s.else, fn, next);
        break;
      case 'select':
        for (const b of s.branches) forEachStep(b.then, fn, next);
        break;
      case 'check':
        for (const k of ['success', 'fail', 'crit_success', 'crit_fail'] as const) {
          if (s[k]) forEachStep(s[k]!, fn, next);
        }
        break;
      case 'random':
        for (const o of s.options) forEachStep(o.then, fn, next);
        break;
      case 'battle':
        if (s.on_win) forEachStep(s.on_win, fn, next);
        if (s.on_lose) forEachStep(s.on_lose, fn, next);
        break;
      case 'effects':
        if (s.effects.battle?.on_win) forEachStep(s.effects.battle.on_win, fn, next);
        if (s.effects.battle?.on_lose) forEachStep(s.effects.battle.on_lose, fn, next);
        break;
      default:
        break;
    }
  }
}

/** Collect every Effects object reachable from a list of steps. */
export function collectEffects(steps: Step[]): Effects[] {
  const out: Effects[] = [];
  forEachStep(steps, (s) => {
    if (s.kind === 'effects') out.push(s.effects);
    if (s.kind === 'choice') for (const o of s.options) if (o.effects) out.push(o.effects);
  });
  return out;
}

/** Substitute {name}, {town}, {domain} in text. */
export function substituteText(
  text: string,
  vars: { name: string; town: string; domain: string },
): string {
  return text.replace(/\{(name|town|domain)\}/g, (_, k: keyof typeof vars) => vars[k]);
}
