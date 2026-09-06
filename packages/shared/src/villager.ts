import { z } from 'zod';
import { ConditionSchema, ID } from './condition.ts';
import type { Condition } from './condition.ts';
import {
  DOMAINS,
  FACILITY_IDS,
  GIFT_CATEGORIES,
  HOME_TOWNS,
  MARKERS,
  PHASES,
  PROFESSIONS,
} from './ids.ts';
import type { GiftCategory, Marker, Phase } from './ids.ts';
import {
  RawEffectsSchema,
  RawLineEntrySchema,
  RawScriptSchema,
  STEP_KEYWORDS,
} from './script.ts';
import type { Effects, Script, Step } from './script.ts';

// ---------------------------------------------------------------------------
// profile.yaml
// ---------------------------------------------------------------------------

export const BENEFIT_TYPES = [
  // town
  'resource_income',
  'build_discount',
  'build_speed',
  'caravan_safety',
  'relationship_gain',
  'energy_max',
  'store_rates',
  'tavern_quality',
  'unlock_action',
  'faith_gain',
  // travel
  'node_weight',
  'gather_yield',
  'extra_paths',
  'preview_nodes',
  'heal_per_node',
  'energy_cost',
  'flee_guaranteed',
  'check_bonus',
  'ambush_chance',
  // combat
  'passive',
  'active',
  'revive',
] as const;
export type BenefitType = (typeof BENEFIT_TYPES)[number];

const BenefitSchema = z.looseObject({ type: z.enum(BENEFIT_TYPES) });
export type Benefit = z.output<typeof BenefitSchema>;

const AffinitySchema = z.strictObject({
  start_bonus: z.number().optional(),
  growth: z.number().positive().optional(),
});
export type Affinity = z.output<typeof AffinitySchema>;

export const SpotRefSchema = z.strictObject({
  map: z.union([ID, z.literal('none')]),
  spot: ID.optional(),
});
export type SpotRef = z.output<typeof SpotRefSchema>;

const SchedulePhasesSchema = z.partialRecord(z.enum(PHASES), SpotRefSchema);

/** How a character agrees to move to Withergate once the recruit topic is unlocked. */
export const RecruitMethodSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ask') }),
  z.strictObject({
    kind: z.literal('chance'),
    chance: z.number().min(0).max(1),
    max_attempts: z.number().int().positive().default(3),
  }),
  z.strictObject({ kind: z.literal('quest'), quest: ID }),
  z.strictObject({ kind: z.literal('item'), item: ID, amount: z.number().int().positive().default(1) }),
]);
export type RecruitMethod = z.output<typeof RecruitMethodSchema>;

export const ProfileSchema = z
  .strictObject({
    id: ID.refine((id) => !STEP_KEYWORDS.includes(id), {
      message: 'this id collides with a dialog keyword',
    }),
    name: z.string().min(1),
    pronouns: z.string().optional(),
    profession: z.enum(PROFESSIONS),
    home_town: z.enum(HOME_TOWNS),
    romanceable: z.boolean(),
    portrait_set: ID.optional(),
    sprite_set: ID.optional(),
    bio: z.string(),
    personality: z.array(z.string()).optional(),
    likes: z.array(z.string()),
    dislikes: z.array(z.string()),
    gifts: z.strictObject({
      loved: z.array(ID).default([]),
      liked: z.array(ID).default([]),
      disliked: z.array(ID).default([]),
      hated: z.array(ID).default([]),
    }),
    tag_affinity: z.record(ID, AffinitySchema).optional(),
    domain_affinity: z.partialRecord(z.enum(DOMAINS), AffinitySchema).optional(),
    romance: z
      .strictObject({
        interest_requires: ConditionSchema.optional(),
        lover_requires: ConditionSchema.optional(),
      })
      .optional(),
    recruit: z
      .strictObject({
        requires: ConditionSchema,
        method: RecruitMethodSchema.default({ kind: 'ask' }),
        leaves_if: z.array(ConditionSchema).optional(),
        workplace: z.enum([...FACILITY_IDS, 'none']).optional(),
      })
      .optional(),
    energy: z.number().int().min(1).optional(),
    /** Days before they can travel again after a death on the road. */
    recovery_days: z.number().int().min(0).default(5),
    benefits: z
      .strictObject({
        town: z.array(BenefitSchema).optional(),
        travel: z.array(BenefitSchema).optional(),
        combat: z.array(BenefitSchema).optional(),
      })
      .optional(),
    schedule: z
      .strictObject({
        home: SchedulePhasesSchema.optional(),
        withergate: SchedulePhasesSchema.optional(),
        overrides: z
          .array(z.strictObject({ when: ConditionSchema, at: SpotRefSchema }))
          .optional(),
      })
      .optional(),
  })
  .refine((p) => !(p.recruit && p.energy === undefined), {
    message: 'recruitable characters need an energy value',
    path: ['energy'],
  });
export type Profile = z.output<typeof ProfileSchema>;

// ---------------------------------------------------------------------------
// chat.yaml / flirt.yaml
// ---------------------------------------------------------------------------

export const RawPoolSchema = z.strictObject({
  when: ConditionSchema.optional(),
  weight: z.number().positive().optional(),
  effects: RawEffectsSchema.optional(),
  lines: z.array(RawLineEntrySchema).min(1),
});
export const PoolFileSchema = z.strictObject({ pools: z.array(RawPoolSchema).min(1) });

export interface Pool {
  when?: Condition;
  weight: number;
  effects?: Effects;
  lines: Step[][];
}

// ---------------------------------------------------------------------------
// discuss.yaml
// ---------------------------------------------------------------------------

export const RawTopicSchema = z.strictObject({
  id: ID,
  label: z.string().min(1),
  marker: z.enum(MARKERS).default('none'),
  requires: ConditionSchema.optional(),
  once: z.boolean().default(true),
  repeatable: z.boolean().default(false),
  cost: z.enum(['none', 'phase']).default('none'),
  script: RawScriptSchema,
});
export const DiscussFileSchema = z.strictObject({ topics: z.array(RawTopicSchema) });

export interface Topic {
  id: string;
  label: string;
  marker: Marker;
  requires?: Condition;
  once: boolean;
  repeatable: boolean;
  cost: 'none' | 'phase';
  script: Script;
}

// ---------------------------------------------------------------------------
// gifts.yaml
// ---------------------------------------------------------------------------

const RawGiftOverrideSchema = z.strictObject({
  when: ConditionSchema.optional(),
  lines: z.array(RawLineEntrySchema).min(1),
  effects: RawEffectsSchema.optional(),
});
export const GiftsFileSchema = z.strictObject({
  reactions: z.partialRecord(z.enum(GIFT_CATEGORIES), z.array(RawLineEntrySchema).min(1)),
  overrides: z
    .record(ID, z.union([RawGiftOverrideSchema, z.array(RawGiftOverrideSchema).min(1)]))
    .optional(),
});

export interface GiftOverride {
  when?: Condition;
  lines: Step[][];
  effects?: Effects;
}
export interface GiftReactions {
  reactions: Partial<Record<GiftCategory, Step[][]>>;
  overrides: Record<string, GiftOverride[]>;
}

// ---------------------------------------------------------------------------
// recruit.yaml
// ---------------------------------------------------------------------------

export const RecruitFileSchema = z.strictObject({
  topic_label: z.string().min(1).default('Come to Withergate'),
  script: RawScriptSchema,
  unhappy: z
    .array(z.strictObject({ when: ConditionSchema.optional(), lines: z.array(RawLineEntrySchema).min(1) }))
    .optional(),
  farewell: RawScriptSchema.optional(),
});

export interface RecruitScripts {
  topic_label: string;
  script: Script;
  unhappy: { when?: Condition; lines: Step[][] }[];
  farewell?: Script;
}

// ---------------------------------------------------------------------------
// barks.yaml
// ---------------------------------------------------------------------------

export const BARK_KEYS = [
  'battle_start',
  'low_hp',
  'withdraw',
  'gather_wood',
  'gather_ore',
  'gather_herbs',
  'gather_food',
  'rest',
  'night',
  'victory',
  'defeat',
  'depart',
] as const;
export const BarksFileSchema = z.partialRecord(z.enum(BARK_KEYS), z.array(RawLineEntrySchema).min(1));
export type Barks = Partial<Record<(typeof BARK_KEYS)[number], Step[][]>>;

// ---------------------------------------------------------------------------
// events/*.yaml (heart events)
// ---------------------------------------------------------------------------

export const StageSchema = z.strictObject({
  map: ID.optional(),
  place: z.record(ID, ID).optional(),
  companions: z.enum(['hide', 'show']).optional(),
});
export type Stage = z.output<typeof StageSchema>;

export const EventFileSchema = z.strictObject({
  id: ID,
  title: z.string().optional(),
  trigger: z.strictObject({
    on: z.enum(['enter_map', 'talk', 'phase_start']).default('enter_map'),
    requires: ConditionSchema.optional(),
    once: z.boolean().default(true),
    priority: z.number().default(0),
  }),
  stage: StageSchema.optional(),
  script: RawScriptSchema,
});

export interface HeartEvent {
  id: string;
  villager: string;
  title?: string;
  trigger: {
    on: 'enter_map' | 'talk' | 'phase_start';
    requires?: Condition;
    once: boolean;
    priority: number;
  };
  stage?: Stage;
  script: Script;
}

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

export interface VillagerBundle {
  profile: Profile;
  chat: Pool[];
  flirt: Pool[];
  discuss: Topic[];
  gifts: GiftReactions;
  recruit?: RecruitScripts;
  barks: Barks;
  events: HeartEvent[];
  /** Relative paths of the files that made up this villager, for tooling. */
  files: Record<string, string>;
}

export type Schedule = Partial<Record<Phase, SpotRef>>;
