// Withergate: facilities, residents, the store, the tavern, the shrine and crafting.
// Pure state + rules; the session wires them to panels. See docs/design/gdd.md §9.
import { DAYS_PER_WEEK, FIXED_FACILITIES, RESOURCES, mapEntities, tierForPoints } from '@withergate/shared';
import type { Condition, Facility, Resource, Script, TavernActivity, Tier } from '@withergate/shared';
import { evaluate } from './conditions';
import type { Ctx } from './ctx';
import type { StoreOffer } from './state';
import { applyEffects } from './effects';
import { TIER_LABELS } from './relationships';
import { faithLevel, residents, townBonuses, villagerState } from './state';
import { advancePhases } from './time';

export const MAX_RESIDENTS = 10;
export const MAX_EQUIPPED_POWERS = 4;
export const SATCHEL_SIZE = 3;
export const UNHAPPY_DAYS = 3;
export const DEFAULT_ROUTE_DAYS = 2;

// --- resident benefits -------------------------------------------------------

export interface ResidentTotals {
  resource_income: Partial<Record<Resource, number>>;
  /** Percent discount on building costs, per resource ('all' applies to every resource). */
  build_discount: Partial<Record<Resource | 'all', number>>;
  build_speed: number;
  store_rates: number;
  energy_max: number;
  relationship_gain: number;
  caravan_safety: number;
  tavern_quality: number;
  actions: string[];
}

/** Sum of residents' town benefits. Friends and best friends give 25% more (proposed). */
export function residentTotals(ctx: Ctx): ResidentTotals {
  const t: ResidentTotals = {
    resource_income: {},
    build_discount: {},
    build_speed: 0,
    store_rates: 0,
    energy_max: 0,
    relationship_gain: 0,
    caravan_safety: 0,
    tavern_quality: 0,
    actions: [],
  };
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  for (const id of residents(ctx.state)) {
    const profile = ctx.content.villagers[id]?.profile;
    if (!profile) continue;
    const tier: Tier = tierForPoints(villagerState(ctx.state, ctx.content, id).friendship);
    const mult = tier === 'friend' || tier === 'best_friend' ? 1.25 : 1;
    for (const b of profile.benefits?.town ?? []) {
      switch (b.type) {
        case 'resource_income': {
          const r = b.resource as Resource;
          t.resource_income[r] = (t.resource_income[r] ?? 0) + num(b.amount) * mult;
          break;
        }
        case 'build_discount': {
          const key = (typeof b.resource === 'string' ? b.resource : 'all') as Resource | 'all';
          t.build_discount[key] = (t.build_discount[key] ?? 0) + num(b.percent);
          break;
        }
        case 'build_speed': t.build_speed += num(b.days); break;
        case 'store_rates': t.store_rates += num(b.percent); break;
        case 'energy_max': t.energy_max += num(b.amount); break;
        case 'relationship_gain': t.relationship_gain += num(b.percent); break;
        case 'caravan_safety': t.caravan_safety += num(b.percent); break;
        case 'tavern_quality': t.tavern_quality += num(b.amount); break;
        case 'unlock_action': if (typeof b.action === 'string') t.actions.push(b.action); break;
        default: break;
      }
    }
  }
  return t;
}

/** Add the day's income from facilities and residents to the stores. Returns what came in. */
export function dailyIncome(ctx: Ctx): Partial<Record<Resource, number>> {
  const income: Partial<Record<Resource, number>> = {};
  const add = (r: Resource, n: number) => {
    if (n <= 0) return;
    income[r] = (income[r] ?? 0) + n;
  };
  for (const [r, n] of Object.entries(townBonuses(ctx.state, ctx.content).resource_income)) add(r as Resource, n ?? 0);
  for (const [r, n] of Object.entries(residentTotals(ctx).resource_income)) add(r as Resource, n ?? 0);
  const parts: string[] = [];
  for (const [r, n] of Object.entries(income)) {
    const whole = Math.round(n ?? 0);
    if (whole <= 0) continue;
    ctx.state.town.resources[r as Resource] += whole;
    income[r as Resource] = whole;
    parts.push(`+${whole} ${r}`);
  }
  if (parts.length) ctx.state.notices.push(`Withergate's stores grew overnight: ${parts.join(', ')}.`);
  return income;
}

// --- facilities --------------------------------------------------------------

export function slotIds(ctx: Ctx): string[] {
  const m = ctx.content.maps.withergate;
  return m ? mapEntities(m, 'facility_slot').map((s) => s.id) : [];
}

export function freeSlots(ctx: Ctx): string[] {
  const taken = new Set([...Object.keys(ctx.state.town.slots), ...ctx.state.town.buildQueue.map((b) => b.slot)]);
  return slotIds(ctx).filter((id) => !taken.has(id));
}

export function optionalFacilities(ctx: Ctx): Facility[] {
  return Object.values(ctx.content.facilities).filter((f) => !f.fixed && !(FIXED_FACILITIES as readonly string[]).includes(f.id));
}

export function buildCost(ctx: Ctx, facilityId: string): Partial<Record<Resource, number>> {
  const f = ctx.content.facilities[facilityId];
  if (!f) return {};
  const disc = residentTotals(ctx).build_discount;
  const out: Partial<Record<Resource, number>> = {};
  for (const [r, n] of Object.entries(f.cost)) {
    const pct = (disc[r as Resource] ?? 0) + (disc.all ?? 0);
    out[r as Resource] = Math.max(0, Math.ceil((n ?? 0) * (1 - Math.min(90, pct) / 100)));
  }
  return out;
}

export function buildDays(ctx: Ctx, facilityId: string): number {
  const f = ctx.content.facilities[facilityId];
  if (!f) return 1;
  return Math.max(1, f.build_days - residentTotals(ctx).build_speed);
}

export function missingResources(ctx: Ctx, cost: Partial<Record<Resource, number>>): string[] {
  const out: string[] = [];
  for (const [r, n] of Object.entries(cost)) {
    const have = ctx.state.town.resources[r as Resource] ?? 0;
    if (have < (n ?? 0)) out.push(`${(n ?? 0) - have} more ${r}`);
  }
  return out;
}

/** Why a facility cannot be built in a slot right now, or null. */
export function canBuild(ctx: Ctx, facilityId: string, slot: string): string | null {
  const f = ctx.content.facilities[facilityId];
  if (!f) return 'Unknown facility.';
  if (f.fixed) return `${f.name} is already part of Withergate.`;
  if (ctx.state.town.facilities.includes(facilityId)) return `${f.name} is already built.`;
  if (ctx.state.town.buildQueue.some((b) => b.facility === facilityId)) return `${f.name} is already being built.`;
  if (!slotIds(ctx).includes(slot)) return 'That is not a build slot.';
  if (!freeSlots(ctx).includes(slot)) return 'That slot is taken.';
  const missing = missingResources(ctx, buildCost(ctx, facilityId));
  if (missing.length) return `Not enough resources: ${missing.join(', ')}.`;
  return null;
}

export function startBuild(ctx: Ctx, facilityId: string, slot: string): boolean {
  if (canBuild(ctx, facilityId, slot)) return false;
  const cost = buildCost(ctx, facilityId);
  for (const [r, n] of Object.entries(cost)) ctx.state.town.resources[r as Resource] -= n ?? 0;
  const days = buildDays(ctx, facilityId);
  ctx.state.town.buildQueue.push({ facility: facilityId, slot, daysLeft: days });
  const name = ctx.content.facilities[facilityId]?.name ?? facilityId;
  ctx.notify(`${name} will be ready in ${days} day${days === 1 ? '' : 's'}.`);
  ctx.requests.push({ kind: 'town_changed' });
  return true;
}

/** Advance construction by a day; completed facilities open. Called from the daily tick. */
export function completeBuilds(ctx: Ctx): void {
  const s = ctx.state;
  for (const build of [...s.town.buildQueue]) {
    build.daysLeft -= 1;
    if (build.daysLeft > 0) continue;
    s.town.buildQueue = s.town.buildQueue.filter((b) => b !== build);
    if (!s.town.facilities.includes(build.facility)) s.town.facilities.push(build.facility);
    if (build.slot) s.town.slots[build.slot] = build.facility;
    const name = ctx.content.facilities[build.facility]?.name ?? build.facility;
    s.notices.push(`${name} is finished.`);
    ctx.requests.push({ kind: 'town_changed' });
  }
}

export function demolish(ctx: Ctx, facilityId: string): boolean {
  const f = ctx.content.facilities[facilityId];
  if (!f || f.fixed || !ctx.state.town.facilities.includes(facilityId)) return false;
  ctx.state.town.facilities = ctx.state.town.facilities.filter((id) => id !== facilityId);
  for (const [slot, id] of Object.entries(ctx.state.town.slots)) if (id === facilityId) delete ctx.state.town.slots[slot];
  ctx.notify(`${f.name} has been torn down.`);
  ctx.requests.push({ kind: 'town_changed' });
  return true;
}

export interface FacilityInfo {
  facility: Facility;
  built: boolean;
  slot: string | null;
  daysLeft: number | null;
  workers: string[];
}

export function facilityInfo(ctx: Ctx, facilityId: string): FacilityInfo | null {
  const facility = ctx.content.facilities[facilityId];
  if (!facility) return null;
  const slot = Object.entries(ctx.state.town.slots).find(([, id]) => id === facilityId)?.[0] ?? null;
  const queued = ctx.state.town.buildQueue.find((b) => b.facility === facilityId);
  const workers = residents(ctx.state).filter((id) => ctx.content.villagers[id]?.profile.recruit?.workplace === facilityId);
  return { facility, built: ctx.state.town.facilities.includes(facilityId), slot, daysLeft: queued?.daysLeft ?? null, workers };
}

// --- residents ---------------------------------------------------------------

export interface ResidentStatus {
  ok: boolean;
  reasons: { kind: string; text: string }[];
}

/** Which of a resident's leave conditions currently hold. */
export function residentStatus(ctx: Ctx, id: string): ResidentStatus {
  const profile = ctx.content.villagers[id]?.profile;
  const reasons: { kind: string; text: string }[] = [];
  for (const c of profile?.recruit?.leaves_if ?? []) {
    if (!evaluate(c, { ...ctx, speaker: id })) continue;
    const key = Object.keys(c)[0] ?? 'conditions';
    reasons.push({ kind: key === 'domain_lean' ? 'domain' : key, text: describeLeaveCondition(ctx, c) });
  }
  return { ok: reasons.length === 0, reasons };
}

function describeLeaveCondition(ctx: Ctx, c: Condition): string {
  const nameOf = (id: string) => ctx.content.villagers[id]?.profile.name ?? id;
  const facilityName = (id: string) => ctx.content.facilities[id]?.name ?? id;
  if (c.not_facility) return `needs a ${facilityName(c.not_facility)} to work at`;
  if (c.facility) return `will not live near the ${facilityName(c.facility)}`;
  if (c.villager_in_town) return `will not live alongside ${nameOf(c.villager_in_town)}`;
  if (c.villager_not_in_town) return `needs ${nameOf(c.villager_not_in_town)} here`;
  if (c.tier) return 'feels treated badly (the friendship has sunk too low)';
  if (c.domain_lean) return 'does not like where your deeds are leading';
  if (c.flags || c.not_flags) return 'something has changed';
  return 'conditions are no longer met';
}

/** Daily: warn unhappy residents, count down, and remove those who give up. Pushes notices. */
export function checkResidents(ctx: Ctx): void {
  const s = ctx.state;
  for (const id of residents(s)) {
    const v = villagerState(s, ctx.content, id);
    const name = ctx.content.villagers[id]?.profile.name ?? id;
    const status = residentStatus(ctx, id);
    if (status.reasons.length) {
      const first = status.reasons[0]!;
      if (!v.unhappy) {
        v.unhappy = { reason: first.kind, daysLeft: UNHAPPY_DAYS };
        s.notices.push(
          `A messenger finds you at first light. "${name} is unhappy with your decisions. You have ${UNHAPPY_DAYS} days until they leave town forever." (${name} ${first.text}.)`,
        );
      } else {
        v.unhappy.reason = first.kind;
        v.unhappy.daysLeft -= 1;
        if (v.unhappy.daysLeft <= 0) {
          v.gone = true;
          v.resident = false;
          v.unhappy = null;
          s.party = s.party.filter((p) => p !== id);
          s.notices.push(`${name} has left Withergate for good.`);
          ctx.requests.push({ kind: 'npc_refresh' });
        } else {
          s.notices.push(`${name} will leave in ${v.unhappy.daysLeft} day${v.unhappy.daysLeft === 1 ? '' : 's'} unless something changes (${first.text}).`);
        }
      }
    } else if (v.unhappy) {
      v.unhappy = null;
      s.notices.push(`${name} seems settled again.`);
    }
  }
}

/** Days it takes to walk a character to their home town (a route from Withergate, else a default). */
export function routeDays(ctx: Ctx, town: string): number {
  const route = Object.values(ctx.content.regions).find((r) => r.kind === 'route' && r.from === 'withergate' && r.to === town);
  return route?.days ?? DEFAULT_ROUTE_DAYS;
}

/** Escort a resident home (decided F3): costs the route's days, as if they were never recruited. */
export function escortHome(ctx: Ctx, id: string): number {
  const v = villagerState(ctx.state, ctx.content, id);
  const profile = ctx.content.villagers[id]?.profile;
  if (!profile || !v.resident) return 0;
  const days = routeDays(ctx, profile.home_town);
  v.resident = false;
  v.unhappy = null;
  ctx.state.party = ctx.state.party.filter((p) => p !== id);
  ctx.notify(`You walk ${profile.name} home. ${days} day${days === 1 ? '' : 's'} pass.`);
  advancePhases(ctx, days * 4);
  ctx.requests.push({ kind: 'npc_refresh' });
  return days;
}

export type RecruitReadiness = 'resident' | 'gone' | 'ready' | 'not_ready' | 'closed' | 'full' | 'not_recruitable';

export function recruitReadiness(ctx: Ctx, id: string): RecruitReadiness {
  const profile = ctx.content.villagers[id]?.profile;
  if (!profile?.recruit) return 'not_recruitable';
  const v = villagerState(ctx.state, ctx.content, id);
  if (v.gone) return 'gone';
  if (v.resident) return 'resident';
  if (profile.recruit.method.kind === 'chance' && v.recruitAttempts >= profile.recruit.method.max_attempts) return 'closed';
  if (residents(ctx.state).length >= MAX_RESIDENTS) return 'full';
  return evaluate(profile.recruit.requires, { ...ctx, speaker: id }) ? 'ready' : 'not_ready';
}

// --- general store -----------------------------------------------------------

/** Multiplier on buy prices after Bazaar and Socialite bonuses. */
export function storeRateMod(ctx: Ctx): number {
  const pct = townBonuses(ctx.state, ctx.content).store_rates + residentTotals(ctx).store_rates;
  return Math.max(0.5, 1 - pct / 100);
}

export const weekOf = (day: number): number => Math.floor((day - 1) / DAYS_PER_WEEK) + 1;

const isResource = (item: string): item is Resource => (RESOURCES as readonly string[]).includes(item);

/** Base value of a resource or gift item in gold; 0 if the store never deals in it. */
export function baseValue(ctx: Ctx, item: string): number {
  const eco = ctx.content.economy;
  return (isResource(item) ? eco.prices[item] : eco.gifts[item]) ?? 0;
}

/** Everything the store could put on its shelves, weighted by economy.yaml and by who lives here. */
function storeCatalogue(ctx: Ctx): { item: string; weight: number }[] {
  const eco = ctx.content.economy;
  const weights: Record<string, number> = {};
  for (const r of RESOURCES) if (r !== 'gold' && eco.prices[r]) weights[r] = eco.stock.weights[r] ?? 1;
  for (const g of Object.keys(eco.gifts)) weights[g] = eco.stock.weights[g] ?? 1;
  for (const id of residents(ctx.state)) {
    for (const [item, w] of Object.entries(ctx.content.villagers[id]?.profile.store ?? {})) {
      if (!baseValue(ctx, item)) continue;
      weights[item] = (weights[item] ?? 0) + w;
    }
  }
  return Object.entries(weights)
    .filter(([, w]) => w > 0)
    .map(([item, weight]) => ({ item, weight }));
}

/**
 * Roll this week's shelves (decided H2): a handful of different things, drawn by
 * weight, each priced at the base value times a random weekly markup. Bazaar and
 * Socialite discounts soften the markup but the store never sells below value.
 */
export function rollStore(ctx: Ctx): void {
  const eco = ctx.content.economy;
  const pool = storeCatalogue(ctx);
  const rate = storeRateMod(ctx);
  const [lo, hi] = eco.stock.markup;
  const offers: StoreOffer[] = [];
  for (let i = 0; i < eco.stock.offers && pool.length; i += 1) {
    const pick = ctx.rng.weighted(pool, (p) => p.weight);
    pool.splice(pool.indexOf(pick), 1);
    const base = baseValue(ctx, pick.item);
    const markup = lo + ctx.rng.next() * (hi - lo);
    const price = Math.max(Math.ceil(base * 1.05), Math.ceil(base * markup * rate));
    const qty = isResource(pick.item) ? (eco.stock.units[pick.item] ?? eco.stock.units.default ?? 10) : ctx.rng.int(1, 2);
    offers.push({ item: pick.item, qty, price });
  }
  ctx.state.town.store = { week: weekOf(ctx.state.time.day), offers };
}

/** This week's offers, rolled on first sight of a new week. */
export function storeOffers(ctx: Ctx): StoreOffer[] {
  const store = ctx.state.town.store;
  if (!store || store.week !== weekOf(ctx.state.time.day)) rollStore(ctx);
  return ctx.state.town.store!.offers;
}

/** Buy up to n of an offer; resources go to the town's stocks, gifts to storage. */
export function buyOffer(ctx: Ctx, index: number, n: number): string | null {
  const offer = storeOffers(ctx)[index];
  if (!offer) return 'The store does not sell that.';
  if (offer.qty <= 0) return 'Sold out until next week.';
  const count = Math.max(1, Math.min(n, offer.qty));
  const cost = offer.price * count;
  if (ctx.state.town.resources.gold < cost) return `Not enough gold (${cost} needed).`;
  ctx.state.town.resources.gold -= cost;
  offer.qty -= count;
  if (isResource(offer.item)) ctx.state.town.resources[offer.item] += count;
  else ctx.state.town.storage[offer.item] = (ctx.state.town.storage[offer.item] ?? 0) + count;
  return null;
}

export function sellPrice(ctx: Ctx, resource: Resource, n = 1): number {
  const price = ctx.content.economy.prices[resource] ?? 0;
  return Math.floor(price * ctx.content.economy.sell_rate * n);
}
export function sell(ctx: Ctx, resource: Resource, n: number): string | null {
  if (resource === 'gold') return 'You cannot sell gold.';
  if ((ctx.state.town.resources[resource] ?? 0) < n) return `You do not have ${n} ${resource}.`;
  ctx.state.town.resources[resource] -= n;
  ctx.state.town.resources.gold += sellPrice(ctx, resource, n);
  return null;
}

// --- tavern --------------------------------------------------------------------

export function tavernActivities(ctx: Ctx): { activity: TavernActivity; blocked: string | null }[] {
  return ctx.content.tavern.map((activity) => {
    let blocked: string | null = null;
    if (activity.once_per_day && ctx.state.flags[`tavern:${activity.id}`] === ctx.state.time.day) blocked = 'Already today';
    else if (activity.requires && !evaluate(activity.requires, ctx)) blocked = 'Not now';
    else if (ctx.state.town.resources.gold < activity.gold) blocked = `Needs ${activity.gold} gold`;
    return { activity, blocked };
  });
}

export function doActivity(ctx: Ctx, id: string): { ok: boolean; reason?: string; script?: Script } {
  const entry = tavernActivities(ctx).find((a) => a.activity.id === id);
  if (!entry) return { ok: false, reason: 'Unknown activity.' };
  if (entry.blocked) return { ok: false, reason: `${entry.blocked}.` };
  const a = entry.activity;
  ctx.state.town.resources.gold -= a.gold;
  if (a.once_per_day) ctx.state.flags[`tavern:${a.id}`] = ctx.state.time.day;
  if (a.effects) applyEffects(a.effects, ctx);
  if (a.cost === 'phase') advancePhases(ctx, 1);
  return { ok: true, script: a.script };
}

// --- shrine (powers) -----------------------------------------------------------

export function canUnlockPower(ctx: Ctx, id: string): string | null {
  const power = ctx.content.powers[id];
  const p = ctx.state.player;
  if (!power) return 'Unknown power.';
  if (p.powers.includes(id)) return 'Already understood.';
  const level = faithLevel(ctx.state, ctx.content);
  if (level < power.tier) return `Needs faith level ${power.tier}.`;
  const missing = power.requires.filter((r) => !p.powers.includes(r)).map((r) => ctx.content.powers[r]?.name ?? r);
  if (missing.length) return `Needs ${missing.join(', ')} first.`;
  if (p.skillPoints < power.points) return `Needs ${power.points} skill point${power.points === 1 ? '' : 's'} (${p.skillPoints} spare).`;
  return null;
}

export function unlockPower(ctx: Ctx, id: string): boolean {
  if (canUnlockPower(ctx, id)) return false;
  const power = ctx.content.powers[id]!;
  const p = ctx.state.player;
  p.powers.push(id);
  p.skillPoints -= power.points;
  if (power.domain) p.domainPoints[power.domain] += 1;
  if (power.kind === 'combat' && p.equippedPowers.length < MAX_EQUIPPED_POWERS) p.equippedPowers.push(id);
  ctx.notify(`You understand ${power.name}.`);
  return true;
}

export function toggleEquip(ctx: Ctx, id: string): string | null {
  const power = ctx.content.powers[id];
  const p = ctx.state.player;
  if (!power || !p.powers.includes(id)) return 'You do not know that power.';
  if (power.kind !== 'combat') return 'That power is always with you.';
  if (p.equippedPowers.includes(id)) {
    p.equippedPowers = p.equippedPowers.filter((x) => x !== id);
    return null;
  }
  if (p.equippedPowers.length >= MAX_EQUIPPED_POWERS) return `You can hold only ${MAX_EQUIPPED_POWERS} powers at once.`;
  p.equippedPowers.push(id);
  return null;
}

// --- loadout -------------------------------------------------------------------

export function equipWeapon(ctx: Ctx, id: string | null): string | null {
  if (id !== null && !ctx.state.player.weapons.includes(id)) return 'You do not own that weapon.';
  ctx.state.player.weaponId = id;
  return null;
}

export function satchelAdd(ctx: Ctx, item: string): string | null {
  const s = ctx.state;
  if (s.player.satchel.length >= SATCHEL_SIZE) return `The satchel holds ${SATCHEL_SIZE} gifts.`;
  if ((s.town.storage[item] ?? 0) <= 0) return 'None in storage.';
  if (ctx.content.items[item]?.kind !== 'gift') return 'Only gifts go in the satchel.';
  s.town.storage[item] -= 1;
  if (s.town.storage[item]! <= 0) delete s.town.storage[item];
  s.player.satchel.push(item);
  return null;
}

export function satchelRemove(ctx: Ctx, index: number): void {
  const s = ctx.state;
  const [item] = s.player.satchel.splice(index, 1);
  if (item) s.town.storage[item] = (s.town.storage[item] ?? 0) + 1;
}

// --- crafting ------------------------------------------------------------------

export interface Craftable {
  kind: 'weapon' | 'item';
  id: string;
  name: string;
  facility: string;
  cost: Partial<Record<Resource, number>>;
  blocked: string | null;
}

export function craftables(ctx: Ctx, facility?: string): Craftable[] {
  const out: Craftable[] = [];
  const built = (f: string) => ctx.state.town.facilities.includes(f);
  for (const w of Object.values(ctx.content.weapons)) {
    const c = w.source?.craft;
    if (!c || (facility && c.facility !== facility)) continue;
    const missing = missingResources(ctx, c.cost);
    const blocked = ctx.state.player.weapons.includes(w.id)
      ? 'Already own one'
      : !built(c.facility)
        ? `Needs the ${ctx.content.facilities[c.facility]?.name ?? c.facility}`
        : missing.length
          ? `Needs ${missing.join(', ')}`
          : null;
    out.push({ kind: 'weapon', id: w.id, name: w.name, facility: c.facility, cost: c.cost, blocked });
  }
  for (const it of Object.values(ctx.content.items)) {
    const c = it.craft;
    if (!c || (facility && c.facility !== facility)) continue;
    const missing = missingResources(ctx, c.cost);
    const blocked = !built(c.facility)
      ? `Needs the ${ctx.content.facilities[c.facility]?.name ?? c.facility}`
      : c.requires && !evaluate(c.requires, ctx)
        ? 'Not yet'
        : missing.length
          ? `Needs ${missing.join(', ')}`
          : null;
    out.push({ kind: 'item', id: it.id, name: it.name, facility: c.facility, cost: c.cost, blocked });
  }
  return out;
}

export function craft(ctx: Ctx, kind: 'weapon' | 'item', id: string): string | null {
  const entry = craftables(ctx).find((c) => c.kind === kind && c.id === id);
  if (!entry) return 'Cannot craft that.';
  if (entry.blocked) return `${entry.blocked}.`;
  for (const [r, n] of Object.entries(entry.cost)) ctx.state.town.resources[r as Resource] -= n ?? 0;
  if (kind === 'weapon') ctx.state.player.weapons.push(id);
  else ctx.state.town.storage[id] = (ctx.state.town.storage[id] ?? 0) + 1;
  ctx.notify(`Made ${entry.name}.`);
  return null;
}

export const RESOURCE_LIST = RESOURCES;
