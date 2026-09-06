# Conditions & Effects Reference

One vocabulary, used everywhere: dialog choices (`requires:`), chat and flirt pools (`when:`), topics, heart-event triggers, recruit rules, quest stages, encounter placement, and node weights. If a condition or effect you need is missing, say so; adding one is a small code change and it becomes available everywhere at once.

---

## Conditions

A condition is a YAML mapping. **Several keys in one mapping are ANDed.** Use `any:` / `all:` / `not:` to combine.

```yaml
requires: { tier: friend+, time: evening, not_tags: [callous] }

requires:
  any:
    - { tier: best_friend }
    - { romance: lover }
  not: { flags: [mara_left] }
```

Tier and romance comparisons: `friend` exact · `friend+` at least · `friend-` at most.

### Relationship (the current speaker unless `villager:` is given)

| Key | Example | Meaning |
|---|---|---|
| `tier` | `tier: acquaintance+` | friendship tier |
| `romance` | `romance: interest` | `neutral`, `interest`, `lover`; `interest+` allowed |
| `friendship_min` / `friendship_max` | `friendship_min: 30` | raw points |
| `romance_min` | `romance_min: 25` | raw points |
| `met` | `met: mara` | introduced |
| `events_seen` | `events_seen: [mara_heart_1]` | |
| `topics_done` | `topics_done: [the_mill]` | |
| `villager` | `{ villager: tobin, tier: friend+ }` | evaluate the relationship keys against another villager |

### Player

| Key | Example | Meaning |
|---|---|---|
| `tags` | `tags: [scary]` | all present |
| `any_tags` | `any_tags: [cool, fun]` | at least one |
| `not_tags` | `not_tags: [callous]` | none present |
| `stat_min` | `stat_min: { charisma: 6 }` | |
| `level_min` | `level_min: 5` | |
| `domain_lean` | `domain_lean: combat` | current leading axis: `friendship`, `pleasure`, `prosperity`, `combat`, `discovery` (`none` when tied or all zero) |
| `domain_points_min` | `domain_points_min: { discovery: 20 }` | |
| `faith_level_min` | `faith_level_min: 2` | |
| `form` | `form: fem` | `masc` or `fem` |
| `label` | `label: scary` | creation label (also a tag) |
| `hp_below` | `hp_below: 0.5` | fraction |

### Progress

| Key | Example | Meaning |
|---|---|---|
| `flags` | `flags: [mara_river_promise]` | all truthy |
| `not_flags` | `not_flags: [mara_left]` | |
| `flag_eq` / `flag_min` / `flag_max` | `flag_min: { drinks_won: 3 }` | numeric or string flags |
| `quest` | `quest: { id: sour_river, status: active, stage: gather_wood }` | status: `not_started`, `active`, `done`, `failed`; stage optional |
| `quests_done_min` | `quests_done_min: { type: personal, count: 3 }` | |

### World and time

| Key | Example | Meaning |
|---|---|---|
| `time` | `time: evening` · `time: [evening, night]` | phase |
| `day_min` / `day_max` | `day_min: 10` | |
| `map` | `map: dilsdurf_mill` | current map |
| `town` | `town: dilsdurf` | current town area (any of its maps) |
| `biome` | `biome: forest` | on expedition |
| `corruption_min` / `corruption_max` | `corruption_max: 3` | world value 0–10 |
| `relations` | `relations: { between: [aboridge, dilsdurf], is: hostile }` | town relation state |
| `in_expedition` | `in_expedition: true` | |
| `chance` | `chance: 0.3` | random gate (seeded) |

### Withergate

| Key | Example | Meaning |
|---|---|---|
| `facility` / `not_facility` | `facility: barracks` | built |
| `villager_in_town` / `villager_not_in_town` | `villager_in_town: mara` | resident |
| `residents_min` | `residents_min: 3` | |
| `resource_min` | `resource_min: { wood: 20 }` | in storage |
| `party_has` | `party_has: mara` | in current party |
| `party_has_profession` | `party_has_profession: doctor` | |
| `party_size_max` | `party_size_max: 1` | |
| `recruit_conditions_met` | `recruit_conditions_met: mara` | rarely needed (the recruit topic is automatic) |

### Special (only in certain places)

| Key | Where | Meaning |
|---|---|---|
| `reason` | `recruit.yaml → unhappy` | kind of the broken condition |
| `gift_category` | gift override pools | `loved`… |
| `node` | node weight rules | node type |

---

## Effects

An effects block is a mapping; every key is optional and all present keys apply in order listed here. Numbers may be written `+5` or `5`; negative as `-8`.

### Relationship (current speaker unless a per-villager map is given)

| Key | Example | Meaning |
|---|---|---|
| `friendship` | `friendship: +5` · `friendship: { mara: +5, tobin: -3 }` | growth multipliers apply to positive values |
| `romance` | `romance: +3` | ignored for non-romanceable characters |
| `set_tier` | `set_tier: { tobin: enemy }` | rare, for story moments |
| `introduce` | `introduce: [tobin]` | marks met and applies start bonuses |

### Player

| Key | Example |
|---|---|
| `tags` / `remove_tags` | `tags: [callous]` |
| `temp_tags` | `temp_tags: { drunk: 2 }` (tag → number of phases it lasts) |
| `xp` | `xp: 50` |
| `hp` / `energy` / `grace` | `hp: -5` |
| `domain_points` | `domain_points: { discovery: +2 }` |
| `faith` | `faith: +1` (points toward the next faith level) |
| `unlock_power` | `unlock_power: verdant_grasp` |
| `stat_check_bonus` | `stat_check_bonus: { stat: charisma, amount: 2, until: day_end }` |

### Progress

| Key | Example |
|---|---|
| `flags` | `flags: { mara_river_promise: true, drinks_won: 3, last_word: "sorry" }` |
| `increment` | `increment: { drinks_won: 1 }` |
| `clear_flags` | `clear_flags: [temp_flag]` |
| `quest_start` / `quest_advance` / `quest_complete` / `quest_fail` | `quest_start: sour_river` · `quest_advance: { id: sour_river, to: return }` |

### World and town

| Key | Example |
|---|---|
| `resources` | `resources: { wood: -20, gold: +50 }` (storage; on expeditions, the haul) |
| `items` | `items: { whetstone: 1 }` (gift items into storage) |
| `set_romance` | `set_romance: lover` · `set_romance: { mara: lover }` (Lover is only ever set by content, e.g. the confession event) |
| `relations` | `relations: { between: [aboridge, dilsdurf], set: tense }` |
| `corruption` | `corruption: -1` |
| `recruit` / `dismiss` | `recruit: mara` |
| `build` | `build: { facility: farm, instant: true }` (story use) |
| `time` | `time: +1` (advance phases) · `time: morning` (sleep to) |
| `teleport` | `teleport: { map: withergate, spawn: from_road }` |
| `schedule_override` | `schedule_override: { villager: mara, map: dilsdurf_mill, spot: wheel, until: day_end }` |

### Flow (also available as steps)

| Key | Example |
|---|---|
| `battle` | `battle: { enemy: hollow_wolf, on_win: [steps], on_lose: [steps] }` |
| `start_cutscene` | `start_cutscene: the_messenger` |
| `start_event` | `start_event: mara_heart_1` (forces a heart event now, ignoring its trigger) |
| `notify` | `notify: "Mara seems to trust you a little more."` (toast) |
| `unlock_map` | `unlock_map: heathel` (destination becomes selectable) |

---

## Known tags (starter list; you will add more)

Creation labels: `cool`, `scary`, `cute`, `fun`.
Behaviour: `callous`, `kind`, `liar`, `honest`, `merciful`, `ruthless`, `brave`, `cautious`, `generous`, `greedy`, `party_animal`, `sober`, `pious`, `irreverent`, `restorer`, `fallen`.
Temporary: `drunk` (set with `temp_tags`, expires after the given phases).
Axis milestones (granted when an axis passes the threshold in `progression.yaml`): to be named per axis, e.g. `beloved` (friendship), `hedonist` (pleasure), `provider` (prosperity), `warlord` (combat), `wayfarer` (discovery).

Tags are free text; the validator collects every tag used in content into one list so misspellings stand out. Add new tags by using them and telling me what they mean if any system beyond dialog should react.

## Flag naming

`<owner>_<thing>` in lowercase: `mara_river_promise`, `aboridge_gate_opened`, `main_act1_done`. Flags are booleans unless you set a number or string. Quest state should live in the quest, not in flags, unless you need it in a condition before the quest exists.
