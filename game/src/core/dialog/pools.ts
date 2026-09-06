import type { Effects, Pool, Step } from '@withergate/shared';
import { evaluate } from '../conditions';
import type { Ctx } from '../ctx';

export interface PickedLine {
  key: string;
  steps: Step[];
  effects?: Effects;
}

/** Pick one line from the pools whose conditions hold, avoiding recently used lines. */
export function pickLine(pools: Pool[], ctx: Ctx, recent: string[]): PickedLine | null {
  const candidates: { key: string; weight: number; steps: Step[]; effects?: Effects }[] = [];
  pools.forEach((pool, pi) => {
    if (!evaluate(pool.when, ctx)) return;
    pool.lines.forEach((steps, li) => {
      candidates.push({ key: `${pi}:${li}`, weight: pool.weight, steps, effects: pool.effects });
    });
  });
  if (!candidates.length) return null;
  const fresh = candidates.filter((c) => !recent.includes(c.key));
  const from = fresh.length ? fresh : candidates;
  const picked = ctx.rng.weighted(from, (c) => c.weight);
  return { key: picked.key, steps: picked.steps, effects: picked.effects };
}
