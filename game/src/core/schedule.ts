import { mapEntities } from '@withergate/shared';
import { evaluate } from './conditions';
import type { Ctx } from './ctx';
import { phaseAbs, residents, villagerState } from './state';

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
  // travelling with you: not standing anywhere (decided J2)
  if (ctx.state.party.includes(id)) return null;
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

interface Place {
  id: string;
  x: number;
  y: number;
  facing: 'left' | 'right';
}

function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Where residents without an explicit Withergate schedule stand (decided H3):
 * at a free place near their workplace when they have one (the front of a built
 * slot, or the door of a fixed facility), at a random free place otherwise,
 * around the well in the evening, and home at night. No two residents share a
 * place, and the arrangement changes from day to day. Places are the map's NPC
 * spots, slot fronts and building doors; the ground near the square catches the
 * overflow.
 */
function residentPlacements(ctx: Ctx): Map<string, Placement | null> {
  const mapId = 'withergate';
  const out = new Map<string, Placement | null>();
  const map = ctx.content.maps[mapId];
  if (!map) return out;
  const ids = residents(ctx.state)
    .filter((id) => !ctx.content.villagers[id]?.profile.schedule?.withergate)
    .sort();
  const phase = ctx.state.time.phase;
  if (phase === 'night') {
    for (const id of ids) out.set(id, null);
    return out;
  }
  const places: Place[] = [];
  for (const s of mapEntities(map, 'npc_spot')) places.push({ id: s.id, x: s.x, y: s.y, facing: s.facing });
  for (const slot of mapEntities(map, 'facility_slot')) places.push({ id: `slot:${slot.id}`, x: slot.x + 60, y: slot.y, facing: 'left' });
  for (const e of mapEntities(map, 'interactable')) places.push({ id: `door:${e.id}`, x: e.x + e.w + 50, y: map.ground_y, facing: 'left' });
  const square = places.find((p) => p.id === 'square') ?? places[0];
  for (let k = 1; square && places.length < ids.length + 2; k += 1) {
    places.push({ id: `ground:${k}`, x: square.x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 90, y: map.ground_y, facing: 'left' });
  }
  const free = new Set(places.map((p) => p.id));
  // residents with a sheet of their own already stand somewhere; keep those places clear
  for (const id of residents(ctx.state)) {
    const table = ctx.content.villagers[id]?.profile.schedule?.withergate;
    const ref = table?.[phase];
    if (ref && ref.map === mapId && ref.spot) free.delete(ref.spot);
  }
  const anchorOf = (id: string): number | null => {
    const workplace = ctx.content.villagers[id]?.profile.recruit?.workplace;
    if (!workplace || workplace === 'none') return null;
    const slotId = Object.entries(ctx.state.town.slots).find(([, f]) => f === workplace)?.[0];
    if (slotId) return places.find((p) => p.id === `slot:${slotId}`)?.x ?? null;
    if (ctx.state.town.facilities.includes(workplace)) return places.find((p) => p.id.startsWith(`door:${workplace}`))?.x ?? null;
    return null;
  };
  const wellX = places.find((p) => p.id === 'well')?.x ?? null;
  // workers first, so the places next to their work are still free
  const ordered = [...ids].sort((a, b) => Number(anchorOf(a) === null) - Number(anchorOf(b) === null) || a.localeCompare(b));
  for (const id of ordered) {
    const open = places.filter((p) => free.has(p.id));
    if (!open.length) {
      out.set(id, null);
      continue;
    }
    const anchor = phase === 'evening' ? (wellX ?? anchorOf(id)) : anchorOf(id);
    const place =
      anchor === null
        ? open[hashOf(`${id}:${ctx.state.time.day}`) % open.length]!
        : open.reduce((best, p) => (Math.abs(p.x - anchor) < Math.abs(best.x - anchor) ? p : best), open[0]!);
    free.delete(place.id);
    out.set(id, { map: mapId, spot: place.id, facing: place.facing, x: place.x, y: place.y });
  }
  return out;
}

function residentPlacement(ctx: Ctx, id: string): Placement | null {
  return residentPlacements(ctx).get(id) ?? null;
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
