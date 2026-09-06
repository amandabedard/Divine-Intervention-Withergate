import { z } from 'zod';
import { ID } from './condition.ts';
import { ConditionSchema } from './condition.ts';
import { PHASES } from './ids.ts';

// Map files are written by the editor (docs/tools/map-editor.md) and can be
// hand-edited. Coordinates are in logical pixels at 1280x720.

/**
 * Characters stand this far below `ground_y` (inside the path band drawn under the
 * ground line) rather than on the line itself. Shared by the game and the editor.
 */
export const WALK_LINE_OFFSET = 28;

export const PlacementSchema = z.strictObject({
  /** Asset id from the manifest, or "placeholder". */
  asset: z.string().min(1),
  x: z.number(),
  y: z.number(),
  flipX: z.boolean().optional(),
  scale: z.number().positive().optional(),
  /** Repeat the image horizontally this many times (tiles, fences). */
  repeatX: z.number().int().positive().optional(),
  /** Placeholder-only: size, colour and label of the block. */
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
  color: z.string().optional(),
  label: z.string().optional(),
});
export type Placement = z.output<typeof PlacementSchema>;

const Rect = { x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() };

export const EXIT_DIRECTIONS = ['left', 'right', 'up', 'down', 'door'] as const;
export type ExitDirection = (typeof EXIT_DIRECTIONS)[number];

export const InteractActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('open_ui'),
    ui: z.enum(['bed', 'quarters', 'living_quarters', 'general_store', 'tavern', 'build', 'shrine', 'notice_board']),
  }),
  z.strictObject({ kind: z.literal('run_script'), script: z.string().min(1) }),
  z.strictObject({ kind: z.literal('sign'), text: z.string().min(1) }),
  z.strictObject({ kind: z.literal('forage'), resource: z.enum(['wood', 'stone', 'ore', 'food', 'herbs', 'cloth']), amount: z.tuple([z.number().int(), z.number().int()]), once_per_day: z.boolean().default(true) }),
  z.strictObject({ kind: z.literal('facility'), facility: z.string().min(1) }),
]);
export type InteractAction = z.output<typeof InteractActionSchema>;

export const EntitySchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('spawn'),
    id: ID,
    x: z.number(),
    y: z.number(),
    facing: z.enum(['left', 'right']).default('right'),
  }),
  z.strictObject({
    type: z.literal('exit'),
    id: ID,
    ...Rect,
    direction: z.enum(EXIT_DIRECTIONS),
    to: z.strictObject({ map: ID, spawn: ID }),
    /** Trigger by walking in (true) or by pressing interact (false). Defaults: left/right auto, others not. */
    auto: z.boolean().optional(),
    requires: ConditionSchema.optional(),
    label: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal('npc_spot'),
    id: ID,
    x: z.number(),
    y: z.number(),
    facing: z.enum(['left', 'right']).default('left'),
  }),
  z.strictObject({
    type: z.literal('interactable'),
    id: ID,
    ...Rect,
    label: z.string().optional(),
    action: InteractActionSchema,
    requires: ConditionSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('trigger'),
    id: ID,
    ...Rect,
    once: z.boolean().default(true),
    action: z.union([
      z.strictObject({ kind: z.literal('run_script'), script: z.string().min(1) }),
      z.strictObject({ kind: z.literal('start_event'), event: ID }),
      z.strictObject({ kind: z.literal('start_cutscene'), cutscene: ID }),
    ]),
    requires: ConditionSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('facility_slot'),
    id: ID,
    x: z.number(),
    y: z.number(),
    size: z.enum(['small', 'large']).default('large'),
  }),
  z.strictObject({ type: z.literal('camera_bounds'), id: ID, ...Rect }),
]);
export type MapEntity = z.output<typeof EntitySchema>;
export type EntityOf<T extends MapEntity['type']> = Extract<MapEntity, { type: T }>;

export const BackgroundLayerSchema = z.strictObject({
  asset: z.string().optional(),
  color: z.string().optional(),
  parallax: z.number().min(0).max(2).default(0.5),
  repeatX: z.boolean().default(true),
  y: z.number().default(0),
  /** Placeholder hills: draw a soft silhouette instead of an image. */
  silhouette: z.boolean().optional(),
});

export const GameMapSchema = z
  .strictObject({
    id: ID,
    version: z.literal(1),
    name: z.string().optional(),
    size: z.strictObject({ width: z.number().positive(), height: z.number().positive() }),
    town: ID.optional(),
    /** Whether this is an interior (no sky, no time tint, NPCs use interior schedules). */
    interior: z.boolean().default(false),
    /** The y coordinate characters' feet stand on. */
    ground_y: z.number(),
    background: z.array(BackgroundLayerSchema).default([]),
    layers: z
      .strictObject({
        midground: z.array(PlacementSchema).default([]),
        ground: z.array(PlacementSchema).default([]),
        decor: z.array(PlacementSchema).default([]),
        foreground: z.array(PlacementSchema).default([]),
      })
      .default({ midground: [], ground: [], decor: [], foreground: [] }),
    /** Solid rectangles the player cannot walk through. */
    collision: z.array(z.strictObject(Rect)).default([]),
    entities: z.array(EntitySchema).default([]),
    ambience: z
      .strictObject({
        music: ID.optional(),
        tint: z.partialRecord(z.enum(PHASES), z.string()).optional(),
        sky: z.strictObject({ top: z.string(), bottom: z.string() }).optional(),
        ground_color: z.string().optional(),
      })
      .default({}),
  })
  .superRefine((m, ctx) => {
    const ids = new Set<string>();
    m.entities.forEach((e, i) => {
      const key = `${e.type}:${e.id}`;
      if (ids.has(key)) {
        ctx.addIssue({ code: 'custom', message: `duplicate ${e.type} id "${e.id}"`, path: ['entities', i, 'id'] });
      }
      ids.add(key);
    });
    if (!m.entities.some((e) => e.type === 'spawn')) {
      ctx.addIssue({ code: 'custom', message: 'a map needs at least one spawn entity', path: ['entities'] });
    }
  });
export type GameMap = z.output<typeof GameMapSchema>;

export function mapEntities<T extends MapEntity['type']>(map: GameMap, type: T): EntityOf<T>[] {
  return map.entities.filter((e): e is EntityOf<T> => e.type === type);
}
