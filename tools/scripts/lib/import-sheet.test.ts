import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, describe, expect, it } from 'vitest';
import type { AssetManifest } from '@withergate/shared';
import { cleanName, importFolder, kindForFolder } from './import-folder.mjs';
import { importSheet } from './import-sheet.mjs';

/** A 384x288 sheet: two props in the top row of cells, a 192x192 block of two textures below. */
function makeSheet(): Buffer {
  const png = new PNG({ width: 384, height: 288 });
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * 384 + x) * 4;
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  };
  // a "house": 80x80 with a dark outline
  for (let y = 8; y < 88; y += 1) for (let x = 8; x < 88; x += 1) set(x, y, x === 8 || y === 8 || x === 87 || y === 87 ? 20 : 160, 120, 90);
  // a small cart
  for (let y = 30; y < 70; y += 1) for (let x = 110; x < 170; x += 1) set(x, y, 90, 70, 40);
  // texture block: cells (0..1, 1..2); left half red noise, right half blue noise
  for (let y = 96; y < 288; y += 1) {
    for (let x = 0; x < 192; x += 1) {
      const n = Math.floor(rnd() * 60);
      if (x < 96) set(x, y, 160 + n, 40 + n, 40);
      else set(x, y, 40, 40 + n, 160 + n);
    }
  }
  return PNG.sync.write(png);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-sheet-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('importSheet', () => {
  it('cuts props and textures into separate library assets and is idempotent', () => {
    const manifest: AssetManifest = { version: 1, assets: [] };
    const first = importSheet({ assetsDir: dir, manifest, pack: 'test', name: 'sheet.png', buffer: makeSheet() });
    const kinds = first.pieces.map((p) => p.kind).sort();
    expect(kinds).toEqual(['prop', 'prop', 'tile', 'tile', 'tile', 'tile']);
    expect(first.created).toBe(6);
    expect(manifest.assets).toHaveLength(6);
    const house = manifest.assets.find((a) => a.w === 80 && a.h === 80)!;
    expect(house).toMatchObject({ kind: 'prop', pack: 'test', pixel: true, source: { sheet: 'test/sheet.png', x: 8, y: 8 } });
    expect(house.id).toMatch(/^prop_test_sheet_\d\d$/);
    expect(house.tags).toContain('test');
    expect(fs.existsSync(path.join(dir, house.file))).toBe(true);
    const cropped = PNG.sync.read(fs.readFileSync(path.join(dir, house.file)));
    expect([cropped.width, cropped.height]).toEqual([80, 80]);
    // the two textures are cut apart, then into grid cells (the noise does not repeat, so all four stay)
    const tiles = manifest.assets.filter((a) => a.kind === 'tile');
    expect(tiles.map((t) => [t.w, t.h])).toEqual([
      [96, 96],
      [96, 96],
      [96, 96],
      [96, 96],
    ]);
    expect(tiles.map((t) => t.id)).toEqual(['tile_test_sheet_01', 'tile_test_sheet_02', 'tile_test_sheet_03', 'tile_test_sheet_04']);
    expect(manifest.assets.filter((a) => a.kind === 'prop').map((a) => a.id)).toEqual(['prop_test_sheet_01', 'prop_test_sheet_02']);
    // the original sheet is kept for re-imports
    expect(fs.existsSync(path.join(dir, '_sheets', 'test', 'sheet.png'))).toBe(true);

    const again = importSheet({ assetsDir: dir, manifest, pack: 'test', name: 'sheet.png', buffer: makeSheet() });
    expect(again.created).toBe(0);
    expect(again.existing).toBe(6);
    expect(manifest.assets).toHaveLength(6);
  });

  it('only reports in a dry run', () => {
    const manifest: AssetManifest = { version: 1, assets: [] };
    const r = importSheet({ assetsDir: path.join(dir, 'dry'), manifest, pack: 'test', name: 'sheet.png', buffer: makeSheet(), dryRun: true });
    expect(r.pieces).toHaveLength(6);
    expect(manifest.assets).toHaveLength(0);
    expect(fs.existsSync(path.join(dir, 'dry'))).toBe(false);
  });

  it('objects mode cuts spaced-out objects by their pixels, grid mode makes every cell a tile', () => {
    // objects: the house and the cart sit in the same rows and columns, so only clusters tell them apart
    const objects = importSheet({ assetsDir: dir, manifest: { version: 1, assets: [] }, pack: 'obj', name: 'sheet.png', buffer: makeSheet(), options: { mode: 'objects' }, dryRun: true });
    const rects = objects.pieces.map((p) => [p.x, p.y, p.w, p.h]).sort((a, b) => a[0]! - b[0]!);
    expect(objects.pieces.every((p) => p.kind === 'prop')).toBe(true);
    expect(rects).toEqual([
      [0, 96, 192, 192],
      [8, 8, 80, 80],
      [110, 30, 60, 40],
    ]);
    // grid: 16px cells, empty ones skipped, identical ones once
    const grid = importSheet({ assetsDir: dir, manifest: { version: 1, assets: [] }, pack: 'grd', name: 'sheet.png', buffer: makeSheet(), options: { mode: 'grid', layout: 96 }, dryRun: true });
    expect(grid.pieces.every((p) => p.kind === 'tile' && p.w === 96 && p.h === 96)).toBe(true);
    expect(grid.pieces.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [96, 0],
      [0, 96],
      [96, 96],
      [0, 192],
      [96, 192],
    ]);
  });

  it('imports a folder of ready-made files, kind by subfolder, and is idempotent', () => {
    const src = path.join(dir, 'pack');
    const png = (w: number, h: number) => {
      const p = new PNG({ width: w, height: h });
      p.data.fill(200);
      return PNG.sync.write(p);
    };
    fs.mkdirSync(path.join(src, 'Background'), { recursive: true });
    fs.mkdirSync(path.join(src, 'Building'), { recursive: true });
    fs.mkdirSync(path.join(src, 'Platformer'), { recursive: true });
    fs.mkdirSync(path.join(src, '__MACOSX', 'Building'), { recursive: true });
    fs.writeFileSync(path.join(src, 'Background', 'Background - Layer 00.png'), png(300, 200));
    fs.writeFileSync(path.join(src, 'Building', 'Village_Level_Set_Building - Wall A 02.png'), png(128, 320));
    fs.writeFileSync(path.join(src, 'Platformer', 'Ground_01.png'), png(128, 128));
    fs.writeFileSync(path.join(src, '__MACOSX', 'Building', '._junk.png'), png(4, 4));
    fs.writeFileSync(path.join(src, 'Preview.png'), png(50, 50));
    const manifest: AssetManifest = { version: 1, assets: [] };
    const r = importFolder({ assetsDir: path.join(dir, 'lib'), manifest, pack: 'village', dir: src, credit: 'craftpix.net' });
    expect(r.created).toBe(3);
    expect(manifest.assets.map((a) => [a.id, a.kind, a.file])).toEqual([
      ['background_village_layer_00', 'background', 'backgrounds/village/layer_00.png'],
      ['prop_village_wall_a_02', 'prop', 'props/village/wall_a_02.png'],
      ['tile_village_ground_01', 'tile', 'tiles/village/ground_01.png'],
    ]);
    expect(manifest.assets[1]).toMatchObject({ w: 128, h: 320, tags: ['village', 'building'], credit: 'craftpix.net', pack: 'village', pixel: false, source: { sheet: 'village/Building/Village_Level_Set_Building - Wall A 02.png', x: 0, y: 0 } });
    expect(fs.existsSync(path.join(dir, 'lib', 'props', 'village', 'wall_a_02.png'))).toBe(true);
    const again = importFolder({ assetsDir: path.join(dir, 'lib'), manifest, pack: 'village', dir: src });
    expect(again.created).toBe(0);
    expect(again.existing).toBe(3);
    expect(cleanName('Cartoon_Medieval_Farm_Level_Set_Environment - Rock 01.png')).toBe('Rock 01');
    expect(kindForFolder('Platformer')).toBe('tile');
  });

  it('rejects a bad pack id', () => {
    expect(() => importSheet({ assetsDir: dir, manifest: { version: 1, assets: [] }, pack: 'Bad Pack', name: 'x.png', buffer: makeSheet() })).toThrow(/pack/);
  });
});
