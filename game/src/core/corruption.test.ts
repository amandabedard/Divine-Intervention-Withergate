import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadContent } from '@withergate/shared/node';
import type { ContentBundle } from '@withergate/shared';
import { claimable, corruptionTick, dungeonAbandoned, dungeonFinished, dungeonStarted, idleDays, incursion } from './corruption';
import type { Ctx } from './ctx';
import { recruit } from './effects';
import { ascend, canAscend, deityTitle } from './ending';
import { arrive, completeNode, currentNode, headHome, reachable, startExpedition, travelTo } from './expedition';
import { Rng } from './rng';
import { newGame, villagerState } from './state';
import type { GameState } from './state';
import { sleepUntilMorning } from './time';

const here = path.dirname(fileURLToPath(import.meta.url));
let content: ContentBundle;

function mk(state: GameState, seed = 7): Ctx {
  return { state, content, rng: new Rng(seed), notify: () => undefined, requests: [] };
}
function start(): GameState {
  return newGame(content, {
    name: 'Test',
    form: 'masc',
    label: 'cool',
    stats: { charisma: 5, intelligence: 5, luck: 5, dexterity: 5, perception: 5 },
    seed: 9,
  });
}
const sleep = (ctx: Ctx, days = 1) => {
  for (let i = 0; i < days; i += 1) sleepUntilMorning(ctx);
};

beforeAll(async () => {
  const result = await loadContent({ root: path.resolve(here, '../../../content') });
  content = result.bundle;
  expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
});

describe('the corruption clock', () => {
  it('warns after a week idle, then takes someone unprotected three days later', () => {
    const state = start();
    const ctx = mk(state);
    const cfg = content.progression.corruption;
    expect(claimable(ctx)).toEqual(['aldric', 'wren']); // the messenger is protected
    sleep(ctx, cfg.warning_days);
    expect(idleDays(state)).toBe(cfg.warning_days);
    expect(state.world.clock.warnedDay).toBe(state.time.day);
    expect(state.notices).toContain(cfg.warning);
    state.notices = [];
    sleep(ctx, cfg.grace_days - 1);
    expect(state.world.clock.taken).toEqual([]);
    sleep(ctx);
    expect(state.world.clock.taken).toHaveLength(1);
    const taken = state.world.clock.taken[0]!;
    expect(villagerState(state, content, taken).gone).toBe(true);
    expect(state.notices.some((n) => n.includes('we lost') && n.includes(content.villagers[taken]!.profile.name))).toBe(true);
    // the cycle starts over
    expect(state.world.clock.warnedDay).toBeNull();
    expect(idleDays(state)).toBe(0);
  });

  it('residents are safe, and a corruption expedition pauses the clock and clears it when finished', () => {
    const state = start();
    const ctx = mk(state);
    villagerState(state, content, 'aldric').friendship = 20;
    recruit(ctx, 'aldric');
    expect(claimable(ctx)).toEqual(['wren']);
    sleep(ctx, 5);
    expect(state.world.clock.warnedDay).not.toBeNull();
    // setting out onto the frontier within the grace period: nobody is taken while it lasts
    startExpedition(ctx, 'frontier', []);
    expect(state.world.clock.inDungeon).toBe(true);
    expect(state.world.clock.startedSinceWarning).toBe(true);
    sleep(ctx, 5);
    expect(state.world.clock.taken).toEqual([]);
    expect(state.world.clock.pausedDays).toBe(5);
    expect(idleDays(state)).toBe(5);
    // walk to the end of the exploration
    const exp = state.expedition!;
    let guard = 0;
    while (!(currentNode(exp)?.final) && guard++ < 40) {
      const rows = reachable(exp);
      const node = exp.columns[exp.col + 1]![rows[0]!]!;
      if (!node.checkpoint) node.type = 'gather_ore';
      travelTo(ctx, rows[0]!);
      completeNode(ctx);
    }
    expect(currentNode(exp)!.final).toBe(true);
    arrive(ctx);
    expect(state.expedition).toBeNull();
    expect(state.world.clock).toMatchObject({ inDungeon: false, warnedDay: null, pausedDays: 0, startedSinceWarning: false });
    expect(state.world.clock.lastCleared).toBe(state.time.day);
    expect(state.notices).toContain(content.progression.corruption.cleared);
    expect(state.flags.expeditions_done).toBe(1);
  });

  it('turning back from a dungeon resumes the clock with a fresh grace', () => {
    const state = start();
    const ctx = mk(state);
    sleep(ctx, 5);
    startExpedition(ctx, 'frontier', []);
    const exp = state.expedition!;
    const first = exp.columns[0]![0]!;
    first.type = 'rest';
    travelTo(ctx, 0);
    completeNode(ctx);
    const dayTurnedBack = state.time.day;
    headHome(ctx);
    expect(state.world.clock.inDungeon).toBe(false);
    expect(state.world.clock.startedSinceWarning).toBe(false);
    expect(state.world.clock.warnedDay).toBe(dayTurnedBack); // the grace runs from the day you gave up
    dungeonStarted(ctx, content.regions.east_road_route); // plain roads do not count
    expect(state.world.clock.inDungeon).toBe(false);
    dungeonFinished(ctx, content.regions.east_road_route);
    dungeonAbandoned(ctx, content.regions.east_road_route);
    expect(state.world.clock.warnedDay).toBe(dayTurnedBack); // untouched by plain roads
  });

  it('spreads while idle and sends incursions the militia can hold', () => {
    const state = start();
    const ctx = mk(state);
    const cfg = content.progression.corruption;
    const before = state.world.corruption;
    // idle days accrue while nobody is taken: recruit everyone claimable first
    for (const id of ['aldric', 'wren']) {
      villagerState(state, content, id).friendship = 20;
      recruit(ctx, id);
    }
    state.town.facilities.push('farm');
    sleep(ctx, cfg.rise_every_days);
    expect(state.world.corruption).toBe(before + 1); // nobody left to take at day 9, so the corruption took ground
    expect(state.notices).toContain(cfg.spread);
    state.world.clock.lastRise = state.time.day - cfg.rise_every_days;
    sleep(ctx);
    expect(state.world.corruption).toBe(before + 2); // and it creeps on its own every rise_every_days
    // an incursion against an undefended town costs stores
    state.world.corruption = cfg.incursion_from + 2;
    state.town.resources.wood = 40;
    const hit = incursion(ctx);
    expect(hit.repelled).toBe(false);
    expect(state.town.resources.wood).toBe(34);
    state.town.facilities.push('barracks'); // +2 defence, plus Aldric the warrior
    state.world.corruption = cfg.incursion_from;
    const held = incursion(ctx);
    expect(held.repelled).toBe(true);
  });
});

describe('ascension', () => {
  it('names you from the two strongest axes and only when the shrine allows it', () => {
    const state = start();
    const ctx = mk(state);
    expect(canAscend(ctx)).toBe(content.ascension.not_yet);
    state.player.domainPoints.combat = 10;
    state.player.domainPoints.discovery = 6;
    state.player.domainPoints.friendship = 2;
    const t = deityTitle(ctx);
    expect(t.primary).toBe('combat');
    expect(t.secondary).toBe('discovery');
    expect(t.title).toBe(`Test ${content.ascension.titles.combat!.epithet}, God of ${content.ascension.titles.combat!.domain} and ${content.ascension.titles.discovery!.domain}`);
    state.player.domainPoints.discovery = 4; // less than half: a single domain
    expect(deityTitle(ctx).secondary).toBeNull();
    // meet the requirements: act 3 done, faith level 5, five residents (the sample roster is smaller, so relax residents)
    state.quests.main_act3 = { status: 'done', stage: 'placeholder', startedDay: 1 };
    state.player.faith = 999;
    for (const id of ['aldric', 'wren']) villagerState(state, content, id).resident = true;
    expect(canAscend(ctx)).toBe(content.ascension.not_yet);
    content.ascension.requires = { all: [{ quest: { id: 'main_act3', status: 'done' } }, { faith_level_min: 5 }, { residents_min: 2 }] };
    expect(canAscend(ctx)).toBeNull();
    const summary = ascend(ctx);
    expect(summary.residents).toBe(2);
    expect(state.ended?.title).toBe(summary.title);
  });
});
