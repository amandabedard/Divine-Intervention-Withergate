import type { AssetManifest } from '@withergate/shared';

export interface SheetPiece {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'prop' | 'tile';
  tags: string[];
  opaque?: number;
  id?: string;
  file?: string;
  status?: 'created' | 'exists';
}

export interface SheetOptions {
  mode?: 'auto' | 'objects' | 'grid';
  alphaMin?: number;
  gap?: number;
  layout?: number;
  cell?: number;
  gapTolerance?: number;
  minSize?: number;
  cutTiles?: boolean;
  cutThreshold?: number;
  repeatSimilarity?: number;
}

export interface ImportSheetResult {
  layout: string;
  width: number;
  height: number;
  pieces: SheetPiece[];
  created: number;
  existing: number;
  /** Pieces of an earlier cut of this sheet that were dropped (only when `used` was given). */
  removed: number;
}

export const KIND_DIRS: Record<string, string>;
export function slug(s: string): string;
export function importSheet(args: {
  assetsDir: string;
  manifest: AssetManifest;
  pack: string;
  name: string;
  buffer: Buffer;
  options?: SheetOptions;
  dryRun?: boolean;
  keepSheet?: boolean;
  used?: Set<string> | null;
}): ImportSheetResult;
