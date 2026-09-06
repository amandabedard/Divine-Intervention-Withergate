// Which library assets a map needs, loading them on demand, and pixel-art filtering.
import Phaser from 'phaser';
import { IMAGE_ASSET_KINDS } from '@withergate/shared';
import type { AssetManifest, GameMap } from '@withergate/shared';

export const textureKey = (assetId: string): string => `asset:${assetId}`;

/** Ids of every library asset placed on a map (layers and background), without placeholders. */
export function assetsUsedByMap(map: GameMap): string[] {
  const ids = new Set<string>();
  for (const layer of Object.values(map.layers)) for (const p of layer) if (p.asset !== 'placeholder') ids.add(p.asset);
  for (const b of map.background) if (b.asset) ids.add(b.asset);
  return [...ids];
}

/** Ids worth loading at boot: everything any map uses, plus UI art. */
export function assetsToPreload(manifest: AssetManifest, maps: Record<string, GameMap>): string[] {
  const used = new Set<string>();
  for (const map of Object.values(maps)) for (const id of assetsUsedByMap(map)) used.add(id);
  return manifest.assets.filter((a) => IMAGE_ASSET_KINDS.includes(a.kind) && (used.has(a.id) || a.kind === 'ui' || a.kind === 'icon')).map((a) => a.id);
}

/** Queue image loads for the given asset ids; returns how many were queued. */
export function queueAssets(scene: Phaser.Scene, manifest: AssetManifest, ids: Iterable<string>): number {
  let n = 0;
  for (const id of ids) {
    const key = textureKey(id);
    if (scene.textures.exists(key)) continue;
    const entry = manifest.assets.find((a) => a.id === id);
    if (!entry || !IMAGE_ASSET_KINDS.includes(entry.kind)) continue;
    scene.load.image(key, `/art/${entry.file}`);
    n += 1;
  }
  return n;
}

/** Pixel-art assets are scaled with nearest-neighbour sampling so they stay crisp. */
export function applyPixelFilters(scene: Phaser.Scene, manifest: AssetManifest): void {
  for (const a of manifest.assets) {
    if (!a.pixel) continue;
    const key = textureKey(a.id);
    if (scene.textures.exists(key)) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
