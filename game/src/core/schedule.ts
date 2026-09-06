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

  if (v.resident && !profile.schedule?.withergate) return residentPlacement(ctx, id);
  const table = v.resident ? profile.schedule?.withergate : profile.schedule?.home;
  const ref = table?.[phase];
  if (!ref || ref.map === 'none') return null;
  return resolve(ctx, ref.map, ref.spot);
}

/**
 * Where a resident without an explicit Withergate schedule stands: at their workplace while
 * it exists (a built slot, or the door of a fixed facility), the square otherwise, the well
 * in the evening, and home at night.
 */
function residentPlacement(ctx: Ctx, id: string): Placement | null {
  const mapId = 'withergate';
  const map = ctx.content.maps[mapId];
  if (!map) return null;
  const phase = ctx.state.time.phase;
  if (phase === 'night') return null;
  const spots = mapEntities(map, 'npc_spot');
  const spotByName = (name: string) => spots.find((s) => s.id === name);
  const at = (s: { id: string; x: number; y: number; facing: 'left' | 'right' } | undefined): Placement | null =>
    s ? { map: mapId, spot: s.id, facing: s.facing, x: s.x, y: s.y } : null;
  if (phase === 'evening') return at(spotByName('well') ?? spots[0]);
  const workplace = ctx.content.villagers[id]?.profile.recruit?.workplace;
  if (workplace && workplace !== 'none') {
    const slotId = Object.entries(ctx.state.town.slots).find(([, f]) => f === workplace)?.[0];
    const slot = slotId ? mapEntities(map, 'facility_slot').find((s) => s.id === slotId) : undefined;
    if (slot) return { map: mapId, spot: `slot:${slot.id}`, facing: 'left', x: slot.x + 60, y: slot.y };
    const door = map.entities.find((e) => (e.type === 'interactable' || e.type === 'exit') && e.id.startsWith(workplace));
    if (door && 'w' in door) return { map: mapId, spot: `door:${door.id}`, facing: 'left', x: door.x + door.w + 50, y: map.ground_y };
  }
  return at(spotByName('square') ?? spots[0]);
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
