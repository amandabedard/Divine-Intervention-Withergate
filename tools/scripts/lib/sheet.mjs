// Slices an asset sheet into pieces.
//
// The packs we use are 768px sheets laid out on a 96px grid: props (buildings,
// trees, vehicles, crops) sit in grid cells and often touch their neighbours, and
// some sheets are full-bleed grids of ground/wall textures. So the slicer works
// top-down rather than by connected pixels:
//
//  1. the 96px grid cells are grouped: neighbouring cells stay together unless
//     the edge between them is a transparent gap, an outline meeting an outline,
//     or a strong colour change (see cellGroups);
//  2. a group of completely opaque cells is a texture block: it is cut where the
//     texture visibly changes (on the 48px tile grid) and then into single grid
//     cells, dropping cells that only repeat the one before them, so every
//     texture ends up as tiles that can be placed with repeatX;
//  3. any other group is a prop region: trim it to its opaque bounding box, cut
//     it where a fully transparent row or column runs across it (or where a line
//     near a grid line is almost transparent, for props that bleed a few pixels
//     into the next cell), and recurse on both halves;
//  4. a region with no such line is one piece, unless it is a cell-sized pattern
//     repeated across the region (rows of crates, fence segments), which is diced.
//
// RPG Maker A2/A3/A4/A5 sheets (recognised by name and size) use their fixed
// layouts. Everything here is pure over pngjs images; used by
// tools/scripts/import-sheets.mjs and the editor's "Import sheet" action.
import { PNG } from 'pngjs';

export const DEFAULT_OPTIONS = {
  /**
   * How to read the sheet: `auto` for packed 96px-grid sheets (props that touch,
   * texture blocks), `objects` for objects spaced out on a transparent
   * background (cut on the gaps only), `grid` for a tileset (every cell is a tile).
   */
  mode: 'auto',
  /** Alpha at or above this counts as opaque. */
  alphaMin: 16,
  /** objects mode: clusters closer than 2*gap pixels are one object. */
  gap: 1,
  /** Grid the sheet's props are packed on. */
  layout: 96,
  /** Tile grid used when cutting full-bleed texture blocks. */
  cell: 48,
  /** A row/column near a layout grid line counts as a gap if at most this share of it is opaque. */
  gapTolerance: 0.04,
  /** Pieces smaller than this in both dimensions are dropped as specks. */
  minSize: 8,
  /** Cut full-bleed regions into tiles where the texture changes. */
  cutTiles: true,
  /** Mean colour change (0-255) across a grid line that counts as a texture boundary. */
  cutThreshold: 22,
  /** Share of matching pixels one cell apart for a region to count as a repeated pattern. */
  repeatSimilarity: 0.45,
};

export function readPng(buffer) {
  return PNG.sync.read(buffer);
}

export function writePng(png) {
  return PNG.sync.write(png);
}

function buildMask(png, alphaMin) {
  const { width: W, height: H, data } = png;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) mask[i] = data[i * 4 + 3] >= alphaMin ? 1 : 0;
  return mask;
}

/** Box dilation by r pixels (separable sliding window). */
function dilate(mask, W, H, r) {
  if (r <= 0) return mask;
  const tmp = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    const row = y * W;
    let count = 0;
    for (let x = -r; x < W; x += 1) {
      const add = x + r;
      if (add < W && mask[row + add]) count += 1;
      const rem = x - r - 1;
      if (rem >= 0 && mask[row + rem]) count -= 1;
      if (x >= 0) tmp[row + x] = count > 0 ? 1 : 0;
    }
  }
  const out = new Uint8Array(W * H);
  for (let x = 0; x < W; x += 1) {
    let count = 0;
    for (let y = -r; y < H; y += 1) {
      const add = y + r;
      if (add < H && tmp[add * W + x]) count += 1;
      const rem = y - r - 1;
      if (rem >= 0 && tmp[rem * W + x]) count -= 1;
      if (y >= 0) out[y * W + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}

/**
 * Objects spaced out on a transparent background: every cluster of opaque
 * pixels (joined across gaps of up to 2*gap pixels) is one piece; boxes that
 * overlap each other substantially are merged.
 */
function objectPieces(mask, W, H, opts) {
  const grown = dilate(mask, W, H, opts.gap ?? 1);
  const labels = new Int32Array(W * H);
  const stack = new Int32Array(W * H);
  const boxes = [];
  for (let i = 0; i < W * H; i += 1) {
    if (!grown[i] || labels[i]) continue;
    const id = boxes.length + 1;
    const box = { x0: W, y0: H, x1: -1, y1: -1 };
    boxes.push(box);
    let sp = 0;
    stack[sp++] = i;
    labels[i] = id;
    while (sp) {
      const p = stack[--sp];
      const x = p % W;
      const y = (p - x) / W;
      if (mask[p]) {
        if (x < box.x0) box.x0 = x;
        if (x > box.x1) box.x1 = x;
        if (y < box.y0) box.y0 = y;
        if (y > box.y1) box.y1 = y;
      }
      const tryPush = (q) => {
        if (grown[q] && !labels[q]) {
          labels[q] = id;
          stack[sp++] = q;
        }
      };
      if (x > 0) tryPush(p - 1);
      if (x < W - 1) tryPush(p + 1);
      if (y > 0) tryPush(p - W);
      if (y < H - 1) tryPush(p + W);
    }
  }
  let rects = boxes.filter((b) => b.x1 >= 0).map((b) => ({ x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 }));
  // merge boxes that overlap by more than a corner (a detached part sitting over its object)
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        const inter = ix * iy;
        const smaller = Math.min(a.w * a.h, b.w * b.h);
        if (inter > 0 && inter >= 0.4 * smaller) {
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          rects[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
          rects.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  const min = opts.minSize;
  rects = rects.filter((r) => !(r.w < min && r.h < min) && Math.min(r.w, r.h) >= 2);
  return rects.map((r) => ({ ...r, kind: 'prop', tags: [], opaque: opaqueFraction(mask, W, r) }));
}

/** Trim transparent borders off a rect; null if fully transparent. */
function trimRect(mask, W, r) {
  let x0 = r.x + r.w;
  let y0 = r.y + r.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = r.y; y < r.y + r.h; y += 1) {
    for (let x = r.x; x < r.x + r.w; x += 1) {
      if (!mask[y * W + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function opaqueFraction(mask, W, r) {
  let n = 0;
  for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) n += mask[y * W + x];
  return n / (r.w * r.h);
}

/** Opaque pixels per line across the region, along `axis` ('y' = per row, 'x' = per column). */
function profile(mask, W, r, axis) {
  const len = axis === 'y' ? r.h : r.w;
  const out = new Int32Array(len);
  for (let y = 0; y < r.h; y += 1) {
    const row = (r.y + y) * W + r.x;
    for (let x = 0; x < r.w; x += 1) {
      if (mask[row + x]) out[axis === 'y' ? y : x] += 1;
    }
  }
  return out;
}

/**
 * Best line to split a region on: the widest fully transparent run, or failing
 * that an almost transparent line near a layout grid line.
 */
function findGapCut(mask, W, r, opts) {
  let best = null;
  const consider = (c) => {
    if (!best || c.score > best.score) best = c;
  };
  for (const axis of ['y', 'x']) {
    const start = axis === 'y' ? r.y : r.x;
    const len = axis === 'y' ? r.h : r.w;
    const across = axis === 'y' ? r.w : r.h;
    if (len < opts.minSize * 2) continue;
    const prof = profile(mask, W, r, axis);
    // fully transparent runs (the region is trimmed, so index 0 and len-1 are opaque)
    let i = 1;
    while (i < len - 1) {
      if (prof[i] !== 0) {
        i += 1;
        continue;
      }
      let j = i;
      while (j + 1 < len - 1 && prof[j + 1] === 0) j += 1;
      consider({ axis, pos: start + ((i + j) >> 1), score: 1000 + (j - i + 1), count: 0 });
      i = j + 1;
    }
    // almost transparent lines where the packing grid says a neighbour may bleed over
    const tol = Math.max(2, Math.round(across * opts.gapTolerance));
    const first = Math.ceil((start + opts.minSize) / opts.layout) * opts.layout;
    for (let g = first; g <= start + len - opts.minSize; g += opts.layout) {
      let min = Infinity;
      let at = -1;
      for (let d = -12; d <= 12; d += 1) {
        const p = g + d - start;
        if (p < opts.minSize || p > len - opts.minSize) continue;
        if (prof[p] < min) {
          min = prof[p];
          at = g + d;
        }
      }
      if (at >= 0 && min > 0 && min <= tol) consider({ axis, pos: at, score: 500 - min, count: min });
    }
  }
  return best;
}

/**
 * Mean colour change across the line just before `pos` (absolute), measured over
 * `band` pixels on each side and only where both sides are opaque, within `region`.
 */
function boundaryStrength(png, mask, region, axis, pos, band) {
  const { width: W, data } = png;
  const sum = [0, 0, 0, 0, 0, 0];
  let na = 0;
  let nb = 0;
  const lo = axis === 'x' ? region.y : region.x;
  const hi = axis === 'x' ? region.y + region.h : region.x + region.w;
  for (let j = lo; j < hi; j += 1) {
    for (let k = 1; k <= band; k += 1) {
      const pa = axis === 'x' ? j * W + (pos - k) : (pos - k) * W + j;
      const pb = axis === 'x' ? j * W + (pos + k - 1) : (pos + k - 1) * W + j;
      if (mask[pa]) {
        sum[0] += data[pa * 4];
        sum[1] += data[pa * 4 + 1];
        sum[2] += data[pa * 4 + 2];
        na += 1;
      }
      if (mask[pb]) {
        sum[3] += data[pb * 4];
        sum[4] += data[pb * 4 + 1];
        sum[5] += data[pb * 4 + 2];
        nb += 1;
      }
    }
  }
  if (!na || !nb) return 0;
  return (Math.abs(sum[0] / na - sum[3] / nb) + Math.abs(sum[1] / na - sum[4] / nb) + Math.abs(sum[2] / na - sum[5] / nb)) / 3;
}

/** Strongest boundary within +-slop of an absolute line position. */
function strengthNear(png, mask, region, axis, pos, slop) {
  const start = axis === 'x' ? region.x : region.y;
  const length = axis === 'x' ? region.w : region.h;
  const band = 4;
  let best = { pos: -1, strength: 0 };
  for (let d = -slop; d <= slop; d += 1) {
    const p = pos + d;
    if (p - band < start || p + band > start + length) continue;
    const s = boundaryStrength(png, mask, region, axis, p, band);
    if (s > best.strength) best = { pos: p, strength: s };
  }
  return best;
}

/** Strongest texture boundary on the tile grid inside a region, along one axis. */
function bestCut(png, mask, region, axis, opts) {
  const start = axis === 'x' ? region.x : region.y;
  const length = axis === 'x' ? region.w : region.h;
  const minPart = opts.cell - 6;
  let best = { pos: -1, strength: 0 };
  const first = Math.ceil((start + minPart) / opts.cell) * opts.cell;
  for (let c = first; c <= start + length - minPart; c += opts.cell) {
    const s = strengthNear(png, mask, region, axis, c, 3);
    if (s.strength > best.strength) best = s;
  }
  return best;
}

/** Recursive cut of a full-bleed region at texture boundaries. */
function cutRegion(png, mask, region, opts, out) {
  const cx = bestCut(png, mask, region, 'x', opts);
  const cy = bestCut(png, mask, region, 'y', opts);
  const pick = cx.strength >= cy.strength ? { axis: 'x', ...cx } : { axis: 'y', ...cy };
  if (pick.pos < 0 || pick.strength < opts.cutThreshold) {
    out.push({ ...region });
    return;
  }
  if (pick.axis === 'x') {
    cutRegion(png, mask, { x: region.x, y: region.y, w: pick.pos - region.x, h: region.h }, opts, out);
    cutRegion(png, mask, { x: pick.pos, y: region.y, w: region.x + region.w - pick.pos, h: region.h }, opts, out);
  } else {
    cutRegion(png, mask, { x: region.x, y: region.y, w: region.w, h: pick.pos - region.y }, opts, out);
    cutRegion(png, mask, { x: region.x, y: pick.pos, w: region.w, h: region.y + region.h - pick.pos }, opts, out);
  }
}

/** Share of opaque pixel pairs one step of `shift` apart along `axis` that have the same colour. */
function similarity(png, mask, r, axis, shift) {
  const { width: W, data } = png;
  let same = 0;
  let n = 0;
  const w = axis === 'x' ? r.w - shift : r.w;
  const h = axis === 'x' ? r.h : r.h - shift;
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 1) {
      const a = (r.y + y) * W + r.x + x;
      const b = axis === 'x' ? a + shift : a + shift * W;
      if (!mask[a] || !mask[b]) continue;
      n += 1;
      if (Math.abs(data[a * 4] - data[b * 4]) <= 12 && Math.abs(data[a * 4 + 1] - data[b * 4 + 1]) <= 12 && Math.abs(data[a * 4 + 2] - data[b * 4 + 2]) <= 12) same += 1;
    }
  }
  return n ? same / n : 0;
}

/** Share of matching pixels between two equal-sized rects (both opaque, within a small colour tolerance). */
function rectSimilarity(png, mask, a, b) {
  const { width: W, data } = png;
  let same = 0;
  let n = 0;
  for (let y = 0; y < a.h; y += 2) {
    for (let x = 0; x < a.w; x += 1) {
      const p = (a.y + y) * W + a.x + x;
      const q = (b.y + y) * W + b.x + x;
      if (!mask[p] || !mask[q]) continue;
      n += 1;
      if (Math.abs(data[p * 4] - data[q * 4]) <= 12 && Math.abs(data[p * 4 + 1] - data[q * 4 + 1]) <= 12 && Math.abs(data[p * 4 + 2] - data[q * 4 + 2]) <= 12) same += 1;
    }
  }
  return n ? same / n : 0;
}

/** Cut lines at multiples of `L` strictly inside [start, start+len), never leaving a sliver under 24px. */
function gridCuts(start, len, L) {
  const cuts = [];
  for (let g = Math.ceil((start + 1) / L) * L; g < start + len; g += L) {
    if (g - start >= 24 && start + len - g >= 24) cuts.push(g);
  }
  return cuts;
}

/**
 * Cut a texture block into single grid cells (both axes). A cell that merely
 * repeats the previous one along the cut axis is dropped, so a seamless strip
 * of one texture becomes one tile and a strip of different tiles keeps them all.
 */
function diceCells(png, mask, r, opts) {
  const L = opts.layout;
  let parts = [r];
  for (const axis of ['x', 'y']) {
    const next = [];
    for (const part of parts) {
      const start = axis === 'x' ? part.x : part.y;
      const len = axis === 'x' ? part.w : part.h;
      const cuts = gridCuts(start, len, L);
      if (!cuts.length) {
        next.push(part);
        continue;
      }
      let prev = start;
      let kept = null;
      for (const c of [...cuts, start + len]) {
        const piece = axis === 'x' ? { x: prev, y: part.y, w: c - prev, h: part.h } : { x: part.x, y: prev, w: part.w, h: c - prev };
        prev = c;
        if (kept && kept.w === piece.w && kept.h === piece.h && rectSimilarity(png, mask, kept, piece) >= 0.6) continue;
        next.push(piece);
        kept = piece;
      }
    }
    parts = next;
  }
  return parts;
}

/** Split a region of k cells along an axis if its content repeats every cell. */
function dice(png, mask, r, opts) {
  const L = opts.layout;
  const parts = [];
  for (const axis of ['x', 'y']) {
    const len = axis === 'x' ? r.w : r.h;
    const other = axis === 'x' ? r.h : r.w;
    const k = Math.round(len / L);
    if (k < 2 || Math.abs(len - k * L) > 6 || other > L + 8) continue;
    if (similarity(png, mask, r, axis, L) < opts.repeatSimilarity) continue;
    const start = axis === 'x' ? r.x : r.y;
    // cut on the sheet's grid so neighbours line up
    const first = Math.ceil((start + 1) / L) * L;
    let prev = start;
    const cuts = [];
    for (let g = first; g < start + len - L / 2; g += L) cuts.push(g);
    for (const c of [...cuts, start + len]) {
      if (c - prev >= 8) parts.push(axis === 'x' ? { x: prev, y: r.y, w: c - prev, h: r.h } : { x: r.x, y: prev, w: r.w, h: c - prev });
      prev = c;
    }
    return parts;
  }
  return [r];
}

const nearMultiple = (v, m, tol) => Math.abs(v - Math.round(v / m) * m) <= tol;

function classify(mask, W, r, opts) {
  const opaque = opaqueFraction(mask, W, r);
  const gridSized = nearMultiple(r.w, opts.cell, 5) && nearMultiple(r.h, opts.cell, 5) && r.w >= opts.cell - 5 && r.h >= opts.cell - 5;
  return { opaque, kind: opaque >= 0.96 && gridSized ? 'tile' : 'prop' };
}

/** Luminance below which a pixel counts as an outline, adapted to the sheet (20th percentile). */
function darkThreshold(png, mask) {
  const { width: W, height: H, data } = png;
  const lums = [];
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const i = y * W + x;
      if (mask[i]) lums.push(0.3 * data[i * 4] + 0.59 * data[i * 4 + 1] + 0.11 * data[i * 4 + 2]);
    }
  }
  lums.sort((a, b) => a - b);
  return lums.length ? lums[Math.floor(lums.length * 0.2)] : 0;
}

/**
 * Evidence that the 96px edge between two grid cells separates two different
 * things: how much of it is a transparent gap, how much of the opaque part has
 * a dark outline on either side, and the colour change across it. Measured at
 * the best of five offsets, since props bleed a pixel or two over the grid.
 */
function edgeStats(png, mask, dark, axis, g, s0, L) {
  const { width: W, height: H, data } = png;
  const op = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
  const isDark = (x, y) => {
    const p = (y * W + x) * 4;
    return 0.3 * data[p] + 0.59 * data[p + 1] + 0.11 * data[p + 2] < dark;
  };
  let best = null;
  for (let d = -2; d <= 2; d += 1) {
    const p = g + d;
    let n = 0;
    let gap = 0;
    let one = 0;
    const sa = [0, 0, 0];
    const sb = [0, 0, 0];
    let na = 0;
    let nb = 0;
    for (let s = s0; s < s0 + L; s += 1) {
      const ax = axis === 'y' ? s : p - 1;
      const ay = axis === 'y' ? p - 1 : s;
      const bx = axis === 'y' ? s : p;
      const by = axis === 'y' ? p : s;
      if (!op(ax, ay) || !op(bx, by)) {
        gap += 1;
        continue;
      }
      n += 1;
      if (isDark(ax, ay) || isDark(bx, by)) one += 1;
      for (let k = 1; k <= 4; k += 1) {
        const qx = axis === 'y' ? s : p - k;
        const qy = axis === 'y' ? p - k : s;
        const rx = axis === 'y' ? s : p + k - 1;
        const ry = axis === 'y' ? p + k - 1 : s;
        if (op(qx, qy)) {
          const q = (qy * W + qx) * 4;
          sa[0] += data[q];
          sa[1] += data[q + 1];
          sa[2] += data[q + 2];
          na += 1;
        }
        if (op(rx, ry)) {
          const q = (ry * W + rx) * 4;
          sb[0] += data[q];
          sb[1] += data[q + 1];
          sb[2] += data[q + 2];
          nb += 1;
        }
      }
    }
    const delta = na && nb ? (Math.abs(sa[0] / na - sb[0] / nb) + Math.abs(sa[1] / na - sb[1] / nb) + Math.abs(sa[2] / na - sb[2] / nb)) / 3 : 0;
    const r = { gap: gap / L, one: n ? one / n : 0, delta };
    const score = r.gap * 100 + r.one * 100 + r.delta;
    if (!best || score > best.score) best = { ...r, score };
  }
  return best;
}

/**
 * Group the sheet's grid cells into pieces: neighbouring cells stay together
 * unless the edge between them is a gap, an outline against an outline, or a
 * strong colour change. Fully opaque cells are texture: they always stay with
 * fully opaque neighbours and never join a prop cell (texture blocks are cut
 * separately, by texture, into tiles).
 */
function cellGroups(png, mask, opts) {
  const { width: W, height: H } = png;
  const L = opts.layout;
  const cols = Math.ceil(W / L);
  const rows = Math.ceil(H / L);
  const rect = (c, r) => ({ x: c * L, y: r * L, w: Math.min(L, W - c * L), h: Math.min(L, H - r * L) });
  const fill = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) fill.push(opaqueFraction(mask, W, rect(c, r)));
  const full = fill.map((f, i) => f >= 0.995 && rect(i % cols, Math.floor(i / cols)).w >= L - 2 && rect(i % cols, Math.floor(i / cols)).h >= L - 2);
  const parent = fill.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const unite = (a, b) => {
    parent[find(a)] = find(b);
  };
  const dark = darkThreshold(png, mask);
  const separated = (e) => e.gap >= 0.85 || (e.one >= 0.85 && e.delta >= 25) || e.delta >= 45;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      if (!fill[i]) continue;
      // completely opaque cells are texture; they stay with each other and never join a prop cell
      if (c + 1 < cols && fill[i + 1] && full[i] === full[i + 1]) {
        if (full[i] || !separated(edgeStats(png, mask, dark, 'x', (c + 1) * L, r * L, rect(c, r).h))) unite(i, i + 1);
      }
      if (r + 1 < rows && fill[i + cols] && full[i] === full[i + cols]) {
        if (full[i] || !separated(edgeStats(png, mask, dark, 'y', (r + 1) * L, c * L, rect(c, r).w))) unite(i, i + cols);
      }
    }
  }
  const groups = new Map();
  fill.forEach((f, i) => {
    if (!f) return;
    const root = find(i);
    if (!groups.has(root)) groups.set(root, { cells: [], full: true });
    const g = groups.get(root);
    g.cells.push(i);
    if (!full[i]) g.full = false;
  });
  return [...groups.values()].map((g) => {
    const cells = g.cells.map((i) => rect(i % cols, Math.floor(i / cols)));
    const x0 = Math.min(...cells.map((c) => c.x));
    const y0 = Math.min(...cells.map((c) => c.y));
    const x1 = Math.max(...cells.map((c) => c.x + c.w));
    const y1 = Math.max(...cells.map((c) => c.y + c.h));
    return { cells, full: g.full, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  });
}

function segment(png, mask, region, opts, out, depth) {
  const W = png.width;
  const r = trimRect(mask, W, region);
  if (!r || (r.w < opts.minSize && r.h < opts.minSize) || Math.min(r.w, r.h) < 3) return;
  const cut = depth < 80 ? findGapCut(mask, W, r, opts) : null;
  if (cut) {
    if (cut.axis === 'y') {
      segment(png, mask, { x: r.x, y: r.y, w: r.w, h: cut.pos - r.y }, opts, out, depth + 1);
      segment(png, mask, { x: r.x, y: cut.pos, w: r.w, h: r.y + r.h - cut.pos }, opts, out, depth + 1);
    } else {
      segment(png, mask, { x: r.x, y: r.y, w: cut.pos - r.x, h: r.h }, opts, out, depth + 1);
      segment(png, mask, { x: cut.pos, y: r.y, w: r.x + r.w - cut.pos, h: r.h }, opts, out, depth + 1);
    }
    return;
  }
  const { opaque, kind } = classify(mask, W, r, opts);
  const big = r.w >= 2 * opts.cell - 8 || r.h >= 2 * opts.cell - 8;
  if (opts.cutTiles && opaque >= 0.9 && big && r.w >= opts.cell - 8 && r.h >= opts.cell - 8) {
    const parts = [];
    cutRegion(png, mask, r, opts, parts);
    if (parts.length > 1) {
      for (const p of parts) {
        const t = trimRect(mask, W, p);
        if (!t || Math.min(t.w, t.h) < 16) continue;
        const inner = [];
        segment(png, mask, t, opts, inner, depth + 1);
        for (const piece of inner) piece.tags = [...new Set([...piece.tags, 'cut'])];
        out.push(...inner);
      }
      return;
    }
  }
  const diced = dice(png, mask, r, opts);
  if (diced.length > 1) {
    for (const p of diced) segment(png, mask, p, opts, out, depth + 1);
    return;
  }
  out.push({ x: r.x, y: r.y, w: r.w, h: r.h, kind, tags: [], opaque: Math.round(opaque * 100) / 100 });
}

/** RPG Maker sheet layouts, recognised by file name and size. */
export function fixedLayout(name, W, H) {
  const n = name.toLowerCase();
  const has = (tag) => new RegExp(`(^|[^a-z0-9])${tag}([^a-z0-9]|$)`).test(n);
  const grid = (cols, rowHeights, colWidth, tag) => {
    const pieces = [];
    let y = 0;
    rowHeights.forEach((rh, ri) => {
      for (let c = 0; c < cols; c += 1) {
        pieces.push({ x: c * colWidth, y, w: colWidth, h: rh, kind: 'tile', tags: typeof tag === 'function' ? tag(ri, rh) : [tag] });
      }
      y += rh;
    });
    return pieces;
  };
  if (has('a4') && W === 768 && H === 720) {
    return { layout: 'a4', pieces: grid(8, [144, 96, 144, 96, 144, 96], 96, (_, rh) => (rh === 144 ? ['wall', 'wall_top'] : ['wall'])) };
  }
  if (has('a2') && W === 768 && H === 576) return { layout: 'a2', pieces: grid(8, [144, 144, 144, 144], 96, 'ground') };
  if (has('a3') && W === 768 && H === 384) return { layout: 'a3', pieces: grid(8, [96, 96, 96, 96], 96, 'building') };
  if (has('a5') && W === 384 && H === 768) return { layout: 'a5', pieces: grid(8, new Array(16).fill(48), 48, 'tile') };
  return null;
}

/** Content hash so identical tiles are imported once. */
export function pieceHash(png, r) {
  const { width: W, data } = png;
  let h = 2166136261;
  for (let y = r.y; y < r.y + r.h; y += 1) {
    for (let x = r.x; x < r.x + r.w; x += 1) {
      const p = (y * W + x) * 4;
      h ^= data[p] ^ (data[p + 1] << 8) ^ (data[p + 2] << 16) ^ (data[p + 3] << 24);
      h = Math.imul(h, 16777619);
    }
  }
  return `${r.w}x${r.h}:${(h >>> 0).toString(16)}`;
}

function dedupe(png, pieces) {
  const seen = new Set();
  return pieces.filter((p) => {
    const h = pieceHash(png, p);
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });
}

/**
 * Find every piece on a sheet.
 * @returns {{ layout: string, pieces: { x:number, y:number, w:number, h:number, kind:'prop'|'tile', tags:string[] }[] }}
 */
export function sliceSheet(png, name = '', options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { width: W, height: H } = png;
  const mask = buildMask(png, opts.alphaMin);
  const fixed = fixedLayout(name, W, H);
  if (fixed) {
    const pieces = fixed.pieces.filter((p) => trimRect(mask, W, p));
    return { layout: fixed.layout, pieces: dedupe(png, pieces) };
  }
  const band = (p) => Math.floor((p.y + p.h / 2) / opts.layout);
  const order = (a, b) => band(a) - band(b) || a.x - b.x;
  if (opts.mode === 'grid') {
    // a tileset: every non-empty cell is a tile, identical cells once
    const L = opts.layout;
    const pieces = [];
    for (let y = 0; y < H; y += L) {
      for (let x = 0; x < W; x += L) {
        const cell = { x, y, w: Math.min(L, W - x), h: Math.min(L, H - y) };
        if (trimRect(mask, W, cell)) pieces.push({ ...cell, kind: 'tile', tags: [], opaque: 1 });
      }
    }
    return { layout: 'grid', pieces: dedupe(png, pieces) };
  }
  if (opts.mode === 'objects') {
    const pieces = objectPieces(mask, W, H, opts);
    pieces.sort(order);
    return { layout: 'objects', pieces: dedupe(png, pieces) };
  }
  const pieces = [];
  const groupMask = new Uint8Array(W * H);
  for (const group of cellGroups(png, mask, opts)) {
    groupMask.fill(0);
    for (const c of group.cells) for (let y = c.y; y < c.y + c.h; y += 1) groupMask.set(mask.subarray(y * W + c.x, y * W + c.x + c.w), y * W + c.x);
    if (group.full) {
      const parts = [];
      if (opts.cutTiles) cutRegion(png, groupMask, group.rect, opts, parts);
      else parts.push(group.rect);
      for (const part of parts) {
        const t = trimRect(groupMask, W, part);
        if (!t) continue;
        for (const d of opts.cutTiles ? diceCells(png, groupMask, t, opts) : [t]) {
          const tt = trimRect(groupMask, W, d);
          if (!tt || Math.min(tt.w, tt.h) < 16) continue;
          pieces.push({ ...tt, kind: 'tile', tags: [], opaque: 1, cells: group.cells });
        }
      }
      continue;
    }
    const before = pieces.length;
    segment(png, groupMask, group.rect, opts, pieces, 0);
    // remember which cells the piece came from so the crop can drop neighbours' pixels
    for (let i = before; i < pieces.length; i += 1) pieces[i].cells = group.cells;
  }
  // reading order: bands of a layout cell top to bottom, then left to right
  pieces.sort(order);
  return { layout: 'auto', pieces: dedupe(png, pieces) };
}

/** Copy a rect out of the sheet; with `mask`, pixels outside the mask become transparent. */
export function cropPng(png, r, mask = null) {
  const out = new PNG({ width: r.w, height: r.h });
  for (let y = 0; y < r.h; y += 1) {
    const src = ((r.y + y) * png.width + r.x) * 4;
    png.data.copy(out.data, y * r.w * 4, src, src + r.w * 4);
    if (mask) {
      for (let x = 0; x < r.w; x += 1) {
        if (!mask[(r.y + y) * png.width + r.x + x]) out.data.fill(0, (y * r.w + x) * 4, (y * r.w + x) * 4 + 4);
      }
    }
  }
  return out;
}

/** Debug: the sheet with piece outlines drawn on it (green props, cyan tiles). */
export function overlayPng(png, pieces) {
  const out = new PNG({ width: png.width, height: png.height });
  png.data.copy(out.data);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
    const p = (y * png.width + x) * 4;
    out.data[p] = c[0];
    out.data[p + 1] = c[1];
    out.data[p + 2] = c[2];
    out.data[p + 3] = 255;
  };
  for (const r of pieces) {
    const c = r.kind === 'tile' ? [0, 220, 255] : r.kind === 'background' ? [255, 80, 255] : [80, 255, 80];
    for (let x = r.x - 1; x <= r.x + r.w; x += 1) {
      set(x, r.y - 1, c);
      set(x, r.y + r.h, c);
    }
    for (let y = r.y - 1; y <= r.y + r.h; y += 1) {
      set(r.x - 1, y, c);
      set(r.x + r.w, y, c);
    }
  }
  return out;
}
