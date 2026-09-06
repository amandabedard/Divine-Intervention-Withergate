import { z } from 'zod';

// ---------------------------------------------------------------------------
// game/public/generated/index.json — written by tools/scripts/build-sprites.mjs
// ---------------------------------------------------------------------------

export interface SpriteSetInfo {
  /** URL of the packed atlas image, relative to the game's public root. */
  image: string;
  frameWidth: number;
  frameHeight: number;
  /** Frame index ranges per animation name (idle, leftwalk, rightwalk, ...). */
  animations: Record<string, { from: number; to: number; fps: number }>;
  /** Where the feet are, as a fraction of frameHeight (origin y). */
  originY: number;
  /** Source frame size before trimming. */
  source: { w: number; h: number };
  /** Trim box applied to every frame (relative to the source frame). */
  trim: { x: number; y: number; w: number; h: number };
}

export interface BustSetInfo {
  /** mood -> image URL */
  moods: Record<string, string>;
}

export interface GeneratedIndex {
  generatedAt: string;
  sprites: Record<string, SpriteSetInfo>;
  busts: Record<string, BustSetInfo>;
}

export const EMPTY_INDEX: GeneratedIndex = { generatedAt: '', sprites: {}, busts: {} };

// ---------------------------------------------------------------------------
// assets/manifest.json — managed by the editor (props, tiles, backgrounds, ui, audio)
// ---------------------------------------------------------------------------

export const ASSET_KINDS = ['tile', 'prop', 'background', 'ui', 'icon', 'audio'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const IMAGE_ASSET_KINDS: readonly AssetKind[] = ['tile', 'prop', 'background', 'ui', 'icon'];

export const AssetEntrySchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  kind: z.enum(ASSET_KINDS),
  /** Path relative to assets/, posix separators. */
  file: z.string().min(1),
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
  tags: z.array(z.string()).default([]),
  placeholder: z.boolean().default(false),
  credit: z.string().optional(),
});
export type AssetEntry = z.output<typeof AssetEntrySchema>;

export const AssetManifestSchema = z.strictObject({
  version: z.literal(1),
  assets: z.array(AssetEntrySchema),
});
export type AssetManifest = z.output<typeof AssetManifestSchema>;

export const EMPTY_MANIFEST: AssetManifest = { version: 1, assets: [] };
