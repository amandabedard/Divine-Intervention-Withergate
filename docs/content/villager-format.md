# Villager Authoring Format

How to write a villager so the game can load them. One folder per villager under `content/villagers/<id>/`. The `id` is lowercase with underscores and is used everywhere else (dialog speakers, conditions, quests).

```
content/villagers/mara/
  profile.yaml     who they are, likes, gifts, affinities, recruit rules, benefits, schedule
  chat.yaml        banter pools
  discuss.yaml     topics (! quest, ♥ friendship)
  flirt.yaml       flirt responses by romance state (omit if not romanceable)
  gifts.yaml       gift reaction lines and special-gift overrides
  recruit.yaml     the recruit conversation, unhappy lines, farewell
  barks.yaml       optional one-liners while travelling with you
  events/          heart events, one file each
    heart_1.yaml
    heart_2.yaml
```

Everything except `profile.yaml` uses the [dialog format](dialog-format.md). Conditions (`requires:`, `when:`) and `effects:` use the shared [conditions & effects](conditions-and-effects.md) vocabulary. Anything you have not written yet can be left out; the game falls back to a visible `[PLACEHOLDER]`.

YAML tips: wrap any spoken line in double quotes if it contains a colon, a `#`, or starts with a symbol. Indent with two spaces. `#` starts a comment.

---

## profile.yaml — complete example

```yaml
id: mara                       # must match the folder name
name: Mara Holt
pronouns: she/her              # used only in system text ("She has left Withergate.")
profession: logger             # doctor | warrior | farmer | academic | engineer | logger | miner | chef | explorer | craftsman | socialite
home_town: dilsdurf            # aboridge | dilsdurf | heathel | mukrige | scottsburg | none (wanderer)
romanceable: true
portrait_set: mara             # busts in assets/characters/mara_busts/mara_<mood>.png; every mood used in dialog must exist (neutral required)
sprite_set: mara               # frames in assets/characters/mara_sprites/{idle,leftwalk,rightwalk}N.png

bio: >
  Ran the Holt sawmill with her father until the river soured. Blunt, loyal,
  and quietly grieving. Distrusts anyone who talks like a noble.

personality: [blunt, loyal, grieving]     # free text tags for your reference and for the coverage report

# Weights on social interactions. Topics and chat lines can reference these
# with likes:/dislikes: conditions, and the game uses them for tavern events.
likes: [woodcarving, honesty, strong drink, quiet mornings]
dislikes: [nobility, waste, flattery]

gifts:
  loved:    [ironwood_carving, aged_whiskey]
  liked:    [pine_resin, hearty_stew, whetstone]
  disliked: [perfume, gilded_ring]
  hated:    [silk_ribbon]
  # anything not listed is neutral

# How your hidden tags land with her. start_bonus is applied once, when you are
# introduced. growth multiplies positive friendship gains while you hold the tag.
tag_affinity:
  scary:   { start_bonus: +10, growth: 1.25 }
  cute:    { start_bonus: -5,  growth: 0.9 }
  callous: { growth: 0.75 }
  restorer: { start_bonus: +15 }

# Domain leanings. Applied like tag affinities once a domain is locked in.
domain_affinity:                     # keyed by axis: friendship, pleasure, prosperity, combat, discovery
  prosperity: { growth: 1.25 }
  combat:     { start_bonus: -10, growth: 0.75 }

# Optional per-character overrides of the global thresholds.
romance:
  interest_requires: { romance_min: 25, tier: acquaintance+ }
  lover_requires:    { romance_min: 75, tier: friend+, events_seen: [mara_heart_3] }

recruit:
  requires:                          # all must hold for the recruit topic to appear
    tier: acquaintance+
    quest: { id: sour_river, status: done }
  method: { kind: chance, chance: 0.5, max_attempts: 3 }
  # how she agrees once asked. One of:
  #   { kind: ask }                                    she just says yes
  #   { kind: chance, chance: 0.5, max_attempts: 3 }   a roll each time you ask, limited asks
  #   { kind: quest, quest: sour_river }               a quest must be done
  #   { kind: item, item: ironwood_carving, amount: 1 } bring something
  leaves_if:                         # any one of these breaks her stay (checked daily)
    - villager_in_town: lord_pell    # will not live alongside him
    - domain_lean: combat            # she will not stay in a war camp
    - tier: disliked-                # if you treat her badly enough
  # A villager who needs a workplace adds:  - not_facility: farm
  workplace: none                    # none | barracks | farm | library | town_hall | bazaar | hospital | inn | restaurant | tavern | general_store

energy: 6                            # expedition stamina (companions 4–10)
recovery_days: 5                     # days out of action after a death on the road (default 5, a week)

benefits:                            # from the catalogue below; unique per character is encouraged
  town:
    - { type: resource_income, resource: wood, amount: 3 }
    - { type: build_discount, resource: wood, percent: 15 }
  travel:
    - { type: node_weight, node: gather_wood, multiplier: 1.5 }
    - { type: gather_yield, resource: wood, multiplier: 1.5 }
  combat:
    - { type: passive, effect: enemy_defense_down, value: 1 }
    - { type: active, skill: mara_cleave }        # optional, one use per battle, defined in powers.yaml as kind: companion

schedule:
  home:                              # where to find her before she moves in
    morning:   { map: dilsdurf_mill, spot: mill_yard }
    afternoon: { map: dilsdurf_forest_edge, spot: stump }
    evening:   { map: dilsdurf_tavern, spot: bar_left }
    night:     { map: none }         # not reachable
  withergate:                        # after she moves in; falls back to workplace/lodging defaults if omitted
    morning:   { map: withergate, spot: lumber_pile }
    afternoon: { map: withergate, spot: lumber_pile }
    evening:   { map: withergate_tavern, spot: corner_table }
    night:     { map: withergate_living, spot: room_2 }
  overrides:                         # optional, first match wins
    - when: { flags: [mara_river_restored], time: morning }
      at: { map: dilsdurf_mill, spot: wheel }
```

---

## Field reference

| Field | Required | Notes |
|---|---|---|
| `id`, `name` | yes | id is lowercase_with_underscores |
| `pronouns` | no | for system text only; player is always they/them |
| `profession` | yes | one of the 11; exceptions allowed with `profession: none` |
| `home_town` | yes | `none` for wanderers met on the road |
| `romanceable` | yes | false → flirt always rejected with the standard line and no effect |
| `portrait_set`, `sprite_set` | no | default to `id`; missing assets show the placeholder |
| `bio` | yes | shown in Living Quarters and the journal |
| `personality` | no | free text; not read by the game beyond reports |
| `likes`, `dislikes` | yes | free text keywords; referenced by conditions and tavern events |
| `gifts` | yes | item ids from `content/items.yaml`; unlisted items are neutral |
| `tag_affinity` | no | keys are tag ids; see [conditions & effects](conditions-and-effects.md) for known tags |
| `domain_affinity` | no | keys `friendship`, `pleasure`, `prosperity`, `combat`, `discovery` |
| `romance` | no | overrides global thresholds; only read if `romanceable: true` |
| `recruit.requires` | yes for recruitables | a condition block; omit the whole `recruit` section for non-recruitable characters |
| `recruit.method` | no | how they agree: `ask` (default), `chance`, `quest`, `item` |
| `recruit.leaves_if` | no | list of conditions, any one breaks their stay |
| `recovery_days` | no | default 5 |
| `recruit.workplace` | no | facility they work at once recruited; `none` = odd jobs. If they *need* it, also add `not_facility: X` to `leaves_if` |
| `energy` | yes for recruitables | |
| `benefits` | no | see catalogue |
| `schedule.home` | yes if they have a home town | any phase can be `{ map: none }` |
| `schedule.withergate` | no | defaults derived from workplace and Living Quarters |

---

## Benefit catalogue (v1)

Each benefit is `{ type, ...params }`. This list is the code's contract; ask for a new type when a character needs one, it is a small change.

**Town** (apply while they live in Withergate)

| type | params | effect |
|---|---|---|
| `resource_income` | resource, amount | per day into storage |
| `build_discount` | resource?, percent | cheaper facilities |
| `build_speed` | days | fewer build days |
| `caravan_safety` | percent | reduces ambush chance |
| `relationship_gain` | percent | town-wide friendship gain bonus |
| `energy_max` | amount | all residents |
| `store_rates` | percent | better trade rates |
| `tavern_quality` | amount | better event outcomes |
| `unlock_action` | action | enables a facility action (e.g. `craft_weapon`, `research`, `heal_resident`) |
| `faith_gain` | percent | more faith from deeds |

**Travel** (apply while in your party)

| type | params | effect |
|---|---|---|
| `node_weight` | node, multiplier | more or fewer nodes of a kind |
| `gather_yield` | resource?, multiplier | |
| `extra_paths` | amount | more edges per column |
| `preview_nodes` | columns | reveal node types ahead |
| `heal_per_node` | amount | party HP |
| `energy_cost` | delta | modifies per-node energy cost for the party |
| `flee_guaranteed` | — | |
| `check_bonus` | stat, amount | on event checks |
| `ambush_chance` | percent | on the road |

**Combat**

| type | params | effect |
|---|---|---|
| `passive` | effect, value | `enemy_defense_down`, `player_attack_up`, `player_defense_up`, `intercept_hit`, `grace_regen`, `crit_chance`, `status_resist` |
| `active` | skill | one use per battle; skill defined in `powers.yaml` with `kind: companion` |
| `revive` | times | per expedition |

---

## Writing notes

- **Introduce before you deepen.** Stranger-tier chat should work for someone who has never met you; acquaintance and up can reference shared history.
- **Give every villager one thing they want and one thing they fear.** Recruit conditions and leave conditions should come from those.
- **Likes and dislikes are for texture and for consequences.** Tavern events, gifts, and some choices check them.
- **Use flags for anything you want to remember**, named `<villager>_<thing>` (for example `mara_river_promise`). The validator lists every flag name so typos show up.
- **Coverage target per villager (v1):** ~30 chat lines (at least 4 per tier), 6–10 topics, flirt lines for 3 states, gift reactions in 5 categories plus 2 overrides, 3 heart events (4 for romanceable), recruit + unhappy + farewell scripts, ~6 barks.
