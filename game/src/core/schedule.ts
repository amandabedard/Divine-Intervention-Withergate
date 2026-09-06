import { mapEntities } from '@withergate/shared';
import { evaluate } from './conditions';
import type { Ctx } from './ctx';
import { phaseAbs, villagerState } from './state';

export interface Placement {
  map: string;
  spot: string;
  facing: 'left' | 'right';
  x: number;
  y: number;
}

/** Where a character is right now, or null if they are unreachable this phase. */
export function whereIs(ctx: Ctx, id: string): Placement | null {
  const bundle = ctx.content.villagers[id];
  if (!bundle) return null;
  const v = villagerState(ctx.state, ctx.content, id);
  if (v.gone) return null;
  const profile = bundle.profile;
  const phase = ctx.state.time.phase;

  const override = ctx.state.scheduleOverrides[id];
  if (override && override.untilPhase > phaseAbs(ctx.state)) return resolve(ctx, override.map, override.spot);

  for (const o of profile.schedule?.overrides ?? []) {
    if (evaluate(o.when, { ...ctx, speaker: id })) {
      if (o.at.map === 'none') return null;
      return resolve(ctx, o.at.map, o.at.spot);
    }
  }

  const table = v.resident ? profile.schedule?.withergate ?? defaultResidentSchedule(ctx) : profile.schedule?.home;
  const ref = table?.[phase];
  if (!ref || ref.map === 'none') return null;
  return resolve(ctx, ref.map, ref.spot);
}

function defaultResidentSchedule(ctx: Ctx): Record<string, { map: string; spot?: string }> {
  const map = ctx.content.maps.withergate ? 'withergate' : Object.keys(ctx.content.maps)[0] ?? 'withergate';
  const spot = mapEntities(ctx.content.maps[map]!, 'npc_spot')[0]?.id;
  return { morning: { map, spot }, afternoon: { map, spot }, evening: { map, spot } };
}

function resolve(ctx: Ctx, map: string, spot: string | undefined): Placement | null {
  const m = ctx.content.maps[map];
  if (!m) return null;
  const spots = mapEntities(m, 'npc_spot');
  const s = (spot ? spots.find((e) => e.id === spot) : undefined) ?? spots[0];
  if (!s) return null;
  return { map, spot: s.id, facing: s.facing, x: s.x, y: s.y };
}

/** Every character standing on a given map this phase. */
export function charactersOn(ctx: Ctx, map: string): { id: string; at: Placement }[] {
  const out: { id: string; at: Placement }[] = [];
  for (const id of Object.keys(ctx.content.villagers)) {
    const at = whereIs(ctx, id);
    if (at && at.map === map) out.push({ id, at });
  }
  return out;
}
