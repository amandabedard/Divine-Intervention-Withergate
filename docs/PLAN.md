# Divine Intervention: Withergate — Build Plan

**Status:** Draft v0.1 (2026-09-05). Creative direction: Amanda. Implementation: Claude.
**Companion docs:** [design reference](design/gdd.md) · [villager format](content/villager-format.md) · [dialog format](content/dialog-format.md) · [conditions & effects](content/conditions-and-effects.md) · [other data formats](content/data-formats.md) · [map editor](tools/map-editor.md) · [open questions](OPEN_QUESTIONS.md)

Anything marked **(proposed)** in these docs is a gap I filled with a sensible default. The [open questions](OPEN_QUESTIONS.md) file lists every such decision with the default that applies if you say nothing.

---

## 1. What we are building

A 2D side-scrolling RPG and town-builder. You play a cast-out demigod who must become the Deity of *something* by making yourself known in a war-torn region on the edge of a spreading corruption. You build Withergate, recruit up to 10 villagers into it, form relationships, and explore on a Slay-the-Spire-style node map with turn-based combat. Time advances only when you act.

**Design pillars** (used to settle arguments later):

1. **Choices shape the deity.** Domain, hidden tags, and relationships all branch from what you do. Winning one person can cost you another.
2. **Withergate is yours.** Facilities, recruits, and industry are the player's to choose; villagers have conditions and can be lost for good.
3. **Every trip costs time.** Days pass per action and per expedition node; where and when you are changes what you meet.
4. **People are the content.** Villagers carry the story through layered dialog, quests, and heart events.

---

## 2. Recommended tech stack

**TypeScript + Phaser 3 + Vite**, with a React overlay for text-heavy UI, YAML content validated by schemas, and a browser-based map/asset editor in the same repo. Browser-first; wrap in Electron or Tauri later for a desktop build.

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript | You asked for JS or Python. TS is JS with a type-checker, and this game is mostly data structures (villagers, dialog, quests). Types plus schema validation catch content mistakes with a file and line number instead of a silent bug. |
| Engine | Phaser 3 | The standard 2D browser engine: scenes, sprites, spritesheet animation, tilemaps, cameras, input, audio. Well documented; huge example base. |
| Text UI | React overlay on the canvas | Dialog boxes, menus, town management, the node map, and character creation are all "forms and text". HTML/CSS does that far better than drawing text in a canvas. Phaser handles the world and combat; React handles everything else. |
| Bundler | Vite | Fast dev server with hot reload; the same server hosts the editor and a small file-writing API for it. |
| Content | YAML files, compiled to JSON | Readable to write and diff. Validated by zod schemas shared between game and editor. |
| Tests | Vitest | Pure game systems (relationships, combat math, node generation, dialog interpreter) are tested without a browser. |
| Saves | IndexedDB in browser, files on desktop | Save data is one JSON object, so both are trivial and exportable. |
| Distribution | itch.io web build first, desktop wrapper later | Zero-install playtesting from day one. |

**Alternatives considered**

| Option | Verdict |
|---|---|
| Godot 4 (GDScript, Python-like) | Excellent engine with a built-in tilemap editor. Rejected because you want a custom lightweight map tool and a fully text/data-driven workflow, and because a scene-file, GUI-editor workflow is much harder for me to build and verify autonomously than a code-and-JSON one. |
| Python + Pygame/Arcade | Low-level (no scene management, UI, or animation tooling), painful distribution, and the map editor would be a second GUI stack. Not worth it. |
| Plain JS + Canvas, no engine | Maximum control, but we would rebuild sprites, cameras, input, audio, and asset loading. Phaser gives all of that for free. |
| Ink or Yarn Spinner for dialog | Strong writer-facing languages with JS runtimes. I am proposing a small custom YAML dialog format instead because your dialog has a regular structure (chat pools, discuss topics, flirt, gifts, heart events) tied to game concepts (tiers, tags, quests). If you would rather write in Ink, the interpreter is swappable. See question 4. |

---

## 3. Architecture

### 3.1 Layers

```
┌──────────────────────────────────────────────────────────────┐
│ React UI overlay   dialog box · menus · town screens · HUD    │
│                    expedition node map · character creation   │
├──────────────────────────────────────────────────────────────┤
│ Phaser scenes      World (side-scroller) · Battle · Cutscene  │
├──────────────────────────────────────────────────────────────┤
│ Bridge             event bus + store: commands in, events out │
├──────────────────────────────────────────────────────────────┤
│ Core (pure TS)     GameState · time · relationships · tags    │
│                    dialog interpreter · condition/effect      │
│                    evaluator · quests · town · expedition     │
│                    generator · combat resolver · caravan      │
│                    save/load · seeded RNG                     │
├──────────────────────────────────────────────────────────────┤
│ Content registry   YAML → validated JSON: villagers, dialog,  │
│                    quests, items, enemies, maps, facilities   │
├──────────────────────────────────────────────────────────────┤
│ Assets             manifest.json → images/audio (editor-managed)│
└──────────────────────────────────────────────────────────────┘
```

Rules that keep this maintainable:

- **Core has no Phaser or React imports.** It is plain TypeScript operating on a serializable `GameState`. That is what makes it unit-testable and what makes saves trivial.
- **Scenes and UI never mutate state directly.** They send commands (`talk(villager)`, `chooseOption(i)`, `travel(region)`, `attack()`); core updates state and emits events (`dialog.line`, `relationship.changed`, `time.advanced`); scenes and UI react.
- **One condition/effect grammar everywhere.** Dialog choices, quest stages, recruitment rules, heart-event triggers, and node weights all use the same `requires:` and `effects:` vocabulary ([reference](content/conditions-and-effects.md)). New content never needs new code unless it needs a new *kind* of condition or effect.
- **Everything random is seeded.** Expedition maps, encounter picks, and rolls draw from a seeded RNG stored in the save, so bugs are reproducible and reloading alone cannot reroll an outcome.

### 3.2 Repository layout (proposed)

```
Divine-Intervention-Withergate/
├─ game/                      # the game (Vite + Phaser + React overlay)
│  └─ src/
│     ├─ core/                # pure TS systems, no engine imports, unit-tested
│     ├─ scenes/              # Phaser: Boot, World, Battle, Cutscene
│     ├─ ui/                  # React: dialog, menus, town, node map, HUD, creation
│     ├─ bridge/              # event bus + store connecting the three
│     └─ dev/                 # debug menu, dialog test room, map jump
├─ tools/
│  ├─ editor/                 # map & asset editor (Vite + React) + its file API plugin
│  └─ scripts/                # build-sprites (frames → atlases), build-content (YAML → JSON bundle)
├─ packages/
│  └─ shared/                 # content types, zod schemas, condition/effect grammar, validator CLI
├─ content/                   # YOUR authored data
│  ├─ villagers/<id>/         # profile.yaml, chat.yaml, discuss.yaml, flirt.yaml, gifts.yaml, recruit.yaml, events/
│  ├─ quests/                 # one file per quest
│  ├─ encounters/             # expedition event scripts
│  ├─ enemies/                # enemy definitions
│  ├─ cutscenes/              # opening, story beats
│  ├─ dialog/shared/          # reusable dialog snippets
│  ├─ maps/                   # *.map.json written by the editor
│  ├─ items.yaml              # gifts and materials
│  └─ facilities.yaml · powers.yaml · weapons.yaml · regions.yaml · progression.yaml
├─ assets/                    # art & audio by kind: characters/<set>_sprites, characters/<set>_busts,
│  │                          #   backgrounds/, props/, tiles/, ui/, audio/ (editor-managed uploads)
│  └─ manifest.json           # id → files, frame data, tags, placeholder flag, usage
├─ docs/                      # these documents (+ docs/design/lore/ for your bibles)
└─ package.json               # npm workspaces
```

### 3.3 Game state (shape, abbreviated)

```ts
interface GameState {
  meta:      { version; seed; created; playedPhases }
  player:    { name; form; label; stats: { charisma; intelligence; luck; dexterity; perception };
               level; xp; hp; grace; energy; weaponId; powers[]; domainPoints; faith; tags[] }
  time:      { day; phase: 'morning' | 'afternoon' | 'evening' | 'night' }
  where:     { mapId; x; facing } | { expedition: ExpeditionState }
  town:      { facilities[]; buildQueue[]; resources; storage; residents[]; unhappy: { [villagerId]: daysLeft } }
  villagers: { [id]: { met; friendship; romance; romanceState; flags; topicsDone[]; eventsSeen[];
               giftedToday; chattedToday; flirtedToday; location } }
  quests:    { [id]: { status; stage; vars } }
  flags:     { [key]: boolean | number | string }
  world:     { corruption; townRelations; renown: { [town]: number }; caravans[] }
  rng:       RngState
}
```

Saves are this object plus a version number, with migrations when the shape changes.

### 3.4 The four engines, one sentence each

- **Dialog interpreter** walks a script (a list of steps: lines, choices, checks, branches, effects, stage directions) and pauses whenever the UI needs input.
- **Relationship engine** turns points into tiers, applies tag affinities and daily limits, and decides romance state transitions.
- **Tag system** is a set of hidden strings on the player; content reads them through conditions and affinities.
- **Quest engine** advances stages when their completion condition becomes true and applies rewards.

Full rules are in the [design reference](design/gdd.md).

---

## 4. Content pipeline (how your writing gets into the game)

1. You write YAML in `content/` using the formats in `docs/content/`. Each villager is a folder; each quest, enemy, and encounter is a file.
2. `npm run validate` checks every file against its schema and cross-checks references (every `goto`, item, villager, map, spawn point, and asset must exist). Errors point at file and line.
3. `npm run validate -- --coverage` prints a per-villager coverage report (tiers with no chat lines, missing gift reactions, heart events without triggers) so you can see what is left to write.
4. The game loads the compiled bundle. In dev, editing a YAML file hot-reloads it without restarting or reloading the save.
5. **Placeholders:** any text you have not written yet is filled by me with `[PLACEHOLDER: what goes here]`. Any asset that is a stand-in is flagged `placeholder: true` in the manifest. A report lists both so nothing ships by accident.

**Two dev tools that make content work fast:**

- **Dialog Test Room** (in-game dev scene): pick a villager, set tier/romance/tags/flags/time from a panel, and run any chat pool, topic, flirt state, gift, or heart event in the real dialog box.
- **Debug menu:** jump to any map, set time, grant resources, set relationship values, start a battle against any enemy, generate an expedition for any region.

---

## 5. Tools

| Tool | Purpose | Spec |
|---|---|---|
| Map & asset editor | Upload sprites/tiles/backgrounds into the asset library, place them on side-scroller maps, mark collision, exits, NPC spots, interactables, triggers, and facility slots. Tracks which assets are used and lets you prune the rest. Generates labelled placeholder blocks and swaps a real asset in behind the same ID later. | [map-editor.md](tools/map-editor.md) |
| Content validator | Schema + cross-reference + coverage checks, run locally and in CI. | §4 |
| Dialog Test Room / Debug menu | Exercise any content without playing to it. | §4 |

---

## 6. Milestones

Phases are ordered so that a playable vertical slice exists by the end of Phase 5, and so that each phase unblocks a kind of content you can write while the next phase is built. Effort: S ≈ a session or two, M ≈ several sessions, L ≈ many sessions.

**Status (2026-09-06):** Phase 0 done (scaffold, schemas, validator with coverage, sprite atlas build, sample content, hot reload). Phase 1 MVP done (editor: asset upload/usage/prune, placement, collision, entities with property editors, undo/redo, validated save, play-from-here). Phase 2 done ahead of order (world scene, movement, prompts, exits, schedules, time tint). Phase 3 core done (dialog interpreter, talk menu, chat/discuss/flirt/gift, relationships, tags, heart events with stage directions, saves at the bed). Phase 5 largely done (opening cutscene, forage, first fight, messenger, arrival; full keyboard and gamepad navigation). **Phase 4 done (2026-09-07):** turn-based battles with weapons, damage types, powers, statuses, enemy move AI, companion passives and skills, spare and flee, XP and rewards, death rules, a battle scene with animations, a keyboard-driven battle menu, and debug controls for enemy, party, weapon and powers. **Phase 6 done (2026-09-07):** building in five equal slots with costs, days and a queue; facility effects (income, store rates, energy, unlock actions) and resident benefits; the Quarters menu (bed, loadout, satchel, storage, residents with escort-home, build); Living Quarters roster and readiness; the general store (buy, sell, gifts) from `economy.yaml`; tavern activities from `tavern.yaml`; the shrine for unlocking and holding powers; morning notices; unhappiness warnings, countdown and departure; crafting at the Bazaar; residents standing at their workplace. **Asset packs (2026-09-07):** seven pixel-art packs cut into 5,424 library pieces (props and 96px tiles) by a sheet cutter (`tools/scripts/import-sheets.mjs`, also in the editor as "Import sheet…"), the asset panel rebuilt around packs, search and thumbnails, the editor canvas made scrollable with map-edge resizing, and the game loading only the art each map uses. Not started: expeditions (7), story systems (8).

### Phase 0 — Foundation & content pipeline (S)
- Monorepo scaffold: Vite + Phaser + React overlay hello-world, strict TypeScript, ESLint/Prettier, Vitest.
- `packages/shared`: schemas for villager profile, dialog scripts, quests, items, enemies, facilities, powers, weapons, regions, maps; the condition/effect grammar; `npm run validate`.
- Sample content: one placeholder villager with every file type, one quest, one hand-written map, one enemy.
- Placeholder asset kit (labelled rectangles for characters, buildings, tiles, portraits).
- Sprite atlas build: packs the named frames in `assets/characters/*_sprites` into trimmed atlases and indexes busts by mood.
- `CLAUDE.md` and docs kept current.
- **Done when:** `npm run dev` shows a Phaser canvas with a React overlay; `npm run validate` catches a deliberately broken reference; `npm test` passes.
- **You can author now:** villager roster and profiles, town bibles, story outline, item/gift lists, resource list, domain names and power ideas.

### Phase 1 — Map & asset editor MVP (M)
- Asset library: upload, tag, set sprite-sheet frame size, mark placeholder, replace, usage report, prune-unused.
- Canvas: pan/zoom, snap-to-grid toggle, layers (parallax backgrounds, midground, ground, decor, entities), place/move/erase, collision rectangles.
- Entity markers: spawn, exit (to map + spawn), npc_spot, interactable (with action), trigger zone, facility_slot, camera bounds.
- Save/load `content/maps/*.map.json`; "Play from here" launches the game at that map.
- **Done when:** you can block out Withergate with two exits to a road map and several NPC spots without touching a file by hand, and it validates.
- **You can author now:** blockouts of Withergate, one town, one road.

### Phase 2 — Side-scroller core (M)
- World scene loads map JSON; player controller; camera follow; parallax; time-of-day tint.
- Prompts: `!` above the player near an interactable, arrow near an exit, speech bubble above an NPC in range.
- Map transitions via exits/spawns; NPCs placed from schedules by day phase; HUD (day, phase, location).
- Dev: map jump, hot reload of maps and content.
- **Done when:** walk Withergate → road → Aboridge blockout, all prompts appear, time advances when you perform a timed activity.
- **You can author now:** detailed maps, NPC schedules.

### Phase 3 — Dialog & relationships (L)
- Dialog interpreter and dialog UI (portraits with moods, typewriter text, choices, locked-choice display, checks).
- Talk menu: Chat / Discuss (with `!` and ♥ markers) / Flirt / Give Gift / Exit.
- Friendship and romance points, tiers, tag affinities, daily limits, one-time topics, gift categories and overrides, crush/interest transitions, non-romanceable flirt handling.
- Heart-event triggers and stage directions (place characters, move, face, emote, fade, camera).
- Dialog Test Room and debug menu.
- **Done when:** your first real villager plays end-to-end from Stranger to Best Friend (and Lover if romanceable) inside the test room, with every effect visible in the debug panel.
- **You can author now:** complete dialog sets for the first 3–5 villagers.

### Phase 4 — Combat core (M/L)
- Battle scene: player vs one enemy, party members shown beside you; turn order by speed.
- Actions: Attack (weapon), Defend, Power (spends Grace), Companion skill (if the design allows one active per member), Flee.
- Damage types vs resistances, a small status set, enemy AI from weighted move lists, XP and leveling from `progression.yaml`, defeat handling.
- Barks: party lines on battle start, low HP, withdrawal.
- **Done when:** from the debug menu you can fight three enemy types with two weapons and two powers and the numbers read clearly.
- **You can author now:** enemy roster and stats, weapons, powers per domain, bark lines.

### Phase 5 — Character creation & opening (M) → **first vertical slice**
- Creation: form, name, stat allocation, label.
- Opening cutscene (data-driven cutscene script), the fall, landing map, forage interaction, first fight, the messenger, arrival at Withergate, first sleep and save at Quarters.
- Main menu, save/load slots.
- **Done when:** New Game → arrive at Withergate → save → quit → load.
- **You can author now:** opening script, messenger and king dialog, initial Withergate NPCs.

### Phase 6 — Town management (M/L)
- Resources and storage; daily tick (income, build progress, unhappiness, corruption).
- Quarters UI: save, weapon/power loadout, gift satchel, storage view. Living Quarters UI: roster, capacity, condition status. General Store: buy and trade. Tavern v1: scheduled social events.
- Build menu for the 5 optional slots; facility effects framework; workplaces.
- Recruitment flow, villagers moving in with Withergate schedules, in-town benefits, unhappiness warning and permanent departure.
- **Done when:** recruit two villagers, build one facility, break a condition on purpose and watch the warning, then the departure.
- **You can author now:** facility descriptions, store stock, tavern events, recruit and farewell dialog.

### Phase 7 — Expeditions & caravan (L)
- Region definitions; node graph generator with weights by biome, phase, corruption, party, and facilities.
- Node types: battle, elite, event, gather, rest, shrine, cache, traveler, settlement (loads a world map), checkpoint/boss.
- Party selection and willingness, energy depletion and withdrawal, time passage per node, fixed routes between towns, abort/return, caravan resolution with ambush.
- **Done when:** travel Withergate → Aboridge and back with a party, gather resources, and the caravan arrives or is robbed.
- **You can author now:** encounter events (many), region flavour, boss concepts, settlement maps.

### Phase 8 — World, story & domains (L)
- Corruption spread and effects; town relations and the war; renown per town.
- Domain leanings, faith levels, power unlocks, end-game deity title generation.
- Main quest chain with story checkpoints slotted into expeditions; quest journal; heart events across the roster; ascension ending.
- **Done when:** the main story is playable start to finish with placeholder text where you have not written yet.

### Phase 9 — Integration & polish (ongoing)
- Full roster and towns, audio, settings, gamepad, text-size options, balancing passes, save migrations, desktop packaging, itch.io build.

---

## 7. Content budget for v1

A budget keeps the writing finite. These are targets, not limits.

| Content | v1 target | Notes |
|---|---|---|
| Recruitable villagers | 24 (≈5 per town, minus a few special cases) | 10 can live in Withergate at once |
| Key non-recruitables | ~10 | king, messenger, shopkeepers, antagonists |
| Per villager | ~30 chat lines (≥4 per tier, plus romance variants), 6–10 discuss topics, flirt lines for 3 states, gift reactions (5 categories + 2 overrides), 3 heart events (4 for romanceable), recruit + farewell scripts, ~6 party barks | Coverage report tracks this |
| Maps | Withergate (grows), 5 towns × 2–3 maps, ~6 road/settlement maps, ~5 reusable interiors | Placeholder blockouts first |
| Enemies | 15 regular + 4 bosses | |
| Encounter events | 40 | Node events with checks and choices |
| Quests | 24 personal + 8 town + main chain (~12 stages) | |
| Powers | 5 axes × ~6 in a skill tree | faith levels grant the points |
| Weapons | 6 | |
| Gift items | ~30 | |

---

## 8. Risks and how the plan handles them

| Risk | Mitigation |
|---|---|
| Content volume overwhelms one writer | Budget above, folder templates, coverage report, placeholders that are safe to ship in tests. |
| Text-heavy UI is painful in a game canvas | React overlay for all menus and dialog. |
| Random node maps clash with authored story | Checkpoints have story slots; the generator asks the quest engine for a required checkpoint before filling randomly. Seeds live in saves. |
| Permanent villager loss feels unfair | 3-day unhappiness warning with dialog, visible condition status in Living Quarters, suspend-save so quitting mid-expedition is never a loss. |
| Side-scroller maps are expensive to build | Editor first, placeholder blockouts, reusable interiors, parallax backgrounds instead of hand-placed detail. |
| 11 professions × 8 facilities × unique benefits sprawls | Benefits are data from a fixed catalogue of benefit *types*. Adding a character never needs code; adding a new benefit type does, and is a small change. |
| Reload-to-reroll on rolls and ambushes | Seeded RNG stored in the save. |

---

## 9. Immediate next steps

1. You: answer the **Phase 0 blockers** at the top of [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) (stack, art scale, jumping, dialog format). Everything else can wait.
2. You: skim the [villager](content/villager-format.md) and [dialog](content/dialog-format.md) formats and say what feels awkward to write in. This is the best time to change them.
3. Me: Phase 0 scaffold and validator, then the editor.
4. You, in parallel: roster, town bibles, story outline in plain markdown under `docs/design/lore/` (your format, no rules), then first villager profiles in YAML.
