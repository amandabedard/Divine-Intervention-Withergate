import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadContent } from '@withergate/shared/node';
import type { ContentBundle } from '@withergate/shared';
import { evaluate } from './conditions';
import type { Ctx } from './ctx';
import { applyEffects, recruit } from './effects';
import {
  NODES_PER_SEGMENT,
  arrive,
  canStart,
  completeNode,
  currentNode,
  destinations,
  endExpeditionByDeath,
  generateExpedition,
  headHome,
  partyCandidates,
  pickEncounter,
  reachable,
  resolveCaravans,
  sendHaulHome,
  startExpedition,
  travelTo,
} from './expedition';
import { Rng } from './rng';
import { maxHp, newGame, villagerState } from './state';
import type { GameState } from './state';

const here = path.dirname(fileURLToPath(import.meta.url));
let content: ContentBundle;

function mk(state: GameState, seed = 11): Ctx {
  return { state, content, rng: new Rng(seed), notify: () => undefined, requests: [] };
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
function withAldric(state: GameState, ctx: Ctx): void {
  villagerState(state, content, 'aldric').friendship = 20;
  recruit(ctx, 'aldric');
}

beforeAll(async () => {
  const result = await loadContent({ root: path.resolve(here, '../../../content') });
  content = result.bundle;
  expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
});

describe('the map', () => {
  it('lays a route out as one segment per day, three nodes and a checkpoint each, fully connected', () => {
    const ctx = mk(start());
    const region = content.regions.east_road_route!;
    const exp = generateExpedition(ctx, region, 'out');
    expect(exp.columns).toHaveLength(region.days! * NODES_PER_SEGMENT);
    exp.columns.forEach((col, c) => {
      const checkpoint = c % NODES_PER_SEGMENT === NODES_PER_SEGMENT - 1;
      if (checkpoint) {
        expect(col).toHaveLength(1);
        expect(col[0]!.type).toBe('checkpoint');
        expect(col[0]!.final).toBe(c === exp.columns.length - 1);
      } else {
        expect(col.length).toBeGreaterThanOrEqual(2);
        expect(col.length).toBeLessThanOrEqual(4);
        for (const n of col) expect(['checkpoint', 'boss', 'settlement']).not.toContain(n.type);
      }
      if (c < exp.columns.length - 1) {
        const m = exp.columns[c + 1]!.length;
        const incoming = new Set<number>();
        for (const n of col) {
          expect(n.next.length).toBeGreaterThan(0);
          for (const j of n.next) {
            expect(j).toBeGreaterThanOrEqual(0);
            expect(j).toBeLessThan(m);
            incoming.add(j);
          }
        }
        expect(incoming.size).toBe(m);
      }
    });
    // the same seed gives the same road
    const again = generateExpedition(mk(start()), region, 'out');
    expect(again.columns.map((c) => c.map((n) => n.type))).toEqual(exp.columns.map((c) => c.map((n) => n.type)));
  });

  it('knows which roads leave from here and which lead back', () => {
    const state = start();
    const ctx = mk(state);
    const here = destinations(ctx).map((d) => `${d.region.id}:${d.direction}`);
    expect(here).toContain('east_road_route:out');
    expect(here).toContain('frontier:out');
    state.where.map = 'aboridge';
    expect(destinations(ctx).map((d) => `${d.region.id}:${d.direction}`)).toEqual(['east_road_route:back']);
  });
});

describe('the party', () => {
  it('lists residents with why they will not come', () => {
    const state = start();
    const ctx = mk(state);
    withAldric(state, ctx);
    expect(partyCandidates(ctx)).toMatchObject([{ id: 'aldric', willing: true }]);
    const v = villagerState(state, content, 'aldric');
    v.energy = 0;
    expect(partyCandidates(ctx)[0]).toMatchObject({ willing: false, reason: 'exhausted' });
    v.energy = 5;
    v.recoveryUntilDay = state.time.day + 3;
    expect(partyCandidates(ctx)[0]!.reason).toMatch(/recovering \(3 more days\)/);
    v.recoveryUntilDay = 0;
    v.friendship = -20;
    expect(partyCandidates(ctx)[0]!.reason).toMatch(/will not travel/);
    expect(canStart(ctx, 'east_road_route', ['aldric'])).toMatch(/cannot come/);
    expect(canStart(ctx, 'east_road_route', ['aldric', 'wren', 'messenger'])).toMatch(/At most/);
    expect(canStart(ctx, 'nowhere', [])).toMatch(/No such road/);
  });
});

describe('walking the road', () => {
  it('gathers into the haul, costs a phase and energy, and companions turn back when spent', () => {
    const state = start();
    const ctx = mk(state);
    withAldric(state, ctx);
    const exp = startExpedition(ctx, 'east_road_route', ['aldric']);
    expect(state.party).toEqual(['aldric']);
    expect(evaluate({ in_expedition: true, party_has: 'aldric', party_has_profession: 'warrior', party_size_max: 1 }, ctx)).toBe(true);
    // force the first node to be a wood gather so the outcome is known
    const first = exp.columns[0]![0]!;
    first.type = 'gather_wood';
    first.biome = 'forest';
    expect(reachable(exp)).toEqual(exp.columns[0]!.map((_, i) => i));
    const out = travelTo(ctx, 0);
    expect(out.kind).toBe('text');
    expect(exp.haul.wood).toBeGreaterThanOrEqual(2);
    expect(state.town.resources.wood).toBe(20); // nothing reaches home yet
    // effects on the road also go to the haul
    applyEffects({ resources: { herbs: 2 } }, ctx);
    expect(exp.haul.herbs).toBe(2);
    villagerState(state, content, 'aldric').energy = 1;
    const energy = state.player.energy;
    const done = completeNode(ctx);
    expect(state.time.phase).toBe('afternoon');
    expect(state.player.energy).toBe(energy - 1);
    expect(done.withdrawn).toEqual(['aldric']);
    expect(state.party).toEqual([]);
    expect(exp.withdrawn).toEqual(['aldric']);
    expect(done.checkpoint).toBe(false);
  });

  it('a camp sleeps to morning and restores, night costs double, and running out of energy heads home', () => {
    const state = start();
    const ctx = mk(state);
    const exp = startExpedition(ctx, 'east_road_route', []);
    const camp = exp.columns[0]![0]!;
    camp.type = 'rest';
    state.player.hp = 5;
    state.time.phase = 'evening';
    travelTo(ctx, 0);
    const done = completeNode(ctx);
    expect(done.rested).toBe(true);
    expect(state.time.day).toBe(2);
    expect(state.time.phase).toBe('morning');
    expect(state.player.hp).toBe(maxHp(state, content));
    // a night step in corrupted ground costs two energy
    const next = exp.columns[1]![exp.columns[0]![0]!.next[0]!]!;
    next.type = 'gather_herbs';
    next.biome = 'corrupted';
    state.time.phase = 'night';
    state.player.energy = 2;
    travelTo(ctx, exp.columns[0]![0]!.next[0]!);
    const spent = completeNode(ctx);
    expect(spent.exhausted).toBe(true); // dawn refills energy, but the night decided it
    const day = state.time.day;
    const home = headHome(ctx);
    expect(home.days).toBe(1);
    expect(state.time.day).toBe(day + 1);
    expect(state.expedition).toBeNull();
    expect(ctx.requests.some((r) => r.kind === 'teleport' && r.map === 'withergate')).toBe(true);
    expect(home.report.some((l) => /haul you carried/.test(l))).toBe(true);
  });

  it('picks encounters that fit the biome, the hour and the corruption', () => {
    const state = start();
    const ctx = mk(state);
    expect(pickEncounter(ctx, 'event', 'forest')?.id).toBe('lost_child');
    state.time.phase = 'night';
    expect(pickEncounter(ctx, 'event', 'forest')).toBeNull();
    state.time.phase = 'morning';
    state.world.corruption = 5;
    expect(pickEncounter(ctx, 'event', 'forest')).toBeNull();
  });

  it('battle nodes pick an enemy that appears here, and elites are marked', () => {
    const state = start();
    const ctx = mk(state);
    const exp = startExpedition(ctx, 'east_road_route', []);
    const node = exp.columns[0]![0]!;
    node.type = 'elite';
    node.biome = 'forest';
    state.time.phase = 'evening';
    const out = travelTo(ctx, 0);
    expect(out.kind).toBe('battle');
    if (out.kind === 'battle') {
      expect(['hollow_wolf', 'road_bandit']).toContain(out.enemy);
      expect(out.elite).toBe(true);
    }
  });
});

describe('checkpoints and the caravan', () => {
  function walkToCheckpoint(ctx: Ctx): void {
    const exp = ctx.state.expedition!;
    do {
      const rows = reachable(exp);
      const node = exp.columns[exp.col + 1]![rows[0]!]!;
      if (!node.checkpoint) node.type = 'gather_food';
      travelTo(ctx, rows[0]!);
      completeNode(ctx);
    } while (!currentNode(exp)?.checkpoint);
  }

  it('sends the haul home from a checkpoint and it arrives, whole or ambushed', () => {
    const state = start();
    const ctx = mk(state, 3);
    startExpedition(ctx, 'east_road_route', []);
    walkToCheckpoint(ctx);
    const exp = state.expedition!;
    expect(exp.atCheckpoint).toBe(true);
    const food = exp.haul.food ?? 0;
    expect(food).toBeGreaterThan(0);
    const caravan = sendHaulHome(ctx)!;
    expect(caravan).toMatchObject({ region: 'east_road_route', resources: { food } });
    expect(caravan.risk).toBeGreaterThanOrEqual(0.05);
    expect(caravan.risk).toBeLessThanOrEqual(0.9);
    expect(exp.haul).toEqual({});
    expect(sendHaulHome(ctx)).toBeNull();
    const before = state.town.resources.food;
    while (state.time.day < caravan.arrivesDay) {
      state.time.day += 1;
      resolveCaravans(ctx);
    }
    expect(state.caravans).toEqual([]);
    const notice = state.notices.find((n) => n.includes('caravan'));
    expect(notice).toBeTruthy();
    expect(state.town.resources.food).toBeGreaterThan(before);
    expect(state.town.resources.food).toBeLessThanOrEqual(before + food);
    if (notice!.includes('ambushed')) expect(state.town.resources.food).toBeLessThan(before + food);
  });

  it('a route ends at the town, with the haul carted home', () => {
    const state = start();
    const ctx = mk(state, 5);
    startExpedition(ctx, 'east_road_route', []);
    for (let seg = 0; seg < content.regions.east_road_route!.days!; seg += 1) walkToCheckpoint(ctx);
    const node = currentNode(state.expedition!)!;
    expect(node.final).toBe(true);
    const at = arrive(ctx);
    expect(at.map).toBe('aboridge');
    expect(state.expedition).toBeNull();
    expect(state.caravans).toHaveLength(1);
    expect(ctx.requests.some((r) => r.kind === 'teleport' && r.map === 'aboridge')).toBe(true);
  });

  it('dying on the road loses the haul', () => {
    const state = start();
    const ctx = mk(state);
    const exp = startExpedition(ctx, 'east_road_route', []);
    exp.haul.wood = 9;
    endExpeditionByDeath(ctx);
    expect(state.expedition).toBeNull();
    expect(state.notices.some((n) => n.includes('lost'))).toBe(true);
  });
});
