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

**The title is earned, not chosen (decided).** Choices, quests, and deeds award domain points on the five axes throughout the game, based on what you actually do. Nothing is locked in. At the end, the game generates what you are the Deity *of* from your accumulated stats: the leading axis, with the secondary axis and notable tags available for flavour (question F5). Content reads your current leaning through `domain_lean` and thresholds through `domain_points_min`.

**Faith (decided)** is the progression, not a spendable resource and not a separate renown meter. You earn it by doing things and completing story and character quests as humans come to believe in you. Faith levels grant skill points.

**Powers form a skill tree (decided E1).** Each power belongs to an axis, needs a faith level (`tier`), may require other powers (`requires`), and costs skill points (`points`). Unlocking a power adds a point to its axis, so your powers and your eventual title reinforce each other. A power is either a combat action (costs Grace, scales with Divinity) or an out-of-combat ability (a discovery power that previews nodes, a pleasure power that improves tavern events, a combat power that reduces caravan ambushes). Format in [data-formats.md](../content/data-formats.md); tree shape is question F1.

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
A world value 0–10 (proposed) that rises on a schedule slowed or reversed by story progress. Effects: node weights near the frontier (more monsters, corrupted variants, corrupted gather nodes), incursion events at Withergate (defend it; Barracks and Warriors help), corrupted checkpoints. **Special corruption maps must be cleared; otherwise it starts killing non-recruited NPCs at random (decided).** Recruiting someone protects them. Which characters are at risk and how much warning you get is question F4.

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
- **Give Gift:** choose from your satchel, or from town storage when in Withergate. One gift per character per day (proposed). The reaction category comes from the character's lists; special gifts have item-specific overrides.

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
Up to 10 residents. Unlock conditions are per character: a facility present, a tier, flags, a leaning, another villager present or absent. When met, a "Come to Withergate" topic appears under Discuss (decided). **How they agree is also per character** (`recruit.method`): they simply say yes; a chance roll (e.g. 50%, at most 3 asks; question F2 covers what happens after the last failure); a quest that must be done; or an item you must bring. Living Quarters shows the roster, capacity, and each resident's condition status (green / amber / red).

### 8.4 Leaving
Conditions are re-checked at each daily tick. If broken, the villager becomes Unhappy and a 3-day countdown starts (decided). A messenger tells you: "X is unhappy with your decisions. You have 3 days until they leave town forever." Sometimes it can be fixed, sometimes not; characters with this ability have special dialogue for their conditions (`recruit.yaml → unhappy`). If unresolved, they leave permanently and are removed from the game, with a farewell in person or as a notice at Quarters. **Alternatively you can escort them home from your Quarters**, which is treated as if you had never recruited them (question F3 covers cost and re-recruiting). Other villagers can react through flags and affinities.

### 8.5 Party
Up to 2 companions per expedition, chosen from residents (proposed: residents only). Willingness depends on tier and energy. Companions appear in battle and cannot be targeted by enemies (decided). All provide passives; some also have one active battle ability the player triggers (decided). Energy: a max per character; −1 per node, −2 at night or in corruption; at 0 they withdraw and walk home safely (proposed), and you lose their benefits for the rest of the trip. At home, companion energy recovers over days rather than instantly (proposed +2 per day).

## 9. Withergate

### 9.1 Fixed facilities
- **Your Quarters:** the bed (save without sleeping, or sleep to a chosen phase and save; decided); loadout (weapon, powers, gift satchel); storage view; the build menu (proposed here so building works without a Town Hall).
- **Living Quarters:** roster, capacity 10, condition status, dismiss (with consequences).
- **General Store:** buy resources with gold; trade resource for resource at posted rates; stock and rates shift with your industry and town relations.
- **Tavern (decided):** heart events, group dialog with specific characters, and other chances to build relationships. Drinking can leave you with a temporary `drunk` tag for a phase or two (`temp_tags` effect; mechanics in question F6). Scheduling a gathering a couple of days ahead and inviting NPCs for relationship points is on the list (27).

### 9.2 Optional facilities (choose 5 of 8)
Barracks, Farm, Library, Town Hall, Bazaar, Hospital, Inn, Restaurant. Each has a cost, build days, workplace professions, and effects (proposed roles in [data-formats.md](../content/data-formats.md)). They are built into `facility_slot` entities on the Withergate map; the placeholder swaps to the building sprite when complete. Demolishing is possible but can break residents' conditions.

### 9.3 Resources (proposed list)
Gold, Wood, Stone, Ore, Food, Herbs, Cloth. Faith is not a resource (§3). Storage is unlimited in v1.

### 9.4 Industry focus
Emerges from facility and recruit choices: Farm + Restaurant + Bazaar makes a trade town; Barracks + Hospital a martial town; Library + Town Hall a diplomatic town. Focus changes store stock, visiting NPCs, town events, and renown sources.

## 10. Expeditions

### 10.1 Starting one
Leave Withergate by a road exit → choose a destination town or a region to explore → choose up to 2 companions → confirm the expected days. Travel is a random assortment of days and encounters until the Town Hall establishes a route to a town, which cuts the time (decided).

### 10.2 The node map
Slay-the-Spire style: columns of 2–4 nodes with edges; you pick a path left to right. Each node costs one phase. Each segment ends in a **checkpoint**: a significant event such as a settlement, a boss, a story beat, or a discovery. Town routes have a fixed length and end at the town; region explorations have 1–3 segments (proposed).

### 10.3 Node types
Battle · Elite battle · Event (text, checks, choices) · Gather (wood, ore, herbs, food, flavoured by biome) · Rest (camp; restore HP and energy; advances to morning) · Shrine (domain choices, minor blessings) · Cache (resources, sometimes a gift item) · Traveler (merchant or NPC) · Settlement (small side-scroller map) · Checkpoint / Boss.

### 10.4 What shapes the map
Biome; time phase (night favours monsters); corruption level (corrupted variants); party (Explorer adds paths, Logger adds wood nodes, Academic previews nodes); Withergate facilities (Library previews, Barracks fewer ambushes); day count; and quest requirements (a story checkpoint can be forced into a segment).

### 10.5 Ending an expedition
Reach the destination, finish the last checkpoint, or choose "Head home" from a rest or checkpoint (costs return days at a reduced node count, proposed). Gathered resources travel home by caravan (§12). HP and energy reset at home.

## 11. Combat

- Turn-based, one enemy at a time; some encounters chain two or three enemies in sequence. The player is the only controlled actor; companions stand beside you.
- Turn order by Speed each round. Speed ≥ 1.5× the enemy grants an extra action every other round (proposed).
- **Actions:** Attack (weapon, deals its damage type) · Defend (halve incoming damage, +2 Grace) · Power (spend Grace) · Companion skill (one per companion per battle, if adopted) · Flee (Dexterity check; Explorer guarantees it).
- **Damage (proposed):** `max(1, round(Attack × weapon.power × typeMultiplier × variance(0.9–1.1)) − Defense)`; critical hits ×1.5.
- **Damage types and weaknesses:** weapons deal a type (proposed: blade, blunt, pierce, divine); enemies carry multipliers per type. Amanda defines the matrix and the weapon list.
- **Powers:** cost Grace, scale with Divinity, may apply statuses from a small fixed set (bleed, stagger, inspired, rooted, burning).
- **Enemy AI:** a weighted move list with simple conditions (low HP → desperate move).
- **Rewards:** XP, resources into the haul, occasional gift items, tags for notable kills or spares.
- **HP recovery without items:** full at home; Rest nodes restore 50% (proposed); a Doctor companion restores some per node; certain powers heal.
- **Defeat (decided):** you die. Everything gathered on that expedition is lost. Every companion on it has their energy drained to 0 and cannot travel again until they recover (recovery time per character, proposed 3 days). You wake in your bed at Withergate a day later at half HP and half energy. Story bosses may have bespoke failure branches.

## 12. Caravan and resources

You choose when the haul goes home (decided): send it back from a checkpoint (50% chance of losing some) or carry it with you to the end (30%, since you are travelling with it). A loss takes 25–50% of each resource (proposed). Modifiers (proposed): Warrior resident or Barracks (−10 to −15%), Explorer (−5%), Luck (−1% per point), corruption (+5% per level near the frontier), combat powers. The result is reported when the caravan arrives.

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
| Gift categories | loved +12 · liked +6 · neutral +1 · disliked −6 · hated −12; loved also +3 romance if romanceable |
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
