import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadContent } from '@withergate/shared/node';
import type { ContentBundle } from '@withergate/shared';
import type { Ctx } from './ctx';
import { recruit } from './effects';
import { Rng } from './rng';
import { charactersOn, whereIs } from './schedule';
import { newGame, villagerState } from './state';
import type { GameState } from './state';

const here = path.dirname(fileURLToPath(import.meta.url));
let content: ContentBundle;

function mk(state: GameState): Ctx {
  return { state, content, rng: new Rng(3), notify: () => undefined, requests: [] };
}
function start(): GameState {
  return newGame(content, {
    name: 'Test',
    form: 'fem',
    label: 'cool',
    stats: { charisma: 5, intelligence: 5, luck: 5, dexterity: 5, perception: 5 },
    seed: 4,
  });
}

beforeAll(async () => {
  const result = await loadContent({ root: path.resolve(here, '../../../content') });
  content = result.bundle;
});

describe('resident placement', () => {
  it('puts workers next to their work, spreads the rest over free places, and gathers everyone at the well', () => {
    const state = start();
    const ctx = mk(state);
    for (const id of ['aldric', 'wren']) villagerState(state, content, id).friendship = 20;
    state.town.facilities.push('farm');
    state.town.slots.slot_2 = 'farm';
    recruit(ctx, 'wren');
    recruit(ctx, 'aldric');

    state.time.phase = 'morning';
    const wren = whereIs(ctx, 'wren')!;
    const aldric = whereIs(ctx, 'aldric')!;
    expect(wren.spot).toBe('slot:slot_2'); // the farm she works at
    expect(aldric.map).toBe('withergate'); // no barracks yet, so somewhere free in town
    expect(aldric.spot).not.toBe(wren.spot);
    expect(charactersOn(ctx, 'withergate').map((c) => c.id).sort()).toEqual(['aldric', 'wren']);

    // the same day gives the same arrangement; another day may shuffle the idle
    expect(whereIs(ctx, 'aldric')!.spot).toBe(aldric.spot);

    state.time.phase = 'evening';
    const spots = ['aldric', 'wren'].map((id) => whereIs(ctx, id)!);
    expect(spots.map((s) => s.spot)).toContain('well');
    expect(new Set(spots.map((s) => s.spot)).size).toBe(2);
    const well = content.maps.withergate!.entities.find((e) => e.type === 'npc_spot' && e.id === 'well') as { x: number };
    for (const s of spots) expect(Math.abs(s.x - well.x)).toBeLessThan(1200);

    state.time.phase = 'night';
    expect(whereIs(ctx, 'wren')).toBeNull();
  });
});
