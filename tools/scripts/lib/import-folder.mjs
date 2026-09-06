// Imports a folder of ready-made PNGs (one asset per file, as shipped by
// craftpix-style packs) into the asset library. Shared by
// tools/scripts/import-folder.mjs. Files are copied as they are; the kind comes
// from the subfolder name (Background → background, Platformer/Tiles/Ground →
// tile, anything else → prop).
import fs from 'node:fs';
import path from 'node:path';
import { KIND_DIRS, slug } from './import-sheet.mjs';

const SKIP = /(^|[\\/])(__MACOSX|preview|example|sample|coupon)/i;

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) };
}

/** Default kind for a file, from the folder it sits in. */
export function kindForFolder(folder) {
  const f = folder.toLowerCase();
  if (/background|backdrop|parallax/.test(f)) return 'background';
  if (/platform|tile|ground|terrain/.test(f)) return 'tile';
  return 'prop';
}

/** "Cartoon_Medieval_Farm_Level_Set_Building - Wall A 02.png" → "Wall A 02". */
export function cleanName(file) {
  let name = path.basename(file).replace(/\.[a-z0-9]+$/i, '');
  const dash = name.lastIndexOf(' - ');
  if (dash >= 0) name = name.slice(dash + 3);
  return name.replace(/\s+/g, ' ').trim();
}

/** Every PNG under `dir`, relative posix paths, sorted, skipping previews and Mac junk. */
export function listPngs(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, entry.name);
      if (SKIP.test(abs.slice(dir.length))) continue;
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.toLowerCase().endsWith('.png')) out.push(path.relative(dir, abs).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * @param {object} args
 * @param {string} args.assetsDir    absolute path of the repo's assets/ folder
 * @param {{ version: 1, assets: any[] }} args.manifest   mutated in place
 * @param {string} args.pack         pack id (lowercase_with_underscores)
 * @param {string} args.dir          folder to import (walked recursively)
 * @param {boolean} [args.pixel]     pixel art (drawn without smoothing)
 * @param {string} [args.credit]     recorded on every entry
 * @param {(folder: string, file: string) => string} [args.kindFor]
 * @param {boolean} [args.dryRun]
 * @param {Set<string>} [args.used]  asset ids maps use; with it, pieces of this pack that came from
 *                                   this folder but no longer exist there are removed unless used
 */
export function importFolder({ assetsDir, manifest, pack, dir, pixel = false, credit, kindFor = kindForFolder, dryRun = false, used = null }) {
  if (!/^[a-z][a-z0-9_]*$/.test(pack)) throw new Error('pack must be lowercase_with_underscores');
  const files = listPngs(dir);
  const takenIds = new Set(manifest.assets.map((a) => a.id));
  const takenFiles = new Set(manifest.assets.map((a) => a.file));
  const results = [];
  let created = 0;
  let existing = 0;
  for (const rel of files) {
    const buffer = fs.readFileSync(path.join(dir, rel));
    const size = pngSize(buffer);
    if (!size) continue;
    const folder = rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '';
    const kind = KIND_DIRS[kindFor(folder, rel)] ? kindFor(folder, rel) : 'prop';
    const sheetRel = `${pack}/${rel}`;
    const found = manifest.assets.find((a) => a.source && a.source.sheet === sheetRel && a.w === size.w && a.h === size.h);
    if (found) {
      existing += 1;
      results.push({ rel, id: found.id, file: found.file, kind: found.kind, status: 'exists' });
      continue;
    }
    const base = slug(cleanName(rel));
    let id = `${kind}_${pack}_${base}`;
    let n = 2;
    while (takenIds.has(id)) id = `${kind}_${pack}_${base}_${n++}`;
    takenIds.add(id);
    let file = `${KIND_DIRS[kind]}/${pack}/${base}.png`;
    n = 2;
    while (takenFiles.has(file) || fs.existsSync(path.join(assetsDir, file))) file = `${KIND_DIRS[kind]}/${pack}/${base}_${n++}.png`;
    takenFiles.add(file);
    const tags = [pack];
    if (folder) tags.push(slug(folder));
    const entry = { id, kind, file, w: size.w, h: size.h, tags, placeholder: false, credit, pack, pixel, source: { sheet: sheetRel, x: 0, y: 0 } };
    if (!credit) delete entry.credit;
    if (!dryRun) {
      const abs = path.join(assetsDir, file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, buffer);
      manifest.assets.push(entry);
    }
    created += 1;
    results.push({ rel, id, file, kind, status: 'created' });
  }
  let removed = 0;
  if (used) {
    const keep = new Set(results.map((r) => r.id));
    const stale = manifest.assets.filter((a) => a.pack === pack && a.source && a.source.sheet.startsWith(`${pack}/`) && !keep.has(a.id) && !used.has(a.id));
    for (const a of stale) {
      if (!dryRun) {
        const abs = path.join(assetsDir, a.file);
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
        manifest.assets.splice(manifest.assets.indexOf(a), 1);
      }
      removed += 1;
    }
  }
  return { files: results, created, existing, removed };
}
