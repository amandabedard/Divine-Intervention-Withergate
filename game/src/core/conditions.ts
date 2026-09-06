import { ROMANCE_STATES, TIERS, matchesOrdered, tierForPoints } from '@withergate/shared';
import type { Condition, Phase } from '@withergate/shared';
import type { Ctx } from './ctx';
import { activeTags, domainLean, faithLevel, maxHp, residents, villagerState } from './state';

/** Evaluate a content condition against the current game. Missing context fails closed. */
export function evaluate(cond: Condition | undefined, ctx: Ctx): boolean {
  if (!cond) return true;
  const { state, content } = ctx;
  const target = cond.villager ?? ctx.speaker;
  const rel = target ? villagerState(state, content, target) : undefined;
  const tier = rel ? tierForPoints(rel.friendship) : undefined;
  const tags = activeTags(state);

  if (cond.tier !== undefined && !(tier && matchesOrdered(TIERS, tier, cond.tier))) return false;
  if (cond.romance !== undefined && !(rel && matchesOrdered(ROMANCE_STATES, rel.romanceState, cond.romance))) return false;
  if (cond.friendship_min !== undefined && !(rel && rel.friendship >= cond.friendship_min)) return false;
  if (cond.friendship_max !== undefined && !(rel && rel.friendship <= cond.friendship_max)) return false;
  if (cond.romance_min !== undefined && !(rel && rel.romance >= cond.romance_min)) return false;
  if (cond.met !== undefined && !villagerState(state, content, cond.met).met) return false;
  if (cond.events_seen && !(rel && cond.events_seen.every((e) => rel.eventsSeen.includes(e)))) return false;
  if (cond.topics_done && !(rel && cond.topics_done.every((t) => rel.topicsDone.includes(t)))) return false;

  if (cond.tags && !cond.tags.every((t) => tags.includes(t))) return false;
  if (cond.any_tags && !cond.any_tags.some((t) => tags.includes(t))) return false;
  if (cond.not_tags && cond.not_tags.some((t) => tags.includes(t))) return false;
  if (cond.stat_min) {
    for (const [stat, min] of Object.entries(cond.stat_min)) {
      if ((state.player.stats[stat as keyof typeof state.player.stats] ?? 0) < (min ?? 0)) return false;
    }
  }
  if (cond.level_min !== undefined && state.player.level < cond.level_min) return false;
  if (cond.domain_lean !== undefined && domainLean(state) !== cond.domain_lean) return false;
  if (cond.domain_points_min) {
    for (const [d, min] of Object.entries(cond.domain_points_min)) {
      if ((state.player.domainPoints[d as keyof typeof state.player.domainPoints] ?? 0) < (min ?? 0)) return false;
    }
  }
  if (cond.faith_level_min !== undefined && faithLevel(state, content) < cond.faith_level_min) return false;
  if (cond.form !== undefined && state.player.form !== cond.form) return false;
  if (cond.label !== undefined && state.player.label !== cond.label) return false;
  if (cond.hp_below !== undefined && !(state.player.hp < maxHp(state, content) * cond.hp_below)) return false;

  if (cond.flags && !cond.flags.every((f) => truthy(state.flags[f]))) return false;
  if (cond.not_flags && cond.not_flags.some((f) => truthy(state.flags[f]))) return false;
  if (cond.flag_eq) for (const [k, v] of Object.entries(cond.flag_eq)) if (state.flags[k] !== v) return false;
  if (cond.flag_min) for (const [k, v] of Object.entries(cond.flag_min)) if (Number(state.flags[k] ?? 0) < v) return false;
  if (cond.flag_max) for (const [k, v] of Object.entries(cond.flag_max)) if (Number(state.flags[k] ?? 0) > v) return false;
  if (cond.quest) {
    const q = state.quests[cond.quest.id];
    const status = q?.status ?? 'not_started';
    if (cond.quest.status !== undefined && status !== cond.quest.status) return false;
    if (cond.quest.stage !== undefined && (!q || q.stage !== cond.quest.stage)) return false;
    if (cond.quest.status === undefined && cond.quest.stage === undefined && status === 'not_started') return false;
  }
  if (cond.quests_done_min) {
    const n = Object.entries(state.quests).filter(
      ([id, q]) => q.status === 'done' && (!cond.quests_done_min!.type || content.quests[id]?.type === cond.quests_done_min!.type),
    ).length;
    if (n < cond.quests_done_min.count) return false;
  }

  if (cond.time !== undefined) {
    const phases: Phase[] = Array.isArray(cond.time) ? cond.time : [cond.time];
    if (!phases.includes(state.time.phase)) return false;
  }
  if (cond.day_min !== undefined && state.time.day < cond.day_min) return false;
  if (cond.day_max !== undefined && state.time.day > cond.day_max) return false;
  if (cond.map !== undefined && state.where.map !== cond.map) return false;
  if (cond.town !== undefined && content.maps[state.where.map]?.town !== cond.town) return false;
  if (cond.biome !== undefined && ctx.extras?.biome !== cond.biome) return false;
  if (cond.corruption_min !== undefined && state.world.corruption < cond.corruption_min) return false;
  if (cond.corruption_max !== undefined && state.world.corruption > cond.corruption_max) return false;
  if (cond.relations) {
    const key = relationKey(cond.relations.between[0], cond.relations.between[1]);
    if ((state.world.relations[key] ?? 'neutral') !== cond.relations.is) return false;
  }
  if (cond.in_expedition !== undefined && cond.in_expedition !== false) return false; // expeditions arrive in Phase 7
  if (cond.chance !== undefined && !ctx.rng.chance(cond.chance)) return false;

  if (cond.facility !== undefined && !state.town.facilities.includes(cond.facility)) return false;
  if (cond.not_facility !== undefined && state.town.facilities.includes(cond.not_facility)) return false;
  if (cond.villager_in_town !== undefined && !isResident(ctx, cond.villager_in_town)) return false;
  if (cond.villager_not_in_town !== undefined && isResident(ctx, cond.villager_not_in_town)) return false;
  if (cond.residents_min !== undefined && residents(state).length < cond.residents_min) return false;
  if (cond.resource_min) {
    for (const [r, min] of Object.entries(cond.resource_min)) {
      if ((state.town.resources[r as keyof typeof state.town.resources] ?? 0) < (min ?? 0)) return false;
    }
  }
  if (cond.party_has !== undefined) return false; // no party until Phase 7
  if (cond.party_has_profession !== undefined) return false;
  if (cond.party_size_max !== undefined && cond.party_size_max < 0) return false;
  if (cond.recruit_conditions_met !== undefined) {
    const profile = content.villagers[cond.recruit_conditions_met]?.profile;
    if (!profile?.recruit) return false;
    if (!evaluate(profile.recruit.requires, { ...ctx, speaker: cond.recruit_conditions_met })) return false;
  }

  if (cond.reason !== undefined && ctx.extras?.reason !== cond.reason) return false;
  if (cond.gift_category !== undefined && ctx.extras?.gift_category !== cond.gift_category) return false;
  if (cond.node !== undefined && ctx.extras?.node !== cond.node) return false;

  if (cond.all && !cond.all.every((c) => evaluate(c, ctx))) return false;
  if (cond.any && !cond.any.some((c) => evaluate(c, ctx))) return false;
  if (cond.not && evaluate(cond.not, ctx)) return false;
  return true;
}

function truthy(v: unknown): boolean {
  return v !== undefined && v !== false && v !== 0 && v !== '';
}

function isResident(ctx: Ctx, id: string): boolean {
  const v = ctx.state.villagers[id];
  return !!v && v.resident && !v.gone;
}

export function relationKey(a: string, b: string): string {
  return [a, b].sort().join('~');
}
