# Open Questions

Answer inline under each question (replace the `Answer:` line). Each question states the default that applies if you say nothing. I check this file at the start of every session and fold answers into the design docs.

Groups A–F were answered on 2026-09-06 and 2026-09-07 and are kept below as the decision log. Group G holds the current follow-ups.

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

## G. Follow-ups

**G1. Combat numbers.** Phase 4 ships with these proposals: crit chance 5% + 1% per Luck; dodge 2% per Dexterity (player only); Defend halves damage and restores 2 Grace; a power's damage scales from Divinity (`Divinity × 2 × power`) instead of Attack; Spare appears when an enemy is under 25% HP. Change any of them?
Default: as stated.
Answer:

**G2. Loot outside expeditions.** Until expeditions exist, battle loot goes straight into Withergate's stores. Once the haul and caravan arrive (Phase 7), loot on the road goes into the haul instead. OK?
Default: yes.
Answer:

**G3. Corruption timing.** How often does the corruption claim someone once the week-long warning has passed and nothing was done: one character per week, or escalating?
Default: one per week, escalating to two after the second warning.
Answer:
