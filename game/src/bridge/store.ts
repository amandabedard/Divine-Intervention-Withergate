import { useSyncExternalStore } from 'react';
import { EMPTY_INDEX, EMPTY_MANIFEST, emptyBundle } from '@withergate/shared';
import type { AssetManifest, ContentBundle, GeneratedIndex } from '@withergate/shared';
import { Rng } from '../core/rng';
import type { GameState } from '../core/state';
import { bus } from './bus';

export type PanelKind = 'bed' | 'living_quarters' | 'general_store' | 'tavern' | 'build' | 'notice_board';
export type UiMode = 'boot' | 'title' | 'creation' | 'world' | 'dialog' | 'panel';
export type TalkView = 'menu' | 'topics' | 'gifts';

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
  talk: TalkState | null;
  line: DialogLine | null;
  choices: DialogChoice[] | null;
  roll: DialogRoll | null;
  dialogActive: boolean;
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
    talk: null,
    line: null,
    choices: null,
    roll: null,
    dialogActive: false,
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
