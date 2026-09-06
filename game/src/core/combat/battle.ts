// Turn-based combat: the player versus one enemy, with companions providing passives and
// at most one active skill each per battle. Pure state + rules; the session animates the
// events this module returns. See docs/design/gdd.md §11 for the rules in prose.
import { STATUSES, resolveCheck, tagCheckBonus } from '@withergate/shared';
import type { Enemy, Power, Status, Step, Weapon } from '@withergate/shared';
import { evaluate } from '../conditions';
import type { Ctx } from '../ctx';
import { grantXp } from '../effects';
import { activeTags, combatStats, maxEnergy, maxGrace, maxHp, villagerState } from '../state';
import { sleepUntilMorning } from '../time';

export type Side = 'player' | 'enemy';
export type BattleResult = 'won' | 'lost' | 'fled' | 'spared';
export type BattleSource = 'debug' | 'script' | 'expedition';

export interface StatusInstance {
  id: Status;
  turns: number;
}

export type BattleAction =
  | { kind: 'attack' }
  | { kind: 'defend' }
  | { kind: 'power'; id: string }
  | { kind: 'companion'; villager: string; skill: string }
  | { kind: 'spare' }
  | { kind: 'flee' };

export type BattleEvent =
  | { type: 'start'; enemy: string }
  | { type: 'round'; round: number }
  | { type: 'line'; speaker: string; text: string }
  | { type: 'enemy_move'; name: string }
  | { type: 'power'; name: string; by: string }
  | { type: 'hit'; actor: string; target: Side; damage: number; crit: boolean; label: string; mult: number }
  | { type: 'miss'; target: Side; label: string }
  | { type: 'heal'; target: Side; amount: number; label: string }
  | { type: 'status'; target: Side; status: Status; turns: number }
  | { type: 'status_tick'; target: Side; status: Status; damage: number }
  | { type: 'status_end'; target: Side; status: Status }
  | { type: 'skip'; target: Side; status: Status }
  | { type: 'defend' }
  | { type: 'grace'; amount: number }
  | { type: 'intercept'; by: string }
  | { type: 'flee'; success: boolean; reason?: 'rooted' | 'explorer' }
  | { type: 'spare'; success: boolean }
  | { type: 'end'; result: BattleResult; xp: number; loot: Record<string, number>; drops: string[] };

export interface Passives {
  player_attack_up: number;
  player_defense_up: number;
  enemy_defense_down: number;
  grace_regen: number;
  crit_chance: number;
  status_resist: number;
  intercepts: number;
  interceptor: string | null;
}

export interface BattleState {
  enemyId: string;
  enemyHp: number;
  enemyMaxHp: number;
  round: number;
  /** Actors still to act this round, first is current. */
  queue: Side[];
  /** True once the player's turn has been prepared and we are waiting for input. */
  awaitingInput: boolean;
  phase: 'active' | BattleResult;
  playerStatuses: StatusInstance[];
  enemyStatuses: StatusInstance[];
  defending: boolean;
  companionSkillsUsed: string[];
  passives: Passives;
  interceptsLeft: number;
  party: string[];
  source: BattleSource;
  lowHpWarned: boolean;
}

export const STATUS_LABELS: Record<Status, string> = {
  bleed: 'Bleeding',
  stagger: 'Staggered',
  inspired: 'Inspired',
  rooted: 'Rooted',
  burning: 'Burning',
  attack_up: 'Attack up',
  defense_up: 'Defense up',
};

const DOT: Partial<Record<Status, number>> = { bleed: 2, burning: 3 };
const BUFFS: readonly Status[] = ['attack_up', 'defense_up', 'inspired'];
const SPARE_THRESHOLD = 0.25;
const UNARMED: Pick<Weapon, 'name' | 'power' | 'damage_type' | 'speed_mod' | 'grace_regen'> = {
  name: 'Bare hands',
  power: 0.7,
  damage_type: 'blunt',
  speed_mod: 0,
  grace_regen: 0,
};

// --- queries ------------------------------------------------------------------

export function battleEnemy(ctx: Ctx): Enemy {
  const b = ctx.state.battle!;
  return ctx.content.enemies[b.enemyId]!;
}

export function weaponOf(ctx: Ctx): Pick<Weapon, 'name' | 'power' | 'damage_type' | 'speed_mod' | 'grace_regen'> & { trait?: Weapon['trait'] } {
  const id = ctx.state.player.weaponId;
  return (id && ctx.content.weapons[id]) || UNARMED;
}

/** Equipped powers usable in battle. */
export function combatPowers(ctx: Ctx): Power[] {
  return ctx.state.player.equippedPowers
    .map((id) => ctx.content.powers[id])
    .filter((p): p is Power => !!p && p.kind === 'combat');
}

/** Companion active skills not yet used this battle. */
export function companionSkills(ctx: Ctx): { villager: string; power: Power }[] {
  const b = ctx.state.battle;
  if (!b) return [];
  const out: { villager: string; power: Power }[] = [];
  for (const id of b.party) {
    for (const ben of ctx.content.villagers[id]?.profile.benefits?.combat ?? []) {
      if (ben.type !== 'active' || typeof ben.skill !== 'string') continue;
      const power = ctx.content.powers[ben.skill];
      if (!power || b.companionSkillsUsed.includes(`${id}:${ben.skill}`)) continue;
      out.push({ villager: id, power });
    }
  }
  return out;
}

export function canSpare(ctx: Ctx): boolean {
  const b = ctx.state.battle;
  if (!b || b.phase !== 'active') return false;
  const enemy = battleEnemy(ctx);
  if (!enemy.spare || enemy.spare.possible === false) return false;
  return b.enemyHp / b.enemyMaxHp <= SPARE_THRESHOLD;
}

export function playerCombat(ctx: Ctx) {
  const base = combatStats(ctx.state, ctx.content);
  const b = ctx.state.battle;
  const w = weaponOf(ctx);
  let attack = base.attack;
  let defense = base.defense;
  let speed = base.speed + w.speed_mod;
  if (b) {
    if (has(b.playerStatuses, 'attack_up')) attack *= 1.25;
    if (has(b.playerStatuses, 'defense_up')) defense *= 1.25;
    if (has(b.playerStatuses, 'inspired')) {
      attack += 2;
      speed += 1;
    }
    attack += b.passives.player_attack_up;
    defense += b.passives.player_defense_up;
  }
  return { attack, defense, speed, divinity: base.divinity };
}

function enemyCombat(ctx: Ctx, enemy: Enemy) {
  const b = ctx.state.battle!;
  let attack = enemy.stats.attack;
  let defense = enemy.stats.defense;
  let speed = enemy.stats.speed;
  if (has(b.enemyStatuses, 'attack_up')) attack *= 1.25;
  if (has(b.enemyStatuses, 'defense_up')) defense *= 1.25;
  if (has(b.enemyStatuses, 'inspired')) {
    attack += 2;
    speed += 1;
  }
  defense = Math.max(0, defense - b.passives.enemy_defense_down);
  return { attack, defense, speed };
}

// --- lifecycle ----------------------------------------------------------------

/** Begin a fight. Returns the events up to the first player decision. */
export function startBattle(ctx: Ctx, enemyId: string, source: BattleSource): BattleEvent[] {
  const enemy = ctx.content.enemies[enemyId];
  if (!enemy) throw new Error(`unknown enemy ${enemyId}`);
  const party = ctx.state.party.filter((id) => {
    const v = ctx.state.villagers[id];
    return !!ctx.content.villagers[id] && !v?.gone;
  });
  ctx.state.battle = {
    enemyId,
    enemyHp: enemy.stats.hp,
    enemyMaxHp: enemy.stats.hp,
    round: 0,
    queue: [],
    awaitingInput: false,
    phase: 'active',
    playerStatuses: [],
    enemyStatuses: [],
    defending: false,
    companionSkillsUsed: [],
    passives: collectPassives(ctx, party),
    interceptsLeft: 0,
    party,
    source,
    lowHpWarned: false,
  };
  const b = ctx.state.battle;
  b.interceptsLeft = b.passives.intercepts;
  const events: BattleEvent[] = [{ type: 'start', enemy: enemyId }];
  for (const id of party) {
    const line = bark(ctx, id, 'battle_start');
    if (line) events.push(line);
  }
  progress(ctx, events);
  return events;
}

/** The player's decision for this turn. Returns the events up to the next decision (or the end). */
export function playerAct(ctx: Ctx, action: BattleAction): BattleEvent[] {
  const b = ctx.state.battle;
  if (!b || b.phase !== 'active' || b.queue[0] !== 'player' || !b.awaitingInput) return [];
  const events: BattleEvent[] = [];
  const enemy = battleEnemy(ctx);
  let consumed = true;
  switch (action.kind) {
    case 'attack':
      playerAttack(ctx, enemy, events);
      break;
    case 'defend': {
      b.defending = true;
      const before = ctx.state.player.grace;
      ctx.state.player.grace = Math.min(maxGrace(ctx.state, ctx.content), before + 2);
      events.push({ type: 'defend' });
      if (ctx.state.player.grace > before) events.push({ type: 'grace', amount: ctx.state.player.grace - before });
      break;
    }
    case 'power': {
      const power = combatPowers(ctx).find((p) => p.id === action.id);
      if (!power || ctx.state.player.grace < power.cost) return [];
      ctx.state.player.grace -= power.cost;
      usePower(ctx, enemy, power, 'player', events);
      break;
    }
    case 'companion': {
      const skill = companionSkills(ctx).find((s) => s.villager === action.villager && s.power.id === action.skill);
      if (!skill) return [];
      b.companionSkillsUsed.push(`${action.villager}:${action.skill}`);
      usePower(ctx, enemy, skill.power, action.villager, events);
      break;
    }
    case 'spare': {
      if (!canSpare(ctx)) return [];
      const check = enemy.spare?.check ?? { stat: 'charisma' as const, dc: 12 };
      const roll = resolveCheck(
        ctx.rng.d20(),
        ctx.state.player.stats[check.stat],
        ctx.state.player.stats.luck,
        check.dc,
        tagCheckBonus(activeTags(ctx.state), check.stat),
      );
      const ok = roll.outcome === 'success' || roll.outcome === 'crit_success';
      events.push({ type: 'spare', success: ok });
      if (ok) {
        b.phase = 'spared';
        const xp = enemy.spare?.xp ?? 0;
        if (xp) grantXp(ctx, xp);
        for (const t of enemy.spare?.tags ?? []) if (!ctx.state.player.tags.includes(t)) ctx.state.player.tags.push(t);
        events.push({ type: 'end', result: 'spared', xp, loot: {}, drops: [] });
        return events;
      }
      break;
    }
    case 'flee': {
      if (has(b.playerStatuses, 'rooted')) {
        events.push({ type: 'flee', success: false, reason: 'rooted' });
        break;
      }
      const explorer = b.party.some((id) => ctx.content.villagers[id]?.profile.profession === 'explorer');
      let ok = explorer;
      if (!ok) {
        const es = enemyCombat(ctx, enemy);
        const roll = resolveCheck(
          ctx.rng.d20(),
          ctx.state.player.stats.dexterity,
          ctx.state.player.stats.luck,
          10 + Math.round(es.speed),
          tagCheckBonus(activeTags(ctx.state), 'dexterity'),
        );
        ok = roll.outcome === 'success' || roll.outcome === 'crit_success';
      }
      events.push({ type: 'flee', success: ok, reason: explorer ? 'explorer' : undefined });
      if (ok) {
        b.phase = 'fled';
        events.push({ type: 'end', result: 'fled', xp: 0, loot: {}, drops: [] });
        return events;
      }
      break;
    }
    default:
      consumed = false;
  }
  if (!consumed) return [];
  b.queue.shift();
  b.awaitingInput = false;
  if (checkEnd(ctx, events)) return events;
  progress(ctx, events);
  return events;
}

/** Death (decided): companions on the trip are spent and recovering, you wake next morning at half HP and energy. */
export function applyDefeat(ctx: Ctx): void {
  const s = ctx.state;
  const prog = ctx.content.progression;
  for (const id of s.party) {
    const v = villagerState(s, ctx.content, id);
    v.energy = 0;
    v.recoveryUntilDay = s.time.day + 1 + (ctx.content.villagers[id]?.profile.recovery_days ?? prog.energy.death_recovery_days);
  }
  s.party = [];
  s.battle = null;
  sleepUntilMorning(ctx);
  s.player.hp = Math.max(1, Math.floor(maxHp(s, ctx.content) / 2));
  s.player.energy = Math.floor(maxEnergy(s, ctx.content) / 2);
  const bed = ctx.content.maps.withergate_quarters ? { map: 'withergate_quarters', spawn: 'from_door' } : { map: 'withergate', spawn: 'default' };
  ctx.requests.push({ kind: 'teleport', map: bed.map, spawn: bed.spawn });
  ctx.notify('You died. You wake in your bed a day later, weaker.');
}

// --- turn engine ----------------------------------------------------------------

function progress(ctx: Ctx, events: BattleEvent[]): void {
  const b = ctx.state.battle!;
  const enemy = battleEnemy(ctx);
  let guard = 0;
  while (b.phase === 'active' && guard < 50) {
    guard += 1;
    if (!b.queue.length) newRound(ctx, enemy, events);
    const actor = b.queue[0]!;
    if (actor === 'player') {
      if (b.awaitingInput) return;
      b.defending = false;
      const skip = tickStatuses(ctx, 'player', events);
      if (checkEnd(ctx, events)) return;
      const regen = 1 + weaponOf(ctx).grace_regen + b.passives.grace_regen;
      const before = ctx.state.player.grace;
      ctx.state.player.grace = Math.min(maxGrace(ctx.state, ctx.content), before + regen);
      if (ctx.state.player.grace > before) events.push({ type: 'grace', amount: ctx.state.player.grace - before });
      if (skip) {
        b.queue.shift();
        continue;
      }
      b.awaitingInput = true;
      return;
    }
    b.queue.shift();
    const skip = tickStatuses(ctx, 'enemy', events);
    if (checkEnd(ctx, events)) return;
    if (!skip) enemyMove(ctx, enemy, events);
    if (checkEnd(ctx, events)) return;
  }
}

function newRound(ctx: Ctx, enemy: Enemy, events: BattleEvent[]): void {
  const b = ctx.state.battle!;
  b.round += 1;
  const ps = playerCombat(ctx).speed;
  const es = enemyCombat(ctx, enemy).speed;
  const first: Side = ps >= es ? 'player' : 'enemy';
  const second: Side = first === 'player' ? 'enemy' : 'player';
  b.queue = [first, second];
  const fastest = first === 'player' ? ps : es;
  const slowest = first === 'player' ? es : ps;
  if (fastest >= slowest * 1.5 && b.round % 2 === 0) b.queue.push(first);
  events.push({ type: 'round', round: b.round });
}

/** Damage-over-time and expiry at the start of an actor's action. Returns true if the actor loses the action. */
function tickStatuses(ctx: Ctx, side: Side, events: BattleEvent[]): boolean {
  const b = ctx.state.battle!;
  const list = side === 'player' ? b.playerStatuses : b.enemyStatuses;
  for (const s of [...list]) {
    const dot = DOT[s.id];
    if (dot) {
      hurt(ctx, side, dot);
      events.push({ type: 'status_tick', target: side, status: s.id, damage: dot });
    }
  }
  let skipBy: Status | null = null;
  if (has(list, 'stagger')) skipBy = 'stagger';
  else if (side === 'enemy' && has(list, 'rooted')) skipBy = 'rooted';
  for (const s of list) s.turns -= 1;
  for (const s of list.filter((x) => x.turns <= 0)) events.push({ type: 'status_end', target: side, status: s.id });
  const remaining = list.filter((x) => x.turns > 0);
  list.splice(0, list.length, ...remaining);
  if (skipBy) events.push({ type: 'skip', target: side, status: skipBy });
  return skipBy !== null;
}

function playerAttack(ctx: Ctx, enemy: Enemy, events: BattleEvent[]): void {
  const b = ctx.state.battle!;
  const w = weaponOf(ctx);
  const ps = playerCombat(ctx);
  const es = enemyCombat(ctx, enemy);
  const mult = enemy.resistances[w.damage_type] ?? 1;
  const variance = 0.9 + ctx.rng.next() * 0.2;
  const crit = ctx.rng.chance(0.05 + ctx.state.player.stats.luck * 0.01 + b.passives.crit_chance);
  const raw = ps.attack * w.power * mult * variance * (crit ? 1.5 : 1);
  const damage = Math.max(1, Math.round(raw - es.defense));
  hurt(ctx, 'enemy', damage);
  events.push({ type: 'hit', actor: 'player', target: 'enemy', damage, crit, label: w.name, mult });
  const onHit = w.trait?.on_hit;
  if (onHit && b.enemyHp > 0 && ctx.rng.chance(onHit.chance)) addStatus(b.enemyStatuses, onHit.status, onHit.turns, 'enemy', events);
}

function usePower(ctx: Ctx, enemy: Enemy, power: Power, by: string, events: BattleEvent[]): void {
  const b = ctx.state.battle!;
  events.push({ type: 'power', name: power.name, by });
  const ps = playerCombat(ctx);
  if (power.heal) {
    const amount = power.heal + Math.floor(ps.divinity / 2);
    const before = ctx.state.player.hp;
    ctx.state.player.hp = Math.min(maxHp(ctx.state, ctx.content), before + amount);
    events.push({ type: 'heal', target: 'player', amount: ctx.state.player.hp - before, label: power.name });
  }
  if (power.power) {
    const es = enemyCombat(ctx, enemy);
    const type = power.damage_type ?? 'divine';
    const mult = enemy.resistances[type] ?? 1;
    const variance = 0.9 + ctx.rng.next() * 0.2;
    const crit = ctx.rng.chance(0.05 + ctx.state.player.stats.luck * 0.01 + b.passives.crit_chance);
    const base = by === 'player' ? ps.divinity * 2 : ps.attack;
    const raw = base * power.power * mult * variance * (crit ? 1.5 : 1);
    const damage = Math.max(1, Math.round(raw - Math.floor(es.defense / 2)));
    hurt(ctx, 'enemy', damage);
    events.push({ type: 'hit', actor: by, target: 'enemy', damage, crit, label: power.name, mult });
  }
  const status = statusOf(power.effect);
  if (status) {
    const turns = Number((power.effect as { turns?: unknown } | undefined)?.turns ?? 1);
    if (BUFFS.includes(status)) addStatus(b.playerStatuses, status, turns, 'player', events);
    else if (b.enemyHp > 0) addStatus(b.enemyStatuses, status, turns, 'enemy', events);
  }
}

function enemyMove(ctx: Ctx, enemy: Enemy, events: BattleEvent[]): void {
  const b = ctx.state.battle!;
  const hpFrac = b.enemyHp / b.enemyMaxHp;
  const allowed = enemy.moves.filter((m) => moveAllowed(ctx, m.when, hpFrac));
  const move = ctx.rng.weighted(allowed.length ? allowed : enemy.moves, (m) => m.weight);
  events.push({ type: 'enemy_move', name: move.name });
  if (move.power !== undefined) {
    const ps = playerCombat(ctx);
    const es = enemyCombat(ctx, enemy);
    if (ctx.rng.chance(ctx.state.player.stats.dexterity * 0.02)) {
      events.push({ type: 'miss', target: 'player', label: move.name });
    } else if (b.interceptsLeft > 0 && b.passives.interceptor) {
      b.interceptsLeft -= 1;
      events.push({ type: 'intercept', by: b.passives.interceptor });
    } else {
      const variance = 0.9 + ctx.rng.next() * 0.2;
      const crit = ctx.rng.chance(0.05);
      let raw = es.attack * move.power * variance * (crit ? 1.5 : 1);
      if (b.defending) raw *= 0.5;
      const damage = Math.max(1, Math.round(raw - ps.defense));
      hurt(ctx, 'player', damage);
      events.push({ type: 'hit', actor: 'enemy', target: 'player', damage, crit, label: move.name, mult: 1 });
      if (!b.lowHpWarned && ctx.state.player.hp > 0 && ctx.state.player.hp <= maxHp(ctx.state, ctx.content) * 0.3) {
        b.lowHpWarned = true;
        for (const id of b.party) {
          const line = bark(ctx, id, 'low_hp');
          if (line) events.push(line);
        }
      }
    }
  }
  if (move.effect) {
    const st = move.effect.status;
    if (BUFFS.includes(st)) addStatus(b.enemyStatuses, st, move.effect.turns, 'enemy', events);
    else if (ctx.state.player.hp > 0 && !ctx.rng.chance(b.passives.status_resist)) addStatus(b.playerStatuses, st, move.effect.turns, 'player', events);
  }
}

function moveAllowed(ctx: Ctx, when: Enemy['moves'][number]['when'], hpFrac: number): boolean {
  if (!when) return true;
  const { hp_below, ...rest } = when;
  if (hp_below !== undefined && !(hpFrac < hp_below)) return false;
  return Object.keys(rest).length ? evaluate(rest, ctx) : true;
}

function checkEnd(ctx: Ctx, events: BattleEvent[]): boolean {
  const b = ctx.state.battle!;
  if (b.phase !== 'active') return true;
  if (b.enemyHp <= 0) {
    finishWin(ctx, events);
    return true;
  }
  if (ctx.state.player.hp <= 0) {
    b.phase = 'lost';
    for (const id of b.party) {
      const line = bark(ctx, id, 'defeat');
      if (line) events.push(line);
    }
    events.push({ type: 'end', result: 'lost', xp: 0, loot: {}, drops: [] });
    return true;
  }
  return false;
}

function finishWin(ctx: Ctx, events: BattleEvent[]): void {
  const b = ctx.state.battle!;
  const enemy = battleEnemy(ctx);
  b.phase = 'won';
  const s = ctx.state;
  if (enemy.xp) grantXp(ctx, enemy.xp);
  const loot: Record<string, number> = {};
  for (const [r, n] of Object.entries(enemy.loot)) {
    if (!n) continue;
    const key = r as keyof typeof s.town.resources;
    // Until expeditions exist, loot goes straight to Withergate's stores (question G2).
    s.town.resources[key] = (s.town.resources[key] ?? 0) + n;
    loot[r] = n;
  }
  const drops: string[] = [];
  if (enemy.gift_drop && ctx.rng.chance(enemy.gift_drop.chance)) {
    s.town.storage[enemy.gift_drop.item] = (s.town.storage[enemy.gift_drop.item] ?? 0) + 1;
    drops.push(enemy.gift_drop.item);
  }
  for (const t of enemy.tags_on_kill) if (!s.player.tags.includes(t)) s.player.tags.push(t);
  s.player.domainPoints.combat += 1;
  for (const id of b.party) {
    const line = bark(ctx, id, 'victory');
    if (line) events.push(line);
  }
  events.push({ type: 'end', result: 'won', xp: enemy.xp, loot, drops });
}

// --- helpers --------------------------------------------------------------------

function has(list: StatusInstance[], id: Status): boolean {
  return list.some((s) => s.id === id);
}

function addStatus(list: StatusInstance[], id: Status, turns: number, target: Side, events: BattleEvent[]): void {
  const existing = list.find((s) => s.id === id);
  if (existing) existing.turns = Math.max(existing.turns, turns);
  else list.push({ id, turns });
  events.push({ type: 'status', target, status: id, turns });
}

function hurt(ctx: Ctx, side: Side, amount: number): void {
  const b = ctx.state.battle!;
  if (side === 'enemy') b.enemyHp = Math.max(0, b.enemyHp - amount);
  else ctx.state.player.hp = Math.max(0, ctx.state.player.hp - amount);
}

function statusOf(effect: unknown): Status | null {
  if (!effect || typeof effect !== 'object') return null;
  const s = (effect as { status?: unknown }).status;
  return typeof s === 'string' && (STATUSES as readonly string[]).includes(s) ? (s as Status) : null;
}

function collectPassives(ctx: Ctx, party: string[]): Passives {
  const p: Passives = {
    player_attack_up: 0,
    player_defense_up: 0,
    enemy_defense_down: 0,
    grace_regen: 0,
    crit_chance: 0,
    status_resist: 0,
    intercepts: 0,
    interceptor: null,
  };
  for (const id of party) {
    for (const ben of ctx.content.villagers[id]?.profile.benefits?.combat ?? []) {
      if (ben.type !== 'passive') continue;
      const value = Number(ben.value ?? 1);
      switch (ben.effect) {
        case 'player_attack_up': p.player_attack_up += value; break;
        case 'player_defense_up': p.player_defense_up += value; break;
        case 'enemy_defense_down': p.enemy_defense_down += value; break;
        case 'grace_regen': p.grace_regen += value; break;
        case 'crit_chance': p.crit_chance += value; break;
        case 'status_resist': p.status_resist += value; break;
        case 'intercept_hit':
          p.intercepts += value;
          p.interceptor ??= id;
          break;
        default: break;
      }
    }
  }
  return p;
}

/** A random bark of the given kind, as a log line. */
function bark(ctx: Ctx, villager: string, key: 'battle_start' | 'low_hp' | 'victory' | 'defeat'): BattleEvent | null {
  const lines = ctx.content.villagers[villager]?.barks[key];
  if (!lines?.length) return null;
  const steps: Step[] = ctx.rng.pick(lines);
  const line = steps.find((s) => s.kind === 'line');
  return line && line.kind === 'line' ? { type: 'line', speaker: line.speaker === 'narrate' ? villager : line.speaker, text: line.text } : null;
}
