import { useSyncExternalStore } from 'react';
import { EMPTY_INDEX, EMPTY_MANIFEST, mapEntities } from '@withergate/shared';
import type { AssetManifest, GameMap, GeneratedIndex, MapEntity, Placement } from '@withergate/shared';
import { api } from './api';
import type { ContentIndex, MapSummary } from './api';

export type Tool = 'select' | 'place' | 'erase' | 'collision' | 'entity';
export type LayerName = 'midground' | 'ground' | 'decor' | 'foreground';
export const LAYERS: LayerName[] = ['midground', 'ground', 'decor', 'foreground'];
export const ENTITY_TYPES: MapEntity['type'][] = ['spawn', 'exit', 'npc_spot', 'interactable', 'trigger', 'facility_slot', 'camera_bounds'];

export type Selection =
  | { kind: 'placement'; layer: LayerName; index: number }
  | { kind: 'entity'; index: number }
  | { kind: 'collision'; index: number }
  | null;

export interface Visibility {
  midground: boolean;
  ground: boolean;
  decor: boolean;
  foreground: boolean;
  collision: boolean;
  entities: boolean;
  grid: boolean;
  scenery: boolean;
}

export interface EditorState {
  ready: boolean;
  maps: MapSummary[];
  mapFiles: string[];
  manifest: AssetManifest;
  usage: Record<string, string[]>;
  generated: GeneratedIndex;
  content: ContentIndex;
  mapId: string | null;
  map: GameMap | null;
  dirty: boolean;
  tool: Tool;
  layer: LayerName;
  entityType: MapEntity['type'];
  /** Selected library asset id, or 'placeholder'. */
  assetId: string | null;
  selection: Selection;
  grid: number;
  snap: boolean;
  zoom: number;
  pan: { x: number; y: number };
  visible: Visibility;
  history: GameMap[];
  future: GameMap[];
  status: string;
  issues: string[];
  version: number;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Fill in anything a hand-written or partially broken map file leaves out, so the editor never crashes on it. */
export function normalizeMap(raw: any): GameMap {
  const m = { ...(raw ?? {}) };
  m.version = 1;
  m.size = { width: Number(m.size?.width) || 2560, height: Number(m.size?.height) || 720 };
  m.ground_y = Number(m.ground_y) || m.size.height - 100;
  m.background = Array.isArray(m.background) ? m.background : [];
  m.layers = { midground: [], ground: [], decor: [], foreground: [], ...(m.layers ?? {}) };
  for (const l of LAYERS) if (!Array.isArray(m.layers[l])) m.layers[l] = [];
  m.collision = Array.isArray(m.collision) ? m.collision : [];
  m.entities = Array.isArray(m.entities) ? m.entities : [];
  m.ambience = m.ambience ?? {};
  m.interior = !!m.interior;
  return m as GameMap;
}

class EditorStore {
  state: EditorState = {
    ready: false,
    maps: [],
    mapFiles: [],
    manifest: EMPTY_MANIFEST,
    usage: {},
    generated: EMPTY_INDEX,
    content: { villagers: [], shared: [], events: [], cutscenes: [], facilities: [], items: [], issues: [] },
    mapId: null,
    map: null,
    dirty: false,
    tool: 'select',
    layer: 'midground',
    entityType: 'npc_spot',
    assetId: 'placeholder',
    selection: null,
    grid: 32,
    snap: true,
    zoom: 0.5,
    pan: { x: 20, y: 20 },
    visible: { midground: true, ground: true, decor: true, foreground: true, collision: true, entities: true, grid: true, scenery: true },
    history: [],
    future: [],
    status: '',
    issues: [],
    version: 0,
  };
  private listeners = new Set<() => void>();
  private lastRecord: { key: string; at: number } | null = null;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  set(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 };
    for (const l of [...this.listeners]) l();
  }

  status(text: string): void {
    this.set({ status: text });
  }

  async load(): Promise<void> {
    try {
      const idx = await api.index();
      this.set({
        ready: true,
        maps: idx.maps,
        mapFiles: idx.mapFiles,
        manifest: idx.manifest,
        usage: idx.usage,
        generated: idx.generated,
        content: idx.content,
      });
      const wanted = this.state.mapId ?? new URLSearchParams(location.search).get('map') ?? idx.mapFiles[0];
      if (wanted && !this.state.map) await this.openMap(wanted);
    } catch (e) {
      this.status(`Could not load index: ${(e as Error).message}`);
    }
  }

  async refreshIndex(): Promise<void> {
    const idx = await api.index();
    this.set({ maps: idx.maps, mapFiles: idx.mapFiles, manifest: idx.manifest, usage: idx.usage, generated: idx.generated, content: idx.content });
  }

  async openMap(id: string): Promise<void> {
    if (this.state.dirty && !confirm('Discard unsaved changes?')) return;
    try {
      const map = normalizeMap(await api.getMap(id));
      this.set({ mapId: id, map, dirty: false, selection: null, history: [], future: [], issues: [], status: `Opened ${id}` });
      history.replaceState(null, '', `?map=${id}`);
    } catch (e) {
      this.status(`Could not open ${id}: ${(e as Error).message}`);
    }
  }

  async newMap(): Promise<void> {
    const id = prompt('Map id (lowercase_with_underscores):');
    if (!id) return;
    const interior = confirm('Interior map? (OK = interior, Cancel = outdoors)');
    try {
      const map = normalizeMap(await api.createMap({ id, interior }));
      await this.refreshIndex();
      this.set({ mapId: id, map, dirty: false, selection: null, history: [], future: [], issues: [], status: `Created ${id}` });
      history.replaceState(null, '', `?map=${id}`);
    } catch (e) {
      this.status(`Could not create: ${(e as Error).message}`);
    }
  }

  async save(): Promise<void> {
    const { map, mapId } = this.state;
    if (!map || !mapId) return;
    try {
      const r = await api.saveMap(mapId, map);
      this.set({ dirty: false, issues: r.warnings, status: r.warnings.length ? `Saved with ${r.warnings.length} warning(s)` : `Saved ${mapId}` });
      await this.refreshIndex();
    } catch (e) {
      const body = (e as Error & { body?: { issues?: string[] } }).body;
      this.set({ issues: body?.issues ?? [(e as Error).message], status: 'Not saved: fix the issues' });
    }
  }

  /** Mutate the map. `key` coalesces rapid edits of the same field into one undo step. */
  updateMap(fn: (map: GameMap) => void, key?: string): void {
    const { map } = this.state;
    if (!map) return;
    const now = Date.now();
    const coalesce = key && this.lastRecord && this.lastRecord.key === key && now - this.lastRecord.at < 900;
    const history = coalesce ? this.state.history : [...this.state.history, clone(map)].slice(-100);
    this.lastRecord = key ? { key, at: now } : null;
    const next = clone(map);
    fn(next);
    this.set({ map: next, history, future: [], dirty: true });
  }

  undo(): void {
    const { history, map } = this.state;
    if (!history.length || !map) return;
    const prev = history[history.length - 1]!;
    this.set({ map: prev, history: history.slice(0, -1), future: [clone(map), ...this.state.future], dirty: true, selection: null });
    this.lastRecord = null;
  }

  redo(): void {
    const { future, map } = this.state;
    if (!future.length || !map) return;
    const next = future[0]!;
    this.set({ map: next, future: future.slice(1), history: [...this.state.history, clone(map)], dirty: true, selection: null });
    this.lastRecord = null;
  }

  select(selection: Selection): void {
    this.set({ selection });
  }

  snapValue(v: number): number {
    return this.state.snap ? Math.round(v / this.state.grid) * this.state.grid : Math.round(v);
  }

  uniqueEntityId(map: GameMap, type: MapEntity['type']): string {
    const used = new Set(map.entities.filter((e) => e.type === type).map((e) => e.id));
    let n = 1;
    while (used.has(`${type}_${n}`)) n += 1;
    return `${type}_${n}`;
  }

  deleteSelection(): void {
    const sel = this.state.selection;
    if (!sel) return;
    this.updateMap((m) => {
      if (sel.kind === 'placement') m.layers[sel.layer].splice(sel.index, 1);
      else if (sel.kind === 'entity') m.entities.splice(sel.index, 1);
      else m.collision.splice(sel.index, 1);
    });
    this.select(null);
  }

  nudge(dx: number, dy: number): void {
    const sel = this.state.selection;
    if (!sel) return;
    this.updateMap((m) => {
      const o = selectedObject(m, sel);
      if (!o) return;
      o.x += dx;
      o.y += dy;
    }, `nudge:${JSON.stringify(sel)}`);
  }
}

export function selectedObject(map: GameMap, sel: Selection): (Placement | MapEntity | { x: number; y: number; w: number; h: number }) | undefined {
  if (!sel) return undefined;
  if (sel.kind === 'placement') return map.layers[sel.layer][sel.index];
  if (sel.kind === 'entity') return map.entities[sel.index];
  return map.collision[sel.index];
}

export function spawnsOf(maps: MapSummary[], id: string): string[] {
  return maps.find((m) => m.id === id)?.spawns ?? [];
}

export function mapSpots(map: GameMap): string[] {
  return mapEntities(map, 'npc_spot').map((s) => s.id);
}

export const editor = new EditorStore();
if (import.meta.env.DEV) (window as unknown as { __ed: EditorStore }).__ed = editor;

export function useEditor(): EditorState {
  return useSyncExternalStore(editor.subscribe, () => editor.state);
}
