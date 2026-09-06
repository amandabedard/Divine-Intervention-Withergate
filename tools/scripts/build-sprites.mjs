// Packs the named character frames under assets/characters/<set>_sprites/ into
// one trimmed atlas per set, and indexes busts under assets/characters/<set>_busts/.
// Output: game/public/generated/{index.json, sprites/<set>.png, busts/<set>/<mood>.png}
// Numbered exports (frame_0000.png) are ignored on purpose.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ASSETS = path.join(ROOT, 'assets');
const OUT = path.join(ROOT, 'game', 'public', 'generated');
const FRAME_RE = /^([a-z]+?)(\d+)\.png$/i;
const ANIM_ORDER = ['idle', 'leftwalk', 'rightwalk', 'forwardwalk', 'upwalk', 'attack', 'hurt', 'die'];
const FPS = 8;
const PAD = 2;

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function alphaBox(png) {
  let minX = png.width, minY = png.height, maxX = -1, maxY = -1;
  const d = png.data;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (d[(y * png.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

function listSets(kind) {
  const dir = path.join(ASSETS, kind);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function buildSpriteSet(kind, folder) {
  const set = folder.replace(/_sprites$/, '');
  const dir = path.join(ASSETS, kind, folder);
  const byAnim = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('frame_')) continue;
    const m = FRAME_RE.exec(f);
    if (!m) continue;
    const name = m[1].toLowerCase();
    const list = byAnim.get(name) ?? [];
    list.push({ n: Number(m[2]), file: path.join(dir, f) });
    byAnim.set(name, list);
  }
  if (byAnim.size === 0) return null;

  const names = [...byAnim.keys()].sort((a, b) => {
    const ia = ANIM_ORDER.indexOf(a), ib = ANIM_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const frames = [];
  const animations = {};
  for (const name of names) {
    const list = byAnim.get(name).sort((a, b) => a.n - b.n);
    animations[name] = { from: frames.length, to: frames.length + list.length - 1, fps: FPS };
    for (const entry of list) frames.push(readPng(entry.file));
  }
  const w = frames[0].width, h = frames[0].height;
  if (frames.some((f) => f.width !== w || f.height !== h)) {
    throw new Error(`${folder}: all frames must share one size (first is ${w}x${h})`);
  }
  let box = { minX: w, minY: h, maxX: -1, maxY: -1 };
  for (const f of frames) {
    const b = alphaBox(f);
    if (!b) continue;
    box = { minX: Math.min(box.minX, b.minX), minY: Math.min(box.minY, b.minY), maxX: Math.max(box.maxX, b.maxX), maxY: Math.max(box.maxY, b.maxY) };
  }
  if (box.maxX < 0) throw new Error(`${folder}: every frame is fully transparent`);
  const trim = {
    x: Math.max(0, box.minX - PAD),
    y: Math.max(0, box.minY - PAD),
    w: Math.min(w, box.maxX + PAD + 1) - Math.max(0, box.minX - PAD),
    h: Math.min(h, box.maxY + PAD + 1) - Math.max(0, box.minY - PAD),
  };
  const cols = Math.min(frames.length, 8);
  const rows = Math.ceil(frames.length / cols);
  const atlas = new PNG({ width: cols * trim.w, height: rows * trim.h });
  frames.forEach((f, i) => {
    PNG.bitblt(f, atlas, trim.x, trim.y, trim.w, trim.h, (i % cols) * trim.w, Math.floor(i / cols) * trim.h);
  });
  const outDir = path.join(OUT, 'sprites');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${set}.png`), PNG.sync.write(atlas));
  return [
    set,
    {
      image: `generated/sprites/${set}.png`,
      frameWidth: trim.w,
      frameHeight: trim.h,
      animations,
      // feet sit at the bottom of the trimmed box, minus the padding
      originY: 1 - PAD / trim.h,
      source: { w, h },
      trim,
    },
  ];
}

function buildBustSet(kind, folder) {
  const set = folder.replace(/_busts$/, '');
  const dir = path.join(ASSETS, kind, folder);
  const moods = {};
  for (const f of fs.readdirSync(dir)) {
    if (!f.toLowerCase().endsWith('.png') || f.startsWith('frame_')) continue;
    let mood = f.slice(0, -4).toLowerCase();
    if (mood.startsWith(`${set}_`)) mood = mood.slice(set.length + 1);
    if (!/^[a-z][a-z0-9_]*$/.test(mood)) continue;
    const outDir = path.join(OUT, 'busts', set);
    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(path.join(dir, f), path.join(outDir, `${mood}.png`));
    moods[mood] = `generated/busts/${set}/${mood}.png`;
  }
  if (!moods.neutral) {
    const first = Object.keys(moods)[0];
    if (first) {
      console.warn(`  ${folder}: no ${set}_neutral.png; using ${first} as neutral`);
      moods.neutral = moods[first];
    }
  }
  return Object.keys(moods).length ? [set, { moods }] : null;
}

function main() {
  fs.rmSync(path.join(OUT, 'sprites'), { recursive: true, force: true });
  fs.rmSync(path.join(OUT, 'busts'), { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const index = { generatedAt: new Date().toISOString(), sprites: {}, busts: {} };
  for (const kind of ['characters', 'enemies']) {
    for (const folder of listSets(kind)) {
      try {
        if (folder.endsWith('_sprites')) {
          const built = buildSpriteSet(kind, folder);
          if (built) {
            index.sprites[built[0]] = built[1];
            const anims = Object.entries(built[1].animations).map(([n, a]) => `${n}:${a.to - a.from + 1}`).join(' ');
            console.log(`  sprites ${built[0]}: ${built[1].frameWidth}x${built[1].frameHeight} ${anims}`);
          }
        } else if (folder.endsWith('_busts')) {
          const built = buildBustSet(kind, folder);
          if (built) {
            index.busts[built[0]] = built[1];
            console.log(`  busts   ${built[0]}: ${Object.keys(built[1].moods).join(', ')}`);
          }
        }
      } catch (e) {
        console.error(`  ${folder}: ${e.message}`);
        process.exitCode = 1;
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`wrote ${path.relative(ROOT, path.join(OUT, 'index.json'))}`);
}

console.log('build-sprites');
main();
