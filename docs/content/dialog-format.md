# Dialog Authoring Format

One small scripting format, written in YAML, used for everything a character says: chat, discuss topics, flirting, gift reactions, heart events, recruitment, cutscenes, and expedition events. If you can write a list in YAML, you can write dialog.

Conditions and effects use the shared vocabulary in [conditions-and-effects.md](conditions-and-effects.md).

---

## 1. Scripts and steps

A **script** is a list of **steps** played in order. The simplest script is a few lines:

```yaml
- mara: "My father ran the mill before the river went sour."
- mara(sad): "Some nights I still hear the wheel."
- you: "I'm sorry."
- narrate: "She does not answer for a while."
```

Speaker keys: a villager `id`, `you` (the player), or `narrate`. Add a **mood** in parentheses to change the portrait; moods must exist in that character's portrait set (`neutral` always exists). Player lines have no portrait unless the design adds one.

Text can use `{name}` (player name), `{town}` (Withergate), `{domain}` (the chosen domain's display name), and `\n` for a manual break. Use `...` for beats. Keep one thought per line; the box wraps long lines.

### All step types

| Step | Form | Notes |
|---|---|---|
| Line | `- mara: "text"` · `- mara(sad): "text"` | shorthand |
| Line (long form) | `- say: mara` + `mood: sad` + `text: "…"` + optional `portrait: false`, `sfx: id`, `speed: slow` | when you need extras |
| Choice | `- choice:` then a list of options (see §2) | pauses for the player |
| Branch | `- if: <condition>` + `then: [steps]` + `else: [steps]` | |
| Multi-branch | `- select:` list of `{ when: <condition>, then: [steps] }`, optional final `{ else: [steps] }` | first match wins |
| Check | `- check: { stat: charisma, dc: 12 }` + `success: [steps]` + `fail: [steps]` (+ optional `crit_success`, `crit_fail`) | a stat roll |
| Effects | `- effects: { friendship: +5, flags: { mara_told_me: true } }` | applied immediately |
| Jump | `- goto: node_name` | see §3 |
| Include | `- run: shared/awkward_silence` | reuse a snippet from `content/dialog/shared/` |
| Random | `- random:` list of step lists, or `{ weight: 2, then: [steps] }` entries | picks one |
| End | `- end` (back to the talk menu) · `- end: close` (leave the conversation) · `- end: scene` (end a cutscene) | optional; scripts end naturally |
| Battle | `- battle: { enemy: hollow_wolf, on_win: [steps], on_lose: [steps] }` | scripted fight |
| Stage | `- move`, `- face`, `- emote`, `- wait`, `- fade`, `- camera`, `- place`, `- anim`, `- sfx`, `- music` | cutscenes and heart events, §5 |

### Example with choices, a check and a branch

```yaml
- mara: "My father ran the mill before the river went sour."
- mara(sad): "Some nights I still hear the wheel."
- choice:
    - text: "That must have been hard to lose."
      effects: { friendship: +5, romance: +2 }
      then:
        - mara(soft): "...Thank you. Most people only ask about lumber prices."
    - text: "Mills fail. Move on."
      effects: { friendship: -8, tags: [callous] }
      then:
        - mara(angry): "Right. Forget I said anything."
        - end
    - text: "Maybe I could restore the river someday."
      requires: { domain: nature }
      effects: { friendship: +3, flags: { mara_river_promise: true } }
      then:
        - mara: "Big words for someone who arrived last week. ...But I'll hold you to it."
    - text: "[Lie] I grew up by a mill too."
      check: { stat: charisma, dc: 12 }
      success:
        - mara: "Then you know."
        - effects: { friendship: +4, tags: [liar] }
      fail:
        - mara(wary): "No, you didn't. Your hands have never held a saw."
        - effects: { friendship: -4, tags: [liar] }
- if: { flags: [mara_river_promise] }
  then:
    - mara: "Come find me when you mean it."
  else:
    - mara: "Anyway. Did you need something?"
```

---

## 2. Choices

Each option:

| Key | Meaning |
|---|---|
| `text` | what the player says or does. Prefix with `[Lie]`, `[Flirt]`, `[Intimidate]` if you want the player to know the flavour |
| `requires` | condition; if false the option is hidden |
| `show_locked: true` | show it greyed out instead of hiding it (with `locked_text: "…"` optional) |
| `check` | `{ stat, dc }`; uses `success:` / `fail:` instead of `then:` |
| `effects` | applied when chosen, before `then` |
| `then` | steps to play after choosing |
| `once: true` | option disappears after being chosen once (remembered per villager) |

Choices with no `then` simply continue with the steps after the choice.

---

## 3. Nodes and jumps

For longer conversations that loop ("Ask about something else"), give the file `nodes:` and jump with `goto:`. `start` is the entry point.

```yaml
nodes:
  start:
    - tobin: "Ask away."
    - goto: hub
  hub:
    - choice:
        - text: "About the war..."
          once: true
          then: [ { tobin: "Which one?" }, { goto: hub } ]
        - text: "About the king..."
          then: [ { run: tobin/the_king }, { goto: hub } ]
        - text: "That's all."
          then: [ end ]
```

Inline steps inside `then:` can be written as `{ tobin: "…" }` on one line, as above, or as normal indented lists.

---

## 4. The per-villager files

### chat.yaml — banter pools

```yaml
pools:
  - when: { tier: stranger }
    lines:
      - "Hm? Oh. You're the one from Withergate."
      - mara(wary): "Something you need?"
  - when: { tier: acquaintance+, time: [evening, night] }
    weight: 2
    lines:
      - "Long day. The saw jammed twice."
      - - mara: "You ever just sit and listen to a forest?"
        - you: "Sometimes."
        - mara(soft): "Good."
  - when: { romance: interest }
    lines:
      - mara(blush): "Oh. I didn't see you there. Hi."
  - when: { tier: disliked- }
    lines:
      - mara(cold): "Make it quick."
```

A line is a plain string (spoken by the villager, neutral mood), a `speaker(mood): text` entry, or a nested list for a short exchange (which may include choices). All pools whose `when` holds are merged; `weight` multiplies that pool's lines. Recently used lines are avoided. The first chat each day gives +1 friendship automatically.

### discuss.yaml — topics

```yaml
topics:
  - id: the_mill
    label: "Ask about the mill"
    marker: heart                 # heart (♥ getting to know) | quest (!) | none
    requires: { tier: acquaintance+ }
    once: true                    # default true; repeatable: true to allow repeats
    cost: none                    # none | phase  (a long talk that uses part of the day)
    script:
      - mara: "..."
  - id: sour_river
    label: "The river"
    marker: quest
    requires: { flags: [mara_river_promise], quest: { id: sour_river, status: not_started } }
    script:
      - mara: "..."
      - effects: { quest_start: sour_river }
```

Topics appear in file order, filtered by `requires`; completed one-time topics disappear. The recruit topic is added automatically (see recruit.yaml).

### flirt.yaml — responses by state

```yaml
pools:
  - when: { tier: stranger }
    effects: {}                              # rebuffed, no gain
    lines:
      - mara(flat): "We've spoken twice."
  - when: { romance: neutral, tier: acquaintance+ }
    effects: { romance: +3 }
    lines:
      - mara(wary): "...Is that what that was?"
      - mara: "Flattery's cheap. Try again with a whetstone."
  - when: { romance: interest }
    effects: { romance: +4 }
    lines:
      - mara(blush): "Stop. ...No, don't."
  - when: { romance: lover }
    effects: { friendship: +1 }
    lines:
      - mara(soft): "Come here."
```

Effects apply on the first flirt of the day only. If `romanceable: false` in the profile, this file is ignored and the standard rejection plays.

### gifts.yaml — reactions

```yaml
reactions:
  loved:    [ mara(surprised): "You... how did you know?", mara(soft): "I'll keep it by the bed." ]
  liked:    [ "Useful. Thank you.", mara: "Huh. Good pick." ]
  neutral:  [ "...Thanks." ]
  disliked: [ mara(flat): "What am I supposed to do with this?" ]
  hated:    [ mara(angry): "Silk. From you. Of course." ]
overrides:
  ironwood_carving:
    lines: [ mara(surprised): "This is Holt work. Where did you find this?" ]
    effects: { friendship: +15, romance: +5, flags: { mara_gave_carving: true } }
  aged_whiskey:
    - when: { flags: [mara_sober] }
      lines: [ mara(hurt): "...You know I stopped." ]
      effects: { friendship: -10 }
    - lines: [ mara: "Now we're talking." ]
      effects: { friendship: +12 }
```

Category values (loved +12, liked +6, neutral +1, disliked −6, hated −12) are global tunables; overrides replace them. One gift per villager per day.

### recruit.yaml — asking, unhappiness, farewell

```yaml
topic_label: "Come to Withergate"     # conditions live in profile.yaml → recruit.requires
script:
  - mara: "You want me to leave the mill."
  - choice:
      - text: "There's nothing left of it. Come build something new."
        then:
          - mara: "...Alright. But I bring my own saw."
          - effects: { recruit: mara }
      - text: "Never mind."
        then: [ end ]
unhappy:                                # plays when spoken to while her conditions are broken
  - when: { reason: villager_in_town }
    lines: [ mara(angry): "I will not sleep under the same sky as Pell." ]
  - when: { reason: domain }
    lines: [ mara(cold): "You chose war. I've seen enough of it." ]
  - lines: [ mara: "This isn't working." ]
farewell:                               # plays once when she leaves for good
  - mara: "I'm sorry. I can't stay."
```

`reason` matches the kind of the broken `leaves_if` condition (`not_facility`, `villager_in_town`, `domain`, `tier`, `flags`).

### barks.yaml — one-liners on the road (optional)

```yaml
battle_start: [ "Stay behind me.", mara(grin): "Finally." ]
low_hp:       [ "Don't you dare fall." ]
withdraw:     [ mara(tired): "I'm done. I'll see you at home." ]
gather_wood:  [ "Now this I know." ]
rest:         [ "Sleep. I'll watch." ]
night:        [ mara(wary): "Something's moving out there." ]
```

### events/*.yaml — heart events

```yaml
id: mara_heart_2
title: "The Wheel"                      # for your reference
trigger:
  on: enter_map                          # enter_map | talk | phase_start
  requires: { tier: friend+, flags: [mara_river_promise], time: evening, map: dilsdurf_mill }
  once: true
  priority: 10                           # higher wins if several events qualify
stage:
  map: dilsdurf_mill                     # optional: teleport the scene here
  place: { mara: wheel_spot, player: mill_gate }
  companions: hide
script:
  - fade: in
  - move: { who: player, to: wheel_spot_left, wait: true }
  - mara: "It turned for sixty years."
  - choice:
      - text: "It could turn again."
        effects: { friendship: +6, romance: +4 }
        then: [ { mara(soft): "..." } ]
      - text: "Sixty is a good run."
        effects: { friendship: +2 }
  - fade: out
  - effects: { flags: { mara_heart_2_seen: true } }
  - end: scene
```

---

## 5. Stage directions (cutscenes and heart events)

| Step | Form |
|---|---|
| place | `- place: { who: mara, at: spot_id }` |
| move | `- move: { who: mara, to: spot_id, speed: walk, wait: true }` |
| face | `- face: { who: mara, dir: left }` or `{ who: mara, toward: player }` |
| emote | `- emote: { who: mara, icon: "!" }` icons: `!`, `?`, `heart`, `anger`, `sweat`, `note`, `zzz` |
| anim | `- anim: { who: mara, play: sit }` |
| wait | `- wait: 0.5` (seconds) |
| fade | `- fade: out` · `- fade: in` · `- fade: { to: black, seconds: 1 }` |
| camera | `- camera: { focus: mara }` · `{ shake: 0.3 }` · `{ pan: spot_id }` |
| sfx / music | `- sfx: door_open` · `- music: { play: mara_theme, fade: 2 }` · `- music: stop` |

Every character in a scene must have been placed (or be on the map already). Spot ids come from the map file; the validator checks them.

To continue a scene on another map, set `flags: { cutscene_pending: <cutscene id> }` before the `teleport` effect: the named cutscene plays as soon as the new map is built (the opening's `the_proposal` → `the_tour` does this).

---

## 6. Cutscenes and expedition events

- **Cutscenes** (`content/cutscenes/*.yaml`) are `stage:` + `script:` with no trigger; the story or a quest starts them.
- **Expedition events** (`content/encounters/*.yaml`) are scripts with `narrate` and `you` only, plus `check` and `choice`, and an extra `where:` block that controls when they can appear (see [data-formats.md](data-formats.md)). Effects there commonly use `resources`, `hp`, `energy`, `tags`, `flags`, and `battle`.

---

## 7. Rules the validator enforces

- Speaker ids, moods, item ids, villager ids, map and spot ids, quest ids, power ids all exist.
- Every `goto` targets a node in the same file; every `run` targets an existing snippet.
- Choices have at least one option that is always available (or the choice is guarded so it never appears with zero options).
- Effects only use known keys; tags and flags are collected into a list you can review for typos.
- Placeholders are counted and reported, never blocked.
