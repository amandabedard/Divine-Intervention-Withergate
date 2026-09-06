import { useEffect, useRef, useState } from 'react';
import { WALK_LINE_OFFSET } from '@withergate/shared';
import type { GameMap, MapEntity, Placement } from '@withergate/shared';
import { LAYERS, editor, useEditor } from './state';
import type { EditorState, LayerName, Selection } from './state';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MANNEQUIN = { w: 46, h: 88 }; // a character at game scale
const SLOT_SIZE = { large: { w: 320, h: 240 }, small: { w: 200, h: 160 } };
const HANDLE = 7;

const images = new Map<string, HTMLImageElement>();
let redrawHook: (() => void) | null = null;
function imageFor(file: string): HTMLImageElement | null {
  const url = `/art/${file}`;
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.onload = () => redrawHook?.();
    img.src = url;
    images.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function assetSize(st: EditorState, p: Placement): { w: number; h: number } {
  if (p.asset === 'placeholder') return { w: p.w ?? 120, h: p.h ?? 120 };
  const entry = st.manifest.assets.find((a) => a.id === p.asset);
  const scale = p.scale ?? 1;
  const w = (entry?.w ?? p.w ?? 120) * scale * (p.repeatX ?? 1);
  const h = (entry?.h ?? p.h ?? 120) * scale;
  return { w, h };
}

export function boundsOf(st: EditorState, map: GameMap, sel: NonNullable<Selection>): Rect | null {
  if (sel.kind === 'placement') {
    const p = map.layers[sel.layer][sel.index];
    if (!p) return null;
    return { x: p.x, y: p.y, ...assetSize(st, p) };
  }
  if (sel.kind === 'collision') {
    const c = map.collision[sel.index];
    return c ? { ...c } : null;
  }
  const e = map.entities[sel.index];
  if (!e) return null;
  return entityBounds(e);
}

function entityBounds(e: MapEntity): Rect {
  switch (e.type) {
    case 'spawn':
    case 'npc_spot':
      // feet stand a little below the ground line, exactly as in the game
      return { x: e.x - MANNEQUIN.w / 2, y: e.y + WALK_LINE_OFFSET - MANNEQUIN.h, w: MANNEQUIN.w, h: MANNEQUIN.h };
    case 'facility_slot': {
      const s = SLOT_SIZE[e.size];
      return { x: e.x - s.w / 2, y: e.y - s.h, w: s.w, h: s.h };
    }
    default:
      return { x: e.x, y: e.y, w: e.w, h: e.h };
  }
}

function isRectLike(map: GameMap, sel: NonNullable<Selection>): boolean {
  if (sel.kind === 'collision') return true;
  if (sel.kind === 'placement') return map.layers[sel.layer][sel.index]?.asset === 'placeholder';
  const e = map.entities[sel.index];
  return !!e && (e.type === 'exit' || e.type === 'interactable' || e.type === 'trigger' || e.type === 'camera_bounds');
}

function setRect(map: GameMap, sel: NonNullable<Selection>, r: Rect): void {
  if (sel.kind === 'collision') {
    map.collision[sel.index] = { x: r.x, y: r.y, w: r.w, h: r.h };
    return;
  }
  if (sel.kind === 'placement') {
    const p = map.layers[sel.layer][sel.index]!;
    p.x = r.x;
    p.y = r.y;
    p.w = r.w;
    p.h = r.h;
    return;
  }
  const e = map.entities[sel.index] as Extract<MapEntity, { w: number }>;
  e.x = r.x;
  e.y = r.y;
  e.w = r.w;
  e.h = r.h;
}

function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Topmost object under a world point: entities, then collision, then placements front to back. */
function hitTest(st: EditorState, map: GameMap, x: number, y: number): Selection {
  if (st.visible.entities) {
    for (let i = map.entities.length - 1; i >= 0; i -= 1) {
      if (inRect(x, y, entityBounds(map.entities[i]!))) return { kind: 'entity', index: i };
    }
  }
  if (st.visible.collision) {
    for (let i = map.collision.length - 1; i >= 0; i -= 1) if (inRect(x, y, map.collision[i]!)) return { kind: 'collision', index: i };
  }
  for (const layer of [...LAYERS].reverse()) {
    if (!st.visible[layer]) continue;
    const list = map.layers[layer];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const p = list[i]!;
      if (inRect(x, y, { x: p.x, y: p.y, ...assetSize(st, p) })) return { kind: 'placement', layer, index: i };
    }
  }
  return null;
}

type HandleName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
function handles(r: Rect): { name: HandleName; x: number; y: number }[] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return [
    { name: 'nw', x: r.x, y: r.y },
    { name: 'n', x: cx, y: r.y },
    { name: 'ne', x: r.x + r.w, y: r.y },
    { name: 'e', x: r.x + r.w, y: cy },
    { name: 'se', x: r.x + r.w, y: r.y + r.h },
    { name: 's', x: cx, y: r.y + r.h },
    { name: 'sw', x: r.x, y: r.y + r.h },
    { name: 'w', x: r.x, y: cy },
  ];
}

function resize(r: Rect, h: HandleName, dx: number, dy: number): Rect {
  let { x, y, w, hgt } = { x: r.x, y: r.y, w: r.w, hgt: r.h };
  if (h.includes('w')) {
    x += dx;
    w -= dx;
  }
  if (h.includes('e')) w += dx;
  if (h.includes('n')) {
    y += dy;
    hgt -= dy;
  }
  if (h.includes('s')) hgt += dy;
  if (w < 8) {
    if (h.includes('w')) x = r.x + r.w - 8;
    w = 8;
  }
  if (hgt < 8) {
    if (h.includes('n')) y = r.y + r.h - 8;
    hgt = 8;
  }
  return { x, y, w, h: hgt };
}

// --- drawing ----------------------------------------------------------------

function hills(ctx: CanvasRenderingContext2D, color: string, baseY: number, width: number, seed: number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  const step = 90;
  ctx.moveTo(-step, 900);
  for (let x = -step; x <= width + step; x += step) {
    const y = baseY + Math.sin(x * 0.004 + seed) * 42 + Math.sin(x * 0.0113 + seed * 1.7) * 22 + Math.cos(x * 0.021 + seed * 0.3) * 9;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width + step, 900);
  ctx.closePath();
  ctx.fill();
}

function drawMap(ctx: CanvasRenderingContext2D, st: EditorState, size: { w: number; h: number }): void {
  const map = st.map;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#15161c';
  ctx.fillRect(0, 0, size.w, size.h);
  if (!map) return;
  ctx.setTransform(st.zoom, 0, 0, st.zoom, st.pan.x, st.pan.y);
  const W = map.size.width;
  const H = map.size.height;

  // scenery
  if (st.visible.scenery) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, map.ambience.sky?.top ?? (map.interior ? '#3b2f28' : '#8fb8de'));
    sky.addColorStop(1, map.ambience.sky?.bottom ?? (map.interior ? '#4a3b31' : '#e7d9c3'));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    if (!map.interior) {
      map.background.forEach((layer, i) => {
        if (layer.asset) {
          const entry = st.manifest.assets.find((a) => a.id === layer.asset);
          const img = entry ? imageFor(entry.file) : null;
          if (img) {
            for (let x = 0; x < W; x += img.naturalWidth) {
              ctx.drawImage(img, x, layer.y);
              if (!layer.repeatX) break;
            }
            return;
          }
        }
        hills(ctx, layer.color ?? '#7d92aa', layer.y || 400, W, i * 3.1 + map.id.length);
      });
    }
    ctx.fillStyle = map.ambience.ground_color ?? (map.interior ? '#3a2c22' : '#6b5a44');
    ctx.fillRect(0, map.ground_y, W, H - map.ground_y);
  } else {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, W, H);
  }
  // ground line
  ctx.strokeStyle = 'rgba(255,240,200,0.6)';
  ctx.lineWidth = 2 / st.zoom;
  ctx.beginPath();
  ctx.moveTo(0, map.ground_y);
  ctx.lineTo(W, map.ground_y);
  ctx.stroke();

  // grid
  if (st.visible.grid && st.grid * st.zoom >= 6) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1 / st.zoom;
    ctx.beginPath();
    for (let x = 0; x <= W; x += st.grid) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = 0; y <= H; y += st.grid) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
  }

  const label = (text: string, x: number, y: number, color = '#fff4e0', size = 14) => {
    ctx.font = `${Math.max(size, size / st.zoom)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3 / st.zoom;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };

  // placements
  for (const layer of LAYERS) {
    if (!st.visible[layer]) continue;
    for (const p of map.layers[layer]) {
      const { w, h } = assetSize(st, p);
      if (p.asset === 'placeholder') {
        ctx.fillStyle = p.color ?? '#777';
        ctx.fillRect(p.x, p.y, w, h);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 3 / st.zoom;
        ctx.strokeRect(p.x, p.y, w, h);
        if (h >= 200) {
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(p.x, p.y, w, 18);
        }
        label(p.label ?? 'block', p.x + w / 2, p.y + Math.min(h - 6, 40), '#fff4e0', 16);
        continue;
      }
      const entry = st.manifest.assets.find((a) => a.id === p.asset);
      const img = entry ? imageFor(entry.file) : null;
      if (img) {
        const scale = p.scale ?? 1;
        const reps = p.repeatX ?? 1;
        ctx.save();
        if (p.flipX) {
          ctx.translate(p.x + w, p.y);
          ctx.scale(-1, 1);
          ctx.translate(-p.x, -p.y);
        }
        for (let i = 0; i < reps; i += 1) ctx.drawImage(img, p.x + i * img.naturalWidth * scale, p.y, img.naturalWidth * scale, img.naturalHeight * scale);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(255,0,255,0.25)';
        ctx.fillRect(p.x, p.y, w, h);
        label(`missing: ${p.asset}`, p.x + w / 2, p.y + 20, '#f8c', 14);
      }
    }
  }

  // collision
  if (st.visible.collision) {
    for (const c of map.collision) {
      ctx.fillStyle = 'rgba(224,90,90,0.25)';
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = 'rgba(224,90,90,0.9)';
      ctx.lineWidth = 2 / st.zoom;
      ctx.strokeRect(c.x, c.y, c.w, c.h);
    }
  }

  // entities
  if (st.visible.entities) {
    for (const e of map.entities) {
      const b = entityBounds(e);
      switch (e.type) {
        case 'spawn':
        case 'npc_spot': {
          const color = e.type === 'spawn' ? '#7fd08a' : '#c9a0ff';
          ctx.fillStyle = e.type === 'spawn' ? 'rgba(127,208,138,0.35)' : 'rgba(201,160,255,0.35)';
          ctx.strokeStyle = color;
          ctx.lineWidth = 2 / st.zoom;
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, b.w, b.h, 12);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(e.x, b.y - 16, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // facing arrow
          ctx.beginPath();
          const dir = e.facing === 'left' ? -1 : 1;
          const fy = e.y + WALK_LINE_OFFSET;
          ctx.moveTo(e.x + dir * 8, fy - 40);
          ctx.lineTo(e.x + dir * 24, fy - 40);
          ctx.lineTo(e.x + dir * 16, fy - 48);
          ctx.moveTo(e.x + dir * 24, fy - 40);
          ctx.lineTo(e.x + dir * 16, fy - 32);
          ctx.stroke();
          label(`${e.type === 'spawn' ? '⚑' : '☺'} ${e.id}`, e.x, b.y - 34, color);
          break;
        }
        case 'facility_slot':
          ctx.setLineDash([12 / st.zoom, 8 / st.zoom]);
          ctx.strokeStyle = 'rgba(255,244,224,0.7)';
          ctx.lineWidth = 2 / st.zoom;
          ctx.strokeRect(b.x, b.y, b.w, b.h);
          ctx.setLineDash([]);
          label(`slot ${e.id} (${e.size})`, e.x, b.y + b.h / 2, '#fff4e0');
          break;
        case 'exit':
          ctx.fillStyle = 'rgba(96,165,250,0.25)';
          ctx.fillRect(b.x, b.y, b.w, b.h);
          ctx.strokeStyle = '#60a5fa';
          ctx.lineWidth = 2 / st.zoom;
          ctx.strokeRect(b.x, b.y, b.w, b.h);
          label(`⇥ ${e.id} → ${e.to.map}/${e.to.spawn}`, b.x + b.w / 2, b.y - 6, '#bfdbfe');
          break;
        case 'interactable':
          ctx.fillStyle = 'rgba(250,204,21,0.18)';
          ctx.fillRect(b.x, b.y, b.w, b.h);
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 2 / st.zoom;
          ctx.strokeRect(b.x, b.y, b.w, b.h);
          label(`! ${e.label ?? e.id} (${e.action.kind})`, b.x + b.w / 2, b.y - 6, '#fde68a');
          break;
        case 'trigger':
          ctx.setLineDash([8 / st.zoom, 6 / st.zoom]);
          ctx.strokeStyle = '#fb923c';
          ctx.lineWidth = 2 / st.zoom;
          ctx.strokeRect(b.x, b.y, b.w, b.h);
          ctx.setLineDash([]);
          label(`⚡ ${e.id}`, b.x + b.w / 2, b.y - 6, '#fdba74');
          break;
        case 'camera_bounds':
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 3 / st.zoom;
          ctx.strokeRect(b.x, b.y, b.w, b.h);
          label(`camera ${e.id}`, b.x + b.w / 2, b.y - 6, '#a5f3fc');
          break;
        default:
          break;
      }
    }
  }

  // map border
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2 / st.zoom;
  ctx.strokeRect(0, 0, W, H);

  // selection
  if (st.selection) {
    const b = boundsOf(st, map, st.selection);
    if (b) {
      ctx.strokeStyle = '#d9b66a';
      ctx.lineWidth = 2 / st.zoom;
      ctx.setLineDash([6 / st.zoom, 4 / st.zoom]);
      ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
      ctx.setLineDash([]);
      if (isRectLike(map, st.selection)) {
        ctx.fillStyle = '#d9b66a';
        for (const h of handles(b)) ctx.fillRect(h.x - HANDLE / st.zoom / 2, h.y - HANDLE / st.zoom / 2, HANDLE / st.zoom, HANDLE / st.zoom);
      }
    }
  }
}

// --- component -----------------------------------------------------------------

type Drag =
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
  | { kind: 'move'; sel: NonNullable<Selection>; startX: number; startY: number; orig: Rect; moved: boolean }
  | { kind: 'resize'; sel: NonNullable<Selection>; handle: HandleName; startX: number; startY: number; orig: Rect }
  | { kind: 'draw'; startX: number; startY: number; index: number };

export function MapCanvas() {
  const st = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const dragRef = useRef<Drag | null>(null);
  const spaceRef = useRef(false);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.w * dpr);
    canvas.height = Math.floor(size.h * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const draw = () => {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const inner = ctx;
      // drawMap sets its own transform relative to identity; account for dpr by scaling pan/zoom
      const scaled: EditorState = { ...editor.state, zoom: editor.state.zoom * dpr, pan: { x: editor.state.pan.x * dpr, y: editor.state.pan.y * dpr } };
      inner.setTransform(1, 0, 0, 1, 0, 0);
      drawMap(inner, scaled, { w: size.w * dpr, h: size.h * dpr });
      ctx.restore();
    };
    redrawHook = draw;
    draw();
    return () => {
      if (redrawHook === draw) redrawHook = null;
    };
  }, [st, size]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).matches('input,textarea,select')) {
        spaceRef.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const toWorld = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const s = editor.state;
    return { x: (e.clientX - rect.left - s.pan.x) / s.zoom, y: (e.clientY - rect.top - s.pan.y) / s.zoom };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = editor.state;
    const map = s.map;
    canvasRef.current!.setPointerCapture(e.pointerId);
    if (e.button === 1 || spaceRef.current || (e.button === 0 && e.altKey)) {
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: s.pan.x, panY: s.pan.y };
      return;
    }
    if (!map || e.button !== 0) return;
    const w = toWorld(e);
    const snap = (v: number) => editor.snapValue(v);

    if (s.tool === 'select') {
      // resize handle?
      if (s.selection && isRectLike(map, s.selection)) {
        const b = boundsOf(s, map, s.selection);
        if (b) {
          const tol = (HANDLE + 4) / s.zoom;
          for (const h of handles(b)) {
            if (Math.abs(w.x - h.x) <= tol && Math.abs(w.y - h.y) <= tol) {
              dragRef.current = { kind: 'resize', sel: s.selection, handle: h.name, startX: w.x, startY: w.y, orig: b };
              return;
            }
          }
        }
      }
      const hit = hitTest(s, map, w.x, w.y);
      editor.select(hit);
      if (hit) {
        const b = boundsOf(s, map, hit)!;
        dragRef.current = { kind: 'move', sel: hit, startX: w.x, startY: w.y, orig: b, moved: false };
      }
      return;
    }
    if (s.tool === 'erase') {
      const hit = hitTest(s, map, w.x, w.y);
      if (hit) {
        editor.select(hit);
        editor.deleteSelection();
      }
      return;
    }
    if (s.tool === 'place') {
      if (!s.assetId) return;
      const x = snap(w.x);
      const y = snap(w.y);
      editor.updateMap((m) => {
        const p: Placement =
          s.assetId === 'placeholder'
            ? { asset: 'placeholder', x, y: Math.min(y, m.ground_y - 200), w: 200, h: 200, color: '#8a6a4a', label: 'Block' }
            : { asset: s.assetId!, x, y, scale: 1 };
        m.layers[s.layer].push(p);
      });
      const idx = editor.state.map!.layers[s.layer].length - 1;
      editor.select({ kind: 'placement', layer: s.layer, index: idx });
      if (!e.shiftKey) editor.set({ tool: 'select' });
      return;
    }
    if (s.tool === 'collision') {
      const x = snap(w.x);
      const y = snap(w.y);
      editor.updateMap((m) => {
        m.collision.push({ x, y, w: s.grid, h: s.grid });
      });
      const idx = editor.state.map!.collision.length - 1;
      editor.select({ kind: 'collision', index: idx });
      dragRef.current = { kind: 'draw', startX: x, startY: y, index: idx };
      return;
    }
    if (s.tool === 'entity') {
      const x = snap(w.x);
      const y = snap(w.y);
      editor.updateMap((m) => {
        m.entities.push(newEntity(s, m, x, y));
      });
      const idx = editor.state.map!.entities.length - 1;
      editor.select({ kind: 'entity', index: idx });
      if (!e.shiftKey) editor.set({ tool: 'select' });
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const w = toWorld(e);
    setCursor({ x: Math.round(w.x), y: Math.round(w.y) });
    const d = dragRef.current;
    if (!d) return;
    const s = editor.state;
    if (d.kind === 'pan') {
      editor.set({ pan: { x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) } });
      return;
    }
    if (!s.map) return;
    const dx = w.x - d.startX;
    const dy = w.y - d.startY;
    if (d.kind === 'move') {
      if (Math.abs(dx) < 2 / s.zoom && Math.abs(dy) < 2 / s.zoom && !d.moved) return;
      d.moved = true;
      const nx = editor.snapValue(d.orig.x + dx);
      const ny = editor.snapValue(d.orig.y + dy);
      editor.updateMap((m) => {
        const o = objectOf(m, d.sel);
        if (!o) return;
        const b = boundsOf(s, m, d.sel)!;
        // keep the object's anchor offset relative to its bounds
        const offX = o.x - b.x;
        const offY = o.y - b.y;
        o.x = nx + offX;
        o.y = ny + offY;
      }, `move:${JSON.stringify(d.sel)}`);
      return;
    }
    if (d.kind === 'resize') {
      const r = resize(d.orig, d.handle, editor.snapValue(dx), editor.snapValue(dy));
      editor.updateMap((m) => setRect(m, d.sel, r), `resize:${JSON.stringify(d.sel)}`);
      return;
    }
    if (d.kind === 'draw') {
      const x2 = editor.snapValue(w.x);
      const y2 = editor.snapValue(w.y);
      editor.updateMap((m) => {
        const c = m.collision[d.index];
        if (!c) return;
        c.x = Math.min(d.startX, x2);
        c.y = Math.min(d.startY, y2);
        c.w = Math.max(s.grid, Math.abs(x2 - d.startX));
        c.h = Math.max(s.grid, Math.abs(y2 - d.startY));
      }, `draw:${d.index}`);
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const s = editor.state;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const zoom = Math.min(3, Math.max(0.1, s.zoom * factor));
    const wx = (mx - s.pan.x) / s.zoom;
    const wy = (my - s.pan.y) / s.zoom;
    editor.set({ zoom, pan: { x: mx - wx * zoom, y: my - wy * zoom } });
  };

  const cursorStyle = st.tool === 'select' ? 'default' : st.tool === 'erase' ? 'not-allowed' : 'crosshair';

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, cursor: cursorStyle }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="canvas-status">
        {st.map ? `${st.map.id} · ${st.map.size.width}×${st.map.size.height} · ground ${st.map.ground_y}` : 'no map'} · cursor {cursor.x}, {cursor.y} · zoom {Math.round(st.zoom * 100)}% ·
        space+drag or middle mouse to pan · wheel to zoom
      </div>
    </div>
  );
}

function objectOf(map: GameMap, sel: NonNullable<Selection>): { x: number; y: number } | undefined {
  if (sel.kind === 'placement') return map.layers[sel.layer][sel.index];
  if (sel.kind === 'entity') return map.entities[sel.index];
  return map.collision[sel.index];
}

function newEntity(s: EditorState, m: GameMap, x: number, y: number): MapEntity {
  const id = editor.uniqueEntityId(m, s.entityType);
  const gy = m.ground_y;
  const other = s.maps.find((mm) => mm.id !== m.id) ?? s.maps[0];
  switch (s.entityType) {
    case 'spawn':
      return { type: 'spawn', id, x, y: gy, facing: 'right' };
    case 'npc_spot':
      return { type: 'npc_spot', id, x, y: gy, facing: 'left' };
    case 'exit':
      return {
        type: 'exit',
        id,
        x,
        y: gy - 200,
        w: 60,
        h: 200,
        direction: 'right',
        to: { map: other?.id ?? m.id, spawn: other?.spawns[0] ?? 'default' },
      };
    case 'interactable':
      return { type: 'interactable', id, x, y: gy - 120, w: 70, h: 120, label: 'New', action: { kind: 'sign', text: '[PLACEHOLDER: sign text]' } };
    case 'trigger':
      return { type: 'trigger', id, x, y: gy - 200, w: 100, h: 200, once: true, action: { kind: 'run_script', script: s.content.shared[0] ?? 'shared/notice_board' } };
    case 'facility_slot':
      return { type: 'facility_slot', id, x, y: gy, size: 'large' };
    case 'camera_bounds':
    default:
      return { type: 'camera_bounds', id, x: 0, y: 0, w: m.size.width, h: m.size.height };
  }
}

export type { LayerName };
