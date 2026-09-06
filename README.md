# Divine Intervention: Withergate

A 2D side-scrolling RPG and town-builder: a cast-out demigod builds Withergate on the edge of a spreading corruption, recruits villagers, and earns a title from whatever they do best.

## Run it

```bash
npm install
npm run dev
```

The game opens at http://localhost:5173. Use **Quick Start (dev)** on the title screen, walk with ← → (Shift to run), press **E** to talk or interact, and press **`** for the debug panel.

```bash
npm run editor
```

The map and asset editor opens at http://localhost:5174. It reads and writes `content/maps/*.map.json` and `assets/`. **Play here** opens the game at the current map.

```bash
npm run validate -- --coverage
```

Checks every file under `content/` (schemas, cross references) and prints what is still to write per character.

## Writing content

- Start with [docs/PLAN.md](docs/PLAN.md), then the design reference [docs/design/gdd.md](docs/design/gdd.md).
- Villagers: [docs/content/villager-format.md](docs/content/villager-format.md). Dialog: [docs/content/dialog-format.md](docs/content/dialog-format.md). Everything else: [docs/content/data-formats.md](docs/content/data-formats.md).
- The sample character `aldric` under `content/villagers/aldric/` exercises every file type.
- Character art goes in `assets/characters/<set>_sprites/` (`idle1.png`, `leftwalk1.png`, `rightwalk1.png`, …) and `assets/characters/<set>_busts/<set>_<mood>.png`; `npm run dev` packs it automatically.
- Open questions and the decision log live in [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md).

## Layout

| Path | What |
|---|---|
| `game/` | The game: Phaser scenes, React overlay, pure core logic in `src/core` |
| `tools/editor/` | Map and asset editor |
| `tools/scripts/` | Sprite atlas build |
| `packages/shared/` | Content schemas, validator, shared rules |
| `content/` | Authored YAML/JSON content |
| `assets/` | Art and audio |
| `docs/` | Plan, design reference, authoring formats |
