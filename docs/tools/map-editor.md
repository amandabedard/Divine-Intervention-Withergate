# Map & Asset Editor

A browser app that lives in `tools/editor/`, runs locally with `npm run editor` (http://localhost:5174), and writes straight into the repo: assets into `assets/<kind>/`, maps into `content/maps/`. It shares its types and schemas with the game, so anything it saves is guaranteed to load.

**Status (2026-09-07): MVP built, asset packs in.** Working: asset upload by drop or button (props, tiles, backgrounds, ui, icons), **sheet import** (one image holding many props or tiles is cut into separate assets, with a preview of the cuts), packs with search and filters, usage tracking, delete guard, prune-unused per pack to `assets/_unused/`, placeholder blocks, place/move/erase/resize with snap, collision rectangles, all entity types with property editors and pickers, map settings and background layers, a scrollable canvas with map-edge resizing, undo/redo, validated save with line-level issues, "Play here" (opens the game at `?map=<id>&spawn=<id>`). Not yet: hot reload of the game when a map is saved from the editor (the game's content plugin does pick up the change, but the running scene only reloads on the next map switch), coverage of spots referenced by schedules.

## Goals

1. **Upload once, place by clicking.** Drag images in, they land in the asset library; click on the canvas to place them.
2. **Keep only what we use.** The manifest records which maps and characters use each asset; a report shows unused ones and a button moves them to `assets/_unused/` (never deletes silently).
3. **Placeholders that swap cleanly.** Generate a labelled coloured block of any size, place it everywhere, and later replace the file behind the same asset id. Every placement updates.
4. **Everything a map needs, no hand-editing.** Ground, collision, parallax, exits, spawns, NPC spots, interactables, triggers, facility slots.

## Layout

```
┌────────────┬──────────────────────────────────────────┬──────────────┐
│ Assets     │ Canvas                                   │ Properties   │
│ ─────────  │ scrollbars / wheel / Shift+wheel to move │ ───────────  │
│ kind tabs  │ Ctrl+wheel to zoom at the cursor         │ selected     │
│ search     │ Space+drag or middle mouse to pan        │ object or    │
│ pack ▾     │ drag the map's right/bottom edge to      │ entity       │
│ [upload]   │   resize it; +640 buttons widen it       │ fields       │
│ [import    │ grid + snap toggle                       │              │
│  sheet…]   │ tools: select · place · erase ·          │ map settings │
│ thumbnails │        collision · entity                │ (widen left/ │
│ details    │                                          │  right)      │
│ [prune]    │                                          │ [save] [play]│
└────────────┴──────────────────────────────────────────┴──────────────┘
```

Keyboard: `V` select, `B` place, `E` erase, `C` collision, `N` entity, `G` grid snap, `Ctrl+Z/Y` undo/redo, `Ctrl+S` save, `Del` delete, arrows nudge the selection (`Shift` = 10px) or scroll the view when nothing is selected, `Home` fits the whole map in view.

**Building out the sides.** The view scrolls well past the map's edges, so you can see where the map ends. To make the map bigger, drag its right or bottom edge on the canvas, use the **⇐ +640 / +640 ⇒** buttons in the status bar, or **widen left / widen right / taller** in Map settings. Widening to the left shifts everything already placed to the right, so nothing moves in the world.

## Asset library

Kinds: `tile`, `prop`, `background`, `character`, `portrait`, `enemy`, `ui`, `icon`, `audio`.

Upload flow: drop files → pick kind → for character sets, drop the whole frame folder (a preview animates) → optional tags and credit → saved under `assets/<kind>/` and added to the manifest with a stable `id`.

**Sheets and packs.** A sheet is one image holding many props or tiles (the 768px pixel-art packs). **Import sheet…** cuts it into separate assets: props by the transparent gaps and the 96px grid they are packed on (props that touch are told apart by their outlines), and every completely opaque stretch of cells as texture: cut where the texture changes, then into single 96px tiles (a strip that just repeats one texture becomes one tile), so anything you would repeat along the ground ends up in the tile tab. Repeated rows of props (crates, fence segments) are cut into single cells too. Preview the cuts first; change the grid or turn tile cutting off if a sheet comes out wrong. Every piece gets the pack name as `pack` and as a tag, `pixel: true` (drawn without smoothing, in the editor and in the game), and a `source` (sheet and position) so re-importing the same sheet only adds pieces that are not in the library yet and drops pieces of the old cut that no map uses. The original sheet is kept under `assets/_sheets/<pack>/` (not committed). The same cutter runs from the command line for whole folders:

```
node tools/scripts/import-sheets.mjs --pack town "C:/Users/me/Downloads/town"
node tools/scripts/import-sheets.mjs --pack forest --dry --debug out/ forest/*.png   # report + outlined previews, no writes
node tools/scripts/import-sheets.mjs --pack town --prune-stale assets/_sheets/town   # re-cut with a newer cutter, keeping used pieces
```

In the panel, filter by kind and pack or search ids and tags; click a thumbnail to place it; the details box under the grid renames, retags, flags or deletes the selected asset. **prune** moves the unused pieces of the selected pack (or, with no pack selected, unused assets outside any pack) to `assets/_unused/`. The game only loads the pieces that maps actually use, so a big library costs nothing at runtime.

Conventions for character art, matching how the first sets were delivered, so the game finds animations without configuration:

```
assets/characters/<set>_sprites/idle1.png … idle7.png          one PNG per frame, any frame count
assets/characters/<set>_sprites/leftwalk1.png … rightwalk7.png  (forwardwalk/upwalk are ignored by the side-scroller)
assets/characters/<set>_busts/<set>_neutral.png                 required
assets/characters/<set>_busts/<set>_<mood>.png                  happy, angry, sad, … whatever dialog uses
assets/enemies/<set>_sprites/idle1.png | attack1.png | hurt1.png | die1.png
```

`npm run build:sprites` trims each set to its union bounding box and packs the named frames into one atlas per set under `game/public/generated/`; numbered exports (`frame_0000.png`) are ignored. Both the game and the editor read the atlases.

Manifest entry for an imported piece:

```json
{ "id": "prop_town_s1_01", "kind": "prop", "file": "props/town/s1_01.png", "w": 192, "h": 192,
  "tags": ["town"], "placeholder": false, "pack": "town", "pixel": true,
  "source": { "sheet": "town/1.png", "x": 0, "y": 0 } }
```

Manifest entry for a character set (one per set):

```json
{
  "id": "char_mara",
  "kind": "character",
  "dir": "characters/mara_sprites",
  "animations": { "idle": 7, "leftwalk": 7, "rightwalk": 7 },
  "source": { "w": 400, "h": 400 },
  "fps": 8,
  "tags": ["mara", "dilsdurf"],
  "placeholder": false,
  "credit": "Amanda, 2026",
  "usedBy": ["villager:mara"]
}
```

Actions per asset: rename id (rewrites references), replace file (keeps id; warns if frame size changes), toggle placeholder, delete (only if unused; otherwise offers "move to _unused").

**Placeholder blocks:** no PNG is generated. A placement with `asset: "placeholder"` carries its own `w`, `h`, `color` and `label`, and both the editor and the game draw it at runtime. Swap it for real art by placing the uploaded asset and deleting the block (or keep the block's position and change `asset`). Uploaded assets can also be flagged `placeholder: true` so the coverage report lists them.

## Maps

Side-scroller maps are wide and short. A map has a size, a background stack, object layers, a collision layer, and entities.

Layers (fixed set, top to bottom on screen):

| Layer | Contents | Notes |
|---|---|---|
| `foreground` | props drawn in front of the player | optional parallax > 1 |
| `entities` | markers (not drawn in game except their sprites) | |
| `decor` | props at player depth, y-sorted with characters | |
| `ground` | tiles and platforms the player walks on | |
| `midground` | props behind the player | |
| `background` | 1–4 image layers with parallax 0–1 and repeat-x | |
| `collision` | rectangles (walkable ground, walls) | drawn only in the editor |

Entity types and their properties:

| Type | Properties | Used for |
|---|---|---|
| `spawn` | id, x, y, facing | where the player appears when arriving |
| `exit` | id, rect, direction (left/right/up/down/door), to: { map, spawn }, requires? | arrows appear near it; door exits show `!` |
| `npc_spot` | id, x, y, facing | schedule targets and stage-direction targets |
| `interactable` | id, rect, prompt icon, action: { kind: open_ui | run_script | forage | sign | facility, ... } | `!` above the player when near. `open_ui` targets: bed, quarters, living_quarters, general_store, tavern, build, shrine, notice_board |
| `trigger` | id, rect, once, action: { run_script | start_event | effects } | invisible zones |
| `facility_slot` | id, x, y, size | Withergate build slots; shows the placeholder or the built facility |
| `camera_bounds` | rect | optional clamp |
| `ambience` | tint per phase, music id, sfx loop | map-level settings live in Properties |

Map file (`content/maps/<id>.map.json`, abbreviated):

```json
{
  "id": "withergate",
  "version": 1,
  "size": { "width": 4096, "height": 540 },
  "town": "withergate",
  "background": [{ "asset": "bg_hills", "parallax": 0.3, "repeatX": true, "y": 0 }],
  "layers": {
    "midground": [{ "asset": "prop_fence", "x": 400, "y": 470, "flipX": false, "scale": 1 }],
    "ground":    [{ "asset": "tile_grass", "x": 0, "y": 500, "repeatX": 128 }],
    "decor":     [],
    "foreground": []
  },
  "collision": [{ "x": 0, "y": 500, "w": 4096, "h": 40 }],
  "entities": [
    { "type": "spawn", "id": "from_east_road", "x": 3900, "y": 480, "facing": "left" },
    { "type": "exit", "id": "east_exit", "x": 4060, "y": 380, "w": 36, "h": 160, "direction": "right",
      "to": { "map": "east_road", "spawn": "from_withergate" } },
    { "type": "npc_spot", "id": "lumber_pile", "x": 1200, "y": 480, "facing": "right" },
    { "type": "interactable", "id": "quarters_door", "x": 600, "y": 400, "w": 48, "h": 100,
      "action": { "kind": "open_ui", "ui": "quarters" } },
    { "type": "facility_slot", "id": "slot_1", "x": 2000, "y": 500, "size": "large" }
  ],
  "ambience": { "music": "withergate_day", "tint": { "evening": "#ffd9a0", "night": "#3a4a7a" } }
}
```

Validation on save: exits point to existing maps and spawns (or are flagged as pending), every asset exists, no entity id is duplicated, at least one spawn exists.

## Game integration

- **Play from here:** opens the game in a new tab at this map and spawn with a dev save (level 1, a few residents, morning).
- **Hot reload:** while the game runs in dev, saving a map or any content file reloads it in place; the player stays where they are.
- **Pickers:** the Properties panel offers dropdowns for maps, spawns, scripts, events, UI ids, and facility ids, read from the content index, so ids are never typed by hand.
- **Coverage:** the editor lists NPC spots referenced by schedules that do not exist yet on the map, and spots that nothing references.

## How it runs

The editor is a Vite app. A small Vite plugin adds a local file API (dev only, never shipped):

```
GET    /api/index                 maps (with spawns and spots), manifest, usage, generated sprite index, content ids, content issues
GET    /api/maps/:id              schema-normalised map (raw file if it fails validation)
PUT    /api/maps/:id              validate with GameMapSchema; 400 with issues on failure; warns about dangling exits
POST   /api/maps                  create { id, name?, width?, height?, interior? }
DELETE /api/maps/:id
GET    /api/assets                manifest + usage
POST   /api/assets                upload { name, kind, dataUrl, w, h, tags?, placeholder? }
POST   /api/assets/sheet          cut a sheet { name, pack, dataUrl, options?, dryRun? } into assets (tools/scripts/lib/sheet.mjs)
PATCH  /api/assets/:id            tags / placeholder flag / credit / rename id (rewrites map references)
DELETE /api/assets/:id            409 while any map uses it
POST   /api/assets/prune          move unused files of { pack } (or outside any pack) to assets/_unused/
/art/*                            repo assets/ served statically (the game serves the same prefix in dev)
/generated/*                      atlases and busts from game/public/generated
```

Implementation: React with a plain `<canvas>` renderer (no canvas library); pointer events handle select, move, resize handles, rectangle drawing, pan and zoom. The canvas sits sticky inside a natively scrolling container whose spacer is the zoomed map plus margins, so scrollbars, wheel and trackpad scrolling come from the browser and the scroll offset is the pan. Undo/redo is a snapshot stack over the map JSON with coalescing for rapid edits of one field.

## Out of scope for v1

Tile auto-painting (autotiles), animated tiles, lighting, and the expedition node map (that one is generated, not authored). These can be added if a real map needs them.
