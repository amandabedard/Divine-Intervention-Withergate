# Game Design Reference

The canonical description of every system, consolidated from Amanda's brief and organised by system so it can be implemented and checked against. **(proposed)** marks a default I chose where the brief was silent; every one of them is listed in [OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md). Numbers in §15 are starting tunables and will move in playtesting.

Identifiers used in content files (lowercase): tiers `enemy, disliked, stranger, acquaintance, friend, best_friend` · romance states `neutral, interest, lover` · phases `morning, afternoon, evening, night` · domain axes `friendship, pleasure, prosperity, combat, discovery` · stats `charisma, intelligence, luck, dexterity, perception` · resources `gold, wood, stone, ore, food, herbs, cloth` (faith is a progression level, not a resource).

Decisions from Amanda's answers on 2026-09-06 are marked **(decided)**; the rest of the proposals stay open in groups C–E of the questions file.

---

## 1. Premise and goal

- You are half-human, half-deity of nothing in particular, expelled from the heavens to Earth.
- Goal: make your presence known among humans and become the Deity of ___ so you can return to the heavens. Unlocked by completing the main story: settle the discord between the cities, resolve the corruption, expand your town, among others.
- The region is at war with itself and with an otherworldly power. The King of Aboridge grants you Withergate, a plot of land on the brink of what locals call Hell, a corrupted region that grows daily. It is entirely your domain.
- Towns: Aboridge (seat of the king), Dilsdurf, Heathel, Mukrige, Scottsburg (identities TBD by Amanda), plus Withergate (yours).

## 2. The player character

### 2.1 Creation
1. **Form:** masculine- or feminine-presenting. Characters always refer to you as they/them because you are a deity.
2. **Name:** used through `{name}` in dialog.
3. **Personality stats:** allocate points (§2.2).
4. **Label:** cool, scary, cute, or fun. It becomes your first hidden tag (§7.5).

### 2.2 Personality stats (unchangeable)
Charisma, Intelligence, Luck, Dexterity, and **Perception (decided)**. Strength was rejected as too close to Attack. Perception covers noticing: hidden paths and caches, an ambush before it springs, a lie or a tell in conversation, tracks, a weak point.

- **Point-buy (confirmed):** each stat starts at 2, you distribute 15 points, max 8 at creation, scale 1–10.
- **Checks (confirmed):** `d20 + stat + luckBonus ≥ DC`. DC bands: trivial 6, easy 9, medium 12, hard 15, very hard 18, heroic 21. A natural 20 is a critical success and a natural 1 a critical failure, but only when the script defines those branches.
- **Luck:** `luckBonus = floor(luck / 3)` on every check; Luck is the stat rolled for fortune events (gambling, mystery caches); each point also reduces caravan ambush chance by 1%.
- **Passive uses (proposed):** Charisma adds 5% to positive relationship gains per point above 5; Intelligence previews one extra node column and speeds research; Dexterity improves flee chance and first strike; Perception shows check DCs on choices, reveals hidden nodes, and prevents enemy first strikes from ambushes.

### 2.3 Combat stats
Attack, Defense, Speed, Divinity, plus HP and **Grace** (proposed name for the pool spent on powers; `maxGrace = 10 + 2 × Divinity`). They scale with level through `content/progression.yaml`. XP comes from battles, quests, and discoveries. Level cap 20 (proposed).

### 2.4 Energy
Every character on an expedition has an energy bar, the player included (decided). Player energy caps expedition length; at 0 the expedition ends and you head home. The player's energy refills fully every day. Companions recover gradually at home (proposed +2 per day), and after a death they sit at 0 with a recovery time before they can travel again (§11): per character, default 5 days, which is an in-game week (decided E2).

### 2.5 No inventory
There is no item inventory and no healing items. Everything gathered goes to Withergate by caravan (§12). What you carry is a **loadout** set at your Quarters (decided): one weapon, your equipped powers (up to 4), and a **gift satchel** of up to 3 gift items so you can give gifts in other towns.

## 3. Deity domains and powers

Five axes (decided): **friendship, pleasure, prosperity, combat, discovery**. Ids `friendship / pleasure / prosperity / combat / discovery`.

**The title is earned, not chosen (decided).** Choices, quests, and deeds award domain points on the five axes throughout the game, based on what you actually do. Nothing is locked in. At the end, the game generates what you are the Deity *of* from your accumulated stats. **It is a secret (decided F5):** no screen, toast, or line hints at the leanings before the ending, so `{domain}` in dialog and the `domain_lean` condition are for the ending and for characters reacting in-character, never for telling the player their score. Content reads the leaning through `domain_lean` and thresholds through `domain_points_min`.

**Faith (decided)** is the progression, not a spendable resource and not a separate renown meter. You earn it by doing things and completing story and character quests as humans come to believe in you. Faith levels grant skill points.

**Powers form five small skill trees, one per axis (decided E1, F1).** Each power belongs to an axis, needs a faith level (`tier`), may require other powers (`requires`), and costs skill points (`points`, 1 point per faith level, no respec). Unlocking a power adds a point to its axis, so your powers and your eventual title reinforce each other. A power is either a combat action (costs Grace, scales with Divinity) or an out-of-combat ability (a discovery power that previews nodes, a pleasure power that improves tavern events, a combat power that reduces caravan ambushes). Format in [data-formats.md](../content/data-formats.md).

Leanings also shape who will join Withergate and how villagers feel about you, through `domain_affinity` in profiles.

## 4. Time

- A day counter (Day 1 is the fall) and four phases (decided): morning, afternoon, evening, night. The brief names three; night is added so "more monsters at night" has a phase to live in.
- Time advances only through actions, never in real time.
- **In town (proposed costs):** talking, shopping, and walking are free. Activities cost one phase: a tavern event, a discuss topic marked `cost: phase`, a facility action, resting, some quest steps. Sleeping at Quarters fast-forwards to the next morning (decided E3) and is also where you save (§14). At night most NPCs are home, the tavern is open, and night-only events exist.
- **On expeditions:** each node consumes one phase (4 nodes = 1 day). Night nodes weight toward monsters; a Rest node camps until morning.
- **Daily tick at morning:** resource income, build progress, unhappiness countdowns, corruption growth, caravan movement, store restock.
- No relationship decay (proposed).

## 5. World

### 5.1 Towns
Five towns plus Withergate. Each town is a small set of side-scroller maps (a main street plus interiors), villagers with schedules, a store or tavern equivalent, and a notice board. Identity, industry, and factions are TBD by Amanda (template in `docs/design/lore/`).

### 5.2 The war
Each town has its own conflict (decided): a class war in Aboridge under the king, two towns at war with each other, one at peace, and one dealing with corruption. Town relations are tracked as a matrix (allied / tense / hostile) driven by story and quests. Withergate starts neutral. Details TBD in the town bibles.

### 5.3 Corruption
A world value 0–10 (proposed) that rises on a schedule slowed or reversed by story progress. Effects: node weights near the frontier (more monsters, corrupted variants, corrupted gather nodes), incursion events at Withergate (defend it; Barracks and Warriors help), corrupted checkpoints. **Special corruption maps must be cleared; otherwise it starts killing non-recruited NPCs at random (decided).** At risk: any character who is not recruited and not marked `protected: true` on their sheet (the king and story figures are protected). Recruiting someone protects them. **Cadence (decided G3):** a full week (5 days) without clearing corruption brings the warning: "You can feel the corruption leaking into the mortal plane. Better do something about it before something terrible happens." If a corruption dungeon has not been started within the next 3 days, someone is taken, and the messenger reports it: "It appears we lost xyz in H town to the corruption last night…" (decided F4). What counts as clearing, and whether starting a dungeon pauses the clock, is question H1. Implementation arrives with the story systems (Phase 8).

### 5.4 Making yourself known
There is no separate renown meter (decided). Making your presence known *is* faith (§3): it rises as you complete story plot items and specific character quests, and it is what unlocks abilities and the ending.

### 5.5 Regions between towns
Biomes (proposed): plains, forest, hills, marsh, corrupted frontier. Each region lists biome, danger, node weights, and settlement/checkpoint pools.

## 6. Side-scrolling exploration

- **Art and scale (decided by the assets):** smooth hi-res art, not pixel art. Logical resolution 1280×720, scaled to fit the window. Character frames are authored on 400×400 canvases and busts on 500×500. The sprite build script trims and packs the named frames of each set (`idle`, `leftwalk`, `rightwalk`, …) into an atlas, and the game displays characters at roughly half size (≈100 px tall).
- **Controls:** left/right, run (hold), interact, menu. No jumping (decided); different ground levels connect with ramps and stairs drawn into the map.
- **Prompts:** `!` above the player near an interactable; an arrow near an exit pointing its direction; a speech bubble above an NPC in range.
- **Interactables:** doors (load an interior map or open a UI), signs, notice boards, facility entrances, shrines, forage spots (landing and road maps), containers in settlements.
- **Exits:** zones with a direction; entering loads the target map at a named spawn.
- **NPC schedules:** per phase, a map plus a spot id. Recruited villagers switch to Withergate schedules keyed to their workplace.
- Time-of-day tint and ambient sound per phase.

## 7. Dialog and relationships

### 7.1 Talk menu
**Chat · Discuss · Flirt · Give Gift · Exit**

- **Chat:** banter drawn from pools keyed by conditions (tier, romance state, time, location, tags, flags). The first chat of the day gives +1 friendship (proposed); later chats give nothing.
- **Discuss:** a list of topics. `!` marks quest-related topics, ♥ marks getting-to-know / friendship topics. Topics unlock by conditions (tier, flags, quest state); most are one-time. Topics contain choices with relationship effects.
- **Flirt:** romanceable characters respond by romance state. Non-romanceable characters always say "I'm just not interested, sorry." with no effect. Only the first flirt per day has an effect (proposed). Flirting at Stranger is rebuffed with no gain (proposed).
- **Give Gift:** choose from your satchel, or from town storage when in Withergate. One gift per character per week, five days (decided F7). The reaction category comes from the character's lists; special gifts have item-specific overrides.

### 7.2 Friendship tiers
Enemy < Disliked < Stranger < Acquaintance < Friend < Best Friend. Point thresholds in §15. Stranger is also the pre-introduction state; introduction happens on the first Chat or Discuss and applies any starting bonus from tag affinities.

### 7.3 Romance
States: Neutral → Interest (a crush) → Lover. Romanceable characters only. Romance points accrue from flirting **and** from friendship choices, so a character can develop a crush on you without any flirting.

- Interest (proposed): romance ≥ 25 and tier ≥ Acquaintance.
- Lover (proposed): tier ≥ Friend, romance ≥ 75, and the confession event completed. Characters may add requirements (domain, flags, another relationship ended).
- Interest swaps in crush chat pools and topics; Lover unlocks lover pools and events. A crush can be declined through a topic; romance freezes and they return to Neutral with a flag (proposed).

### 7.4 Choices with consequences
Any choice can carry effects: friendship ±, romance ±, tags, flags, quest changes, resources. Insulting a character after they confide in you costs friendship; reassurance gains it, and for some characters romance too. The same choice can affect two characters differently.

### 7.5 Hidden tags
Player tags are never shown. Sources: the creation label; actions (kill or spare, win a drinking contest, refuse a bribe); dialog choices; domain milestones. Each character has a `tag_affinity` table: per tag, a starting bonus applied on introduction and a growth multiplier applied to positive gains. Tags also gate dialog, topics, quests, and recruitment.

### 7.6 Heart events
Scripted scenes with triggers (tier reached, place, time, flags), played once, with choices that matter. Stage directions place and move characters. Some trigger on entering a map, others when you talk to the character.

### 7.7 Where relationship matters
Dialog pools and topics; quests; recruit conditions; party willingness (Disliked or worse refuses to travel with you, proposed); benefit strength (Friend+ residents give 25% stronger benefits, proposed); epilogues.

## 8. Villagers

### 8.1 Professions (11)
Doctor, Warrior, Farmer, Academic, Engineer, Logger, Miner, Chef, Explorer, Craftsman, Socialite. Preassigned per character with a couple of exceptions. Each profession has default benefits; most characters override them with unique ones.

Proposed defaults (Amanda edits freely):

| Profession | In-town benefit | Travel / combat benefit | Typical workplace |
|---|---|---|---|
| Doctor | Faster recovery after incursions; Hospital actions | Party HP restored each node; one revive per expedition | Hospital |
| Warrior | Caravan ambush −10%; incursion defence | Intercepts one hit per battle | Barracks |
| Farmer | Food income | Food reduces energy costs | Farm |
| Academic | Reveals check DCs and quest hints | Reveals node types one column ahead | Library |
| Engineer | Build time −1 day; facility upgrades | Cache nodes yield more | Town Hall or none |
| Logger | Wood income | More wood nodes; wood yield ×1.5 | none |
| Miner | Stone and ore income | More ore nodes; yield ×1.5 | none |
| Chef | Better tavern events; residents' energy max +1 | Rest nodes restore more | Restaurant or Tavern |
| Explorer | Reveals region info | Extra paths; flee always succeeds | Inn or none |
| Craftsman | Crafts weapons and gifts from resources | Bonus damage vs constructs | Bazaar |
| Socialite | Relationship gains +10% town-wide; attracts visitors | +2 Charisma on event checks | Inn, Bazaar, or Tavern |

### 8.2 Profile
Bio, likes and dislikes (which weight social interactions), gift lists, tag affinities, romanceable flag, home town, schedule, energy, benefits, recruit conditions, leave conditions. Format: [villager-format.md](../content/villager-format.md).

### 8.3 Recruitment
Up to 10 residents. Unlock conditions are per character: a facility present, a tier, flags, a leaning, another villager present or absent. When met, a "Come to Withergate" topic appears under Discuss (decided). **How they agree is also per character** (`recruit.method`): they simply say yes; a chance roll (e.g. 50%, at most 3 asks, after which they are closed as a recruit unless content reopens it with a flag; decided F2); a quest that must be done; or an item you must bring. Living Quarters shows the roster, capacity, and each resident's condition status (green / amber / red).

### 8.4 Leaving
Conditions are re-checked at each daily tick. If broken, the villager becomes Unhappy and a 3-day countdown starts (decided). A messenger tells you: "X is unhappy with your decisions. You have 3 days until they leave town forever." Sometimes it can be fixed, sometimes not; characters with this ability have special dialogue for their conditions (`recruit.yaml → unhappy`). If unresolved, they leave permanently and are removed from the game, with a farewell in person or as a notice at Quarters. **Alternatively you can escort them home from your Quarters**, which is treated as if you had never recruited them: it costs the route's days (abstracted, no node map) and they can be recruited again from scratch (decided F3). Other villagers can react through flags and affinities.

### 8.5 Party
Up to 2 companions per expedition, chosen from residents (proposed: residents only). Willingness depends on tier and energy. Companions appear in battle and cannot be targeted by enemies (decided). All provide passives; some also have one active battle ability the player triggers (decided). Energy: a max per character; −1 per node, −2 at night or in corruption; at 0 they withdraw and walk home safely (proposed), and you lose their benefits for the rest of the trip. At home, companion energy recovers over days rather than instantly (proposed +2 per day).

## 9. Withergate

Implemented in Phase 6 (`game/src/core/town.ts`).

### 9.1 Fixed facilities and the shrine
- **Your Quarters:** the desk opens the Quarters menu: **Bed** (save without sleeping, or sleep until morning and save), **Loadout** (one weapon from those you own, up to 4 combat powers held), **Gift satchel** (3 gifts taken from storage, giftable anywhere), **Storage** (resources and items), **Residents** (escort someone home, decided F3), and **Build**.
- **Living Quarters:** roster with profession, tier, energy and condition status; capacity 10; the people you have met who could be recruited and whether they are ready to ask.
- **General Store (decided H2):** a handful of different things on the shelves each week, drawn by weight from the resources and gift items in `economy.yaml`; every resident adds weight to what they make (`profile.yaml → store`). Each offer is priced at the base value times a random weekly markup, so the store is never a good deal, only sometimes a less bad one (Bazaar and Socialite bonuses soften the markup but never take it below value). Selling pays the sell rate of the base value. A morning notice announces the new stock each week.
- **Tavern (decided):** activities from `tavern.yaml`: a drink (temporary `drunk` tag), an evening gathering with every resident (+friendship all round, costs the evening), listening to the room, and whatever else is written. Heart events and group scenes plug into the same list. Scheduling a gathering ahead is still on the list (27).
- **The shrine** (decided): at the west end of town, where you manage your divinity: see faith and skill points, and unlock powers in the five per-axis trees (faith level, prerequisites, points), then choose which combat powers you hold. It never shows your leanings (F5).
- **Morning notices:** anything that happened overnight (income, finished buildings, messenger warnings) is read out when you wake.

### 9.2 Optional facilities (choose 5 of 8)
Barracks, Farm, Library, Town Hall, Bazaar, Hospital, Inn, Restaurant. Each has a cost, build days, workplace professions, and effects (roles in [data-formats.md](../content/data-formats.md)). All five build slots are the same size and sit together east of town (decided). Walk up to a slot to build there, or use Build from Quarters; construction takes `build_days` (Engineers shorten it) and the finished facility appears in the slot with its name. A built facility can be entered for its effects, its workers, crafting (Bazaar), and demolition. Demolishing breaks the conditions of residents who worked there.

### 9.2a Residents' conditions
Every morning each resident's `leaves_if` conditions are checked. When one holds, a messenger says so at first light ("X is unhappy with your decisions. You have 3 days until they leave town forever.") and the character explains it in person before anything else when spoken to (`recruit.yaml → unhappy`). Fix it within 3 days and they settle; otherwise they leave for good. Escorting them home from Quarters costs the route's days and leaves them recruitable again. Residents without a Withergate schedule of their own stand at free places around town during the day: next to their workplace when they have one (the front of the built slot, or the door of the fixed facility), at a random place otherwise; they gather around the well in the evening and are home at night. No two residents share a place and the arrangement shifts daily (decided H3). Places are the map's NPC spots, slot fronts and building doors, so give Withergate plenty of `npc_spot`s in the editor.

### 9.3 Resources (proposed list)
Gold, Wood, Stone, Ore, Food, Herbs, Cloth. Faith is not a resource (§3). Storage is unlimited in v1. Income arrives every morning from facilities (`resource_income` effects) and residents' town benefits; Friends and Best Friends give 25% more (proposed).

### 9.4 Industry focus
Emerges from facility and recruit choices: Farm + Restaurant + Bazaar makes a trade town; Barracks + Hospital a martial town; Library + Town Hall a diplomatic town. Focus changes store stock, visiting NPCs, town events, and renown sources.

## 10. Expeditions

### 10.1 Starting one
Plan from the desk in your Quarters (decided H1) or at a road's end or a town gate (an `expedition` interactable): choose a destination town or a region to explore → choose up to 2 companions → confirm the days. The planner shows why a resident cannot come (recovering, exhausted, unhappy, dislikes you). Routes have a fixed length in days; the Town Hall's established routes are a day shorter (decided). Built in Phase 7.

### 10.2 The node map
Slay-the-Spire style: columns of 2–4 nodes with edges; you pick a path left to right. Each node costs one phase. A **segment** is three nodes and a **checkpoint**, so a segment is a day; town routes have one segment per day and end at the town, explorations 1–3 segments (decided). Only the next column's node types are known; the Library, an Academic and the Wayfinding power each reveal one more. At a checkpoint you take stock: press on, send the haul home by caravan, or head home. The same map holds the way back: a route ending in a town lists the reverse journey from that town's gate.

### 10.3 Node types
Battle · Elite battle (tougher enemy, double reward) · Event (an encounter from `content/encounters`, filtered by biome, hour and corruption) · Gather (wood, ore, herbs, food by the biome's table) · Rest (camp: sleep to morning, full HP, +2 energy for everyone) · Shrine (a shrine encounter, or a plain one with quiet choices that feed the domains) · Cache (resources, one time in four a gift item) · Traveler (a traveler encounter, or a peddler who buys from the haul) · Checkpoint (the region's pool for that segment, or a story checkpoint a quest asks for) · Settlement and Boss are reserved for content.

### 10.4 What shapes the map
Biome weights × region overrides × the phase the column falls in × corruption (more battles and elites on corrupted ground or past corruption 5) × danger (more elites) × the party's `node_weight` travel benefits. `extra_paths` adds edges, `preview_nodes` reveals columns, `gather_yield` scales gathering, `energy_cost` changes the per-node cost, `heal_per_node` heals on the road, `ambush_chance` shifts caravan risk. A quest stage with `checkpoint: X` forces `X` into the segment the region's `story_checkpoints` names.

### 10.5 Ending an expedition
Reach the destination town (the haul is carted home from there), finish the last checkpoint of an exploration, or choose "Head home" from a camp or checkpoint. Running out of energy also turns you home. The way home is abstract and quicker: one day per two segments walked, then you arrive at Withergate's east gate with everything gathered at the end-of-trip caravan risk (decided). HP and energy reset at home; companions who ran out of energy walked home earlier and simply rest. Dying on the road loses the haul (§11).

## 11. Combat

Implemented in Phase 4 (`game/src/core/combat/battle.ts`); numbers are proposals until playtesting (question G1).

- Turn-based, one enemy at a time (chains of two or three enemies come with expeditions). The player is the only controlled actor; companions stand beside you and cannot be targeted (decided).
- **Turn order** by Speed each round, ties to the player. The faster side gets an extra action every even round when its Speed is at least 1.5× the other's. The player's Speed includes the weapon's `speed_mod`.
- **Actions:** Attack (weapon, deals its damage type; bare hands are blunt ×0.7) · Defend (halve incoming damage until your next turn, +2 Grace) · Power (spend Grace) · Companion skill (each companion with an `active` benefit gets one use per battle) · Spare (decided G1: offered when the enemy is under 25% HP and its sheet has a `spare` block; a Charisma check with Divinity/2 added, since a god nobody knows is easy to ignore; success ends the fight with the sheet's `items` and tags and **no XP**; enemies without a `spare` block can never be spared) · Flee (Dexterity check against 10 + enemy Speed; an Explorer in the party always succeeds; impossible while rooted).
- **Damage:** attack `max(1, round(Attack × weapon.power × typeMultiplier × variance(0.9–1.1) × crit) − Defense)`; a power `max(1, round(Divinity × 2 × power × typeMultiplier × variance × crit) − Defense/2)`; a companion skill uses the player's Attack in place of Divinity. Crit chance 5% + 1% per Luck point (×1.5 damage); the player dodges enemy attacks 2% per Dexterity point. Grace regenerates 1 per turn plus the weapon's `grace_regen`.
- **Damage types:** weapons deal blade, blunt, pierce or divine; enemies carry a multiplier per type on their sheet (the matrix is content). Weapon `trait.on_hit` can inflict a status.
- **Statuses** (a fixed set): bleed (2 damage per turn) and burning (3) tick at the start of the victim's action; stagger costs the next action; rooted stops the player fleeing and stops an enemy acting; attack up / defense up are +25%; inspired is +2 Attack and +1 Speed. Durations count down per action.
- **Enemy AI:** a weighted move list; a move's `when` may use `hp_below` (the enemy's own HP fraction) and any other condition. Buff statuses go on the enemy, the rest on the player.
- **Companions:** passives from `benefits.combat` (`intercept_hit` blocks N hits, `player_attack_up`, `player_defense_up`, `enemy_defense_down`, `grace_regen`, `crit_chance`, `status_resist`); one `active` skill per battle; barks on battle start, low HP, victory and defeat appear in the log.
- **Rewards:** XP, the enemy's loot (into Withergate's stores until the haul exists, question G2), a gift item drop chance, `tags_on_kill`, and one hidden combat point per victory.
- **HP recovery without items:** full at home; Rest nodes restore 50% (proposed); a Doctor companion restores some per node; heal powers restore `heal` + Divinity/2.
- **Defeat (decided):** you die. Everything gathered on that expedition is lost. Every companion on it has their energy drained to 0 and cannot travel again until they recover (`recovery_days`, default 5). You wake in your bed at Withergate the next morning at half HP and half energy. A scripted fight with an `on_lose` branch handles its own consequences instead (the tutorial wolf leaves you at 5 HP for the messenger to find).

## 12. Caravan and resources

You choose when the haul goes home (decided): send it back from a checkpoint (50% chance of losing some) or carry it with you to the end (30%, since you are travelling with it). A loss takes 25–50% of each resource. Modifiers (built): `caravan_safety` from the Barracks and residents, the party's `ambush_chance`, Luck (−1% per point), corruption (+5% per level for regions that touch corrupted ground); the risk is clamped to 5–90%. A caravan sent from a checkpoint arrives after as many days as segments walked; one hired at a destination town takes the route's days. The morning notices report what arrived and what the bandits took. Loot from battles on the road joins the haul too (decided G2).

## 13. Quests and story

- **Types:** Main, Personal (villager), Town (a town's needs), Bounty (repeatable).
- **Structure:** stages with objectives, completion conditions, and rewards; discovered through `!` topics, notice boards, and events.
- **Journal UI** lists active and completed quests with the current objective.
- **Main story skeleton (placeholder, Amanda owns it):** Act 0 the fall and the messenger → Act 1 founding Withergate, meeting the five towns, domain lock-in → Act 2 the discord between the cities while incursions escalate → Act 3 the source of the corruption → Ascension as the Deity of ___, with an epilogue shaped by choices.
- **Ascension conditions (proposed):** main chain complete, maximum faith level, Withergate at a minimum number of residents. The ending names you from your domain points (§3).

## 14. Saving

Saving happens at your bed (decided): choose **Save** (no time passes) or **Sleep & Save** (fast-forward to a chosen phase, then save). Three slots (proposed). No autosave, so consequences stick. A suspend save when quitting mid-expedition, deleted on load, is still proposed (question E8). Saves are versioned JSON with migrations.

## 15. Initial tunables

| Tunable | Starting value |
|---|---|
| Friendship thresholds | Enemy ≤ −40 · Disliked −39 to −1 · Stranger 0–9 · Acquaintance 10–39 · Friend 40–99 · Best Friend 100+ |
| Chat | +1 friendship, first chat per day |
| Discuss topic | +3 to +15 by topic, one-time |
| Gift categories | loved +12 · liked +6 · neutral +1 · disliked −6 · hated −12; loved also +3 romance if romanceable; one gift per character per 5-day week |
| Drunk | −2 Dexterity and Perception checks · +2 Charisma · no expeditions |
| Flirt | neutral +3 · interest +4 · lover +1 friendship; first per day |
| Romance thresholds | Interest 25 · Lover 75 |
| Tag affinity | start bonus −15 to +15 · growth multiplier 0.5–1.5 on positive gains |
| Stats | start 2 each, 15 points, max 8, range 1–10 |
| Check | d20 + stat + floor(luck/3) vs DC 6/9/12/15/18/21 |
| Combat base at level 1 | HP 30 · ATK 6 · DEF 3 · SPD 5 · DIV 4 · Grace 18 |
| Energy | player 8, refills daily · companions 4–10 by character, +2 per day at home · −1 per node, −2 night/corrupted · Rest +2 |
| Death | haul lost · companions to 0 energy + recovery (default 5 days) · wake next day at half HP and half energy |
| Faith | levels 0–5; points per level in `progression.yaml` |
| Expedition | 4 nodes per day · 2–4 nodes per column · town routes 1–3 days |
| Caravan | 30% loss chance carried to the end · 50% sent from a checkpoint · lose 25–50% |
| Skill points | 1 per faith level |
| Unhappiness | 3-day countdown |
| Facilities | 2–5 build days · Engineer −1 |
| Residents | max 10 · companions max 2 |
| Saves | 3 slots at the bed (+1 suspend, proposed) |
