# Other Data Formats

Formats for everything that is not a villager or a dialog script. All use the [conditions & effects](conditions-and-effects.md) vocabulary where they need conditions or effects. Ids are lowercase_with_underscores. Fields marked *(proposed)* are defaults you can change.

Contents: [quests](#quests) · [items](#items-and-gifts) · [enemies](#enemies) · [weapons](#weapons) · [powers](#powers) · [facilities](#facilities) · [regions & nodes](#regions-and-nodes) · [encounter events](#encounter-events) · [cutscenes](#cutscenes) · [progression](#progression)

---

## Quests

`content/quests/<id>.yaml`

```yaml
id: sour_river
title: "The Silent Wheel"
type: personal                 # main | personal | town | bounty
giver: mara                    # villager id, or a town id for town quests, or none
summary: "Mara's mill died with the river. Find out what soured it."
stages:
  - id: ask_around
    objective: "Ask someone in Dilsdurf what happened upstream."
    complete_when: { flags: [river_rumour_heard] }
  - id: find_source
    objective: "Follow the river north."
    complete_when: { flags: [river_source_found] }
    checkpoint: river_source          # forces this story checkpoint into the next expedition north
  - id: gather
    objective: "Bring 20 ironwood to Withergate."
    complete_when: { resource_min: { ironwood: 20 } }
    on_complete: { resources: { ironwood: -20 } }
  - id: return
    objective: "Tell Mara."
    complete_when: { flags: [mara_river_told] }
rewards: { xp: 60, friendship: { mara: +15 }, tags: [restorer], renown: { dilsdurf: +5 } }
fail_when: { flags: [mara_left] }     # optional
journal_notes:                        # optional flavour shown as stages complete
  find_source: "Something is bleeding into the water above the falls."
```

Stages complete automatically when their condition becomes true (checked after every effect and at each daily tick). Use `quest_advance` in a script when you want to move explicitly.

---

## Items and gifts

`content/items.yaml`

```yaml
items:
  - id: ironwood_carving
    name: Ironwood Carving
    kind: gift                  # gift | material | key
    description: "A small fox worn smooth by someone's thumb."
    rarity: rare                # common | uncommon | rare
    sources: [craft, cache, quest]     # for your reference and the coverage report
    craft: { facility: bazaar, cost: { wood: 10 }, requires: { villager_in_town: any_craftsman } }
  - id: pine_resin
    name: Pine Resin
    kind: gift
    rarity: common
    sources: [gather_wood]
```

Resources (gold, wood, stone, ore, food, herbs, cloth, faith) are not items; they are counters in storage. Gift items are countable in storage too and travel in the gift satchel.

---

## Enemies

`content/enemies/<id>.yaml`

```yaml
id: hollow_wolf
name: Hollow Wolf
description: "A wolf that forgot to stop being hungry."
sprite_set: hollow_wolf
stats: { hp: 24, attack: 7, defense: 2, speed: 6 }
damage_type: beast
resistances: { blade: 1.25, blunt: 1.0, pierce: 0.75, divine: 1.0 }   # multipliers on damage taken
moves:
  - { id: bite, name: Bite, weight: 3, power: 1.0 }
  - { id: howl, name: Howl, weight: 1, effect: { status: attack_up, turns: 2 } }
  - { id: frenzy, name: Frenzy, weight: 2, power: 1.4, when: { hp_below: 0.4 } }
xp: 12
loot: { food: 2 }                     # into the haul
gift_drop: { item: wolf_fang, chance: 0.1 }
tags_on_kill: []                      # e.g. [ruthless] for a creature that could be spared
spare: { check: { stat: charisma, dc: 12 }, items: { hollow_fang: 1 }, tags: [merciful] }
appears: { biomes: [forest, corrupted], time: [evening, night], corruption_min: 0 }
tier: regular                         # regular | elite | boss
```

A move with `power` attacks; a move with `effect` applies a status (buffs `attack_up` / `defense_up` / `inspired` go on the enemy itself, everything else on the player); a move can do both. In a move's `when`, `hp_below` means the enemy's own HP fraction. `spare` is optional: leave it out (or set `possible: false`) and the enemy can never be spared; otherwise `check` (default Charisma, DC 12, Divinity/2 is added automatically), `items` (what sparing pays, instead of XP) and `tags`. Boss files add `phases:` (a list of `{ hp_below, moves, on_enter: [steps] }`) and `intro:` / `defeat:` scripts (bosses arrive with the story systems).

---

## Weapons

`content/weapons.yaml`

```yaml
weapons:
  - id: woodaxe
    name: Woodaxe
    damage_type: blade
    power: 1.0
    speed_mod: 0
    trait: { on_hit: { status: bleed, chance: 0.2 } }
    source: { craft: { facility: bazaar, cost: { wood: 5, ore: 5 } } }
  - id: pilgrim_staff
    name: Pilgrim's Staff
    damage_type: divine
    power: 0.8
    grace_regen: 1
```

Damage types *(proposed)*: `blade`, `blunt`, `pierce`, `divine`. Enemy damage types add `beast`, `corrupt`, `construct`. Amanda defines the full matrix; the code only needs every enemy to list its multipliers.

---

## Powers

`content/powers.yaml`

```yaml
powers:
  - id: smite
    name: Smite
    domain: combat                     # the axis this power feeds (unlocking it adds a domain point)
    tier: 1                            # faith level needed
    requires: []                       # skill-tree prerequisites (other power ids)
    points: 1                          # skill points to unlock
    kind: combat                       # combat | passive | town | travel | companion
    cost: 4                            # Grace
    target: enemy
    power: 1.3                         # × Divinity-scaled base
    damage_type: divine
    description: "A bolt of borrowed heaven."
  - id: smite_ii
    name: Greater Smite
    domain: combat
    tier: 2
    requires: [smite]
    points: 2
    kind: combat
    cost: 7
    target: enemy
    power: 1.8
    damage_type: divine
    effect: { status: burning, turns: 2 }
  - id: wayfinding
    name: Wayfinding
    domain: discovery
    tier: 1
    kind: travel
    effect: { type: preview_nodes, columns: 1 }
  - id: mending_light
    name: Mending Light
    domain: friendship
    tier: 1
    kind: combat
    cost: 5
    target: self
    heal: 10                           # restores heal + Divinity/2
  - id: shield_bash
    name: Shield Bash
    kind: companion                    # a companion's once-per-battle skill; referenced from a villager's benefits.combat active entry
    target: enemy
    power: 0.8
    damage_type: blunt
    effect: { status: stagger, turns: 1 }
```

Combat powers may carry `power` (damage), `heal`, and `effect: { status, turns }` in any combination; `cost` is Grace. Companion skills cost nothing and use the player's Attack.

```yaml
  - id: mara_cleave
    name: Cleave
    kind: companion                    # one use per battle, granted by a villager benefit
    cost: 0
    target: enemy
    power: 1.5
    damage_type: blade
```

---

## Facilities

`content/facilities.yaml`

```yaml
facilities:
  - id: barracks
    name: Barracks
    fixed: false
    cost: { wood: 40, stone: 30, gold: 100 }
    build_days: 3
    workplace_for: [warrior]
    effects:
      - { type: caravan_safety, percent: 15 }
      - { type: unlock_action, action: train_militia }
      - { type: incursion_defense, amount: 2 }
    description: "..."
```

Proposed roles for the eight optional facilities (Amanda edits):

| Facility | Proposed role | Workplace for |
|---|---|---|
| Barracks | Caravan safety, incursion defence, militia actions | Warrior |
| Farm | Food income; feeds energy bonuses | Farmer |
| Library | Research: reveal DCs, node previews, lore quests | Academic |
| Town Hall | Policies, festivals, diplomacy actions with the five towns | Engineer, Socialite |
| Bazaar | Crafting weapons and gifts; better trade rates; visiting merchants | Craftsman, Socialite |
| Hospital | Heal residents, recover faster after defeat, doctor actions | Doctor |
| Inn | Visitors bring renown and recruits; room for travellers; explorer contracts | Explorer, Socialite |
| Restaurant | Tavern quality, energy max, food-based buffs before expeditions | Chef |

Fixed facilities (`your_quarters`, `living_quarters`, `general_store`, `tavern`) are in the same file with `fixed: true` and `cost: {}`.

Effects the game applies today: `resource_income` (resource, amount per day), `store_rates` (percent off buys), `energy_max` (amount), `recovery_speed` (days), `caravan_safety` (percent), `preview_nodes` (columns), `incursion_defense` (amount), `faith_gain` (percent), `tavern_quality` (amount), `unlock_action` (action). Unknown types are kept and ignored.

---

## Ascension

`content/ascension.yaml` decides when the shrine lets you ascend and how the ending names you.

```yaml
requires: { all: [{ quest: { id: main_act3, status: done } }, { faith_level_min: 5 }, { residents_min: 5 }] }
not_yet: "The heavens are not listening yet."          # shown at the shrine while requires fails
titles:                                                 # per axis: epithet after your name, and what you are deity of
  friendship: { epithet: "the Beloved", domain: "Hearth and Kin" }
  combat: { epithet: "the Unyielding", domain: "the Sword and the Wall" }
epilogue:                                               # plays before the ending screen; {title} is filled in
  - narrate: "They will remember you as {title}."
```

The strongest axis gives the epithet; it and the runner-up (if at least half as strong) give the domains: "Mara the Unyielding, Goddess of the Sword and the Wall and Roads and Hidden Things". The five axes are shown to the player only on the ending screen.

`content/progression.yaml → corruption` tunes the corruption's cadence and its words (`{name}`, `{town}`, `{lost}` are filled in):

```yaml
corruption:
  warning_days: 5        # idle days before the warning
  grace_days: 3          # days after it to start a corruption expedition before someone is taken
  rise_every_days: 10    # idle days per +1 corruption (0 = story only)
  incursion_from: 6      # corruption level from which incursions can happen
  warning: "You can feel the corruption leaking into the mortal plane…"
  taken: "It appears we lost {name} in {town} to the corruption last night…"
```

---

## Economy and the tavern

`content/economy.yaml`

```yaml
prices: { wood: 3, stone: 4, ore: 6, food: 2, herbs: 3, cloth: 5 }   # base value of each resource, gold per unit
sell_rate: 0.5                                                          # fraction of the base value paid when selling
gifts: { whetstone: 8, hearty_stew: 5 }                                 # gift items the store can stock, base value each
stock:                                                                  # the weekly shelves (decided H2)
  offers: 5                        # different things on the shelves each week
  markup: [1.2, 1.8]               # each offer is priced at base × a random markup in this range; never below base
  units: { default: 10, ore: 5 }   # units of a resource in one offer
  weights: { wood: 3, food: 3, whetstone: 1 }   # base chance of showing up (unlisted = 1); residents add theirs
```

The store is never a good deal: prices sit above the base value even with Bazaar and Socialite discounts, and change every week, so the best you get is a less bad week. Which things appear depends on who lives in Withergate: each villager's `store:` map in `profile.yaml` adds weight to the resources or gift items they make.

`content/tavern.yaml` lists what you can do at the tavern. Each activity is a menu entry:

```yaml
activities:
  - id: gathering
    label: "Gather the residents"
    description: "Spend the evening with everyone who lives here."
    requires: { time: evening, residents_min: 1 }
    gold: 0
    cost: phase                         # none | phase
    once_per_day: true
    effects: { friendship_residents: 2, domain_points: { friendship: 1 } }
    script:
      - narrate: "Chairs scrape, someone finds a fiddle..."
```

`friendship_residents` is an effect that changes friendship with every current resident. Heart events and group scenes can be attached to activities through `script`.

---

## Regions and nodes

`content/regions.yaml`

```yaml
regions:
  - id: dilsdurf_road
    name: The Dilsdurf Road
    kind: route                          # route (between towns) | wild (explore)
    from: withergate
    to: dilsdurf
    days: 2                              # 8 nodes over 2 segments
    biomes: [plains, forest]
    danger: 1                            # 0–5, scales enemy tier and elite chance
    checkpoints:
      - pool: [roadside_shrine, wayfarer_camp]      # random pick for segment 1
      - fixed: dilsdurf_arrival                      # last segment ends at the town
    node_weights:                        # overrides of the biome defaults
      gather_wood: 1.5
      traveler: 0.5
  - id: north_frontier
    kind: wild
    from: withergate
    segments: [1, 3]                     # random 1–3
    biomes: [hills, corrupted]
    danger: 3
    checkpoints:
      - pool: [hollow_den, lost_chapel, corrupted_spring]
    story_checkpoints:                   # a quest stage with checkpoint: X can force one of these
      river_source: { after_segment: 1 }
```

Biome defaults live in `content/biomes.yaml` (node weights per type and per phase, enemy pools, gather tables). The generator multiplies: biome default × region override × phase modifier × corruption modifier × party and facility benefits × power effects.

How a region is walked (built in Phase 7): a route has `days` segments, an exploration rolls its `segments`; every segment is three columns of 2–4 nodes and then one checkpoint drawn from `checkpoints[segment]` (`pool` picks at random among those whose `where` fits, `fixed` always plays). The last checkpoint of a route is the gates of `to`: after it plays, the town's map loads at its `from_road` spawn (or the visit is abstract and you turn back if the town has no map yet). A route that ends in a town also offers the way back from that town. Enemies for battle nodes come from the biome's `enemies`, filtered by each enemy's `appears`; elite nodes prefer `tier: elite` enemies and otherwise toughen a regular one.

---

## Encounter events

`content/encounters/<id>.yaml`

```yaml
id: lost_child
name: "A Child on the Road"
node: event                            # event | shrine | traveler | cache | rest (flavour for rest nodes)
weight: 1.0
where: { biomes: [forest, plains], time: [morning, afternoon], corruption_max: 3 }
once: false
script:
  - narrate: "A child sits at the roadside, crying without sound."
  - choice:
      - text: "Comfort them and look for their parents."
        check: { stat: charisma, dc: 10 }
        success:
          - narrate: "A woodcutter comes running. He presses a bundle into your hands."
          - effects: { resources: { food: 3 }, tags: [kind], renown: { dilsdurf: +2 } }
        fail:
          - narrate: "The child bolts into the trees. You lose an hour searching."
          - effects: { energy: -1 }
      - text: "Corruption uses bait. Keep walking."
        effects: { tags: [callous] }
      - text: "Pray over the child."
        requires: { domain: nature }
        effects: { domain_points: { nature: +1 } }
        then:
          - narrate: "Green shoots curl through the mud where the tears fell."
```

Party members can speak in encounters with `- party: mara` lines; the line is skipped if she is not present, or use `requires: { party_has: mara }` on a choice. `node` decides where an encounter can appear: `event` nodes draw from the event pool, `shrine`, `traveler` and `rest` nodes draw from theirs (with a built-in fallback when nothing fits), and `checkpoint` encounters are only reached through a region's `checkpoints` pools. `once: true` plays a single time per game. While on the road, `resources` effects go into the haul and `in_expedition`, `biome` and `node` conditions describe where you are.

---

## Cutscenes

`content/cutscenes/<id>.yaml` — `stage:` + `script:` exactly as in heart events, without a trigger. Started by a quest stage (`on_enter: { start_cutscene: id }`), an effect, or the story engine (the opening).

```yaml
id: the_messenger
stage:
  map: landing_glade
  place: { messenger: glade_path_east, player: glade_center }
script:
  - fade: in
  - move: { who: messenger, to: glade_center_right, wait: true }
  - messenger(nervous): "You. You're the one who fell."
  - ...
  - effects: { quest_start: main_act0, unlock_map: withergate }
  - end: scene
```

---

## Progression

`content/progression.yaml`

```yaml
level_cap: 20
xp_curve: [0, 20, 50, 90, 140, 200, 270, 350, 440, 540, 650, 770, 900, 1040, 1190, 1350, 1520, 1700, 1890, 2090]
base: { hp: 30, attack: 6, defense: 3, speed: 5, divinity: 4 }
per_level: { hp: 4, attack: 1, defense: 0.5, speed: 0.5, divinity: 0.5 }
lean_growth:                         # extra per level, by current leading axis (proposed)
  combat:     { attack: 0.5, hp: 1 }
  friendship: { defense: 0.5 }
  pleasure:   { speed: 0.5 }
  prosperity: { hp: 2 }
  discovery:  { divinity: 0.5 }
faith_levels: [0, 10, 25, 50, 90, 140]   # faith points needed for levels 0–5; powers of tier N need level N
skill_points_per_faith_level: 1
domain_milestone: 40                 # axis points that grant the milestone tag
grace: { base: 10, per_divinity: 2 }
stats: { start: 2, points: 15, max_at_creation: 8, max: 10 }
energy: { player_max: 8, companion_recovery_per_day: 2, death_recovery_days: 5 }
caravan: { loss_chance_end: 0.3, loss_chance_checkpoint: 0.5, loss_fraction: [0.25, 0.5] }
```
