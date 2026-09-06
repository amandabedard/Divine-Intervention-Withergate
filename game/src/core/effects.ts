import { DOMAIN_LABELS, PHASES, levelForXp } from '@withergate/shared';
import type { Domain, Effects, Phase } from '@withergate/shared';
import { relationKey } from './conditions';
import type { Ctx } from './ctx';
import { advanceQuest, completeQuest, failQuest, startQuest } from './quests';
import { changeFriendship, changeRomance, introduce, setRomanceState } from './relationships';
import { faithLevel, maxEnergy, maxGrace, maxHp, phaseAbs, villagerState } from './state';
import { advancePhases, sleepUntilMorning } from './time';

/** Apply an effects block. Requests that need the world or UI are pushed to ctx.requests. */
export function applyEffects(e: Effects | undefined, ctx: Ctx): void {
  if (!e) return;
  const { state, content } = ctx;
  const p = state.player;

  const perVillager = (v: number | Record<string, number> | undefined, fn: (id: string, n: number) => void) => {
    if (v === undefined) return;
    if (typeof v === 'number') {
      if (ctx.speaker) fn(ctx.speaker, v);
      return;
    }
    for (const [id, n] of Object.entries(v)) fn(id, n);
  };

  perVillager(e.friendship, (id, n) => changeFriendship(ctx, id, n));
  perVillager(e.romance, (id, n) => changeRomance(ctx, id, n));
  if (e.set_tier) {
    for (const [id, tier] of Object.entries(e.set_tier)) {
      const v = villagerState(state, content, id);
      const thresholds = { enemy: -60, disliked: -20, stranger: 0, acquaintance: 10, friend: 40, best_friend: 100 } as const;
      v.friendship = thresholds[tier];
    }
  }
  if (e.set_romance) {
    if (typeof e.set_romance === 'string') {
      if (ctx.speaker) setRomanceState(ctx, ctx.speaker, e.set_romance);
    } else {
      for (const [id, s] of Object.entries(e.set_romance)) setRomanceState(ctx, id, s);
    }
  }
  for (const id of e.introduce ?? []) introduce(ctx, id);

  for (const t of e.tags ?? []) if (!p.tags.includes(t)) p.tags.push(t);
  for (const t of e.remove_tags ?? []) {
    p.tags = p.tags.filter((x) => x !== t);
    delete p.tempTags[t];
  }
  if (e.temp_tags) {
    const now = phaseAbs(state);
    for (const [t, phases] of Object.entries(e.temp_tags)) p.tempTags[t] = Math.max(p.tempTags[t] ?? 0, now + phases);
  }

  if (e.xp) grantXp(ctx, e.xp);
  if (e.hp) p.hp = Math.max(0, Math.min(maxHp(state, content), p.hp + e.hp));
  if (e.energy) p.energy = Math.max(0, Math.min(maxEnergy(state, content), p.energy + e.energy));
  if (e.grace) p.grace = Math.max(0, Math.min(maxGrace(state, content), p.grace + e.grace));
  if (e.domain_points) {
    for (const [d, n] of Object.entries(e.domain_points)) {
      const key = d as Domain;
      const before = p.domainPoints[key];
      p.domainPoints[key] = Math.max(0, before + (n ?? 0));
      const milestone = content.progression.domain_milestone;
      if (before < milestone && p.domainPoints[key] >= milestone) {
        ctx.notify(`Your deeds speak of ${DOMAIN_LABELS[key]}.`);
      }
    }
  }
  if (e.faith) grantFaith(ctx, e.faith);
  if (e.unlock_power && !p.powers.includes(e.unlock_power)) {
    p.powers.push(e.unlock_power);
    const power = content.powers[e.unlock_power];
    if (power?.domain) p.domainPoints[power.domain] += 1;
    ctx.notify(`New power: ${power?.name ?? e.unlock_power}`);
  }
  if (e.stat_check_bonus) {
    const until = e.stat_check_bonus.until === 'expedition_end' ? 'expedition_end' : 'day_end';
    state.flags[`bonus:${e.stat_check_bonus.stat}`] = e.stat_check_bonus.amount;
    state.flags[`bonus_until:${e.stat_check_bonus.stat}`] = until === 'day_end' ? state.time.day : -1;
  }

  if (e.flags) for (const [k, v] of Object.entries(e.flags)) state.flags[k] = v;
  if (e.increment) for (const [k, n] of Object.entries(e.increment)) state.flags[k] = Number(state.flags[k] ?? 0) + n;
  for (const k of e.clear_flags ?? []) delete state.flags[k];

  if (e.quest_start) startQuest(ctx, e.quest_start);
  if (e.quest_advance) {
    if (typeof e.quest_advance === 'string') advanceQuest(ctx, e.quest_advance);
    else advanceQuest(ctx, e.quest_advance.id, e.quest_advance.to);
  }
  if (e.quest_complete) completeQuest(ctx, e.quest_complete);
  if (e.quest_fail) failQuest(ctx, e.quest_fail);

  if (e.resources) {
    for (const [r, n] of Object.entries(e.resources)) {
      const key = r as keyof typeof state.town.resources;
      state.town.resources[key] = Math.max(0, (state.town.resources[key] ?? 0) + (n ?? 0));
    }
  }
  if (e.items) {
    for (const [id, n] of Object.entries(e.items)) {
      const next = (state.town.storage[id] ?? 0) + n;
      if (next <= 0) delete state.town.storage[id];
      else state.town.storage[id] = next;
      if (n > 0) ctx.notify(`Received ${content.items[id]?.name ?? id}${n > 1 ? ` ×${n}` : ''}.`);
    }
  }
  if (e.relations) {
    state.world.relations[relationKey(e.relations.between[0], e.relations.between[1])] = e.relations.set;
  }
  if (e.corruption) state.world.corruption = Math.max(0, Math.min(10, state.world.corruption + e.corruption));
  if (e.recruit) recruit(ctx, e.recruit);
  if (e.dismiss) dismiss(ctx, e.dismiss);
  if (e.build) {
    if (e.build.instant) {
      if (!state.town.facilities.includes(e.build.facility)) state.town.facilities.push(e.build.facility);
    } else if (!state.town.buildQueue.some((b) => b.facility === e.build!.facility)) {
      state.town.buildQueue.push({ facility: e.build.facility, daysLeft: content.facilities[e.build.facility]?.build_days ?? 1 });
    }
  }
  if (e.time !== undefined) {
    if (typeof e.time === 'number') advancePhases(ctx, e.time);
    else if (e.time === 'morning') sleepUntilMorning(ctx);
    else advanceToPhase(ctx, e.time);
  }
  if (e.teleport) ctx.requests.push({ kind: 'teleport', map: e.teleport.map, spawn: e.teleport.spawn });
  if (e.schedule_override) {
    const s = e.schedule_override;
    const now = phaseAbs(state);
    const until = s.until === 'day_end' ? (state.time.day + 1) * PHASES.length : now + 1;
    state.scheduleOverrides[s.villager] = { map: s.map, spot: s.spot, untilPhase: until };
    ctx.requests.push({ kind: 'npc_refresh' });
  }
  if (e.battle) ctx.requests.push({ kind: 'battle', enemy: e.battle.enemy, on_win: e.battle.on_win, on_lose: e.battle.on_lose });
  if (e.start_cutscene) ctx.requests.push({ kind: 'cutscene', id: e.start_cutscene });
  if (e.start_event) ctx.requests.push({ kind: 'event', id: e.start_event });
  if (e.notify) ctx.notify(e.notify);
  if (e.unlock_map && !state.world.unlockedMaps.includes(e.unlock_map)) state.world.unlockedMaps.push(e.unlock_map);
}

export function grantXp(ctx: Ctx, amount: number): void {
  const p = ctx.state.player;
  const prog = ctx.content.progression;
  const before = p.level;
  p.xp += amount;
  p.level = levelForXp(p.xp, prog.xp_curve, prog.level_cap);
  if (p.level > before) {
    p.hp = maxHp(ctx.state, ctx.content);
    ctx.notify(`Level ${p.level}!`);
  }
}

export function grantFaith(ctx: Ctx, amount: number): void {
  const p = ctx.state.player;
  const before = faithLevel(ctx.state, ctx.content);
  p.faith = Math.max(0, p.faith + amount);
  const after = faithLevel(ctx.state, ctx.content);
  if (after > before) {
    p.skillPoints += (after - before) * ctx.content.progression.skill_points_per_faith_level;
    ctx.notify(`Faith grows. Level ${after}.`);
  }
}

export function recruit(ctx: Ctx, id: string): boolean {
  const profile = ctx.content.villagers[id]?.profile;
  const v = villagerState(ctx.state, ctx.content, id);
  if (!profile || v.resident || v.gone) return false;
  v.resident = true;
  v.energy = profile.energy ?? v.energy;
  v.unhappy = null;
  ctx.state.player.domainPoints.friendship += 1;
  ctx.notify(`${profile.name} is moving to Withergate.`);
  ctx.requests.push({ kind: 'npc_refresh' });
  return true;
}

export function dismiss(ctx: Ctx, id: string): void {
  const v = villagerState(ctx.state, ctx.content, id);
  v.resident = false;
  v.unhappy = null;
  ctx.requests.push({ kind: 'npc_refresh' });
}

function advanceToPhase(ctx: Ctx, phase: Phase): void {
  let guard = 0;
  while (ctx.state.time.phase !== phase && guard < PHASES.length) {
    advancePhases(ctx, 1);
    guard += 1;
  }
}
