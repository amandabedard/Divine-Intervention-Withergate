import { z } from 'zod';
import { ConditionSchema, ID } from './condition.ts';
import type { Condition } from './condition.ts';
import {
  BIOMES,
  DAMAGE_TYPES,
  DOMAINS,
  FACILITY_IDS,
  NODE_TYPES,
  PHASES,
  PROFESSIONS,
  QUEST_TYPES,
  RESOURCES,
  STATS,
  STATUSES,
  TOWNS,
} from './ids.ts';
import { RawEffectsSchema, RawScriptSchema } from './script.ts';
import type { Effects, Script } from './script.ts';
import { StageSchema } from './villager.ts';
import type { Stage } from './villager.ts';

// Quests -------------------------------------------------------------------

const QuestStageSchema = z.strictObject({
  id: ID,
  objective: z.string().min(1),
  complete_when: ConditionSchema,
  on_enter: RawEffectsSchema.optional(),
  on_complete: RawEffectsSchema.optional(),
  checkpoint: ID.optional(),
});

export const QuestSchema = z.strictObject({
  id: ID,
  title: z.string().min(1),
  type: z.enum(QUEST_TYPES),
  giver: z.union([ID, z.literal('none')]).default('none'),
  summary: z.string().default(''),
  stages: z.array(QuestStageSchema).min(1),
  rewards: RawEffectsSchema.optional(),
  fail_when: ConditionSchema.optional(),
  journal_notes: z.record(ID, z.string()).optional(),
});
export type RawQuest = z.output<typeof QuestSchema>;
export interface Quest extends Omit<RawQuest, 'stages' | 'rewards'> {
  stages: (Omit<RawQuest['stages'][number], 'on_enter' | 'on_complete'> & {
    on_enter?: Effects;
    on_complete?: Effects;
  })[];
  rewards?: Effects;
}

// Items --------------------------------------------------------------------

export const ItemSchema = z.strictObject({
  id: ID,
  name: z.string().min(1),
  kind: z.enum(['gift', 'material', 'key']),
  description: z.string().default(''),
  rarity: z.enum(['common', 'uncommon', 'rare']).default('common'),
  sources: z.array(z.string()).optional(),
  craft: z
    .strictObject({
      facility: z.enum(FACILITY_IDS),
      cost: z.partialRecord(z.enum(RESOURCES), z.number()),
      requires: ConditionSchema.optional(),
    })
    .optional(),
});
export type Item = z.output<typeof ItemSchema>;
export const ItemsFileSchema = z.strictObject({ items: z.array(ItemSchema) });

// Enemies ------------------------------------------------------------------

const MoveSchema = z.strictObject({
  id: ID,
  name: z.string().min(1),
  weight: z.number().positive().default(1),
  power: z.number().nonnegative().optional(),
  effect: z
    .strictObject({ status: z.enum(STATUSES), turns: z.number().int().positive().default(1) })
    .optional(),
  when: ConditionSchema.optional(),
});

export const EnemySchema = z.strictObject({
  id: ID,
  name: z.string().min(1),
  description: z.string().default(''),
  sprite_set: ID.optional(),
  stats: z.strictObject({
    hp: z.number().positive(),
    attack: z.number().nonnegative(),
    defense: z.number().nonnegative(),
    speed: z.number().nonnegative(),
  }),
  damage_type: z.enum(DAMAGE_TYPES),
  resistances: z.partialRecord(z.enum(DAMAGE_TYPES), z.number().nonnegative()).default({}),
  moves: z.array(MoveSchema).min(1),
  xp: z.number().nonnegative().default(0),
  loot: z.partialRecord(z.enum(RESOURCES), z.number()).default({}),
  gift_drop: z.strictObject({ item: ID, chance: z.number().min(0).max(1) }).optional(),
  tags_on_kill: z.array(ID).default([]),
  /**
   * Sparing (decided G1): a Charisma check helped by Divinity, offered under a quarter HP.
   * Success pays in items instead of XP. Leave `spare` out (or possible: false) for enemies
   * that can never be spared.
   */
  spare: z
    .strictObject({
      possible: z.boolean().default(true),
      check: z.strictObject({ stat: z.enum(STATS), dc: z.number().int() }).optional(),
      items: z.record(ID, z.number().int().positive()).default({}),
      tags: z.array(ID).default([]),
    })
    .optional(),
  appears: z
    .strictObject({
      biomes: z.array(z.enum(BIOMES)).default([]),
      time: z.array(z.enum(PHASES)).default([]),
      corruption_min: z.number().default(0),
    })
    .default({ biomes: [], time: [], corruption_min: 0 }),
  tier: z.enum(['regular', 'elite', 'boss']).default('regular'),
  phases: z
    .array(
      z.strictObject({
        hp_below: z.number().min(0).max(1),
        moves: z.array(MoveSchema).min(1),
        on_enter: RawScriptSchema.optional(),
      }),
    )
    .optional(),
  intro: RawScriptSchema.optional(),
  defeat: RawScriptSchema.optional(),
});
export type RawEnemy = z.output<typeof EnemySchema>;
export interface Enemy extends Omit<RawEnemy, 'phases' | 'intro' | 'defeat'> {
  phases?: { hp_below: number; moves: RawEnemy['moves']; on_enter?: Script }[];
  intro?: Script;
  defeat?: Script;
}

// Weapons ------------------------------------------------------------------

export const WeaponSchema = z.strictObject({
  id: ID,
  name: z.string().min(1),
  description: z.string().default(''),
  damage_type: z.enum(DAMAGE_TYPES),
  power: z.number().positive(),
  speed_mod: z.number().default(0),
  grace_regen: z.number().default(0),
  trait: z
    .strictObject({
      on_hit: z
        .strictObject({ status: z.enum(STATUSES), chance: z.number().min(0).max(1), turns: z.number().int().positive().default(1) })
        .optional(),
    })
    .optional(),
  source: z
    .strictObject({
      craft: z
        .strictObject({ facility: z.enum(FACILITY_IDS), cost: z.partialRecord(z.enum(RESOURCES), z.number()) })
        .optional(),
      quest: ID.optional(),
      starting: z.boolean().optional(),
    })
    .optional(),
});
export type Weapon = z.output<typeof WeaponSchema>;
export const WeaponsFileSchema = z.strictObject({ weapons: z.array(WeaponSchema) });

// Powers -------------------------------------------------------------------

export const PowerSchema = z.strictObject({
  id: ID,
  name: z.string().min(1),
  description: z.string().default(''),
  domain: z.enum(DOMAINS).optional(),
  /** Faith level needed before this power can be unlocked. */
  tier: z.number().int().min(0).max(5).default(1),
  /** Skill-tree prerequisites (other power ids). */
  requires: z.array(ID).default([]),
  /** Skill points spent to unlock. */
  points: z.number().int().nonnegative().default(1),
  kind: z.enum(['combat', 'passive', 'town', 'travel', 'companion']),
  cost: z.number().nonnegative().default(0),
  target: z.enum(['enemy', 'self', 'party']).optional(),
  power: z.number().nonnegative().optional(),
  damage_type: z.enum(DAMAGE_TYPES).optional(),
  heal: z.number().nonnegative().optional(),
  effect: z.looseObject({}).optional(),
});
export type Power = z.output<typeof PowerSchema>;
export const PowersFileSchema = z.strictObject({ powers: z.array(PowerSchema) });

// Facilities ---------------------------------------------------------------

export const FacilitySchema = z.strictObject({
  id: z.enum(FACILITY_IDS),
  name: z.string().min(1),
  description: z.string().default(''),
  fixed: z.boolean().default(false),
  cost: z.partialRecord(z.enum(RESOURCES), z.number()).default({}),
  build_days: z.number().int().nonnegative().default(0),
  workplace_for: z.array(z.enum(PROFESSIONS)).default([]),
  effects: z.array(z.looseObject({ type: z.string() })).default([]),
});
export type Facility = z.output<typeof FacilitySchema>;
export const FacilitiesFileSchema = z.strictObject({ facilities: z.array(FacilitySchema) });

// Regions and biomes -------------------------------------------------------

const CheckpointSpec = z.union([
  z.strictObject({ pool: z.array(ID).min(1) }),
  z.strictObject({ fixed: ID }),
]);

export const RegionSchema = z.strictObject({
  id: ID,
  name: z.string().min(1),
  description: z.string().default(''),
  kind: z.enum(['route', 'wild']),
  from: z.enum(TOWNS),
  to: z.enum(TOWNS).optional(),
  days: z.number().int().positive().optional(),
  segments: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  biomes: z.array(z.enum(BIOMES)).min(1),
  danger: z.number().int().min(0).max(5).default(1),
  checkpoints: z.array(CheckpointSpec).min(1),
  node_weights: z.partialRecord(z.enum(NODE_TYPES), z.number().nonnegative()).optional(),
  story_checkpoints: z
    .record(ID, z.strictObject({ after_segment: z.number().int().nonnegative() }))
    .optional(),
});
export type Region = z.output<typeof RegionSchema>;
export const RegionsFileSchema = z.strictObject({ regions: z.array(RegionSchema) });

export const BiomeSchema = z.strictObject({
  id: z.enum(BIOMES),
  name: z.string().min(1),
  node_weights: z.partialRecord(z.enum(NODE_TYPES), z.number().nonnegative()),
  phase_modifiers: z
    .partialRecord(z.enum(PHASES), z.partialRecord(z.enum(NODE_TYPES), z.number().nonnegative()))
    .optional(),
  enemies: z.array(ID).default([]),
  gather: z.partialRecord(z.enum(RESOURCES), z.tuple([z.number(), z.number()])).default({}),
});
export type BiomeDef = z.output<typeof BiomeSchema>;
export const BiomesFileSchema = z.strictObject({ biomes: z.array(BiomeSchema) });

// Encounters ---------------------------------------------------------------

export const EncounterSchema = z.strictObject({
  id: ID,
  name: z.string().min(1),
  node: z.enum(['event', 'shrine', 'traveler', 'cache', 'rest', 'checkpoint']).default('event'),
  weight: z.number().positive().default(1),
  where: z
    .strictObject({
      biomes: z.array(z.enum(BIOMES)).optional(),
      time: z.array(z.enum(PHASES)).optional(),
      corruption_min: z.number().optional(),
      corruption_max: z.number().optional(),
      requires: ConditionSchema.optional(),
    })
    .default({}),
  once: z.boolean().default(false),
  script: RawScriptSchema,
});
export type RawEncounter = z.output<typeof EncounterSchema>;
export interface Encounter extends Omit<RawEncounter, 'script'> {
  script: Script;
}

// Cutscenes ----------------------------------------------------------------

export const CutsceneSchema = z.strictObject({
  id: ID,
  stage: StageSchema.optional(),
  script: RawScriptSchema,
});
export type RawCutscene = z.output<typeof CutsceneSchema>;
export interface Cutscene {
  id: string;
  stage?: Stage;
  script: Script;
}

// Economy (content/economy.yaml) --------------------------------------------

export const StoreStockSchema = z.strictObject({
  /** Different things on the shelves each week. */
  offers: z.number().int().min(1).default(5),
  /** Weekly price multiplier range applied to the base value (the store never sells below it). */
  markup: z.tuple([z.number().min(1), z.number().min(1)]).default([1.2, 1.8]),
  /** Units of a resource in one offer; `default` covers resources not listed. */
  units: z.record(z.string(), z.number().int().positive()).default({ default: 10 }),
  /** Base chance of each resource or gift item showing up; residents add their own (profile.yaml → store). */
  weights: z.record(z.string(), z.number().nonnegative()).default({}),
});
export type StoreStock = z.output<typeof StoreStockSchema>;

export const EconomySchema = z.strictObject({
  /** Base value of each resource, gold per unit. The store sells above it and buys below it. */
  prices: z.partialRecord(z.enum(RESOURCES), z.number().positive()),
  /** Fraction of the base value paid when selling. */
  sell_rate: z.number().min(0).max(1).default(0.5),
  /** Gift items the general store can stock, base value each. */
  gifts: z.record(ID, z.number().positive()).default({}),
  /** How the weekly shelves are rolled (decided H2). */
  stock: StoreStockSchema.default({ offers: 5, markup: [1.2, 1.8], units: { default: 10 }, weights: {} }),
});
export type Economy = z.output<typeof EconomySchema>;

// Tavern activities (content/tavern.yaml) -----------------------------------

export const TavernActivitySchema = z.strictObject({
  id: ID,
  label: z.string().min(1),
  description: z.string().default(''),
  requires: ConditionSchema.optional(),
  gold: z.number().nonnegative().default(0),
  cost: z.enum(['none', 'phase']).default('none'),
  once_per_day: z.boolean().default(true),
  effects: RawEffectsSchema.optional(),
  script: RawScriptSchema.optional(),
});
export type RawTavernActivity = z.output<typeof TavernActivitySchema>;
export interface TavernActivity extends Omit<RawTavernActivity, 'effects' | 'script'> {
  effects?: Effects;
  script?: Script;
}
export const TavernFileSchema = z.strictObject({ activities: z.array(TavernActivitySchema) });

// Progression --------------------------------------------------------------

export const DEFAULT_CORRUPTION_RULES = {
  warning_days: 5,
  grace_days: 3,
  rise_every_days: 10,
  incursion_from: 6,
  warning: 'You can feel the corruption leaking into the mortal plane. Better do something about it before something terrible happens.',
  taken: 'It appears we lost {name} in {town} to the corruption last night…',
  spread: 'The air over the frontier hangs heavier than yesterday.',
  cleared: 'The frontier breathes easier. The corruption has been pushed back, for now.',
  incursion_repelled: 'Corrupted things came at the walls in the night. The militia turned them back.',
  incursion_hit: 'Corrupted things came at the walls in the night and got into the stores: {lost}.',
};

export const CorruptionRulesSchema = z.strictObject({
  /** Days without fighting the corruption before the warning. */
  warning_days: z.number().int().positive().default(DEFAULT_CORRUPTION_RULES.warning_days),
  /** Days after the warning to start a corruption expedition before someone is taken. */
  grace_days: z.number().int().positive().default(DEFAULT_CORRUPTION_RULES.grace_days),
  /** Every this many idle days the corruption rises by one (0 = only by story). */
  rise_every_days: z.number().int().nonnegative().default(DEFAULT_CORRUPTION_RULES.rise_every_days),
  /** Corruption level from which incursions on Withergate become possible. */
  incursion_from: z.number().int().min(1).max(10).default(DEFAULT_CORRUPTION_RULES.incursion_from),
  warning: z.string().default(DEFAULT_CORRUPTION_RULES.warning),
  taken: z.string().default(DEFAULT_CORRUPTION_RULES.taken),
  spread: z.string().default(DEFAULT_CORRUPTION_RULES.spread),
  cleared: z.string().default(DEFAULT_CORRUPTION_RULES.cleared),
  incursion_repelled: z.string().default(DEFAULT_CORRUPTION_RULES.incursion_repelled),
  incursion_hit: z.string().default(DEFAULT_CORRUPTION_RULES.incursion_hit),
});
export type CorruptionRules = z.output<typeof CorruptionRulesSchema>;

const StatBlock = z.strictObject({
  hp: z.number(),
  attack: z.number(),
  defense: z.number(),
  speed: z.number(),
  divinity: z.number(),
});

export const ProgressionSchema = z.strictObject({
  level_cap: z.number().int().positive(),
  xp_curve: z.array(z.number().nonnegative()).min(2),
  base: StatBlock,
  per_level: StatBlock,
  lean_growth: z.partialRecord(z.enum(DOMAINS), StatBlock.partial()).default({}),
  faith_levels: z.array(z.number().nonnegative()).min(2),
  skill_points_per_faith_level: z.number().int().nonnegative().default(1),
  domain_milestone: z.number().positive().default(40),
  grace: z.strictObject({ base: z.number(), per_divinity: z.number() }),
  stats: z
    .strictObject({
      start: z.number().int().default(2),
      points: z.number().int().default(15),
      max_at_creation: z.number().int().default(8),
      max: z.number().int().default(10),
    })
    .default({ start: 2, points: 15, max_at_creation: 8, max: 10 }),
  energy: z
    .strictObject({
      player_max: z.number().int().default(8),
      companion_recovery_per_day: z.number().default(2),
      death_recovery_days: z.number().int().default(5),
    })
    .default({ player_max: 8, companion_recovery_per_day: 2, death_recovery_days: 5 }),
  caravan: z
    .strictObject({
      loss_chance_end: z.number().min(0).max(1).default(0.3),
      loss_chance_checkpoint: z.number().min(0).max(1).default(0.5),
      loss_fraction: z.tuple([z.number(), z.number()]).default([0.25, 0.5]),
    })
    .default({ loss_chance_end: 0.3, loss_chance_checkpoint: 0.5, loss_fraction: [0.25, 0.5] }),
  /** The corruption's cadence (decided G3, H1, F4) and incursions. Texts use {name} and {town}. */
  corruption: CorruptionRulesSchema.default(DEFAULT_CORRUPTION_RULES),
});
export type Progression = z.output<typeof ProgressionSchema>;

// Ascension (content/ascension.yaml) --------------------------------------------

export const AscensionSchema = z.strictObject({
  /** What must be true before the shrine offers ascension. */
  requires: ConditionSchema.optional(),
  /** Shown at the shrine while `requires` does not hold. */
  not_yet: z.string().default('[PLACEHOLDER: The heavens are not ready for you yet.]'),
  /** Per axis: the epithet that follows your name and the thing you are deity of. */
  titles: z
    .partialRecord(z.enum(DOMAINS), z.strictObject({ epithet: z.string().min(1), domain: z.string().min(1) }))
    .default({}),
  /** Plays before the ending screen; {title} is substituted. */
  epilogue: RawScriptSchema.optional(),
});
export type RawAscension = z.output<typeof AscensionSchema>;
export interface Ascension extends Omit<RawAscension, 'epilogue'> {
  epilogue?: Script;
}

export type { Condition };
