#!/usr/bin/env node
// Imports asset sheets (768px prop/tile sheets) into the asset library.
//
//   node tools/scripts/import-sheets.mjs --pack town "C:/Users/me/Downloads/town (1)"
//   node tools/scripts/import-sheets.mjs --pack forest --dry --debug out/ forest/*.png
//
// Every sheet is cut into pieces (see lib/sheet.mjs), each piece is written to
// assets/<kind>/<pack>/ and added to assets/manifest.json with the pack name as a
// tag. Re-running on the same sheets is safe: pieces already in the manifest are
// kept, new ones are added. The original sheets are copied to assets/_sheets/
// (not committed) so they can be re-imported from the editor later.
//
// Options:
//   --pack <id>        required; lowercase_with_underscores
//   --dry              report only, write nothing
//   --debug <dir>      also write <dir>/<sheet>.png with the pieces outlined
//   --no-cut           never cut full-bleed blocks into tiles
//   --mode <m>         auto (packed 96px sheets), objects (spaced out on transparency), grid (a tileset)
//   --layout <px>      packing grid of the sheets, or the tile size for grid mode (default 96)
//   --cell <px>        tile grid inside texture blocks (default 48)
//   --min-size <px>    drop specks smaller than this (default 8)
//   --gap <px>         objects mode: clusters closer than 2*gap pixels are one object (default 1)
//   --prune-stale      drop pieces of an earlier cut of these sheets that no longer exist and no map uses
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importSheet } from './lib/import-sheet.mjs';
import { overlayPng, readPng, writePng } from './lib/sheet.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ASSETS = path.join(ROOT, 'assets');
const MANIFEST = path.join(ASSETS, 'manifest.json');

const args = process.argv.slice(2);
const opt = { pack: '', dry: false, debug: '', cut: true, layout: 96, cell: 48, pruneStale: false, mode: 'auto', minSize: 8, gap: 1 };
const inputs = [];
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--pack') opt.pack = args[++i] ?? '';
  else if (a === '--dry') opt.dry = true;
  else if (a === '--debug') opt.debug = args[++i] ?? '';
  else if (a === '--no-cut') opt.cut = false;
  else if (a === '--prune-stale') opt.pruneStale = true;
  else if (a === '--layout') opt.layout = Number(args[++i]);
  else if (a === '--cell') opt.cell = Number(args[++i]);
  else if (a === '--mode') opt.mode = args[++i] ?? 'auto';
  else if (a === '--min-size') opt.minSize = Number(args[++i]);
  else if (a === '--gap') opt.gap = Number(args[++i]);
  else inputs.push(a);
}
if (!opt.pack || !inputs.length) {
  console.error('usage: node tools/scripts/import-sheets.mjs --pack <id> [--dry] [--debug <dir>] [--no-cut] <png files or folders>');
  process.exit(1);
}

const files = [];
for (const input of inputs) {
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) {
    console.error(`not found: ${input}`);
    process.exit(1);
  }
  if (fs.statSync(abs).isDirectory()) {
    for (const f of fs.readdirSync(abs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
      if (f.toLowerCase().endsWith('.png')) files.push(path.join(abs, f));
    }
  } else files.push(abs);
}

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { version: 1, assets: [] };
/** Asset ids placed on any map, so a re-cut never drops something in use. */
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
const used = opt.pruneStale ? usedAssets() : null;
let created = 0;
let existing = 0;
let removed = 0;
for (const file of files) {
  const buffer = fs.readFileSync(file);
  const name = path.basename(file);
  const r = importSheet({ assetsDir: ASSETS, manifest, pack: opt.pack, name, buffer, options: { cutTiles: opt.cut, layout: opt.layout, cell: opt.cell, mode: opt.mode, minSize: opt.minSize, gap: opt.gap }, dryRun: opt.dry, used });
  created += r.created;
  existing += r.existing;
  removed += r.removed;
  const kinds = r.pieces.reduce((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] ?? 0) + 1 }), {});
  console.log(`${opt.pack}/${name.padEnd(28)} ${r.layout.padEnd(5)} ${String(r.pieces.length).padStart(3)} pieces  ${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}${r.existing ? `  (${r.existing} already imported)` : ''}${r.removed ? `  (${r.removed} stale dropped)` : ''}`);
  if (opt.debug) {
    fs.mkdirSync(opt.debug, { recursive: true });
    fs.writeFileSync(path.join(opt.debug, `${opt.pack}_${name}`), writePng(overlayPng(readPng(buffer), r.pieces)));
  }
}
if (!opt.dry) fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${opt.dry ? 'would create' : 'created'} ${created} asset(s), ${existing} already present${opt.pruneStale ? `, ${opt.dry ? 'would drop' : 'dropped'} ${removed} stale` : ''}, manifest now ${manifest.assets.length} entries`);
