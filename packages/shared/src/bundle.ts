import type { GameMap } from './map.ts';
import type { Script } from './script.ts';
import type { VillagerBundle } from './villager.ts';
import type {
  BiomeDef,
  Cutscene,
  Encounter,
  Enemy,
  Facility,
  Item,
  Power,
  Progression,
  Quest,
  Region,
  Weapon,
} from './world.ts';

export interface Issue {
  level: 'error' | 'warning';
  file: string;
  line?: number;
  col?: number;
  path?: string;
  message: string;
}

export interface ContentStats {
  files: number;
  villagers: number;
  maps: number;
  lines: number;
  placeholders: number;
}

/** Everything the game needs, compiled from content/ and validated. */
export interface ContentBundle {
  villagers: Record<string, VillagerBundle>;
  quests: Record<string, Quest>;
  items: Record<string, Item>;
  enemies: Record<string, Enemy>;
  weapons: Record<string, Weapon>;
  powers: Record<string, Power>;
  facilities: Record<string, Facility>;
  regions: Record<string, Region>;
  biomes: Record<string, BiomeDef>;
  encounters: Record<string, Encounter>;
  cutscenes: Record<string, Cutscene>;
  /** Reusable scripts from content/dialog/, keyed like "shared/awkward_silence". */
  shared: Record<string, Script>;
  maps: Record<string, GameMap>;
  progression: Progression;
  issues: Issue[];
  stats: ContentStats;
}

export const DEFAULT_PROGRESSION: Progression = {
  level_cap: 20,
  xp_curve: [0, 20, 50, 90, 140, 200, 270, 350, 440, 540, 650, 770, 900, 1040, 1190, 1350, 1520, 1700, 1890, 2090],
  base: { hp: 30, attack: 6, defense: 3, speed: 5, divinity: 4 },
  per_level: { hp: 4, attack: 1, defense: 0.5, speed: 0.5, divinity: 0.5 },
  lean_growth: {},
  faith_levels: [0, 10, 25, 50, 90, 140],
  skill_points_per_faith_level: 1,
  domain_milestone: 40,
  grace: { base: 10, per_divinity: 2 },
  stats: { start: 2, points: 15, max_at_creation: 8, max: 10 },
  energy: { player_max: 8, companion_recovery_per_day: 2, death_recovery_days: 5 },
  caravan: { loss_chance_end: 0.3, loss_chance_checkpoint: 0.5, loss_fraction: [0.25, 0.5] },
};

export function emptyBundle(): ContentBundle {
  return {
    villagers: {},
    quests: {},
    items: {},
    enemies: {},
    weapons: {},
    powers: {},
    facilities: {},
    regions: {},
    biomes: {},
    encounters: {},
    cutscenes: {},
    shared: {},
    maps: {},
    progression: DEFAULT_PROGRESSION,
    issues: [],
    stats: { files: 0, villagers: 0, maps: 0, lines: 0, placeholders: 0 },
  };
}

export const PLACEHOLDER_RE = /\[PLACEHOLDER/i;
