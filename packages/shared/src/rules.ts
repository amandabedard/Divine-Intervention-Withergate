// Pure rule helpers shared by the game and the tools. No engine imports.
import { DEFAULT_TIER_THRESHOLDS, PHASES, TIERS } from './ids.ts';
import type { Phase, Tier } from './ids.ts';

/** Tier for a friendship point total. */
export function tierForPoints(points: number, thresholds = DEFAULT_TIER_THRESHOLDS): Tier {
  let tier: Tier = 'enemy';
  for (const t of TIERS) {
    if (points >= thresholds[t]) tier = t;
  }
  return tier;
}

export function tierIndex(tier: Tier): number {
  return TIERS.indexOf(tier);
}

export function phaseIndex(phase: Phase): number {
  return PHASES.indexOf(phase);
}

export function nextPhase(phase: Phase): { phase: Phase; newDay: boolean } {
  const i = phaseIndex(phase);
  if (i === PHASES.length - 1) return { phase: PHASES[0], newDay: true };
  return { phase: PHASES[i + 1]!, newDay: false };
}

export type CheckOutcome = 'crit_success' | 'success' | 'fail' | 'crit_fail';

export interface CheckResult {
  roll: number;
  total: number;
  dc: number;
  outcome: CheckOutcome;
}

/** d20 + stat + floor(luck/3) vs DC; natural 20 / 1 are critical. */
export function resolveCheck(d20: number, stat: number, luck: number, dc: number, bonus = 0): CheckResult {
  const total = d20 + stat + Math.floor(luck / 3) + bonus;
  let outcome: CheckOutcome;
  if (d20 === 20) outcome = 'crit_success';
  else if (d20 === 1) outcome = 'crit_fail';
  else outcome = total >= dc ? 'success' : 'fail';
  return { roll: d20, total, dc, outcome };
}

/** Level for an xp total given a cumulative curve (index = level - 1). */
export function levelForXp(xp: number, curve: readonly number[], cap: number): number {
  let level = 1;
  for (let i = 1; i < curve.length && i < cap; i += 1) {
    if (xp >= curve[i]!) level = i + 1;
  }
  return Math.min(level, cap);
}

/** Faith level for a faith point total. */
export function faithLevelFor(points: number, levels: readonly number[]): number {
  let level = 0;
  for (let i = 0; i < levels.length; i += 1) {
    if (points >= levels[i]!) level = i;
  }
  return level;
}
