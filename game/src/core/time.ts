import { PHASES, nextPhase } from '@withergate/shared';
import type { Ctx } from './ctx';
import { checkQuests } from './quests';
import { maxEnergy, maxHp, phaseAbs } from './state';

export const PHASE_LABELS: Record<(typeof PHASES)[number], string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

/** Move time forward by n phases, running the daily tick when a new day starts. */
export function advancePhases(ctx: Ctx, n: number): void {
  for (let i = 0; i < n; i += 1) {
    const { phase, newDay } = nextPhase(ctx.state.time.phase);
    ctx.state.time.phase = phase;
    ctx.state.meta.playedPhases += 1;
    if (newDay) {
      ctx.state.time.day += 1;
      dailyTick(ctx);
    }
    expireTemporaries(ctx);
  }
  checkQuests(ctx);
  ctx.requests.push({ kind: 'time_changed' });
}

/** Sleep: always to the next morning (decided E3). Restores HP fully at home. */
export function sleepUntilMorning(ctx: Ctx): void {
  let guard = 0;
  do {
    advancePhases(ctx, 1);
    guard += 1;
  } while (ctx.state.time.phase !== 'morning' && guard < PHASES.length + 1);
  ctx.state.player.hp = maxHp(ctx.state, ctx.content);
}

export function dailyTick(ctx: Ctx): void {
  const { state, content } = ctx;
  state.player.energy = maxEnergy(state, content);
  const recovery = content.progression.energy.companion_recovery_per_day;
  for (const [id, v] of Object.entries(state.villagers)) {
    if (v.gone) continue;
    const max = content.villagers[id]?.profile.energy ?? 6;
    if (v.recoveryUntilDay > state.time.day) continue;
    v.energy = Math.min(max, v.energy + recovery);
    if (v.unhappy) {
      v.unhappy.daysLeft -= 1;
      if (v.unhappy.daysLeft <= 0) {
        v.gone = true;
        v.resident = false;
        ctx.notify(`${content.villagers[id]?.profile.name ?? id} has left Withergate for good.`);
      }
    }
  }
  for (const build of [...state.town.buildQueue]) {
    build.daysLeft -= 1;
    if (build.daysLeft <= 0) {
      state.town.buildQueue = state.town.buildQueue.filter((b) => b !== build);
      if (!state.town.facilities.includes(build.facility)) state.town.facilities.push(build.facility);
      ctx.notify(`${content.facilities[build.facility]?.name ?? build.facility} is complete.`);
    }
  }
  for (const key of Object.keys(state.flags)) {
    if (key.startsWith('bonus_until:') && state.flags[key] !== -1 && Number(state.flags[key]) < state.time.day) {
      const stat = key.slice('bonus_until:'.length);
      delete state.flags[key];
      delete state.flags[`bonus:${stat}`];
    }
  }
}

function expireTemporaries(ctx: Ctx): void {
  const now = phaseAbs(ctx.state);
  for (const [tag, until] of Object.entries(ctx.state.player.tempTags)) {
    if (until <= now) delete ctx.state.player.tempTags[tag];
  }
  for (const [id, o] of Object.entries(ctx.state.scheduleOverrides)) {
    if (o.untilPhase <= now) delete ctx.state.scheduleOverrides[id];
  }
}
