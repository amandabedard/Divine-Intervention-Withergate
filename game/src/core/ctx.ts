import type { Biome, ContentBundle, GiftCategory, NodeType, Step } from '@withergate/shared';
import type { Rng } from './rng';
import type { GameState } from './state';

export interface CondExtras {
  reason?: string;
  gift_category?: GiftCategory;
  node?: NodeType;
  biome?: Biome;
}

/** Side effects that the core cannot perform itself; the session flushes them. */
export type CoreRequest =
  | { kind: 'teleport'; map: string; spawn: string }
  | { kind: 'cutscene'; id: string }
  | { kind: 'event'; id: string }
  | { kind: 'battle'; enemy: string; on_win?: Step[]; on_lose?: Step[] }
  | { kind: 'time_changed' }
  | { kind: 'npc_refresh' }
  /** Facilities or slots changed; the world redraws the town. */
  | { kind: 'town_changed' }
  /** A full-screen flash with a line of text (the corruption taking someone). */
  | { kind: 'flash'; text: string; color: 'purple' };

export interface Ctx {
  state: GameState;
  content: ContentBundle;
  rng: Rng;
  /** Character currently being talked to, if any. */
  speaker?: string;
  extras?: CondExtras;
  notify: (text: string) => void;
  requests: CoreRequest[];
}
