import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadContent } from '@withergate/shared/node';
import type { ContentBundle } from '@withergate/shared';
import type { Ctx } from './ctx';
import { applyEffects } from './effects';
import { canStart, partyCandidates, startExpedition } from './expedition';
import { Rng } from './rng';
import { whereIs } from './schedule';
import { newGame, villagerState } from './state';
import type { GameState } from './state';
import { sleepUntilMorning } from './time';

const here = path.dirname(fileURLToPath(import.meta.url));
let content: ContentBundle;

function mk(state: GameState): Ctx {
  return { state, content, rng: new Rng(2), notify: () => undefined, requests: [] };
}
function start(): GameState {
  return newGame(content, {
    name: 'Test',
    form: 'fem',
    label: 'cool',
    stats: { charisma: 5, intelligence: 5, luck: 5, dexterity: 5, perception: 5 },
    seed: 9,
  });
}

beforeAll(async () => {
  const result = await loadContent({ root: path.resolve(here, '../../../content') });
  content = result.bundle;
  expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
});

describe('guests', () => {
  it('a guest travels with you without living in Withergate, and is nowhere else while on the road', () => {
    const state = start();
    const ctx = mk(state);
    expect(partyCandidates(ctx)).toEqual([]);
    applyEffects({ guest: 'aldric' }, ctx);
    expect(state.guests).toEqual(['aldric']);
    expect(state.party).toEqual(['aldric']);
    expect(villagerState(state, content, 'aldric').resident).toBe(false);
    expect(partyCandidates(ctx)).toMatchObject([{ id: 'aldric', willing: true }]);
    expect(canStart(ctx, 'east_road_route', ['aldric'])).toBeNull();
    // with you: not standing at his usual spot (decided J2)
    expect(whereIs(ctx, 'aldric')).toBeNull();
    state.party = [];
    expect(whereIs(ctx, 'aldric')).not.toBeNull();
    startExpedition(ctx, 'east_road_route', ['aldric']);
    expect(state.party).toEqual(['aldric']);
    applyEffects({ unguest: 'aldric' }, ctx);
    expect(state.guests).toEqual([]);
    expect(state.party).toEqual([]);
  });

  it('the opening flags gate Aldric: no recruit topic until you asked him, and he waits by the desk after the tour', () => {
    const state = start();
    const ctx = mk(state);
    villagerState(state, content, 'aldric').friendship = 20;
    const recruitReady = () => content.villagers.aldric!.profile.recruit!.requires;
    expect(recruitReady()).toMatchObject({ flags: ['aldric_asked'] });
    state.flags.tour_done = true;
    expect(whereIs(ctx, 'aldric')).toMatchObject({ map: 'withergate_quarters', spot: 'desk' });
    state.flags.aldric_quarters_talk = true;
    expect(whereIs(ctx, 'aldric')?.map).not.toBe('withergate_quarters');
  });

  it('the corruption taking someone flashes the screen', () => {
    const state = start();
    const ctx = mk(state);
    for (let d = 0; d < 8; d += 1) sleepUntilMorning(ctx);
    expect(state.world.clock.taken).toHaveLength(1);
    expect(ctx.requests.some((r) => r.kind === 'flash' && r.text === content.progression.corruption.flash)).toBe(true);
    expect(content.progression.corruption.flash).toContain('Duluma');
  });
});
