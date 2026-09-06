import type { AssetManifest, GeneratedIndex } from '../assets.ts';
import type { ContentBundle, Issue } from '../bundle.ts';
import type { Condition } from '../condition.ts';
import { RESOURCES } from '../ids.ts';
import { mapEntities } from '../map.ts';
import { forEachStep } from '../script.ts';
import type { Effects, Step } from '../script.ts';

interface ScriptCtx {
  /** File (or "file:line") used when a step has no loc. */
  file: string;
  /** Nodes of the enclosing script, for goto checks. */
  nodes?: Record<string, Step[]>;
  /** Map the scene is staged on, for spot checks. */
  stageMap?: string;
}

/** Check every reference in the bundle against the ids that exist. */
export function crossCheck(
  bundle: ContentBundle,
  issues: Issue[],
  assets: GeneratedIndex | null,
  manifest: AssetManifest | null = null,
): void {
  const push = (level: Issue['level'], where: string, message: string) => {
    const m = /^(.*):(\d+)$/.exec(where);
    if (m) issues.push({ level, file: m[1]!, line: Number(m[2]), message });
    else issues.push({ level, file: where, message });
  };
  const err = (where: string, message: string) => push('error', where, message);
  const warn = (where: string, message: string) => push('warning', where, message);

  const villagers = bundle.villagers;
  const eventIds = new Set<string>();
  for (const v of Object.values(villagers)) for (const e of v.events) eventIds.add(e.id);

  const has = {
    villager: (id: string) => id in villagers,
    speaker: (id: string) => id === 'you' || id === 'narrate' || id in villagers,
    actor: (id: string) => id === 'player' || id in villagers,
    item: (id: string) => id in bundle.items,
    quest: (id: string) => id in bundle.quests,
    enemy: (id: string) => id in bundle.enemies,
    power: (id: string) => id in bundle.powers,
    map: (id: string) => id in bundle.maps,
    cutscene: (id: string) => id in bundle.cutscenes,
    event: (id: string) => eventIds.has(id),
    shared: (id: string) => id in bundle.shared,
    encounter: (id: string) => id in bundle.encounters,
    facility: (id: string) => id in bundle.facilities,
    spawn: (map: string, spawn: string) =>
      !!bundle.maps[map] && mapEntities(bundle.maps[map]!, 'spawn').some((s) => s.id === spawn),
    spot: (map: string, spot: string) =>
      !!bundle.maps[map] && mapEntities(bundle.maps[map]!, 'npc_spot').some((s) => s.id === spot),
  };

  const checkCondition = (c: Condition | undefined, where: string): void => {
    if (!c) return;
    for (const key of ['met', 'villager', 'villager_in_town', 'villager_not_in_town', 'party_has', 'recruit_conditions_met'] as const) {
      const v = c[key];
      if (v && !has.villager(v)) err(where, `condition ${key}: unknown character "${v}"`);
    }
    for (const id of c.events_seen ?? []) if (!has.event(id)) err(where, `condition events_seen: unknown event "${id}"`);
    if (c.quest && !has.quest(c.quest.id)) err(where, `condition quest: unknown quest "${c.quest.id}"`);
    if (c.quest?.stage && has.quest(c.quest.id) && !bundle.quests[c.quest.id]!.stages.some((s) => s.id === c.quest!.stage)) {
      err(where, `condition quest: quest "${c.quest.id}" has no stage "${c.quest.stage}"`);
    }
    if (c.map && !has.map(c.map)) err(where, `condition map: unknown map "${c.map}"`);
    for (const nested of c.any ?? []) checkCondition(nested, where);
    for (const nested of c.all ?? []) checkCondition(nested, where);
    if (c.not) checkCondition(c.not, where);
  };

  const checkEffects = (e: Effects | undefined, where: string): void => {
    if (!e) return;
    const perVillager = (v: number | Record<string, unknown> | string | undefined, key: string) => {
      if (v && typeof v === 'object') {
        for (const id of Object.keys(v)) if (!has.villager(id)) err(where, `effect ${key}: unknown character "${id}"`);
      }
    };
    perVillager(e.friendship, 'friendship');
    perVillager(e.romance, 'romance');
    perVillager(e.set_tier, 'set_tier');
    perVillager(e.set_romance, 'set_romance');
    for (const id of e.introduce ?? []) if (!has.villager(id)) err(where, `effect introduce: unknown character "${id}"`);
    if (e.unlock_power && !has.power(e.unlock_power)) err(where, `effect unlock_power: unknown power "${e.unlock_power}"`);
    for (const key of ['quest_start', 'quest_complete', 'quest_fail'] as const) {
      const id = e[key];
      if (id && !has.quest(id)) err(where, `effect ${key}: unknown quest "${id}"`);
    }
    if (e.quest_advance) {
      const id = typeof e.quest_advance === 'string' ? e.quest_advance : e.quest_advance.id;
      const to = typeof e.quest_advance === 'string' ? undefined : e.quest_advance.to;
      if (!has.quest(id)) err(where, `effect quest_advance: unknown quest "${id}"`);
      else if (to && !bundle.quests[id]!.stages.some((s) => s.id === to)) err(where, `effect quest_advance: quest "${id}" has no stage "${to}"`);
    }
    for (const id of Object.keys(e.items ?? {})) if (!has.item(id)) err(where, `effect items: unknown item "${id}"`);
    for (const id of e.weapons ?? []) if (!(id in bundle.weapons)) err(where, `effect weapons: unknown weapon "${id}"`);
    for (const key of ['recruit', 'dismiss'] as const) {
      const id = e[key];
      if (id && !has.villager(id)) err(where, `effect ${key}: unknown character "${id}"`);
    }
    if (e.teleport) {
      if (!has.map(e.teleport.map)) err(where, `effect teleport: unknown map "${e.teleport.map}"`);
      else if (!has.spawn(e.teleport.map, e.teleport.spawn)) err(where, `effect teleport: map "${e.teleport.map}" has no spawn "${e.teleport.spawn}"`);
    }
    if (e.schedule_override) {
      const s = e.schedule_override;
      if (!has.villager(s.villager)) err(where, `effect schedule_override: unknown character "${s.villager}"`);
      if (!has.map(s.map)) err(where, `effect schedule_override: unknown map "${s.map}"`);
      else if (!has.spot(s.map, s.spot)) err(where, `effect schedule_override: map "${s.map}" has no spot "${s.spot}"`);
    }
    if (e.battle && !has.enemy(e.battle.enemy)) err(where, `effect battle: unknown enemy "${e.battle.enemy}"`);
    if (e.start_cutscene && !has.cutscene(e.start_cutscene)) err(where, `effect start_cutscene: unknown cutscene "${e.start_cutscene}"`);
    if (e.start_event && !has.event(e.start_event)) err(where, `effect start_event: unknown event "${e.start_event}"`);
    if (e.unlock_map && !has.map(e.unlock_map)) err(where, `effect unlock_map: unknown map "${e.unlock_map}"`);
    if (e.build && !has.facility(e.build.facility)) err(where, `effect build: facility "${e.build.facility}" is not defined in facilities.yaml`);
  };

  const checkSteps = (steps: Step[], ctx: ScriptCtx): void => {
    forEachStep(steps, (s) => {
      const where = s.loc ?? ctx.file;
      switch (s.kind) {
        case 'line': {
          if (!has.speaker(s.speaker)) err(where, `unknown speaker "${s.speaker}"`);
          else if (s.mood && assets && s.speaker !== 'you' && s.speaker !== 'narrate') {
            const set = villagers[s.speaker]?.profile.portrait_set ?? s.speaker;
            const busts = assets.busts[set];
            if (busts && !busts.moods[s.mood]) warn(where, `no bust "${s.mood}" for ${set} (neutral will be shown)`);
          }
          break;
        }
        case 'goto':
          if (ctx.nodes && !(s.node in ctx.nodes)) err(where, `goto: no node named "${s.node}" in this script`);
          break;
        case 'run':
          if (!has.shared(s.script)) err(where, `run: no shared script "${s.script}" under content/dialog/`);
          break;
        case 'battle':
          if (!has.enemy(s.enemy)) err(where, `battle: unknown enemy "${s.enemy}"`);
          break;
        case 'if':
          checkCondition(s.cond, where);
          break;
        case 'select':
          for (const b of s.branches) checkCondition(b.when, where);
          break;
        case 'effects':
          checkEffects(s.effects, where);
          break;
        case 'choice':
          for (const o of s.options) {
            checkCondition(o.requires, where);
            checkEffects(o.effects, where);
          }
          break;
        case 'stage': {
          const who = s.args.who;
          if (typeof who === 'string' && !has.actor(who)) err(where, `${s.op}: unknown character "${who}"`);
          const toward = s.args.toward;
          if (typeof toward === 'string' && !has.actor(toward)) err(where, `${s.op}: unknown character "${toward}"`);
          for (const key of ['to', 'at', 'pan']) {
            const spot = s.args[key];
            if (typeof spot === 'string' && ctx.stageMap) {
              if (!has.spot(ctx.stageMap, spot)) err(where, `${s.op}: map "${ctx.stageMap}" has no spot "${spot}"`);
            }
          }
          break;
        }
        default:
          break;
      }
    });
  };

  const checkScript = (nodes: Record<string, Step[]>, ctx: ScriptCtx) => {
    for (const steps of Object.values(nodes)) checkSteps(steps, { ...ctx, nodes });
  };

  // --- villagers -----------------------------------------------------------
  for (const v of Object.values(villagers)) {
    const p = v.profile;
    const pf = v.files.profile!;
    for (const cat of ['loved', 'liked', 'disliked', 'hated'] as const) {
      for (const id of p.gifts[cat]) if (!has.item(id)) err(pf, `gifts.${cat}: unknown item "${id}"`);
    }
    if (assets) {
      const ps = p.portrait_set ?? p.id;
      if (!assets.busts[ps]) warn(pf, `no busts found for portrait set "${ps}" (assets/characters/${ps}_busts/)`);
      const ss = p.sprite_set ?? p.id;
      if (!assets.sprites[ss]) warn(pf, `no sprites found for sprite set "${ss}" (assets/characters/${ss}_sprites/)`);
    }
    const checkSchedule = (sched: Partial<Record<string, { map: string; spot?: string }>> | undefined, label: string) => {
      for (const [phase, ref] of Object.entries(sched ?? {})) {
        if (!ref || ref.map === 'none') continue;
        if (!has.map(ref.map)) err(pf, `schedule.${label}.${phase}: unknown map "${ref.map}"`);
        else if (ref.spot && !has.spot(ref.map, ref.spot)) err(pf, `schedule.${label}.${phase}: map "${ref.map}" has no spot "${ref.spot}"`);
      }
    };
    checkSchedule(p.schedule?.home, 'home');
    checkSchedule(p.schedule?.withergate, 'withergate');
    for (const id of Object.keys(p.store ?? {})) {
      if (!(RESOURCES as readonly string[]).includes(id) && !has.item(id)) err(pf, `store: unknown resource or item "${id}"`);
    }
    for (const o of p.schedule?.overrides ?? []) {
      checkCondition(o.when, pf);
      if (o.at.map !== 'none') {
        if (!has.map(o.at.map)) err(pf, `schedule.overrides: unknown map "${o.at.map}"`);
        else if (o.at.spot && !has.spot(o.at.map, o.at.spot)) err(pf, `schedule.overrides: map "${o.at.map}" has no spot "${o.at.spot}"`);
      }
    }
    if (p.recruit) {
      checkCondition(p.recruit.requires, pf);
      for (const c of p.recruit.leaves_if ?? []) checkCondition(c, pf);
      const m = p.recruit.method;
      if (m.kind === 'quest' && !has.quest(m.quest)) err(pf, `recruit.method: unknown quest "${m.quest}"`);
      if (m.kind === 'item' && !has.item(m.item)) err(pf, `recruit.method: unknown item "${m.item}"`);
    }
    checkCondition(p.romance?.interest_requires, pf);
    checkCondition(p.romance?.lover_requires, pf);
    for (const b of p.benefits?.combat ?? []) {
      if (b.type === 'active' && typeof b.skill === 'string' && !has.power(b.skill)) err(pf, `benefits.combat: active skill "${b.skill}" is not in powers.yaml`);
    }

    const chatFile = v.files.chat ?? pf;
    for (const pool of v.chat) {
      checkCondition(pool.when, chatFile);
      for (const line of pool.lines) checkSteps(line, { file: chatFile });
    }
    const flirtFile = v.files.flirt ?? pf;
    for (const pool of v.flirt) {
      checkCondition(pool.when, flirtFile);
      checkEffects(pool.effects, flirtFile);
      for (const line of pool.lines) checkSteps(line, { file: flirtFile });
    }
    if (v.flirt.length && !p.romanceable) warn(flirtFile, 'flirt.yaml is ignored because romanceable is false');
    const discussFile = v.files.discuss ?? pf;
    for (const t of v.discuss) {
      checkCondition(t.requires, discussFile);
      checkScript(t.script.nodes, { file: discussFile });
    }
    const giftsFile = v.files.gifts ?? pf;
    for (const lines of Object.values(v.gifts.reactions)) for (const l of lines ?? []) checkSteps(l, { file: giftsFile });
    for (const [item, ovs] of Object.entries(v.gifts.overrides)) {
      if (!has.item(item)) err(giftsFile, `gift override for unknown item "${item}"`);
      for (const o of ovs) {
        checkCondition(o.when, giftsFile);
        checkEffects(o.effects, giftsFile);
        for (const l of o.lines) checkSteps(l, { file: giftsFile });
      }
    }
    if (v.recruit) {
      const rf = v.files.recruit ?? pf;
      checkScript(v.recruit.script.nodes, { file: rf });
      for (const u of v.recruit.unhappy) {
        checkCondition(u.when, rf);
        for (const l of u.lines) checkSteps(l, { file: rf });
      }
      if (v.recruit.farewell) checkScript(v.recruit.farewell.nodes, { file: rf });
    }
    for (const lines of Object.values(v.barks)) for (const l of lines ?? []) checkSteps(l, { file: v.files.barks ?? pf });
    for (const ev of v.events) {
      const ef = v.files[`event:${ev.id}`] ?? pf;
      checkCondition(ev.trigger.requires, ef);
      const stageMap = ev.stage?.map ?? ev.trigger.requires?.map;
      if (ev.stage?.map && !has.map(ev.stage.map)) err(ef, `stage.map: unknown map "${ev.stage.map}"`);
      for (const [who, spot] of Object.entries(ev.stage?.place ?? {})) {
        if (!has.actor(who)) err(ef, `stage.place: unknown character "${who}"`);
        if (stageMap && has.map(stageMap) && !has.spot(stageMap, spot)) err(ef, `stage.place: map "${stageMap}" has no spot "${spot}"`);
      }
      if (ev.trigger.on === 'enter_map' && !stageMap) warn(ef, 'enter_map trigger without a map condition or stage.map fires on every map');
      checkScript(ev.script.nodes, { file: ef, stageMap: stageMap && has.map(stageMap) ? stageMap : undefined });
    }
  }

  // --- quests --------------------------------------------------------------
  for (const q of Object.values(bundle.quests)) {
    const f = `quests/${q.id}.yaml`;
    if (q.giver !== 'none' && !has.villager(q.giver)) err(f, `giver: unknown character "${q.giver}"`);
    checkCondition(q.fail_when, f);
    checkEffects(q.rewards, f);
    const seen = new Set<string>();
    for (const s of q.stages) {
      if (seen.has(s.id)) err(f, `duplicate stage id "${s.id}"`);
      seen.add(s.id);
      checkCondition(s.complete_when, f);
      checkEffects(s.on_enter, f);
      checkEffects(s.on_complete, f);
      if (s.checkpoint && !has.encounter(s.checkpoint)) warn(f, `stage "${s.id}": checkpoint "${s.checkpoint}" has no encounter yet`);
    }
    for (const stageId of Object.keys(q.journal_notes ?? {})) {
      if (!q.stages.some((s) => s.id === stageId)) err(f, `journal_notes: no stage "${stageId}"`);
    }
  }

  // --- enemies -------------------------------------------------------------
  for (const e of Object.values(bundle.enemies)) {
    const f = `enemies/${e.id}.yaml`;
    if (e.gift_drop && !has.item(e.gift_drop.item)) err(f, `gift_drop: unknown item "${e.gift_drop.item}"`);
    for (const id of Object.keys(e.spare?.items ?? {})) if (!has.item(id)) err(f, `spare.items: unknown item "${id}"`);
    for (const m of [...e.moves, ...(e.phases ?? []).flatMap((p) => p.moves)]) checkCondition(m.when, f);
    if (e.intro) checkScript(e.intro.nodes, { file: f });
    if (e.defeat) checkScript(e.defeat.nodes, { file: f });
    for (const p of e.phases ?? []) if (p.on_enter) checkScript(p.on_enter.nodes, { file: f });
    if (assets && e.sprite_set && !assets.sprites[e.sprite_set]) warn(f, `no sprites found for sprite set "${e.sprite_set}"`);
  }

  // --- encounters, cutscenes, shared ---------------------------------------
  for (const e of Object.values(bundle.encounters)) {
    const f = `encounters/${e.id}.yaml`;
    checkCondition(e.where.requires, f);
    checkScript(e.script.nodes, { file: f });
  }
  for (const c of Object.values(bundle.cutscenes)) {
    const f = `cutscenes/${c.id}.yaml`;
    if (c.stage?.map && !has.map(c.stage.map)) err(f, `stage.map: unknown map "${c.stage.map}"`);
    for (const [who, spot] of Object.entries(c.stage?.place ?? {})) {
      if (!has.actor(who)) err(f, `stage.place: unknown character "${who}"`);
      if (c.stage?.map && has.map(c.stage.map) && !has.spot(c.stage.map, spot)) err(f, `stage.place: map "${c.stage.map}" has no spot "${spot}"`);
    }
    checkScript(c.script.nodes, { file: f, stageMap: c.stage?.map && has.map(c.stage.map) ? c.stage.map : undefined });
  }
  for (const [id, s] of Object.entries(bundle.shared)) checkScript(s.nodes, { file: `dialog/${id}.yaml` });

  // --- maps ----------------------------------------------------------------
  const assetIds = manifest ? new Set(manifest.assets.map((a) => a.id)) : null;
  for (const m of Object.values(bundle.maps)) {
    const f = `maps/${m.id}.map.json`;
    if (assetIds) {
      for (const [layer, list] of Object.entries(m.layers)) {
        for (const p of list) {
          if (p.asset !== 'placeholder' && !assetIds.has(p.asset)) warn(f, `layer ${layer}: unknown asset "${p.asset}" (not in assets/manifest.json)`);
        }
      }
      for (const b of m.background) if (b.asset && !assetIds.has(b.asset)) warn(f, `background: unknown asset "${b.asset}"`);
    }
    for (const ex of mapEntities(m, 'exit')) {
      if (!has.map(ex.to.map)) err(f, `exit "${ex.id}": unknown map "${ex.to.map}"`);
      else if (!has.spawn(ex.to.map, ex.to.spawn)) err(f, `exit "${ex.id}": map "${ex.to.map}" has no spawn "${ex.to.spawn}"`);
      checkCondition(ex.requires, f);
    }
    for (const it of mapEntities(m, 'interactable')) {
      checkCondition(it.requires, f);
      if (it.action.kind === 'run_script' && !has.shared(it.action.script)) err(f, `interactable "${it.id}": no shared script "${it.action.script}"`);
      if (it.action.kind === 'facility' && !has.facility(it.action.facility)) err(f, `interactable "${it.id}": unknown facility "${it.action.facility}"`);
    }
    for (const t of mapEntities(m, 'trigger')) {
      checkCondition(t.requires, f);
      if (t.action.kind === 'run_script' && !has.shared(t.action.script)) err(f, `trigger "${t.id}": no shared script "${t.action.script}"`);
      if (t.action.kind === 'start_event' && !has.event(t.action.event)) err(f, `trigger "${t.id}": unknown event "${t.action.event}"`);
      if (t.action.kind === 'start_cutscene' && !has.cutscene(t.action.cutscene)) err(f, `trigger "${t.id}": unknown cutscene "${t.action.cutscene}"`);
    }
  }

  // --- regions -------------------------------------------------------------
  for (const r of Object.values(bundle.regions)) {
    const f = 'regions.yaml';
    if (r.kind === 'route' && !r.to) err(f, `region "${r.id}": routes need a "to" town`);
    if (r.kind === 'route' && !r.days) err(f, `region "${r.id}": routes need "days"`);
    if (r.kind === 'wild' && !r.segments) err(f, `region "${r.id}": wild regions need "segments"`);
    for (const cp of r.checkpoints) {
      const ids = 'pool' in cp ? cp.pool : [cp.fixed];
      for (const id of ids) if (!has.encounter(id)) warn(f, `region "${r.id}": checkpoint "${id}" has no encounter yet`);
    }
    for (const b of r.biomes) if (!(b in bundle.biomes)) warn(f, `region "${r.id}": biome "${b}" is not defined in biomes.yaml`);
  }

  // --- economy and tavern --------------------------------------------------
  for (const id of Object.keys(bundle.economy.gifts)) if (!has.item(id)) err('economy.yaml', `gifts: unknown item "${id}"`);
  for (const id of Object.keys(bundle.economy.stock.weights)) {
    if (!(RESOURCES as readonly string[]).includes(id) && !has.item(id)) err('economy.yaml', `stock.weights: unknown resource or item "${id}"`);
  }
  for (const id of Object.keys(bundle.economy.stock.units)) {
    if (id !== 'default' && !(RESOURCES as readonly string[]).includes(id)) err('economy.yaml', `stock.units: unknown resource "${id}"`);
  }
  for (const a of bundle.tavern) {
    checkCondition(a.requires, 'tavern.yaml');
    checkEffects(a.effects, 'tavern.yaml');
    if (a.script) checkScript(a.script.nodes, { file: 'tavern.yaml' });
  }

  // --- items and powers ----------------------------------------------------
  for (const it of Object.values(bundle.items)) {
    if (it.craft) checkCondition(it.craft.requires, 'items.yaml');
  }
  for (const p of Object.values(bundle.powers)) {
    for (const req of p.requires) if (!has.power(req)) err('powers.yaml', `power "${p.id}": unknown prerequisite "${req}"`);
  }
}
