import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadContent } from '@withergate/shared/node';
import { DAYS_PER_WEEK } from '@withergate/shared';
import type { ContentBundle } from '@withergate/shared';
import type { Ctx } from './ctx';
import { recruit } from './effects';
import { Rng } from './rng';
import { faithLevel, newGame, villagerState } from './state';
import type { GameState } from './state';
import { sleepUntilMorning } from './time';
import {
  baseValue,
  buyOffer,
  canBuild,
  canUnlockPower,
  craftables,
  doActivity,
  escortHome,
  freeSlots,
  recruitReadiness,
  residentStatus,
  satchelAdd,
  sell,
  startBuild,
  storeOffers,
  toggleEquip,
  unlockPower,
} from './town';

const here = path.dirname(fileURLToPath(import.meta.url));
let content: ContentBundle;

function mk(state: GameState): Ctx {
  return { state, content, rng: new Rng(5), notify: () => undefined, requests: [] };
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
const sleep = (ctx: Ctx, days = 1) => {
  for (let i = 0; i < days; i += 1) sleepUntilMorning(ctx);
};

beforeAll(async () => {
  const result = await loadContent({ root: path.resolve(here, '../../../content') });
  content = result.bundle;
  expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
});

describe('building', () => {
  it('spends resources, takes days, then opens the facility in its slot', () => {
    const state = start();
    const ctx = mk(state);
    expect(freeSlots(ctx)).toHaveLength(5);
    expect(canBuild(ctx, 'farm', 'slot_1')).toMatch(/Not enough/);
    state.town.resources.wood = 100;
    state.town.resources.gold = 200;
    expect(canBuild(ctx, 'farm', 'slot_1')).toBeNull();
    expect(startBuild(ctx, 'farm', 'slot_1')).toBe(true);
    expect(state.town.resources.wood).toBe(70);
    expect(state.town.buildQueue[0]).toMatchObject({ facility: 'farm', slot: 'slot_1', daysLeft: 2 });
    expect(canBuild(ctx, 'library', 'slot_1')).toMatch(/taken/);
    sleep(ctx, 2);
    expect(state.town.facilities).toContain('farm');
    expect(state.town.slots.slot_1).toBe('farm');
    expect(state.notices.some((n) => n.includes('Farm is finished'))).toBe(true);
    // the farm's income arrives the next morning
    const food = state.town.resources.food;
    sleep(ctx);
    expect(state.town.resources.food).toBe(food + 4);
  });
});

describe('residents', () => {
  it('a farmer needs a farm: readiness, warning, countdown, departure', () => {
    const state = start();
    const ctx = mk(state);
    villagerState(state, content, 'wren').friendship = 20;
    expect(recruitReadiness(ctx, 'wren')).toBe('not_ready');
    state.town.facilities.push('farm');
    state.town.slots.slot_2 = 'farm';
    expect(recruitReadiness(ctx, 'wren')).toBe('ready');
    recruit(ctx, 'wren');
    expect(residentStatus(ctx, 'wren').ok).toBe(true);
    // tear the farm down: warning, then three days, then gone
    state.town.facilities = state.town.facilities.filter((f) => f !== 'farm');
    delete state.town.slots.slot_2;
    sleep(ctx);
    const v = villagerState(state, content, 'wren');
    expect(v.unhappy).toMatchObject({ reason: 'not_facility', daysLeft: 3 });
    expect(state.notices.some((n) => n.includes('unhappy with your decisions'))).toBe(true);
    sleep(ctx, 2);
    expect(v.unhappy?.daysLeft).toBe(1);
    expect(v.resident).toBe(true);
    sleep(ctx);
    expect(v.gone).toBe(true);
    expect(v.resident).toBe(false);
    expect(state.notices.some((n) => n.includes('left Withergate for good'))).toBe(true);
    expect(recruitReadiness(ctx, 'wren')).toBe('gone');
  });

  it('rebuilding in time settles them again', () => {
    const state = start();
    const ctx = mk(state);
    villagerState(state, content, 'wren').friendship = 20;
    state.town.facilities.push('farm');
    recruit(ctx, 'wren');
    state.town.facilities = state.town.facilities.filter((f) => f !== 'farm');
    sleep(ctx);
    expect(villagerState(state, content, 'wren').unhappy).not.toBeNull();
    state.town.facilities.push('farm');
    sleep(ctx);
    expect(villagerState(state, content, 'wren').unhappy).toBeNull();
    expect(state.notices.some((n) => n.includes('settled again'))).toBe(true);
  });

  it('escorting home costs the route days and leaves them recruitable', () => {
    const state = start();
    const ctx = mk(state);
    villagerState(state, content, 'aldric').friendship = 20;
    recruit(ctx, 'aldric');
    const day = state.time.day;
    const days = escortHome(ctx, 'aldric');
    expect(days).toBe(2); // the east road route
    expect(state.time.day).toBe(day + 2);
    const v = villagerState(state, content, 'aldric');
    expect(v.resident).toBe(false);
    expect(v.gone).toBe(false);
    expect(recruitReadiness(ctx, 'aldric')).toBe('ready');
  });
});

describe('store and tavern', () => {
  it('stocks a weekly, resident-weighted shelf priced above the base value', () => {
    const state = start();
    const ctx = mk(state);
    state.town.resources.gold = 500;
    const offers = storeOffers(ctx);
    expect(offers).toHaveLength(content.economy.stock.offers);
    expect(new Set(offers.map((o) => o.item)).size).toBe(offers.length);
    for (const o of offers) {
      expect(o.price).toBeGreaterThan(baseValue(ctx, o.item));
      expect(o.qty).toBeGreaterThan(0);
    }
    // the same week shows the same shelves
    expect(storeOffers(ctx)).toBe(offers);
    // buying takes from the shelf at the posted price, and the shelf runs out
    const first = offers[0]!;
    const qty = first.qty;
    const gold = state.town.resources.gold;
    expect(buyOffer(ctx, 0, 2)).toBeNull();
    expect(state.town.resources.gold).toBe(gold - 2 * first.price);
    expect(first.qty).toBe(qty - 2);
    expect(buyOffer(ctx, 0, 999)).toBeNull();
    expect(first.qty).toBe(0);
    expect(buyOffer(ctx, 0, 1)).toMatch(/Sold out/);
    expect(buyOffer(ctx, 9, 1)).toMatch(/does not sell/);
    // selling pays the sell rate of the base value, never more
    state.town.resources.wood = 10;
    const before = state.town.resources.gold;
    expect(sell(ctx, 'wood', 10)).toBeNull();
    expect(state.town.resources.gold).toBe(before + Math.floor(10 * 3 * content.economy.sell_rate));
  });

  it('a resident who makes something tilts the shelves, and the shelves change every week', () => {
    const state = start();
    const ctx = mk(state);
    villagerState(state, content, 'wren').friendship = 20;
    state.town.facilities.push('farm');
    recruit(ctx, 'wren');
    const profile = content.villagers.wren!.profile;
    const saved = profile.store;
    profile.store = { food: 1000 };
    try {
      const week1 = storeOffers(ctx).map((o) => o.item);
      sleep(ctx, DAYS_PER_WEEK);
      expect(state.town.store?.week).toBe(2);
      expect(state.notices.some((n) => n.includes('new stock'))).toBe(true);
      const week2 = storeOffers(ctx);
      expect(week2.some((o) => o.item === 'food')).toBe(true);
      expect(week1.includes('food') && week2.map((o) => o.item).join() === week1.join()).toBe(false);
    } finally {
      profile.store = saved;
    }
  });

  it('a gathering costs the evening and warms every resident', () => {
    const state = start();
    const ctx = mk(state);
    villagerState(state, content, 'aldric').friendship = 20;
    recruit(ctx, 'aldric');
    state.time.phase = 'evening';
    const before = villagerState(state, content, 'aldric').friendship;
    const r = doActivity(ctx, 'gathering');
    expect(r.ok).toBe(true);
    expect(r.script).toBeTruthy();
    expect(villagerState(state, content, 'aldric').friendship).toBeGreaterThan(before);
    expect(state.time.phase).toBe('night');
    expect(doActivity(ctx, 'gathering').ok).toBe(false);
  });
});

describe('shrine and loadout', () => {
  it('unlocks powers with faith and skill points, respecting prerequisites and the equip limit', () => {
    const state = start();
    const ctx = mk(state);
    expect(canUnlockPower(ctx, 'smite')).toMatch(/faith level 1/);
    state.player.faith = 10;
    expect(faithLevel(state, content)).toBe(1);
    expect(canUnlockPower(ctx, 'smite')).toMatch(/skill point/);
    state.player.skillPoints = 3;
    expect(canUnlockPower(ctx, 'smite_ii')).toMatch(/faith level 2/);
    state.player.faith = 25; // level 2
    expect(canUnlockPower(ctx, 'smite_ii')).toMatch(/Needs Smite first/);
    expect(unlockPower(ctx, 'smite')).toBe(true);
    expect(state.player.equippedPowers).toContain('smite');
    expect(state.player.skillPoints).toBe(2);
    expect(canUnlockPower(ctx, 'smite_ii')).toBeNull();
    expect(state.player.domainPoints.combat).toBe(1); // unlocking feeds the axis, silently
    expect(toggleEquip(ctx, 'smite')).toBeNull();
    expect(state.player.equippedPowers).not.toContain('smite');
    expect(toggleEquip(ctx, 'wayfinding')).toMatch(/do not know/);
  });

  it('the satchel holds three gifts taken from storage', () => {
    const state = start();
    const ctx = mk(state);
    state.town.storage = { whetstone: 4 };
    expect(satchelAdd(ctx, 'whetstone')).toBeNull();
    expect(satchelAdd(ctx, 'whetstone')).toBeNull();
    expect(satchelAdd(ctx, 'whetstone')).toBeNull();
    expect(satchelAdd(ctx, 'whetstone')).toMatch(/holds 3/);
    expect(state.town.storage.whetstone).toBe(1);
    expect(craftables(ctx).length).toBeGreaterThanOrEqual(0);
  });
});
