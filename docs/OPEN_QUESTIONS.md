# Open Questions

Answer inline under each question (replace the `Answer:` line). Each question states the default that applies if you say nothing. I check this file at the start of every session and fold answers into the design docs.

Groups A–G were answered on 2026-09-06 and 2026-09-07 and are kept below as the decision log. Group H holds the current follow-ups.

---

## Decision log (A–E, 2026-09-06)

| # | Decision |
|---|---|
| 1 | Stack: TypeScript + Phaser 3 + Vite, React overlay, browser-first with a desktop wrapper later. |
| 2 | No mobile or touch. |
| 3 | Art is smooth hi-res (400×400 character frames, 500×500 busts), not pixel art. Curated frames are named `idle1…`, `leftwalk1…`, `rightwalk1…`; busts are `<id>_<mood>.png`. Dialog shows the bust matching the NPC's reaction, defaulting to neutral. |
| 4 | Custom YAML dialog format. |
| 5 | No jumping. |
| 6 | Fifth stat is **Perception**. Point budget and check formula as proposed. |
| 7 | Four phases. Sleeping fast-forwards to the next morning only (E3). |
| 8 | Gift satchel of 3, one equipped weapon, up to 4 equipped powers. |
| 9 | The deity title is generated at the end from gameplay stats. Nothing is chosen or locked in. The town location is fixed. |
| 10 | Death: you die, the haul is lost, every companion on the trip drops to 0 energy with a recovery time (default 5 days, per character), and you wake in bed a day later at half HP and half energy. |
| 11 | The player has energy; it refills fully each day. |
| 12 | Enemies cannot target companions. Some companions have battle abilities; the rest are passive. |
| 13 | Damage types blade / blunt / pierce / divine vs enemy families; matrix filled in later. |
| 14 | **Faith is the progression**, earned by deeds and story/character quests. It unlocks deity abilities. There is no separate renown meter (23). |
| 15 | Manual save at the bed: save as-is, or sleep and save. A suspend save when quitting mid-expedition is fine (E8). |
| 16 | Roster starts at 24 recruitables and will grow. Non-recruitables are specific characters (the king) plus unnamed NPCs. |
| 17 | Recruiting is a Discuss topic once unlocked. How they agree is per character: just say yes, a chance (e.g. 50%, at most 3 asks), a quest, or a required item. It lives on the character sheet (`recruit.method`). |
| 18 | 3-day warning. A messenger says "X is unhappy with your decisions. You have 3 days until they leave town forever." Sometimes fixable, sometimes not; characters have special dialogue for their conditions. Alternative: escort them home from your Quarters, which is treated as if you had never recruited them. |
| 19 | Tavern: heart events, group dialog with specific characters, relationship opportunities. The player can get drunk and carry a temporary `drunk` tag (e.g. evening → night). |
| 20 | Corruption: special maps you must clear; otherwise it starts killing non-recruited NPCs at random. |
| 21 | Each town has its own conflict: a class war in the king's town (Aboridge), two towns at war with each other, one at peace, one dealing with corruption. |
| 22 | Town Hall establishes routes to towns and cuts travel time. Otherwise travel is a random assortment of days and encounters. |
| 23 | "Making yourself known" is faith, which grows as story plot items and specific quests complete. |
| 24 | Facility and profession defaults are fine. Socialite is the flex class. |
| 25 | Caravan: send the haul home at a checkpoint (50% loss chance) or carry it to the end (30%, you are travelling with it). |
| 26 | Romanceable characters are all into the player regardless of form. Some react to traits; one or two may like or dislike a form, but nothing is gated. |
| 27 | No seasons, weather or festivals for now. Maybe schedule a tavern gathering a couple of days ahead and invite NPCs for relationship points. |
| 28 | Music later; silence for now. |
| 29 | Domain axes: **friendship, pleasure, prosperity, combat, discovery**, based on what you do best. |
| 30 | Game title as the repo; region name is a placeholder for now. |
| E1 | Powers form a skill tree (prerequisites + skill points from faith levels). |
| E2 | Companion recovery after a death varies per companion; default 5 days (an in-game week). |
| E3 | Sleep wakes you next morning only. |
| E4 | Numbered frame exports are gitignored; nothing deleted. |
| E5 | First walk frame stands in for the player's idle; the masculine form will arrive as `player_m_sprites` with the same names. |
| E6 | Start with the four named moods (neutral, happy, angry, sad). Every line has a reaction or defaults to neutral. |
| E7 | No player bust; the player only picks options. |
| E8 | Suspend save: yes. |
| F1 | Skill tree: five small trees (one per axis), 1 skill point per faith level, no respec. Works for now. |
| F2 | Recruit chance: after the last failed ask the character is closed as a recruit unless content reopens it with a flag. |
| F3 | Escort home: costs the route's days (abstracted, no node map); the character can be recruited again from scratch. |
| F4 | Corruption kills non-recruited characters that are not specially protected (`protected: true` on the character sheet). About a week before: "You can feel the corruption leaking into the mortal plane. Better do something about it before something terrible happens." When it happens, the messenger reports: "It appears we lost xyz in H town to the corruption last night…" |
| F5 | The deity title is a **secret**. The player gets no hint of their leanings until the ending. |
| F6 | `drunk`: −2 on Dexterity and Perception checks, +2 Charisma, cannot start an expedition. |
| F7 | Gifts: **one per character per week** (5 days). Loved gifts +3 romance for romanceables, chat +1 friendship on the first chat of the day, first flirt per day counts. |

---

| G1 | Combat numbers as proposed, except **Spare**: a Charisma check helped by Divinity (a god nobody knows is easy to ignore), it pays in items instead of XP, and some enemies can never be spared. |
| G2 | Battle loot goes to Withergate's stores until the haul exists. |
| G3 | Corruption cadence: a full week (5 days) without clearing corruption brings the warning; if a dungeon has not been started within the next 3 days, someone is taken. |
| — | All five build slots are the same (large) size and sit together east of town; the old fifth spot at the west end is now the **shrine**, where you manage your divinity (unlock and hold powers). |
| H1 | Starting a corruption dungeon pauses the countdown (that day no longer counts as a day without fighting the corruption), but the clock only resets when the dungeon is finished. Dungeon expeditions are planned from the desk in your quarters. |
| H2 | Store stock is limited and weighted by who lives in Withergate: each villager profile adds weight to particular items showing up. Prices are always above the base value and change weekly, so the store is never a good deal, only sometimes a less bad one. |
| H3 | Residents whose workplace is a fixed facility, or who have none, stand at free spots around town, nearer their work when possible; two residents never share a spot. Interiors for the fixed buildings can come later. |
| I1 | The top-down packs keep their interior floors and furniture; their outdoor tiles are dropped. |
| J | The way home is abstract. Companions travelling with you stand nowhere else. Checkpoints are unknown on the map though every node's type is fixed at generation (for a future explorer skill); a checkpoint may be a mini town, a caravan of explorers, a boss, or a rest. Clearing a den only resets the clock. |
| K | The world is **Duluma**. Anyone unprotected can be taken; a resurrection is planned, so a taken giver's quest greys out instead of failing. Incursions and takings are morning notices, with a purple flash "The corruption has reached Duluma…". The ending is the *return to the heavens*; its conditions are open (K1). |
| — | The opening (Amanda's script, 2026-09-07): the Duluma prologue before character creation; the fall into the glade; forage; a thief; Aldric and two knights bring the king's proposal (Withergate, the queen taken by the corruption) and lead you there; the tour; the talk at your desk (farmer / doctor / "join me", the last being the only way to make Aldric recruitable); Aldric travels with you as a guest to Aboridge to meet the king. |
| L1 | Resurrection is a late-game mechanic driven by a character who does not exist yet. Until then, taken characters stay gone and their quests wait greyed in the journal. |

---

## H. Follow-ups

**H1. Corruption dungeons.** "Clearing corruption" means finishing a corruption map (a dungeon that takes days). Is starting one enough to reset the warning clock, or only finishing it? Do dungeons appear as expedition checkpoints, or as their own destinations?
Default: starting one pauses the clock, finishing resets it; they are their own destinations on the expedition map.
Answer: You have to finish it, but starting one is enough to pause the countdown (the day does not count as a day of corruption, because you have technically fought it). Dungeon expeditions can be planned from your desk. *(Folded into the decision log; built with Phase 7/8.)*

**H2. Store stock.** The general store currently sells every resource plus a few gifts from `economy.yaml`. Should stock be limited per day, or change with the town's industry, from the start?
Default: unlimited until Phase 8 adds industry.
Answer: Stock is limited and based on the characters in town, who each add weight to specific items showing up. Things are always more expensive in the store, but the price varies weekly: you never get a good deal, but you can get a slightly less worse one. *(Folded into the decision log and the store; see `docs/content/villager-format.md` → `store` and `docs/content/data-formats.md` → `economy.yaml`.)*

**H3. Fixed-facility workplaces.** Residents whose workplace is a fixed facility (tavern, store) stand outside its door during the day. Good enough, or should the fixed buildings get interiors and spots?
Default: outside the door for now.
Answer: Thinking about interiors, not sure yet. For now they stand as near as they can, as assumed. *(Built.)*

## I. Asset packs (2026-09-07)

The first set (seven 768px pixel-art packs: town, gothic, farm, dreamland, rome, steampunk, forest; 5,424 cut pieces) was **removed** the same day on Amanda's decision, together with the twelve placements that used it. The library now holds seven craftpix packs (`assets/README.md`): five cartoon platformer tilesets (`workshop`, `tailor`, `market`, `village`, `farm`; 120 ready-made pieces each: two parallax background layers, modular building parts, props, thirteen 128px ground tiles) and two 16px top-down pixel-art packs (`farm_topdown`, `home_topdown`; objects and tilesets cut with the sheet cutter's `objects` and `grid` modes; animation strips and the water-detail tileset left out). 1,881 pieces in all. The repository stays private because the craftpix licence forbids redistributing the files.

**I1. Top-down art in a side-scroller.** The two top-down packs are drawn from above at 16px, next to 128px cartoon platformer art. Their props (plants, furniture, animals' houses) can pass as decoration at 2x–4x scale; their ground and water tiles will look odd on a side view. Keep them as an option, or drop them to keep the tile tab short?
Default: keep.
Answer: Keep the interior floors and furniture as options, drop the outdoor tiles. *(Done: the outdoor tilesets of `farm_topdown` were removed; 300 interior tiles remain.)*

## J. Expeditions (2026-09-07, Phase 7 built with these defaults)

**J1. The way home.** "Head home" is abstract: one day per two segments walked, no nodes, and the carried haul faces the end-of-trip risk once. Keep it abstract, or should the return be its own shorter node map (more risk, more gathering)?
Default: abstract.
Answer: Keep it abstract.

**J2. Companions in other towns.** Companions who reach Aboridge with you still show up at their usual Withergate spots while you are away (schedules do not know about the road yet). Fine for now, or should they follow you onto town maps?
Default: fine for now.
Answer: Once recruited (or travelling with you) they no longer show up at their spot. *(Built: anyone in your party stands nowhere while on the road or in another town; residents already use Withergate's placement.)*

**J3. Settlements and bosses.** `settlement` nodes (a small side-scroller map mid-road) and `boss` nodes are reserved: today a boss is just a checkpoint encounter that starts a battle (see `hollow_den`). Do you want settlements as map-loading nodes, and bosses with their own node type and reward rules?
Default: content-driven checkpoints only.
Answer: The checkpoint node is unknown on the map, but every node has its type assigned when the map is generated, to support a future explorer skill that reveals them. A checkpoint could be a mini town, a caravan of explorers, a boss, or just a place to rest. *(Built: checkpoints show as `?` until reached; types are still generated up front; what waits there is the region's checkpoint pool, so those four kinds are encounters to write.)*

**J4. Corruption clearing.** The frontier's `hollow_den` lowers corruption by one and sets `hollow_den_cleared`; the countdown and messenger from G3/H1 arrive with Phase 8. Should clearing a den also protect a named villager (a "who was saved" line), or only reset the clock?
Default: only the clock.
Answer: Only reset the clock. The corruption creeps toward town, and someone runs into it and dies. *(Built as is.)*

## K. Story systems (2026-09-07, Phase 8 built with these defaults)

**K1. Ascension conditions.** `content/ascension.yaml` requires act 3 done, faith level 5 and five residents. Keep, loosen, or add (a romance, a specific facility, corruption below a level)?
Default: as written.
Answer: Unclear what ascension is. *(Explained in the summary: it is the ending, the return to the heavens with your title. Renamed in the game to "Return to the heavens"; conditions unchanged until you say otherwise.)*

**K2. Who the corruption takes.** Anyone not living in Withergate and not `protected: true`, met or not, chosen at random. Should unmet characters be safe until you have met them, and should a taken villager's personal quest fail with a line?
Default: anyone; quests need their own `fail_when`.
Answer: Anyone can be taken. There will be a way to resurrect characters, so their quests just grey out in the journal. *(Built: quests whose giver was taken are greyed and wait; nothing fails. Resurrection itself is not built yet, see L1.)*

**K3. Spread and incursions.** Corruption rises by one every ten idle days and, from level 6, corrupted things may hit the stores at night unless the Barracks and Warriors hold. Numbers in `progression.yaml → corruption`. Do you want incursions to be scenes (a fight at the gate) rather than a morning notice?
Default: notices.
Answer: Just the notice, with a purple flash reading "The corruption has reached Duluma…". The region is named **Duluma**. *(Built: the flash plays the morning someone is taken; text in `progression.yaml → corruption.flash`.)*

**K4. Town relations and the war.** Relations are a matrix set by `relations` effects and read by `relations` conditions; nothing moves them yet. Do you want a `towns.yaml` (name, conflict, starting relations, notice-board lines) so the war can be data, or will it live in quests?
Default: quests.
Answer:

## L. After the opening (2026-09-07)

**L1. Resurrection.** You said there will be a way to bring back characters the corruption took. Where and at what cost: the shrine (faith), a Hospital action, a quest per character, or a story beat?
Default: not built yet; taken characters stay `gone` and their quests wait greyed.
Answer: It's a late-game mechanic driven by a character that doesn't exist yet. *(So nothing to build now: taken characters stay gone and their quests wait greyed until that character and their mechanic are written.)*

**L2. Aboridge and the king.** The opening ends with Aldric taking you to Aboridge to meet the king and choose from "a couple of candidates" ready to move to Withergate. Aboridge has a placeholder map; the king, the candidates and that conversation need writing. Shall I scaffold the king as a protected character and the candidate choice as a cutscene with placeholder lines, or wait for your script?
Default: wait.
Answer:

**L3. Knights in the glade.** The proposal mentions two knights hanging back; they are narration until there is art and a reason to give them names.
Default: narration.
Answer:
