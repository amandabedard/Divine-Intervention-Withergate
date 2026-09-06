import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadContent } from '@withergate/shared/node';
import type { ContentBundle } from '@withergate/shared';
import type { Ctx } from './ctx';
import { Interpreter } from './dialog/interpreter';
import { pickLine } from './dialog/pools';
import { changeFriendship, introduce, tierOf } from './relationships';
import { Rng } from './rng';
import { newGame, villagerState } from './state';
import type { GameState } from './state';
import { advancePhases, sleepUntilMorning } from './time';

const here = path.dirname(fileURLToPath(import.meta.url));
let content: ContentBundle;

function mk(state: GameState, speaker?: string): Ctx {
  return { state, content, rng: new Rng(42), speaker, notify: () => undefined, requests: [] };
}

function start(): GameState {
  return newGame(content, {
    name: 'Test',
    form: 'fem',
    label: 'cool',
    stats: { charisma: 5, intelligence: 5, luck: 5, dexterity: 5, perception: 5 },
    seed: 7,
  });
}

beforeAll(async () => {
  const result = await loadContent({ root: path.resolve(here, '../../../content') });
  content = result.bundle;
  expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
});

describe('relationships', () => {
  it('moves through tiers and notices romance interest', () => {
    const state = start();
    const ctx = mk(state, 'aldric');
    introduce(ctx, 'aldric');
    expect(tierOf(ctx, 'aldric')).toBe('stranger');
    changeFriendship(ctx, 'aldric', 12);
    expect(tierOf(ctx, 'aldric')).toBe('acquaintance');
    const v = villagerState(state, content, 'aldric');
    v.romance = 30;
    changeFriendship(ctx, 'aldric', 1);
    expect(v.romanceState).toBe('interest');
  });

  it('applies tag start bonuses on introduction', () => {
    const state = start();
    state.player.tags.push('scary');
    const ctx = mk(state, 'aldric');
    introduce(ctx, 'aldric');
    expect(villagerState(state, content, 'aldric').friendship).toBe(5);
  });
});

describe('dialog', () => {
  it('runs a topic, applies choice effects and sets flags', () => {
    const state = start();
    const ctx = mk(state, 'aldric');
    introduce(ctx, 'aldric');
    const topic = content.villagers.aldric!.discuss.find((t) => t.id === 'about_aboridge')!;
    const it = new Interpreter(ctx, topic.script, 'test');
    const first = it.next();
    expect(first.type).toBe('line');
    it.next();
    const choice = it.next();
    expect(choice.type).toBe('choice');
    if (choice.type !== 'choice') return;
    const out = it.choose(choice.options[0]!.index);
    expect(out?.type).toBe('line');
    expect(villagerState(state, content, 'aldric').friendship).toBe(5);
    expect(villagerState(state, content, 'aldric').romance).toBe(2);
    // drain
    let guard = 0;
    let o = it.next();
    while (o.type !== 'done' && guard < 20) {
      o = it.next();
      guard += 1;
    }
    expect(state.flags.aldric_walls_asked).toBe(true);
  });

  it('picks chat lines by tier', () => {
    const state = start();
    const ctx = mk(state, 'aldric');
    const pools = content.villagers.aldric!.chat;
    const stranger = pickLine(pools, ctx, []);
    expect(stranger).not.toBeNull();
    villagerState(state, content, 'aldric').friendship = 50;
    const friend = pickLine(pools, ctx, []);
    expect(friend).not.toBeNull();
  });
});

describe('time', () => {
  it('advances phases and days, refilling player energy', () => {
    const state = start();
    const ctx = mk(state);
    state.player.energy = 2;
    advancePhases(ctx, 4);
    expect(state.time.day).toBe(2);
    expect(state.time.phase).toBe('morning');
    expect(state.player.energy).toBe(content.progression.energy.player_max);
    advancePhases(ctx, 1);
    sleepUntilMorning(ctx);
    expect(state.time.day).toBe(3);
    expect(state.time.phase).toBe('morning');
  });
});
