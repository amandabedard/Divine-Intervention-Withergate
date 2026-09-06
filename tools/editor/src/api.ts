import type { AssetEntry, AssetKind, AssetManifest, GameMap, GeneratedIndex, Issue } from '@withergate/shared';

export interface MapSummary {
  id: string;
  name: string;
  spawns: string[];
  spots: string[];
}

export interface ContentIndex {
  villagers: { id: string; name: string; sprite_set: string }[];
  shared: string[];
  events: string[];
  cutscenes: string[];
  facilities: { id: string; name: string }[];
  items: { id: string; name: string }[];
  issues: Issue[];
}

export interface SheetPiece {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'prop' | 'tile' | 'background';
  tags: string[];
  id?: string;
  status?: 'created' | 'exists';
}

export interface SheetImportResult {
  layout: string;
  width: number;
  height: number;
  pieces: SheetPiece[];
  created: number;
  existing: number;
}

export interface EditorIndex {
  maps: MapSummary[];
  mapFiles: string[];
  manifest: AssetManifest;
  usage: Record<string, string[]>;
  generated: GeneratedIndex;
  content: ContentIndex;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const err = new Error(body.error ?? (body.issues ? body.issues.join('\n') : `${res.status} ${res.statusText}`)) as Error & { body?: unknown };
    err.body = body;
    throw err;
  }
  return body as T;
}

export const api = {
  index: () => call<EditorIndex>('/api/index'),
  getMap: (id: string) => call<GameMap>(`/api/maps/${id}`),
  saveMap: (id: string, map: GameMap) => call<{ ok: true; warnings: string[] }>(`/api/maps/${id}`, { method: 'PUT', body: JSON.stringify(map) }),
  createMap: (body: { id: string; name?: string; width?: number; height?: number; interior?: boolean }) =>
    call<GameMap>('/api/maps', { method: 'POST', body: JSON.stringify(body) }),
  deleteMap: (id: string) => call<{ ok: true }>(`/api/maps/${id}`, { method: 'DELETE' }),
  assets: () => call<{ manifest: AssetManifest; usage: Record<string, string[]> }>('/api/assets'),
  uploadAsset: (body: { name: string; kind: AssetKind; dataUrl: string; w?: number; h?: number; tags?: string[]; placeholder?: boolean }) =>
    call<AssetEntry>('/api/assets', { method: 'POST', body: JSON.stringify(body) }),
  patchAsset: (id: string, patch: Partial<Pick<AssetEntry, 'id' | 'tags' | 'placeholder' | 'credit'>>) =>
    call<AssetEntry>(`/api/assets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteAsset: (id: string) => call<{ ok: true }>(`/api/assets/${id}`, { method: 'DELETE' }),
  prune: (pack?: string) => call<{ moved: string[] }>('/api/assets/prune', { method: 'POST', body: JSON.stringify({ pack: pack ?? null }) }),
  importSheet: (body: { name: string; pack: string; dataUrl: string; options?: { cutTiles?: boolean; layout?: number; cell?: number; gapTolerance?: number; mode?: 'auto' | 'objects' | 'grid' }; dryRun?: boolean }) =>
    call<SheetImportResult>('/api/assets/sheet', { method: 'POST', body: JSON.stringify(body) }),
};

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = dataUrl;
  });
}
