#!/usr/bin/env node
// Imports a folder of ready-made PNGs (one asset per file) into the asset library.
//
//   node tools/scripts/import-folder.mjs --pack village --credit craftpix.net "C:/Users/me/Downloads/village-tileset/PNG"
//   node tools/scripts/import-folder.mjs --pack home --pixel --dry <folder>
//
// The kind comes from each file's subfolder (Background → background,
// Platformer/Tiles/Ground → tile, anything else → prop); the subfolder is added
// as a tag and the file name becomes the id ("Building - Wall A 02.png" →
// prop_village_wall_a_02). Files are copied unchanged to assets/<kind>/<pack>/.
// Re-running is safe: files already imported are kept.
//
// Options:
//   --pack <id>       required; lowercase_with_underscores
//   --pixel           pixel art: drawn without smoothing in the editor and the game
//   --credit <text>   recorded on every entry (e.g. craftpix.net)
//   --dry             report only, write nothing
//   --prune-stale     drop pieces of this pack that came from this folder but no longer exist in it (unless a map uses them)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importFolder } from './lib/import-folder.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ASSETS = path.join(ROOT, 'assets');
const MANIFEST = path.join(ASSETS, 'manifest.json');

const args = process.argv.slice(2);
const opt = { pack: '', pixel: false, credit: '', dry: false, pruneStale: false };
const inputs = [];
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--pack') opt.pack = args[++i] ?? '';
  else if (a === '--pixel') opt.pixel = true;
  else if (a === '--credit') opt.credit = args[++i] ?? '';
  else if (a === '--dry') opt.dry = true;
  else if (a === '--prune-stale') opt.pruneStale = true;
  else inputs.push(a);
}
if (!opt.pack || inputs.length !== 1 || !fs.existsSync(inputs[0]) || !fs.statSync(inputs[0]).isDirectory()) {
  console.error('usage: node tools/scripts/import-folder.mjs --pack <id> [--pixel] [--credit <text>] [--dry] [--prune-stale] <folder>');
  process.exit(1);
}

function usedAssets() {
  const used = new Set();
  const dir = path.join(ROOT, 'content', 'maps');
  if (!fs.existsSync(dir)) return used;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.map.json')) continue;
    for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/"asset":\s*"([a-z0-9_]+)"/g)) used.add(m[1]);
  }
  return used;
}

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { version: 1, assets: [] };
const r = importFolder({
  assetsDir: ASSETS,
  manifest,
  pack: opt.pack,
  dir: path.resolve(inputs[0]),
  pixel: opt.pixel,
  credit: opt.credit || undefined,
  dryRun: opt.dry,
  used: opt.pruneStale ? usedAssets() : null,
});
const kinds = r.files.reduce((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {});
for (const f of r.files) if (f.status === 'created') console.log(`  ${f.kind.padEnd(10)} ${f.id.padEnd(44)} ← ${f.rel}`);
if (!opt.dry) fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `${opt.pack}: ${opt.dry ? 'would create' : 'created'} ${r.created} asset(s) (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}), ${r.existing} already present${opt.pruneStale ? `, ${r.removed} stale dropped` : ''}, manifest now ${manifest.assets.length} entries`,
);
