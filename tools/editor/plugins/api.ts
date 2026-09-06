// Local file API for the editor (dev only). Reads and writes content/maps and assets/.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import { AssetManifestSchema, GameMapSchema, mapEntities } from '@withergate/shared';
import type { AssetEntry, AssetKind, AssetManifest, GeneratedIndex } from '@withergate/shared';
import { flattenZodIssues, loadContent } from '@withergate/shared/node';

const KIND_DIRS: Record<AssetKind, string> = {
  tile: 'tiles',
  prop: 'props',
  background: 'backgrounds',
  ui: 'ui',
  icon: 'icons',
  audio: 'audio',
};

export function editorApiPlugin({ repoRoot }: { repoRoot: string }): Plugin {
  const contentDir = path.join(repoRoot, 'content');
  const mapsDir = path.join(contentDir, 'maps');
  const assetsDir = path.join(repoRoot, 'assets');
  const manifestPath = path.join(assetsDir, 'manifest.json');
  const generatedPath = path.join(repoRoot, 'game', 'public', 'generated', 'index.json');

  const readJson = <T>(file: string, fallback: T): T => {
    try {
      return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const readManifest = (): AssetManifest => {
    const parsed = AssetManifestSchema.safeParse(readJson(manifestPath, { version: 1, assets: [] }));
    return parsed.success ? parsed.data : { version: 1, assets: [] };
  };
  const writeManifest = (m: AssetManifest) => {
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(m, null, 2)}\n`);
  };
  const mapFile = (id: string) => path.join(mapsDir, `${id}.map.json`);
  const listMapIds = (): string[] =>
    existsSync(mapsDir)
      ? readdirSync(mapsDir)
          .filter((f) => f.endsWith('.map.json'))
          .map((f) => f.slice(0, -'.map.json'.length))
          .sort()
      : [];
  const rawMaps = (): Record<string, any> => {
    const out: Record<string, any> = {};
    for (const id of listMapIds()) {
      const m = readJson<any>(mapFile(id), null);
      if (m) out[id] = m;
    }
    return out;
  };
  const usage = (): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const [id, m] of Object.entries(rawMaps())) {
      const add = (asset: unknown) => {
        if (typeof asset !== 'string' || asset === 'placeholder') return;
        (out[asset] ??= []).push(id);
      };
      for (const layer of Object.values(m.layers ?? {})) for (const p of layer as any[]) add(p?.asset);
      for (const b of m.background ?? []) add(b?.asset);
    }
    for (const k of Object.keys(out)) out[k] = [...new Set(out[k])];
    return out;
  };
  const validId = (id: string) => /^[a-z][a-z0-9_]*$/.test(id);
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^([^a-z])/, 'a_$1') || 'asset';

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage): Promise<any> =>
    new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (c) => {
        data += c;
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });

  async function route(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
    const url = (req.url ?? '/').split('?')[0]!;
    const method = req.method ?? 'GET';
    const parts = url.split('/').filter(Boolean);

    if (method === 'GET' && url === '/index') {
      const generated = readJson<GeneratedIndex | null>(generatedPath, null);
      const result = await loadContent({ root: contentDir, assets: generated, manifest: readManifest() });
      const b = result.bundle;
      const maps = Object.values(b.maps).map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        spawns: mapEntities(m, 'spawn').map((s) => s.id),
        spots: mapEntities(m, 'npc_spot').map((s) => s.id),
      }));
      json(res, 200, {
        maps,
        mapFiles: listMapIds(),
        manifest: readManifest(),
        usage: usage(),
        generated: generated ?? { generatedAt: '', sprites: {}, busts: {} },
        content: {
          villagers: Object.values(b.villagers).map((v) => ({ id: v.profile.id, name: v.profile.name, sprite_set: v.profile.sprite_set ?? v.profile.id })),
          shared: Object.keys(b.shared),
          events: Object.values(b.villagers).flatMap((v) => v.events.map((e) => e.id)),
          cutscenes: Object.keys(b.cutscenes),
          facilities: Object.values(b.facilities).map((f) => ({ id: f.id, name: f.name })),
          items: Object.values(b.items).map((i) => ({ id: i.id, name: i.name })),
          issues: result.issues,
        },
      });
      return;
    }

    if (parts[0] === 'maps') {
      const id = parts[1];
      if (method === 'POST' && !id) {
        const body = await readBody(req);
        const newId = String(body.id ?? '');
        if (!validId(newId)) return json(res, 400, { error: 'map id must be lowercase_with_underscores' });
        if (existsSync(mapFile(newId))) return json(res, 409, { error: 'a map with that id already exists' });
        const width = Number(body.width) || 2560;
        const height = Number(body.height) || 720;
        const interior = !!body.interior;
        const map = {
          id: newId,
          version: 1,
          name: String(body.name || newId),
          interior,
          size: { width, height },
          ground_y: height - 100,
          background: interior ? [] : [{ color: '#7d92aa', parallax: 0.2, silhouette: true, y: 380 }, { color: '#586a82', parallax: 0.45, silhouette: true, y: 470 }],
          layers: { midground: [], ground: [], decor: [], foreground: [] },
          collision: [],
          entities: [{ type: 'spawn', id: 'default', x: 200, y: height - 100, facing: 'right' }],
          ambience: interior
            ? { sky: { top: '#3b2f28', bottom: '#4a3b31' }, ground_color: '#3a2c22' }
            : { sky: { top: '#8fb8de', bottom: '#e7d9c3' }, ground_color: '#6b5a44', tint: { evening: '#ffb070', night: '#1a2a5a' } },
        };
        mkdirSync(mapsDir, { recursive: true });
        writeFileSync(mapFile(newId), `${JSON.stringify(map, null, 2)}\n`);
        return json(res, 200, map);
      }
      if (!id || !validId(id)) return json(res, 400, { error: 'bad map id' });
      if (method === 'GET') {
        if (!existsSync(mapFile(id))) return json(res, 404, { error: 'not found' });
        const raw = readJson<unknown>(mapFile(id), null);
        const parsed = GameMapSchema.safeParse(raw);
        // Return the schema-normalised form (defaults filled in) when valid, else the raw file so it can be repaired.
        return json(res, 200, parsed.success ? parsed.data : raw);
      }
      if (method === 'PUT') {
        const body = await readBody(req);
        if (body?.id !== id) return json(res, 400, { error: 'map id in the body must match the file' });
        const parsed = GameMapSchema.safeParse(body);
        if (!parsed.success) {
          return json(res, 400, { issues: flattenZodIssues(parsed.error).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) });
        }
        const warnings: string[] = [];
        const all = rawMaps();
        for (const ex of mapEntities(parsed.data, 'exit')) {
          const target = ex.to.map === id ? parsed.data : all[ex.to.map];
          if (!target) warnings.push(`exit "${ex.id}" points to unknown map "${ex.to.map}"`);
          else if (!(target.entities ?? []).some((e: any) => e.type === 'spawn' && e.id === ex.to.spawn)) {
            warnings.push(`exit "${ex.id}": map "${ex.to.map}" has no spawn "${ex.to.spawn}"`);
          }
        }
        mkdirSync(mapsDir, { recursive: true });
        writeFileSync(mapFile(id), `${JSON.stringify(body, null, 2)}\n`);
        return json(res, 200, { ok: true, warnings });
      }
      if (method === 'DELETE') {
        if (existsSync(mapFile(id))) unlinkSync(mapFile(id));
        return json(res, 200, { ok: true });
      }
    }

    if (parts[0] === 'assets') {
      const manifest = readManifest();
      if (method === 'GET' && !parts[1]) return json(res, 200, { manifest, usage: usage() });
      if (method === 'POST' && !parts[1]) {
        const body = await readBody(req);
        const kind = body.kind as AssetKind;
        if (!(kind in KIND_DIRS)) return json(res, 400, { error: 'unknown asset kind' });
        const dataUrl = String(body.dataUrl ?? '');
        const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
        if (!m) return json(res, 400, { error: 'expected a base64 data URL' });
        const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' } as Record<string, string>)[m[1]!] ?? 'bin';
        const base = slug(String(body.name ?? 'asset'));
        let id = `${kind}_${base}`;
        let n = 2;
        while (manifest.assets.some((a) => a.id === id)) id = `${kind}_${base}_${n++}`;
        const dir = path.join(assetsDir, KIND_DIRS[kind]);
        mkdirSync(dir, { recursive: true });
        let file = `${KIND_DIRS[kind]}/${base}.${ext}`;
        n = 2;
        while (existsSync(path.join(assetsDir, file))) file = `${KIND_DIRS[kind]}/${base}_${n++}.${ext}`;
        writeFileSync(path.join(assetsDir, file), Buffer.from(m[2]!, 'base64'));
        const entry: AssetEntry = {
          id,
          kind,
          file,
          w: Number(body.w) || undefined,
          h: Number(body.h) || undefined,
          tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
          placeholder: !!body.placeholder,
          credit: body.credit ? String(body.credit) : undefined,
        };
        manifest.assets.push(entry);
        writeManifest(manifest);
        return json(res, 200, entry);
      }
      if (method === 'POST' && parts[1] === 'prune') {
        const used = usage();
        const unusedDir = path.join(assetsDir, '_unused');
        const moved: string[] = [];
        manifest.assets = manifest.assets.filter((a) => {
          if (used[a.id]?.length) return true;
          const from = path.join(assetsDir, a.file);
          if (existsSync(from)) {
            const to = path.join(unusedDir, a.file);
            mkdirSync(path.dirname(to), { recursive: true });
            renameSync(from, to);
          }
          moved.push(a.id);
          return false;
        });
        writeManifest(manifest);
        return json(res, 200, { moved });
      }
      const id = parts[1]!;
      const entry = manifest.assets.find((a) => a.id === id);
      if (!entry) return json(res, 404, { error: 'unknown asset' });
      if (method === 'PATCH') {
        const body = await readBody(req);
        if (Array.isArray(body.tags)) entry.tags = body.tags.map(String);
        if (typeof body.placeholder === 'boolean') entry.placeholder = body.placeholder;
        if (typeof body.credit === 'string') entry.credit = body.credit || undefined;
        if (typeof body.id === 'string' && body.id !== id) {
          const newId = body.id;
          if (!validId(newId)) return json(res, 400, { error: 'ids are lowercase_with_underscores' });
          if (manifest.assets.some((a) => a.id === newId)) return json(res, 409, { error: 'id already used' });
          for (const [mapId, m] of Object.entries(rawMaps())) {
            let changed = false;
            for (const layer of Object.values(m.layers ?? {})) for (const p of layer as any[]) if (p?.asset === id) { p.asset = newId; changed = true; }
            for (const b of m.background ?? []) if (b?.asset === id) { b.asset = newId; changed = true; }
            if (changed) writeFileSync(mapFile(mapId), `${JSON.stringify(m, null, 2)}\n`);
          }
          entry.id = newId;
        }
        writeManifest(manifest);
        return json(res, 200, entry);
      }
      if (method === 'DELETE') {
        const usedBy = usage()[id] ?? [];
        if (usedBy.length) return json(res, 409, { error: 'asset is still used', usedBy });
        const file = path.join(assetsDir, entry.file);
        if (existsSync(file)) unlinkSync(file);
        manifest.assets = manifest.assets.filter((a) => a.id !== id);
        writeManifest(manifest);
        return json(res, 200, { ok: true });
      }
    }
    next();
  }

  return {
    name: 'withergate-editor-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res, next) => {
        route(req, res, next).catch((e: unknown) => json(res, 500, { error: e instanceof Error ? e.message : String(e) }));
      });
    },
  };
}
