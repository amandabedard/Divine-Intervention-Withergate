// Identifiers shared by content, the game, and the editor.
// Keep these in sync with docs/design/gdd.md ("Identifiers used in content files").

export const TIERS = ['enemy', 'disliked', 'stranger', 'acquaintance', 'friend', 'best_friend'] as const;
export type Tier = (typeof TIERS)[number];

export const ROMANCE_STATES = ['neutral', 'interest', 'lover'] as const;
export type RomanceState = (typeof ROMANCE_STATES)[number];

export const PHASES = ['morning', 'afternoon', 'evening', 'night'] as const;
export type Phase = (typeof PHASES)[number];

/** The axes the deity title is generated from: whatever you do best. */
export const DOMAINS = ['friendship', 'pleasure', 'prosperity', 'combat', 'discovery'] as const;
export type Domain = (typeof DOMAINS)[number];
export const DOMAIN_LABELS: Record<Domain, string> = {
  friendship: 'Friendship',
  pleasure: 'Pleasure',
  prosperity: 'Prosperity',
  combat: 'Combat',
  discovery: 'Discovery',
};

/** An in-game week. */
export const DAYS_PER_WEEK = 5;

export const STATS = ['charisma', 'intelligence', 'luck', 'dexterity', 'perception'] as const;
export type Stat = (typeof STATS)[number];

export const RESOURCES = ['gold', 'wood', 'stone', 'ore', 'food', 'herbs', 'cloth'] as const;
export type Resource = (typeof RESOURCES)[number];

export const PROFESSIONS = [
  'doctor',
  'warrior',
  'farmer',
  'academic',
  'engineer',
  'logger',
  'miner',
  'chef',
  'explorer',
  'craftsman',
  'socialite',
  'none',
] as const;
export type Profession = (typeof PROFESSIONS)[number];

export const TOWNS = ['aboridge', 'dilsdurf', 'heathel', 'mukrige', 'scottsburg', 'withergate'] as const;
export type Town = (typeof TOWNS)[number];
export const HOME_TOWNS = [...TOWNS, 'none'] as const;
export type HomeTown = (typeof HOME_TOWNS)[number];

export const FACILITY_IDS = [
  'your_quarters',
  'living_quarters',
  'general_store',
  'tavern',
  'barracks',
  'farm',
  'library',
  'town_hall',
  'bazaar',
  'hospital',
  'inn',
  'restaurant',
] as const;
export type FacilityId = (typeof FACILITY_IDS)[number];
export const FIXED_FACILITIES: readonly FacilityId[] = [
  'your_quarters',
  'living_quarters',
  'general_store',
  'tavern',
];

export const GIFT_CATEGORIES = ['loved', 'liked', 'neutral', 'disliked', 'hated'] as const;
export type GiftCategory = (typeof GIFT_CATEGORIES)[number];

export const DAMAGE_TYPES = ['blade', 'blunt', 'pierce', 'divine', 'beast', 'corrupt', 'construct'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export const RELATIONS = ['allied', 'neutral', 'tense', 'hostile'] as const;
export type Relation = (typeof RELATIONS)[number];

export const QUEST_TYPES = ['main', 'personal', 'town', 'bounty'] as const;
export type QuestType = (typeof QUEST_TYPES)[number];
export const QUEST_STATUSES = ['not_started', 'active', 'done', 'failed'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];

export const FORMS = ['masc', 'fem'] as const;
export type Form = (typeof FORMS)[number];
export const LABELS = ['cool', 'scary', 'cute', 'fun'] as const;
export type Label = (typeof LABELS)[number];

export const MARKERS = ['heart', 'quest', 'none'] as const;
export type Marker = (typeof MARKERS)[number];

export const BIOMES = ['plains', 'forest', 'hills', 'marsh', 'corrupted'] as const;
export type Biome = (typeof BIOMES)[number];

export const NODE_TYPES = [
  'battle',
  'elite',
  'event',
  'gather_wood',
  'gather_ore',
  'gather_herbs',
  'gather_food',
  'rest',
  'shrine',
  'cache',
  'traveler',
  'settlement',
  'checkpoint',
  'boss',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const STATUSES = ['bleed', 'stagger', 'inspired', 'rooted', 'burning', 'attack_up', 'defense_up'] as const;
export type Status = (typeof STATUSES)[number];

/** Speakers that are not characters. */
export const RESERVED_SPEAKERS = ['you', 'narrate'] as const;

/** Friendship points at which each tier begins (docs/design/gdd.md §15). */
export const DEFAULT_TIER_THRESHOLDS: Record<Tier, number> = {
  enemy: -40,
  disliked: -1,
  stranger: 0,
  acquaintance: 10,
  friend: 40,
  best_friend: 100,
};

export const DEFAULT_GIFT_POINTS: Record<GiftCategory, number> = {
  loved: 12,
  liked: 6,
  neutral: 1,
  disliked: -6,
  hated: -12,
};

/** Text shown for every non-romanceable flirt attempt (from the brief). */
export const NOT_INTERESTED_LINE = "I'm just not interested, sorry.";
