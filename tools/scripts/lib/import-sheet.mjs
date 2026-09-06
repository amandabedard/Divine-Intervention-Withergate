// Cuts one asset sheet into library assets: writes the pieces under
// assets/<kind>/<pack>/ and adds them to the manifest. Shared by the CLI
// (tools/scripts/import-sheets.mjs) and the editor's "Import sheet" action.
import fs from 'node:fs';
import path from 'node:path';
import { cropPng, readPng, sliceSheet, writePng } from './sheet.mjs';

/** Mirrors ASSET_KIND_DIRS in packages/shared/src/assets.ts (plain Node cannot load the TS). */
export const KIND_DIRS = { tile: 'tiles', prop: 'props', background: 'backgrounds', ui: 'ui', icon: 'icons', audio: 'audio' };

export const slug = (s) =>
  s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 's$1') || 'sheet';

/**
 * @param {object} args
 * @param {string} args.assetsDir   absolute path of the repo's assets/ folder
 * @param {{ version: 1, assets: any[] }} args.manifest   mutated in place
 * @param {string} args.pack        pack id (lowercase_with_underscores)
 * @param {string} args.name        sheet file name, e.g. "1.png"
 * @param {Buffer} args.buffer      the PNG
 * @param {object} [args.options]   slicer options (see sheet.mjs DEFAULT_OPTIONS)
 * @param {boolean} [args.dryRun]   only report what would be created
 * @param {boolean} [args.keepSheet] copy the sheet to assets/_sheets/<pack>/ for later re-imports
 */
export function importSheet({ assetsDir, manifest, pack, name, buffer, options = {}, dryRun = false, keepSheet = true }) {
  if (!/^[a-z][a-z0-9_]*$/.test(pack)) throw new Error('pack must be lowercase_with_underscores');
  const png = readPng(buffer);
  const { layout, pieces } = sliceSheet(png, name, options);
  const sheetRel = `${pack}/${name}`;
  const sheetSlug = slug(name);
  const used = new Set(manifest.assets.map((a) => a.id));
  const files = new Set(manifest.assets.map((a) => a.file));
  const W = png.width;
  const H = png.height;
  const results = [];
  let created = 0;
  let existing = 0;

  const maskFor = (piece) => {
    if (!piece.cells) return null;
    const mask = new Uint8Array(W * H);
    for (const c of piece.cells) {
      for (let y = c.y; y < c.y + c.h; y += 1) {
        for (let x = c.x; x < c.x + c.w; x += 1) {
          if (png.data[(y * W + x) * 4 + 3] >= (options.alphaMin ?? 16)) mask[y * W + x] = 1;
        }
      }
    }
    return mask;
  };

  pieces.forEach((piece, i) => {
    const kind = KIND_DIRS[piece.kind] ? piece.kind : 'prop';
    const found = manifest.assets.find((a) => a.source && a.source.sheet === sheetRel && a.source.x === piece.x && a.source.y === piece.y && a.w === piece.w && a.h === piece.h);
    if (found) {
      existing += 1;
      results.push({ ...piece, id: found.id, file: found.file, status: 'exists' });
      return;
    }
    const nn = String(i + 1).padStart(2, '0');
    let id = `${kind}_${pack}_${sheetSlug}_${nn}`;
    let n = 2;
    while (used.has(id)) id = `${kind}_${pack}_${sheetSlug}_${nn}_${n++}`;
    used.add(id);
    let file = `${KIND_DIRS[kind]}/${pack}/${sheetSlug}_${nn}.png`;
    n = 2;
    while (files.has(file) || fs.existsSync(path.join(assetsDir, file))) file = `${KIND_DIRS[kind]}/${pack}/${sheetSlug}_${nn}_${n++}.png`;
    files.add(file);
    const entry = {
      id,
      kind,
      file,
      w: piece.w,
      h: piece.h,
      tags: [...new Set([pack, ...(piece.tags ?? [])])],
      placeholder: false,
      pack,
      pixel: true,
      source: { sheet: sheetRel, x: piece.x, y: piece.y },
    };
    if (!dryRun) {
      const abs = path.join(assetsDir, file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, writePng(cropPng(png, piece, maskFor(piece))));
      manifest.assets.push(entry);
    }
    created += 1;
    results.push({ ...piece, id, file, status: 'created' });
  });

  if (!dryRun && keepSheet) {
    const dst = path.join(assetsDir, '_sheets', pack, name);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (!fs.existsSync(dst)) fs.writeFileSync(dst, buffer);
  }
  return { layout, width: W, height: H, pieces: results.map(({ cells, ...p }) => p), created, existing };
}
