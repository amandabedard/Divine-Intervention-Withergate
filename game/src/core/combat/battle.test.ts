import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadContent } from '@withergate/shared/node';
import type { ContentBundle } from '@withergate/shared';
import type { Ctx } from '../ctx';
import { Rng } from '../rng';
import { maxEnergy, maxGrace, maxHp, newGame } from '../state';
import type { GameState } from '../state';
import { applyDefeat, canSpare, companionSkills, playerAct, startBattle } from './battle';
import type { BattleEvent } from './battle';

const here = path.dirname(fileURLToPath(import.meta.url));
let content: ContentBundle;

function mk(state: GameState, seed = 11): Ctx {
  return { state, content, rng: new Rng(seed), notify: () => undefined, requests: [] };
}

function start(): GameState {
  const s = newGame(content, {
    name: 'Test',
    form: 'fem',
    label: 'cool',
    stats: { charisma: 5, intelligence: 5, luck: 5, dexterity: 5, perception: 5 },
    seed: 3,
  });
  s.player.weaponId = 'woodaxe';
  s.player.powers = ['smite', 'mending_light'];
  s.player.equippedPowers = ['smite', 'mending_light'];
  return s;
}

const types = (events: BattleEvent[]) => events.map((e) => e.type);

beforeAll(async () => {
  const result = await loadContent({ root: path.resolve(here, '../../../../content') });
  content = result.bundle;
  expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
});

describe('battle flow', () => {
  it('starts, lets the faster wolf act first, then waits for input', () => {
    const state = start();
    const ctx = mk(state);
    const events = startBattle(ctx, 'hollow_wolf', 'debug');
    expect(events[0]).toEqual({ type: 'start', enemy: 'hollow_wolf' });
    expect(types(events)).toContain('round');
    expect(types(events)).toContain('enemy_move');
    expect(state.battle?.awaitingInput).toBe(true);
    expect(state.battle?.queue[0]).toBe('player');
  });

  it('attack damages the enemy using the weapon type multiplier', () => {
    const state = start();
    const ctx = mk(state);
    startBattle(ctx, 'hollow_wolf', 'debug');
    const hpBefore = state.battle!.enemyHp;
    const events = playerAct(ctx, { kind: 'attack' });
    const hit = events.find((e) => e.type === 'hit' && e.actor === 'player');
    expect(hit && hit.type === 'hit' ? hit.mult : 0).toBe(1.25);
    expect(state.battle!.enemyHp).toBeLessThan(hpBefore);
  });

  it('defend halves the next blow and restores grace', () => {
    const state = start();
    const ctx = mk(state);
    ctx.rng.chance = () => false; // no crits, no dodges
    ctx.rng.next = () => 0.5; // no variance
    ctx.rng.weighted = (items) => items[0]!; // wolf always bites
    startBattle(ctx, 'hollow_wolf', 'debug');
    state.player.hp = 100;
    state.player.grace = 5;
    const events = playerAct(ctx, { kind: 'defend' });
    expect(state.player.grace).toBeGreaterThanOrEqual(7);
    const hit = events.find((e) => e.type === 'hit' && e.target === 'player');
    expect(hit && hit.type === 'hit' ? hit.damage : 99).toBe(1); // 7 × 0.5 − 3 → clamped to 1
    expect(state.battle!.defending).toBe(false); // reset when the player's next turn starts
  });

  it('powers spend grace, heal, and win grants xp, loot and a combat point', () => {
    const state = start();
    const ctx = mk(state);
    state.player.hp = 100;
    startBattle(ctx, 'hollow_wolf', 'debug');
    const graceBefore = state.player.grace;
    playerAct(ctx, { kind: 'power', id: 'smite' });
    expect(state.player.grace).toBeLessThan(graceBefore);
    let guard = 0;
    while (state.battle && state.battle.phase === 'active' && guard < 40) {
      playerAct(ctx, { kind: 'attack' });
      guard += 1;
    }
    expect(state.battle?.phase).toBe('won');
    expect(state.player.xp).toBe(12);
    expect(state.town.resources.food).toBe(2);
    expect(state.player.domainPoints.combat).toBe(1);
  });

  it('bleed ticks on the enemy at the start of its action and expires', () => {
    const state = start();
    const ctx = mk(state);
    state.player.hp = 100;
    startBattle(ctx, 'hollow_wolf', 'debug');
    state.battle!.enemyStatuses.push({ id: 'bleed', turns: 1 });
    const hp = state.battle!.enemyHp;
    const events = playerAct(ctx, { kind: 'defend' });
    const tick = events.find((e) => e.type === 'status_tick');
    expect(tick).toBeTruthy();
    expect(types(events)).toContain('status_end');
    expect(state.battle!.enemyHp).toBeLessThanOrEqual(hp - 2);
  });

  it('a staggered enemy loses its action', () => {
    const state = start();
    const ctx = mk(state);
    state.player.hp = 100;
    startBattle(ctx, 'hollow_wolf', 'debug');
    state.battle!.enemyStatuses.push({ id: 'stagger', turns: 1 });
    const events = playerAct(ctx, { kind: 'defend' });
    expect(events.some((e) => e.type === 'skip' && e.target === 'enemy')).toBe(true);
    expect(events.some((e) => e.type === 'enemy_move')).toBe(false);
  });

  it('spare is offered under a quarter HP and ends the fight on a passed check', () => {
    const state = start();
    const ctx = mk(state);
    startBattle(ctx, 'hollow_wolf', 'debug');
    expect(canSpare(ctx)).toBe(false);
    state.battle!.enemyHp = 3;
    expect(canSpare(ctx)).toBe(true);
    ctx.rng.d20 = () => 15;
    const events = playerAct(ctx, { kind: 'spare' });
    expect(state.battle!.phase).toBe('spared');
    expect(state.player.xp).toBe(8);
    expect(state.player.tags).toContain('merciful');
    expect(types(events)).toContain('end');
  });

  it('flee fails while rooted', () => {
    const state = start();
    const ctx = mk(state);
    state.player.hp = 100;
    startBattle(ctx, 'hollow_wolf', 'debug');
    state.battle!.playerStatuses.push({ id: 'rooted', turns: 3 });
    const events = playerAct(ctx, { kind: 'flee' });
    const flee = events.find((e) => e.type === 'flee');
    expect(flee && flee.type === 'flee' ? flee.reason : undefined).toBe('rooted');
    expect(state.battle!.phase).toBe('active');
  });
});

describe('companions', () => {
  it('intercept a hit and offer their skill once', () => {
    const state = start();
    state.party = ['aldric'];
    const ctx = mk(state);
    ctx.rng.chance = () => false;
    ctx.rng.weighted = (items) => items[0]!;
    const events = startBattle(ctx, 'hollow_wolf', 'debug');
    expect(events.some((e) => e.type === 'intercept' && e.by === 'aldric')).toBe(true);
    expect(state.player.hp).toBe(maxHp(state, content));
    expect(companionSkills(ctx).map((s) => s.power.id)).toEqual(['shield_bash']);
    const after = playerAct(ctx, { kind: 'companion', villager: 'aldric', skill: 'shield_bash' });
    expect(after.some((e) => e.type === 'status' && e.status === 'stagger' && e.target === 'enemy')).toBe(true);
    expect(companionSkills(ctx)).toEqual([]);
  });
});

describe('defeat', () => {
  it('spends the party, skips a day and leaves you weakened in bed', () => {
    const state = start();
    state.party = ['aldric'];
    const ctx = mk(state);
    startBattle(ctx, 'hollow_wolf', 'debug');
    state.player.hp = 0;
    const day = state.time.day;
    applyDefeat(ctx);
    expect(state.battle).toBeNull();
    expect(state.party).toEqual([]);
    expect(state.villagers.aldric?.energy).toBe(0);
    expect(state.villagers.aldric?.recoveryUntilDay).toBe(day + 1 + 5);
    expect(state.time.day).toBe(day + 1);
    expect(state.time.phase).toBe('morning');
    expect(state.player.hp).toBe(Math.floor(maxHp(state, content) / 2));
    expect(state.player.energy).toBe(Math.floor(maxEnergy(state, content) / 2));
    expect(state.player.grace).toBeLessThanOrEqual(maxGrace(state, content));
    expect(ctx.requests.some((r) => r.kind === 'teleport' && r.map === 'withergate_quarters')).toBe(true);
  });
});
