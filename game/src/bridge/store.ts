import { useSyncExternalStore } from 'react';
import { EMPTY_INDEX, EMPTY_MANIFEST, emptyBundle } from '@withergate/shared';
import type { AssetManifest, ContentBundle, GeneratedIndex } from '@withergate/shared';
import type { BattleEvent } from '../core/combat/battle';
import type { EndingSummary } from '../core/ending';
import { Rng } from '../core/rng';
import type { GameState } from '../core/state';
import { bus } from './bus';

export type PanelKind =
  | 'quarters'
  | 'bed'
  | 'loadout'
  | 'satchel'
  | 'storage'
  | 'residents'
  | 'living_quarters'
  | 'general_store'
  | 'tavern'
  | 'build'
  | 'shrine'
  | 'facility'
  | 'craft'
  | 'notice_board'
  | 'expedition_plan'
  | 'journal';
export type UiMode = 'boot' | 'title' | 'intro' | 'creation' | 'world' | 'dialog' | 'panel' | 'battle' | 'expedition' | 'ending';

export interface ExpeditionView {
  view: 'map' | 'result' | 'checkpoint' | 'menu';
  title?: string;
  lines?: string[];
}
export type TalkView = 'menu' | 'topics' | 'gifts';

export interface BattleView {
  /** Recent events, oldest first, for the on-screen log. */
  log: BattleEvent[];
  /** True while events are still being animated; the action menu waits. */
  busy: boolean;
  view: 'main' | 'powers' | 'companions';
}

export interface DialogLine {
  speaker: string;
  name: string;
  text: string;
  bust: string | null;
  narrate: boolean;
  mood?: string;
  loc?: string;
}
export interface DialogChoice {
  index: number;
  text: string;
  locked: boolean;
  lockedText?: string;
}
export interface DialogRoll {
  stat: string;
  roll: number;
  total: number;
  dc: number;
  outcome: string;
}
export interface TalkState {
  villager: string;
  view: TalkView;
}
export interface Toast {
  id: number;
  text: string;
}

export interface UiState {
  mode: UiMode;
  panel: PanelKind | null;
  /** Extra context for a panel: a slot id for build, a facility id for facility/craft. */
  panelArg: string | null;
  talk: TalkState | null;
  line: DialogLine | null;
  choices: DialogChoice[] | null;
  roll: DialogRoll | null;
  dialogActive: boolean;
  battle: BattleView | null;
  expedition: ExpeditionView | null;
  ending: EndingSummary | null;
  /** A full-screen flash with a line of text, cleared by the session after a moment. */
  flash: { text: string; color: 'purple' } | null;
  toasts: Toast[];
  debugOpen: boolean;
}

export interface Snapshot {
  state: GameState | null;
  ui: UiState;
  content: ContentBundle;
  assets: GeneratedIndex;
  assetsReady: boolean;
  version: number;
}

function initialUi(): UiState {
  return {
    mode: 'boot',
    panel: null,
    panelArg: null,
    talk: null,
    line: null,
    choices: null,
    roll: null,
    dialogActive: false,
    battle: null,
    expedition: null,
    ending: null,
    flash: null,
    toasts: [],
    debugOpen: false,
  };
}

class Store {
  state: GameState | null = null;
  ui: UiState = initialUi();
  content: ContentBundle = emptyBundle();
  assets: GeneratedIndex = EMPTY_INDEX;
  manifest: AssetManifest = EMPTY_MANIFEST;
  assetsReady = false;
  rng = new Rng(1);
  snapshot: Snapshot;
  private version = 0;
  private listeners = new Set<() => void>();
  private toastId = 0;

  constructor() {
    this.snapshot = this.makeSnapshot();
  }

  private makeSnapshot(): Snapshot {
    return {
      state: this.state,
      ui: this.ui,
      content: this.content,
      assets: this.assets,
      assetsReady: this.assetsReady,
      version: this.version,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Publish the current state to React. Call after any mutation the UI should see. */
  commit(): void {
    if (this.state) this.state.rng = this.rng.state;
    this.version += 1;
    this.ui = { ...this.ui };
    this.snapshot = this.makeSnapshot();
    for (const l of [...this.listeners]) l();
  }

  setContent(bundle: ContentBundle): void {
    this.content = bundle;
    this.commit();
    bus.emit('content.reloaded');
  }

  setAssets(index: GeneratedIndex, manifest?: AssetManifest): void {
    this.assets = index;
    if (manifest) this.manifest = manifest;
    this.commit();
  }

  setState(state: GameState | null): void {
    this.state = state;
    if (state) this.rng = new Rng(state.rng);
    this.commit();
  }

  updateUi(patch: Partial<UiState>): void {
    Object.assign(this.ui, patch);
    this.commit();
  }

  toast(text: string): void {
    const id = ++this.toastId;
    this.ui.toasts = [...this.ui.toasts, { id, text }].slice(-5);
    this.commit();
    setTimeout(() => {
      this.ui.toasts = this.ui.toasts.filter((t) => t.id !== id);
      this.commit();
    }, 3500);
  }
}

export const store = new Store();

export function useStore(): Snapshot {
  return useSyncExternalStore(store.subscribe, () => store.snapshot);
}
