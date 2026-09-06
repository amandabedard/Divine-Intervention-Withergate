import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, describe, expect, it } from 'vitest';
import type { AssetManifest } from '@withergate/shared';
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
    expect(kinds).toEqual(['prop', 'prop', 'tile', 'tile']);
    expect(first.created).toBe(4);
    expect(manifest.assets).toHaveLength(4);
    const house = manifest.assets.find((a) => a.w === 80 && a.h === 80)!;
    expect(house).toMatchObject({ kind: 'prop', pack: 'test', pixel: true, source: { sheet: 'test/sheet.png', x: 8, y: 8 } });
    expect(house.id).toMatch(/^prop_test_sheet_\d\d$/);
    expect(house.tags).toContain('test');
    expect(fs.existsSync(path.join(dir, house.file))).toBe(true);
    const cropped = PNG.sync.read(fs.readFileSync(path.join(dir, house.file)));
    expect([cropped.width, cropped.height]).toEqual([80, 80]);
    // the two textures are cut apart on the tile grid
    const tiles = manifest.assets.filter((a) => a.kind === 'tile');
    expect(tiles.map((t) => [t.w, t.h])).toEqual([
      [96, 192],
      [96, 192],
    ]);
    // the original sheet is kept for re-imports
    expect(fs.existsSync(path.join(dir, '_sheets', 'test', 'sheet.png'))).toBe(true);

    const again = importSheet({ assetsDir: dir, manifest, pack: 'test', name: 'sheet.png', buffer: makeSheet() });
    expect(again.created).toBe(0);
    expect(again.existing).toBe(4);
    expect(manifest.assets).toHaveLength(4);
  });

  it('only reports in a dry run', () => {
    const manifest: AssetManifest = { version: 1, assets: [] };
    const r = importSheet({ assetsDir: path.join(dir, 'dry'), manifest, pack: 'test', name: 'sheet.png', buffer: makeSheet(), dryRun: true });
    expect(r.pieces).toHaveLength(4);
    expect(manifest.assets).toHaveLength(0);
    expect(fs.existsSync(path.join(dir, 'dry'))).toBe(false);
  });

  it('rejects a bad pack id', () => {
    expect(() => importSheet({ assetsDir: dir, manifest: { version: 1, assets: [] }, pack: 'Bad Pack', name: 'x.png', buffer: makeSheet() })).toThrow(/pack/);
  });
});
