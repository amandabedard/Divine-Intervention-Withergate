#!/usr/bin/env node
// Removes whole asset packs from the library: their manifest entries, files,
// kept sheets, and (with --strip-maps) every placement on a map that used them.
//
//   node tools/scripts/remove-pack.mjs town gothic            # refuses if a map still uses a piece
//   node tools/scripts/remove-pack.mjs --strip-maps town      # also removes those placements from content/maps
//   node tools/scripts/remove-pack.mjs --dry town             # report only
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ASSETS = path.join(ROOT, 'assets');
const MANIFEST = path.join(ASSETS, 'manifest.json');
const MAPS = path.join(ROOT, 'content', 'maps');

const args = process.argv.slice(2);
const opt = { dry: false, strip: false };
const packs = [];
for (const a of args) {
  if (a === '--dry') opt.dry = true;
  else if (a === '--strip-maps') opt.strip = true;
  else packs.push(a);
}
if (!packs.length) {
  console.error('usage: node tools/scripts/remove-pack.mjs [--dry] [--strip-maps] <pack> [<pack>...]');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const going = manifest.assets.filter((a) => packs.includes(a.pack));
const goingIds = new Set(going.map((a) => a.id));
if (!going.length) {
  console.error(`no assets belong to: ${packs.join(', ')}`);
  process.exit(1);
}

// placements on maps that use these assets
const mapFiles = fs.existsSync(MAPS) ? fs.readdirSync(MAPS).filter((f) => f.endsWith('.map.json')) : [];
const usedIn = new Map();
for (const f of mapFiles) {
  const m = JSON.parse(fs.readFileSync(path.join(MAPS, f), 'utf8'));
  let count = 0;
  for (const layer of Object.values(m.layers ?? {})) for (const p of layer) if (goingIds.has(p.asset)) count += 1;
  for (const b of m.background ?? []) if (b.asset && goingIds.has(b.asset)) count += 1;
  if (count) usedIn.set(f, { map: m, count });
}
if (usedIn.size && !opt.strip) {
  for (const [f, { count }] of usedIn) console.error(`${f}: ${count} placement(s) use assets from ${packs.join(', ')}; pass --strip-maps to remove them too`);
  process.exit(1);
}

let removedFiles = 0;
for (const a of going) {
  const abs = path.join(ASSETS, a.file);
  if (fs.existsSync(abs)) {
    if (!opt.dry) fs.unlinkSync(abs);
    removedFiles += 1;
  }
}
if (!opt.dry) {
  manifest.assets = manifest.assets.filter((a) => !goingIds.has(a.id));
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const pack of packs) {
    for (const kind of ['props', 'tiles', 'backgrounds', 'ui', 'icons', 'audio']) {
      const dir = path.join(ASSETS, kind, pack);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
    const sheets = path.join(ASSETS, '_sheets', pack);
    if (fs.existsSync(sheets)) fs.rmSync(sheets, { recursive: true, force: true });
  }
  for (const [f, { map }] of usedIn) {
    for (const [name, layer] of Object.entries(map.layers ?? {})) map.layers[name] = layer.filter((p) => !goingIds.has(p.asset));
    map.background = (map.background ?? []).map((b) => (b.asset && goingIds.has(b.asset) ? { ...b, asset: undefined, silhouette: true } : b));
    fs.writeFileSync(path.join(MAPS, f), `${JSON.stringify(map, null, 2)}\n`);
  }
}
console.log(`${opt.dry ? 'would remove' : 'removed'} ${going.length} asset(s) and ${removedFiles} file(s) of ${packs.join(', ')}; manifest ${opt.dry ? 'would have' : 'now has'} ${manifest.assets.length - (opt.dry ? going.length : 0)} entries`);
for (const [f, { count }] of usedIn) console.log(`  ${f}: ${opt.dry ? 'would strip' : 'stripped'} ${count} placement(s)`);
