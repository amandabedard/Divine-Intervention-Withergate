import { z } from 'zod';
import {
  BIOMES,
  DOMAINS,
  FACILITY_IDS,
  FORMS,
  GIFT_CATEGORIES,
  NODE_TYPES,
  PHASES,
  PROFESSIONS,
  QUEST_STATUSES,
  QUEST_TYPES,
  RELATIONS,
  RESOURCES,
  ROMANCE_STATES,
  STATS,
  TIERS,
  TOWNS,
} from './ids.ts';
import type {
  Biome,
  Domain,
  FacilityId,
  Form,
  GiftCategory,
  NodeType,
  Phase,
  Profession,
  QuestStatus,
  QuestType,
  Relation,
  Resource,
  Stat,
  Town,
} from './ids.ts';

export const ID_RE = /^[a-z][a-z0-9_]*$/;
export const ID = z
  .string()
  .regex(ID_RE, 'ids are lowercase letters, digits and underscores, starting with a letter');

export const TIER_EXPR_RE = new RegExp(`^(${TIERS.join('|')})([+-])?$`);
export const ROMANCE_EXPR_RE = new RegExp(`^(${ROMANCE_STATES.join('|')})([+-])?$`);
export const TierExpr = z
  .string()
  .regex(TIER_EXPR_RE, `expected a tier (${TIERS.join(', ')}) optionally followed by + or -`);
export const RomanceExpr = z
  .string()
  .regex(
    ROMANCE_EXPR_RE,
    `expected a romance state (${ROMANCE_STATES.join(', ')}) optionally followed by + or -`,
  );

export type FlagValue = boolean | number | string;
export const FlagValueSchema = z.union([z.boolean(), z.number(), z.string()]);

/**
 * The shared condition vocabulary (docs/content/conditions-and-effects.md).
 * Several keys in one object are ANDed; use any / all / not to combine.
 */
export interface Condition {
  // relationship (current speaker unless `villager` is given)
  tier?: string;
  romance?: string;
  friendship_min?: number;
  friendship_max?: number;
  romance_min?: number;
  met?: string;
  events_seen?: string[];
  topics_done?: string[];
  villager?: string;
  // player
  tags?: string[];
  any_tags?: string[];
  not_tags?: string[];
  stat_min?: Partial<Record<Stat, number>>;
  level_min?: number;
  domain_lean?: Domain | 'none';
  domain_points_min?: Partial<Record<Domain, number>>;
  faith_level_min?: number;
  form?: Form;
  label?: string;
  hp_below?: number;
  // progress
  flags?: string[];
  not_flags?: string[];
  flag_eq?: Record<string, FlagValue>;
  flag_min?: Record<string, number>;
  flag_max?: Record<string, number>;
  quest?: { id: string; status?: QuestStatus; stage?: string };
  quests_done_min?: { type?: QuestType; count: number };
  // world and time
  time?: Phase | Phase[];
  day_min?: number;
  day_max?: number;
  map?: string;
  town?: string;
  biome?: Biome;
  corruption_min?: number;
  corruption_max?: number;
  relations?: { between: [Town, Town]; is: Relation };
  in_expedition?: boolean;
  chance?: number;
  // Withergate
  facility?: FacilityId;
  not_facility?: FacilityId;
  villager_in_town?: string;
  villager_not_in_town?: string;
  residents_min?: number;
  resource_min?: Partial<Record<Resource, number>>;
  party_has?: string;
  party_has_profession?: Profession;
  party_size_max?: number;
  recruit_conditions_met?: string;
  // special contexts
  reason?: string;
  gift_category?: GiftCategory;
  node?: NodeType;
  // combinators
  any?: Condition[];
  all?: Condition[];
  not?: Condition;
}

const phaseOrPhases = z.union([z.enum(PHASES), z.array(z.enum(PHASES)).min(1)]);

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.strictObject({
    tier: TierExpr.optional(),
    romance: RomanceExpr.optional(),
    friendship_min: z.number().optional(),
    friendship_max: z.number().optional(),
    romance_min: z.number().optional(),
    met: ID.optional(),
    events_seen: z.array(ID).optional(),
    topics_done: z.array(ID).optional(),
    villager: ID.optional(),

    tags: z.array(ID).optional(),
    any_tags: z.array(ID).optional(),
    not_tags: z.array(ID).optional(),
    stat_min: z.partialRecord(z.enum(STATS), z.number()).optional(),
    level_min: z.number().optional(),
    domain_lean: z.enum([...DOMAINS, 'none']).optional(),
    domain_points_min: z.partialRecord(z.enum(DOMAINS), z.number()).optional(),
    faith_level_min: z.number().optional(),
    form: z.enum(FORMS).optional(),
    label: ID.optional(),
    hp_below: z.number().min(0).max(1).optional(),

    flags: z.array(z.string()).optional(),
    not_flags: z.array(z.string()).optional(),
    flag_eq: z.record(z.string(), FlagValueSchema).optional(),
    flag_min: z.record(z.string(), z.number()).optional(),
    flag_max: z.record(z.string(), z.number()).optional(),
    quest: z
      .strictObject({
        id: ID,
        status: z.enum(QUEST_STATUSES).optional(),
        stage: ID.optional(),
      })
      .optional(),
    quests_done_min: z
      .strictObject({ type: z.enum(QUEST_TYPES).optional(), count: z.number().int() })
      .optional(),

    time: phaseOrPhases.optional(),
    day_min: z.number().optional(),
    day_max: z.number().optional(),
    map: ID.optional(),
    town: ID.optional(),
    biome: z.enum(BIOMES).optional(),
    corruption_min: z.number().optional(),
    corruption_max: z.number().optional(),
    relations: z
      .strictObject({ between: z.tuple([z.enum(TOWNS), z.enum(TOWNS)]), is: z.enum(RELATIONS) })
      .optional(),
    in_expedition: z.boolean().optional(),
    chance: z.number().min(0).max(1).optional(),

    facility: z.enum(FACILITY_IDS).optional(),
    not_facility: z.enum(FACILITY_IDS).optional(),
    villager_in_town: ID.optional(),
    villager_not_in_town: ID.optional(),
    residents_min: z.number().int().optional(),
    resource_min: z.partialRecord(z.enum(RESOURCES), z.number()).optional(),
    party_has: ID.optional(),
    party_has_profession: z.enum(PROFESSIONS).optional(),
    party_size_max: z.number().int().optional(),
    recruit_conditions_met: ID.optional(),

    reason: z.string().optional(),
    gift_category: z.enum(GIFT_CATEGORIES).optional(),
    node: z.enum(NODE_TYPES).optional(),

    any: z.array(ConditionSchema).optional(),
    all: z.array(ConditionSchema).optional(),
    not: ConditionSchema.optional(),
  }),
);

/** Parse "friend+" into { tier: 'friend', op: '+' }. */
export function parseTierExpr(expr: string): { value: string; op: '' | '+' | '-' } {
  const m = /^([a-z_]+)([+-])?$/.exec(expr);
  if (!m) throw new Error(`bad tier expression: ${expr}`);
  return { value: m[1]!, op: (m[2] as '+' | '-' | undefined) ?? '' };
}

/** True if `actual` satisfies `expr` given an ordered list of values. */
export function matchesOrdered(order: readonly string[], actual: string, expr: string): boolean {
  const { value, op } = parseTierExpr(expr);
  const a = order.indexOf(actual);
  const e = order.indexOf(value);
  if (a < 0 || e < 0) return false;
  if (op === '+') return a >= e;
  if (op === '-') return a <= e;
  return a === e;
}
