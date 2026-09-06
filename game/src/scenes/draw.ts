// Drawing helpers for placeholder art. Everything here is replaced by real assets later.
import Phaser from 'phaser';
import type { GameMap, Placement } from '@withergate/shared';

export const DEPTH = {
  sky: -100,
  hillsFar: -80,
  hillsNear: -70,
  ground: -40,
  midground: -20,
  slot: -15,
  interactable: -10,
  characters: 0, // depth = y for y-sorting
  foreground: 500,
  prompt: 800,
  tint: 900,
};

export function hex(color: string | undefined, fallback: number): number {
  if (!color) return fallback;
  try {
    return Phaser.Display.Color.HexStringToColor(color).color;
  } catch {
    return fallback;
  }
}

export function drawSky(scene: Phaser.Scene, map: GameMap): Phaser.GameObjects.Graphics {
  const top = hex(map.ambience.sky?.top, map.interior ? 0x3b2f28 : 0x8fb8de);
  const bottom = hex(map.ambience.sky?.bottom, map.interior ? 0x4a3b31 : 0xe7d9c3);
  const g = scene.add.graphics();
  g.fillGradientStyle(top, top, bottom, bottom, 1);
  g.fillRect(0, 0, 1280, 720);
  g.setScrollFactor(0).setDepth(DEPTH.sky);
  return g;
}

export function drawHills(
  scene: Phaser.Scene,
  color: number,
  parallax: number,
  baseY: number,
  mapWidth: number,
  seed: number,
  depth: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(color, 1);
  const width = Math.max(1280, mapWidth * parallax + 1280);
  const points: Phaser.Math.Vector2[] = [];
  const step = 90;
  for (let x = -step; x <= width + step; x += step) {
    const y = baseY + Math.sin(x * 0.004 + seed) * 42 + Math.sin(x * 0.0113 + seed * 1.7) * 22 + Math.cos(x * 0.021 + seed * 0.3) * 9;
    points.push(new Phaser.Math.Vector2(x, y));
  }
  points.push(new Phaser.Math.Vector2(width + step, 800), new Phaser.Math.Vector2(-step, 800));
  g.fillPoints(points, true);
  g.setScrollFactor(parallax, 0).setDepth(depth);
  return g;
}

export function drawGround(scene: Phaser.Scene, map: GameMap): void {
  const g = scene.add.graphics();
  const ground = hex(map.ambience.ground_color, map.interior ? 0x3a2c22 : 0x6b5a44);
  g.fillStyle(ground, 1);
  g.fillRect(0, map.ground_y, map.size.width, map.size.height - map.ground_y);
  const path = Phaser.Display.Color.IntegerToColor(ground).lighten(12).color;
  g.fillStyle(path, 1);
  g.fillRect(0, map.ground_y - 4, map.size.width, 30);
  g.setDepth(DEPTH.ground);
  if (map.interior) {
    // wall skirting
    const skirt = Phaser.Display.Color.IntegerToColor(ground).darken(10).color;
    g.fillStyle(skirt, 1);
    g.fillRect(0, map.ground_y - 16, map.size.width, 12);
  }
}

export function drawPlacement(scene: Phaser.Scene, p: Placement, depth: number): Phaser.GameObjects.GameObject {
  if (p.asset !== 'placeholder' && scene.textures.exists(`asset:${p.asset}`)) {
    const key = `asset:${p.asset}`;
    if (p.repeatX && p.repeatX > 1) {
      const src = scene.textures.get(key).getSourceImage() as { width: number; height: number };
      const scale = p.scale ?? 1;
      return scene.add
        .tileSprite(p.x, p.y, src.width * p.repeatX, src.height, key)
        .setOrigin(0, 0)
        .setScale(scale)
        .setDepth(depth);
    }
    const img = scene.add.image(p.x, p.y, key).setOrigin(0, 0).setDepth(depth);
    if (p.flipX) img.setFlipX(true);
    if (p.scale) img.setScale(p.scale);
    return img;
  }
  const w = p.w ?? 120;
  const h = p.h ?? 120;
  const color = hex(p.color, 0x777777);
  const dark = Phaser.Display.Color.IntegerToColor(color).darken(18).color;
  const g = scene.add.graphics();
  g.fillStyle(color, 1);
  g.fillRect(0, 0, w, h);
  g.lineStyle(3, dark, 1);
  g.strokeRect(1.5, 1.5, w - 3, h - 3);
  // roof line for building-sized blocks
  if (h >= 200) {
    g.fillStyle(dark, 1);
    g.fillRect(0, 0, w, 18);
  }
  const label = scene.add
    .text(w / 2, Math.min(h - 14, 34), p.label ?? p.asset, {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      color: '#fff4e0',
      stroke: '#00000088',
      strokeThickness: 3,
      align: 'center',
      wordWrap: { width: w - 12 },
    })
    .setOrigin(0.5, 0);
  const c = scene.add.container(p.x, p.y, [g, label]).setDepth(depth);
  return c;
}

export function drawSlot(scene: Phaser.Scene, x: number, y: number, size: 'small' | 'large', id: string): void {
  const w = size === 'large' ? 320 : 200;
  const h = size === 'large' ? 240 : 160;
  const g = scene.add.graphics();
  g.lineStyle(2, 0xfff4e0, 0.35);
  const dash = 12;
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const n = Math.floor(len / dash);
    for (let i = 0; i < n; i += 2) {
      g.lineBetween(x0 + (dx * i) / n, y0 + (dy * i) / n, x0 + (dx * (i + 1)) / n, y0 + (dy * (i + 1)) / n);
    }
  };
  rect(0, 0, w, 0);
  rect(w, 0, w, h);
  rect(w, h, 0, h);
  rect(0, h, 0, 0);
  const label = scene.add
    .text(w / 2, h / 2, `Build slot\n${id}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '16px',
      color: '#fff4e0',
      align: 'center',
    })
    .setOrigin(0.5)
    .setAlpha(0.6);
  scene.add.container(x - w / 2, y - h, [g, label]).setDepth(DEPTH.slot);
}

export function drawInteractable(scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string): void {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.18);
  g.fillRoundedRect(0, 0, w, h, 8);
  g.lineStyle(2, 0xfff4e0, 0.5);
  g.strokeRoundedRect(1, 1, w - 2, h - 2, 8);
  const t = scene.add
    .text(w / 2, -8, label, {
      fontFamily: 'Georgia, serif',
      fontSize: '15px',
      color: '#fff4e0',
      stroke: '#00000099',
      strokeThickness: 3,
    })
    .setOrigin(0.5, 1);
  scene.add.container(x, y, [g, t]).setDepth(DEPTH.interactable);
}

export function makeBubble(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0xfff8ea, 0.96);
  g.fillRoundedRect(-30, -40, 60, 38, 12);
  g.fillTriangle(-8, -3, 8, -3, 0, 8);
  g.lineStyle(2, 0x2a1a10, 0.6);
  g.strokeRoundedRect(-30, -40, 60, 38, 12);
  const dots = scene.add
    .text(0, -22, '…', { fontFamily: 'Georgia, serif', fontSize: '30px', color: '#2a1a10', fontStyle: 'bold' })
    .setOrigin(0.5, 0.6);
  const c = scene.add.container(0, 0, [g, dots]).setDepth(DEPTH.prompt).setVisible(false);
  return c;
}

export function makePlaceholderCharacter(scene: Phaser.Scene, x: number, y: number, name: string): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0x9a8fbf, 1);
  g.fillRoundedRect(-24, -110, 48, 110, 10);
  g.fillStyle(0xe8d8c8, 1);
  g.fillCircle(0, -128, 20);
  const t = scene.add
    .text(0, -156, name, { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#fff4e0', stroke: '#000000aa', strokeThickness: 3 })
    .setOrigin(0.5, 1);
  return scene.add.container(x, y, [g, t]);
}
