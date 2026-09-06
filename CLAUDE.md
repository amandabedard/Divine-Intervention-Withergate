# Divine Intervention: Withergate

2D side-scrolling RPG and town-builder with turn-based combat and a Slay-the-Spire-style expedition map. TypeScript + Phaser 3.90 + Vite 7, React 19 overlay for UI, YAML content validated with zod 4, plus a companion browser-based map/asset editor.

## Working agreement
- Amanda owns creative direction and writes all dialog, villager profiles, quests, and story. Claude implements systems, tools, and integration.
- Content is data-driven YAML/JSON under `content/`, in the formats specified in `docs/content/`. Never invent final creative content; use `[PLACEHOLDER: ...]` text and mark sample files `# SAMPLE`.
- Anything the brief did not specify is marked **(proposed)** in the docs and tracked in `docs/OPEN_QUESTIONS.md`. Read that file at the start of each session for new answers, fold them into the docs and code, and keep the decision log there.
- Add new kinds of conditions, effects, or benefit types to the shared grammar (`packages/shared/src`) rather than special-casing content.

## Commands
- `npm install` (`.npmrc` sets legacy-peer-deps; npm's resolver crashes on vitest's optional peers otherwise)
- `npm run dev` builds sprite atlases then serves the game at http://localhost:5173 (content hot-reloads on save)
- `npm run editor` serves the map/asset editor at http://localhost:5174
- `node tools/scripts/import-folder.mjs --pack <id> --credit <text> <folder>` imports a pack of ready-made PNGs (kind by subfolder); `node tools/scripts/import-sheets.mjs --pack <id> --mode objects|grid|auto <pngs>` cuts sheets into pieces (`--dry --debug <dir>` previews the cuts; the editor's "Import sheet…" does the same for one file); `node tools/scripts/remove-pack.mjs --strip-maps <pack>` removes a pack and the placements that used it. Packs and credits: `assets/README.md`
- `npm run validate -- --coverage` checks every content file (schema + cross references) and prints per-character coverage
- `npm test` (vitest), `npm run typecheck` (tsc for shared, game, editor), `npm run build`
- In the browser, `` ` `` toggles the debug panel (time, relationships, tags, map jump, and a Battle section to pick an enemy, party, weapon and powers); `window.__wg` exposes `store`, `session`, `game` in dev
- Combat rules live in `game/src/core/combat/battle.ts` (pure, tested); the session animates its events and `game/src/scenes/BattleScene.ts` + `game/src/ui/battle.tsx` render them

## Where things are
- `docs/PLAN.md` master plan and milestones · `docs/design/gdd.md` design reference · `docs/content/*` authoring formats · `docs/tools/map-editor.md` editor spec · `docs/design/lore/` Amanda's notes
- `packages/shared/src` ids, zod schemas, condition/effect grammar, script normaliser, node loader + cross-reference validator + coverage (`node/`), CLI
- `game/src/core` pure game logic (state, conditions, effects, relationships, quests, time, schedule, dialog interpreter, session façade). No Phaser or React imports; tested with vitest. Expeditions live in `game/src/core/expedition.ts` (map generator, party, node outcomes, caravans) with the screen in `game/src/ui/expedition.tsx`.
- `game/src/scenes` Phaser (Boot, World, draw helpers) · `game/src/ui` React overlay · `game/src/bridge` store + event bus · `game/plugins/content.ts` Vite plugin compiling `content/` into `virtual:withergate-content`
- `tools/scripts/build-sprites.mjs` packs `assets/characters/<set>_sprites/{idle,leftwalk,rightwalk}N.png` into atlases and indexes `<set>_busts/<set>_<mood>.png` → `game/public/generated/`
- `tools/scripts/lib/sheet.mjs` cuts prop/tile sheets into pieces (pure, pngjs; tested via `import-sheet.test.ts`); `assets/manifest.json` lists every library asset (`pack`, `pixel`, `source` for imported pieces); the game loads only the assets its maps use (`game/src/scenes/assets.ts`)
- `content/` sample content around the character `aldric` and three maps (`withergate`, `withergate_quarters`, `east_road`)

## Conventions
- Strict TypeScript. Relative imports inside `packages/shared` use explicit `.ts` extensions (Node loads them natively for the Vite config).
- Ids are lowercase_with_underscores; flags are `<owner>_<thing>`; character ids may not collide with dialog keywords.
- Content must pass `npm run validate` before a commit. Game logic changes need a vitest test in `game/src/core` or `packages/shared/test`.
- Keep `docs/` in sync when rules change; the docs are the spec Amanda writes against.
