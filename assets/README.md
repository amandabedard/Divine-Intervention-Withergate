# Assets

Everything the game and the editor draw, indexed by `manifest.json` (see `docs/tools/map-editor.md`). Character art lives in `characters/<set>_sprites` and `characters/<set>_busts`; library pieces (props, tiles, backgrounds) live under `props/`, `tiles/`, `backgrounds/` in one folder per pack.

## Packs and credits

| Pack | Source | Style | Import |
|---|---|---|---|
| `workshop` | craftpix.net, *Medieval Workshop Workers 2D Tileset for Platformers* | cartoon, smooth | `import-folder.mjs` |
| `tailor` | craftpix.net, *Cartoon Medieval Tailor Workshop 2D Game Tileset* | cartoon, smooth | `import-folder.mjs` |
| `market` | craftpix.net, *Free Market Cartoon 2D Game Tileset* | cartoon, smooth | `import-folder.mjs` |
| `village` | craftpix.net, *Village Cartoon 2D Platformer Tileset* | cartoon, smooth | `import-folder.mjs` |
| `farm` | craftpix.net, *Cartoon Medieval Farm 2D Tileset for Platformer* | cartoon, smooth | `import-folder.mjs` |
| `farm_topdown` | craftpix.net, *Top-Down Farm with Animals Pixel Art Asset Pack* | 16px pixel art, top-down | `import-sheets.mjs` (objects + grid modes) |
| `home_topdown` | craftpix.net, *Main Characters Home Free Top-Down Pixel Art Asset* | 16px pixel art, top-down | `import-sheets.mjs` (objects + grid modes) |

The craftpix packs are used under the craftpix file licence (https://craftpix.net/file-licenses/): fine inside the game, not to be redistributed as files, which is why this repository stays private. The animation strips of the top-down packs (animals, birds, smoke, sails, fish, the wicket) and the water-detail tileset were left out; the originals stay in your Downloads.

The five cartoon packs share one layout: `Background` (two parallax layers, 1334×750), `Building` (modular walls, roofs, doors, windows, chimneys, canopies, pillars, ladders), `Environment` (props) and `Platformer` (thirteen 128px ground tiles: tops, edges, corners and fill). In the editor they are `background`, `prop` (tagged `building` or `environment`) and `tile`.
