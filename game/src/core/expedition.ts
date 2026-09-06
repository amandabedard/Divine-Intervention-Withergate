// Expeditions (Phase 7): the node map between towns and into the wild, the party
// that walks it, what each node does, and the caravan that carries the haul home.
// Pure rules over the game state; the session plays the outcomes (scripts, battles)
// and the expedition UI draws the map. See docs/design/gdd.md §10 and §12.
import { PHASES, RESOURCES, tierForPoints } from '@withergate/shared';
import type { Biome, BiomeDef, Encounter, NodeType, Phase, Region, Resource, Script, Step } from '@withergate/shared';
import { evaluate } from './conditions';
import type { Ctx } from './ctx';
import { expeditionBlocker, maxEnergy, maxHp, residents, townBonuses, villagerState } from './state';
import type { GameState } from './state';
import { advancePhases, sleepUntilMorning } from './time';
import { residentTotals } from './town';

/** Nodes per segment: three on the road and the checkpoint that ends the day. */
export const NODES_PER_SEGMENT = 4;
export const MAX_PARTY = 2;
/** Energy a node costs; night and corrupted ground cost double. */
const NODE_ENERGY = 1;
const REST_ENERGY = 2;
const GATHER_DEFAULT: [number, number] = [1, 3];

export interface ExpNode {
  type: NodeType;
  biome: Biome;
  segment: number;
  /** The last node of a segment. */
  checkpoint: boolean;
  /** The last checkpoint: the destination town, or the end of an exploration. */
  final: boolean;
  /** A fixed encounter (story checkpoint) or the pool to pick from on arrival. */
  encounter?: string;
  pool?: string[];
  /** Rows reachable in the next column. */
  next: number[];
  visited: boolean;
}

export interface Caravan {
  id: number;
  region: string;
  resources: Partial<Record<Resource, number>>;
  items: Record<string, number>;
  arrivesDay: number;
  /** Chance of an ambush on the way, after every modifier. */
  risk: number;
}

export interface ExpeditionState {
  region: string;
  direction: 'out' | 'back';
  from: string;
  to: string | null;
  columns: ExpNode[][];
  /** Current position; col -1 is the trailhead before the first step. */
  col: number;
  row: number;
  haul: Partial<Record<Resource, number>>;
  items: Record<string, number>;
  withdrawn: string[];
  startDay: number;
  /** Columns whose node types are known ahead of the current one. */
  preview: number;
  /** The current node is a resolved checkpoint; the checkpoint choices are open. */
  atCheckpoint: boolean;
  log: string[];
}

export type NodeOutcome =
  | { kind: 'script'; id: string; script: Script; biome: Biome; node: NodeType }
  | { kind: 'battle'; enemy: string; elite: boolean; biome: Biome; node: NodeType }
  | { kind: 'text'; title: string; lines: string[] }
  | { kind: 'none' };

export interface NodeCompletion {
  withdrawn: string[];
  /** The player is out of energy: the expedition turns for home. */
  exhausted: boolean;
  checkpoint: boolean;
  final: boolean;
  rested: boolean;
}

export interface TravelBonuses {
  node_weight: Partial<Record<NodeType, number>>;
  gather_yield: Partial<Record<Resource | 'all', number>>;
  extra_paths: number;
  preview_nodes: number;
  heal_per_node: number;
  energy_cost: number;
  flee_guaranteed: boolean;
  ambush_chance: number;
}

export interface PartyCandidate {
  id: string;
  name: string;
  willing: boolean;
  reason?: string;
  energy: number;
  energyMax: number;
}

export interface Destination {
  region: Region;
  direction: 'out' | 'back';
  label: string;
  days: number;
  kind: 'route' | 'wild';
}

const NODE_LABELS: Record<NodeType, string> = {
  battle: 'Battle',
  elite: 'Elite',
  event: 'Event',
  gather_wood: 'Wood',
  gather_ore: 'Ore',
  gather_herbs: 'Herbs',
  gather_food: 'Food',
  rest: 'Rest',
  shrine: 'Shrine',
  cache: 'Cache',
  traveler: 'Traveler',
  settlement: 'Settlement',
  checkpoint: 'Checkpoint',
  boss: 'Boss',
};
export const nodeLabel = (t: NodeType): string => NODE_LABELS[t];

const GATHER_RESOURCE: Partial<Record<NodeType, Resource>> = { gather_wood: 'wood', gather_ore: 'ore', gather_herbs: 'herbs', gather_food: 'food' };

const line = (text: string): Step => ({ kind: 'line', speaker: 'narrate', text });
const script = (steps: Step[]): Script => ({ nodes: { start: steps } });

// --- where you can go ------------------------------------------------------------

/** The town the player is in, by the current map; Withergate when a map has no town. */
export function currentTown(ctx: Ctx): string {
  return ctx.content.maps[ctx.state.where.map]?.town ?? 'withergate';
}

/** Routes and wild regions that start here, plus the way back along a route that ends here. */
export function destinations(ctx: Ctx): Destination[] {
  const town = currentTown(ctx);
  const out: Destination[] = [];
  for (const region of Object.values(ctx.content.regions)) {
    if (region.from === town) {
      const days = region.kind === 'route' ? routeDaysFor(ctx, region) : Math.max(...(region.segments ?? [1, 1]));
      out.push({
        region,
        direction: 'out',
        label: region.kind === 'route' ? `${region.name} → ${townName(region.to ?? '')}` : `Explore: ${region.name}`,
        days,
        kind: region.kind,
      });
    } else if (region.kind === 'route' && region.to === town) {
      out.push({ region, direction: 'back', label: `${region.name} → ${townName(region.from)}`, days: routeDaysFor(ctx, region), kind: 'route' });
    }
  }
  return out;
}

export function townName(id: string): string {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : '';
}

/** A route's days; the Town Hall's established routes are a day shorter (never under one). */
export function routeDaysFor(ctx: Ctx, region: Region): number {
  const days = region.days ?? 2;
  const established = townBonuses(ctx.state, ctx.content).actions.includes('establish_route');
  return established ? Math.max(1, days - 1) : days;
}

// --- the party ------------------------------------------------------------------

export function partyCandidates(ctx: Ctx): PartyCandidate[] {
  const s = ctx.state;
  return residents(s).map((id) => {
    const profile = ctx.content.villagers[id]?.profile;
    const v = villagerState(s, ctx.content, id);
    const energyMax = profile?.energy ?? 6;
    let reason: string | undefined;
    if (v.recoveryUntilDay > s.time.day) reason = `recovering (${v.recoveryUntilDay - s.time.day} more day${v.recoveryUntilDay - s.time.day === 1 ? '' : 's'})`;
    else if (v.energy <= 0) reason = 'exhausted';
    else if (v.unhappy) reason = 'unhappy; will not leave town';
    else {
      const tier = tierForPoints(v.friendship);
      if (tier === 'enemy' || tier === 'disliked') reason = 'will not travel with you';
    }
    return { id, name: profile?.name ?? id, willing: !reason, reason, energy: v.energy, energyMax };
  });
}

/** Travel benefits of the party, equipped travel powers and facilities, summed. */
export function travelBonuses(ctx: Ctx): TravelBonuses {
  const t: TravelBonuses = { node_weight: {}, gather_yield: {}, extra_paths: 0, preview_nodes: 0, heal_per_node: 0, energy_cost: 0, flee_guaranteed: false, ambush_chance: 0 };
  const num = (v: unknown, fallback = 0) => (typeof v === 'number' ? v : fallback);
  const apply = (b: { type: string } & Record<string, unknown>) => {
    switch (b.type) {
      case 'node_weight': {
        const node = String(b.node) as NodeType;
        t.node_weight[node] = (t.node_weight[node] ?? 1) * num(b.multiplier, 1);
        break;
      }
      case 'gather_yield': {
        const key = (typeof b.resource === 'string' ? b.resource : 'all') as Resource | 'all';
        t.gather_yield[key] = (t.gather_yield[key] ?? 1) * num(b.multiplier, 1);
        break;
      }
      case 'extra_paths': t.extra_paths += num(b.amount, 1); break;
      case 'preview_nodes': t.preview_nodes += num(b.columns, 1); break;
      case 'heal_per_node': t.heal_per_node += num(b.amount); break;
      case 'energy_cost': t.energy_cost += num(b.delta); break;
      case 'flee_guaranteed': t.flee_guaranteed = true; break;
      case 'ambush_chance': t.ambush_chance += num(b.percent); break;
      default: break;
    }
  };
  for (const id of ctx.state.party) {
    for (const b of ctx.content.villagers[id]?.profile.benefits?.travel ?? []) apply(b as { type: string } & Record<string, unknown>);
  }
  for (const id of ctx.state.player.equippedPowers) {
    const p = ctx.content.powers[id];
    if (p?.kind === 'travel' && p.effect && typeof p.effect.type === 'string') apply(p.effect as { type: string } & Record<string, unknown>);
  }
  t.preview_nodes += townBonuses(ctx.state, ctx.content).preview_nodes;
  return t;
}

// --- generating the map -----------------------------------------------------------

function biomeOf(ctx: Ctx, id: Biome): BiomeDef {
  return ctx.content.biomes[id] ?? { id, name: id, node_weights: { battle: 2, event: 2, rest: 1 }, enemies: [], gather: {} };
}

function columnWeights(ctx: Ctx, region: Region, biome: BiomeDef, phase: Phase, bonuses: TravelBonuses): Partial<Record<NodeType, number>> {
  const w: Partial<Record<NodeType, number>> = { ...biome.node_weights };
  for (const [k, m] of Object.entries(region.node_weights ?? {})) w[k as NodeType] = (w[k as NodeType] ?? 1) * (m ?? 1);
  for (const [k, m] of Object.entries(biome.phase_modifiers?.[phase] ?? {})) w[k as NodeType] = (w[k as NodeType] ?? 0) * (m ?? 1);
  const corruption = ctx.state.world.corruption;
  if (biome.id === 'corrupted' || corruption >= 5) {
    w.battle = (w.battle ?? 1) * (1 + 0.1 * corruption);
    w.elite = (w.elite ?? 0.3) * (1 + 0.2 * corruption);
  }
  if (region.danger >= 2) w.elite = (w.elite ?? 0.3) * (1 + region.danger / 2);
  for (const [k, m] of Object.entries(bonuses.node_weight)) if (w[k as NodeType] !== undefined) w[k as NodeType]! *= m ?? 1;
  delete w.checkpoint;
  delete w.boss;
  delete w.settlement;
  return w;
}

function pickType(ctx: Ctx, weights: Partial<Record<NodeType, number>>, avoid: NodeType[]): NodeType {
  const entries = Object.entries(weights).filter(([, v]) => (v ?? 0) > 0) as [NodeType, number][];
  if (!entries.length) return 'event';
  let pick = ctx.rng.weighted(entries, (e) => e[1])[0];
  if (avoid.includes(pick) && entries.length > 1) pick = ctx.rng.weighted(entries, (e) => e[1])[0];
  return pick;
}

/** Slay-the-Spire-style edges: each node links to one or two nodes near it in the next column, and nothing is left unreachable. */
function connect(ctx: Ctx, from: ExpNode[], to: ExpNode[], extraPaths: number): void {
  const n = from.length;
  const m = to.length;
  const incoming = new Array(m).fill(0);
  from.forEach((node, i) => {
    const j = n === 1 ? Math.floor(m / 2) : Math.round((i * (m - 1)) / (n - 1));
    node.next = [j];
    incoming[j] += 1;
    if (m > 1 && ctx.rng.chance(0.5)) {
      const k = Math.max(0, Math.min(m - 1, j + (ctx.rng.chance(0.5) ? 1 : -1)));
      if (!node.next.includes(k)) {
        node.next.push(k);
        incoming[k] += 1;
      }
    }
  });
  incoming.forEach((count, j) => {
    if (count) return;
    const i = Math.round((j * (n - 1)) / Math.max(1, m - 1));
    from[i]!.next.push(j);
  });
  for (let e = 0; e < extraPaths; e += 1) {
    const node = ctx.rng.pick(from);
    const j = ctx.rng.int(0, m - 1);
    if (!node.next.includes(j)) node.next.push(j);
  }
  for (const node of from) node.next.sort((a, b) => a - b);
}

/** The story checkpoint an active quest asks this region for, if any. */
function storyCheckpoint(ctx: Ctx, region: Region, segment: number): string | undefined {
  for (const [id, spec] of Object.entries(region.story_checkpoints ?? {})) {
    if (spec.after_segment !== segment) continue;
    for (const [questId, qs] of Object.entries(ctx.state.quests)) {
      if (qs.status !== 'active') continue;
      const stage = ctx.content.quests[questId]?.stages.find((st) => st.id === qs.stage);
      if (stage?.checkpoint === id) return id;
    }
  }
  return undefined;
}

export function generateExpedition(ctx: Ctx, region: Region, direction: 'out' | 'back'): ExpeditionState {
  const bonuses = travelBonuses(ctx);
  const segments = region.kind === 'route' ? routeDaysFor(ctx, region) : ctx.rng.int(region.segments?.[0] ?? 1, region.segments?.[1] ?? 1);
  const startIdx = PHASES.indexOf(ctx.state.time.phase);
  const columns: ExpNode[][] = [];
  for (let seg = 0; seg < segments; seg += 1) {
    for (let t = 0; t < NODES_PER_SEGMENT - 1; t += 1) {
      const colIndex = columns.length;
      const phase = PHASES[(startIdx + colIndex) % PHASES.length]!;
      const n = colIndex === 0 ? ctx.rng.int(2, 3) : ctx.rng.int(2, 4);
      const nodes: ExpNode[] = [];
      for (let i = 0; i < n; i += 1) {
        const biome = ctx.rng.pick(region.biomes);
        const type = pickType(ctx, columnWeights(ctx, region, biomeOf(ctx, biome), phase, bonuses), nodes.map((x) => x.type));
        nodes.push({ type, biome, segment: seg, checkpoint: false, final: false, next: [], visited: false });
      }
      columns.push(nodes);
    }
    const spec = region.checkpoints[Math.min(seg, region.checkpoints.length - 1)];
    const story = storyCheckpoint(ctx, region, seg);
    const node: ExpNode = {
      type: 'checkpoint',
      biome: ctx.rng.pick(region.biomes),
      segment: seg,
      checkpoint: true,
      final: seg === segments - 1,
      next: [],
      visited: false,
    };
    if (story) node.encounter = story;
    else if (spec && 'fixed' in spec) node.encounter = spec.fixed;
    else if (spec) node.pool = spec.pool;
    columns.push([node]);
  }
  for (let c = 0; c < columns.length - 1; c += 1) connect(ctx, columns[c]!, columns[c + 1]!, bonuses.extra_paths);
  const from = direction === 'out' ? region.from : (region.to ?? region.from);
  const to = region.kind === 'route' ? (direction === 'out' ? (region.to ?? null) : region.from) : null;
  return {
    region: region.id,
    direction,
    from,
    to,
    columns,
    col: -1,
    row: 0,
    haul: {},
    items: {},
    withdrawn: [],
    startDay: ctx.state.time.day,
    preview: 1 + bonuses.preview_nodes,
    atCheckpoint: false,
    log: [],
  };
}

// --- starting and moving ------------------------------------------------------------

/** Why an expedition cannot start with this party, or null. */
export function canStart(ctx: Ctx, regionId: string, party: string[]): string | null {
  const blocker = expeditionBlocker(ctx.state);
  if (blocker) return blocker;
  if (ctx.state.expedition) return 'You are already on the road.';
  const region = ctx.content.regions[regionId];
  if (!region) return 'No such road.';
  if (!destinations(ctx).some((d) => d.region.id === regionId)) return 'That road does not start here.';
  if (party.length > MAX_PARTY) return `At most ${MAX_PARTY} companions can come.`;
  const candidates = partyCandidates(ctx);
  for (const id of party) {
    const c = candidates.find((x) => x.id === id);
    if (!c) return `${ctx.content.villagers[id]?.profile.name ?? id} does not live here.`;
    if (!c.willing) return `${c.name} cannot come: ${c.reason}.`;
  }
  return null;
}

export function startExpedition(ctx: Ctx, regionId: string, party: string[]): ExpeditionState {
  const err = canStart(ctx, regionId, party);
  if (err) throw new Error(err);
  const region = ctx.content.regions[regionId]!;
  const direction = destinations(ctx).find((d) => d.region.id === regionId)!.direction;
  ctx.state.party = [...party];
  const exp = generateExpedition(ctx, region, direction);
  exp.log.push(`Set out on ${region.name} on day ${ctx.state.time.day}.`);
  ctx.state.expedition = exp;
  ctx.requests.push({ kind: 'npc_refresh' });
  return exp;
}

/** Rows of the next column the party can step to. */
export function reachable(exp: ExpeditionState): number[] {
  if (exp.col < 0) return exp.columns[0]!.map((_, i) => i);
  if (exp.col >= exp.columns.length - 1) return [];
  return exp.columns[exp.col]![exp.row]!.next;
}

export function currentNode(exp: ExpeditionState): ExpNode | null {
  return exp.col >= 0 ? (exp.columns[exp.col]?.[exp.row] ?? null) : null;
}

function encounterFits(ctx: Ctx, e: Encounter, biome: Biome): boolean {
  const w = e.where;
  if (w.biomes && !w.biomes.includes(biome)) return false;
  if (w.time && !w.time.includes(ctx.state.time.phase)) return false;
  if (w.corruption_min !== undefined && ctx.state.world.corruption < w.corruption_min) return false;
  if (w.corruption_max !== undefined && ctx.state.world.corruption > w.corruption_max) return false;
  if (e.once && ctx.state.world.encountersSeen.includes(e.id)) return false;
  if (w.requires && !evaluate(w.requires, { ...ctx, extras: { biome } })) return false;
  return true;
}

/** A weighted pick among the encounters of a node kind that fit here and now. */
export function pickEncounter(ctx: Ctx, node: Encounter['node'], biome: Biome, pool?: string[]): Encounter | null {
  const all = Object.values(ctx.content.encounters).filter((e) => (pool ? pool.includes(e.id) : e.node === node) && encounterFits(ctx, e, biome));
  if (!all.length) return null;
  return ctx.rng.weighted(all, (e) => e.weight);
}

function enemyFor(ctx: Ctx, biome: BiomeDef, elite: boolean): string | null {
  const phase = ctx.state.time.phase;
  const corruption = ctx.state.world.corruption;
  const fits = (id: string) => {
    const e = ctx.content.enemies[id];
    if (!e) return false;
    const a = e.appears;
    if (a.biomes.length && !a.biomes.includes(biome.id)) return false;
    if (a.time.length && !a.time.includes(phase)) return false;
    if (corruption < a.corruption_min) return false;
    return true;
  };
  const pool = biome.enemies.filter(fits);
  const tiered = pool.filter((id) => ctx.content.enemies[id]!.tier === (elite ? 'elite' : 'regular'));
  const candidates = tiered.length ? tiered : pool.length ? pool : biome.enemies.filter((id) => ctx.content.enemies[id]);
  return candidates.length ? ctx.rng.pick(candidates) : null;
}

function yieldMult(bonuses: TravelBonuses, resource: Resource): number {
  return (bonuses.gather_yield.all ?? 1) * (bonuses.gather_yield[resource] ?? 1);
}

/** Add resources to the haul while on the road, or to Withergate's stores at home. */
export function addResources(ctx: Ctx, res: Partial<Record<string, number>>): void {
  const target = ctx.state.expedition ? ctx.state.expedition.haul : ctx.state.town.resources;
  for (const [r, n] of Object.entries(res)) {
    if (!(RESOURCES as readonly string[]).includes(r) || !n) continue;
    const key = r as Resource;
    (target as Record<string, number>)[key] = Math.max(0, ((target as Record<string, number>)[key] ?? 0) + n);
  }
}

export function addItems(ctx: Ctx, items: Record<string, number>): void {
  const target = ctx.state.expedition ? ctx.state.expedition.items : ctx.state.town.storage;
  for (const [id, n] of Object.entries(items)) {
    if (!n) continue;
    target[id] = Math.max(0, (target[id] ?? 0) + n);
    if (!target[id]) delete target[id];
  }
}

const haulText = (res: Partial<Record<string, number>>, items: Record<string, number> = {}): string => {
  const parts = Object.entries(res).filter(([, n]) => (n ?? 0) > 0).map(([r, n]) => `${n} ${r}`);
  parts.push(...Object.entries(items).map(([id, n]) => `${n} ${id.replace(/_/g, ' ')}`));
  return parts.join(', ') || 'nothing';
};
export { haulText };

function defaultShrine(): Script {
  return script([
    line('A roadside shrine, older than the road. Someone has left flowers.'),
    {
      kind: 'choice',
      options: [
        { id: 'shrine_rest', text: 'Sit a while in its shade.', effects: { hp: 10 }, then: [line('The ache in your legs eases.')] },
        { id: 'shrine_guidance', text: 'Ask it for guidance.', effects: { domain_points: { discovery: 1 } }, then: [line('The wind changes. You think you know the way.')] },
        { id: 'shrine_courage', text: 'Ask it for courage.', effects: { domain_points: { combat: 1 } }, then: [line('Your grip on your weapon feels surer.')] },
        { id: 'shrine_plenty', text: 'Ask it for plenty.', effects: { domain_points: { prosperity: 1 } }, then: [line('A bird drops a seed at your feet, and you laugh.')] },
        { id: 'shrine_leave', text: 'Leave it be.' },
      ],
    },
  ]);
}

function defaultTraveler(ctx: Ctx): Script {
  const haul = ctx.state.expedition?.haul ?? {};
  const prices = ctx.content.economy.prices;
  const options: Step extends { kind: 'choice' } ? never : never[] = [] as never[];
  const choice: Extract<Step, { kind: 'choice' }> = { kind: 'choice', options: [] };
  for (const r of RESOURCES) {
    if (r === 'gold' || (haul[r] ?? 0) < 3 || !prices[r]) continue;
    const gold = Math.max(1, Math.floor(prices[r]! * 3 * 0.8));
    choice.options.push({
      id: `sell_${r}`,
      text: `Sell 3 ${r} for ${gold} gold.`,
      effects: { resources: { [r]: -3, gold } },
      then: [line(`Coins change hands. The peddler tucks the ${r} away.`)],
    });
  }
  choice.options.push({ id: 'peddler_talk', text: 'Ask about the road ahead.', effects: { domain_points: { discovery: 1 } }, then: [line('[PLACEHOLDER: the peddler shares a rumour about the road.]')] });
  choice.options.push({ id: 'peddler_leave', text: 'Wish them well and move on.' });
  void options;
  return script([line('A peddler with a mule and a cartload of odds and ends waves you over.'), choice]);
}

function resolveGather(ctx: Ctx, node: ExpNode, bonuses: TravelBonuses): NodeOutcome {
  const resource = GATHER_RESOURCE[node.type]!;
  const biome = biomeOf(ctx, node.biome);
  const [lo, hi] = biome.gather[resource] ?? GATHER_DEFAULT;
  const amount = Math.max(1, Math.round(ctx.rng.int(lo, hi) * yieldMult(bonuses, resource)));
  addResources(ctx, { [resource]: amount });
  ctx.state.expedition!.log.push(`Gathered ${amount} ${resource}.`);
  return { kind: 'text', title: `${nodeLabel(node.type)} · ${biome.name}`, lines: [`You gather ${amount} ${resource} and add it to the haul.`] };
}

function resolveCache(ctx: Ctx, node: ExpNode, bonuses: TravelBonuses): NodeOutcome {
  const biome = biomeOf(ctx, node.biome);
  const table = Object.entries(biome.gather) as [Resource, [number, number]][];
  const lines: string[] = ['Something left behind, or hidden on purpose.'];
  const found: Partial<Record<string, number>> = {};
  const picks = table.length ? [ctx.rng.pick(table), ...(table.length > 1 && ctx.rng.chance(0.5) ? [ctx.rng.pick(table)] : [])] : [];
  for (const [r, [lo, hi]] of picks) {
    found[r] = (found[r] ?? 0) + Math.max(1, Math.round(ctx.rng.int(lo, hi + 2) * yieldMult(bonuses, r)));
  }
  if (!picks.length) found.gold = ctx.rng.int(3, 8);
  addResources(ctx, found);
  lines.push(`You find ${haulText(found)}.`);
  const gifts = Object.values(ctx.content.items).filter((i) => i.kind === 'gift' && i.rarity === 'common');
  if (gifts.length && ctx.rng.chance(0.25)) {
    const gift = ctx.rng.pick(gifts);
    addItems(ctx, { [gift.id]: 1 });
    lines.push(`Tucked underneath: ${gift.name}.`);
  }
  ctx.state.expedition!.log.push(`Cache: ${haulText(found)}.`);
  return { kind: 'text', title: 'Cache', lines };
}

/**
 * Step onto a node of the next column. Moves the party and returns what happens
 * there; call completeNode() once the outcome has been played.
 */
export function travelTo(ctx: Ctx, row: number): NodeOutcome {
  const exp = ctx.state.expedition;
  if (!exp) throw new Error('not on an expedition');
  if (!reachable(exp).includes(row)) throw new Error('that node is out of reach');
  const node = exp.columns[exp.col + 1]![row]!;
  exp.col += 1;
  exp.row = row;
  exp.atCheckpoint = false;
  node.visited = true;
  const bonuses = travelBonuses(ctx);
  const biome = biomeOf(ctx, node.biome);
  const asScript = (e: Encounter): NodeOutcome => {
    if (!ctx.state.world.encountersSeen.includes(e.id)) ctx.state.world.encountersSeen.push(e.id);
    return { kind: 'script', id: `encounter:${e.id}`, script: e.script, biome: node.biome, node: node.type };
  };
  switch (node.type) {
    case 'battle':
    case 'elite': {
      const enemy = enemyFor(ctx, biome, node.type === 'elite');
      if (!enemy) return { kind: 'text', title: nodeLabel(node.type), lines: ['Tracks, and a smell. Whatever made them has moved on.'] };
      return { kind: 'battle', enemy, elite: node.type === 'elite', biome: node.biome, node: node.type };
    }
    case 'event': {
      const e = pickEncounter(ctx, 'event', node.biome);
      return e ? asScript(e) : { kind: 'text', title: 'The road', lines: [`The ${biome.name.toLowerCase()} is quiet. You walk on.`] };
    }
    case 'shrine': {
      const e = pickEncounter(ctx, 'shrine', node.biome);
      return e ? asScript(e) : { kind: 'script', id: 'shrine:default', script: defaultShrine(), biome: node.biome, node: node.type };
    }
    case 'traveler': {
      const e = pickEncounter(ctx, 'traveler', node.biome);
      return e ? asScript(e) : { kind: 'script', id: 'traveler:default', script: defaultTraveler(ctx), biome: node.biome, node: node.type };
    }
    case 'cache':
      return resolveCache(ctx, node, bonuses);
    case 'gather_wood':
    case 'gather_ore':
    case 'gather_herbs':
    case 'gather_food':
      return resolveGather(ctx, node, bonuses);
    case 'rest': {
      const e = pickEncounter(ctx, 'rest', node.biome);
      return e ? asScript(e) : { kind: 'text', title: 'Camp', lines: ['You make camp. The fire takes a while to catch, then holds.', 'Everyone sleeps until morning.'] };
    }
    case 'checkpoint':
    case 'boss':
    case 'settlement': {
      const e = node.encounter ? (ctx.content.encounters[node.encounter] ?? null) : pickEncounter(ctx, 'checkpoint', node.biome, node.pool);
      if (e) return asScript(e);
      if (node.final && exp.to) return { kind: 'text', title: townName(exp.to), lines: [`The road ends at the gates of ${townName(exp.to)}.`] };
      return { kind: 'text', title: 'Checkpoint', lines: ['A good place to stop and take stock.'] };
    }
    default:
      return { kind: 'none' };
  }
}

export function nodeEnergyCost(ctx: Ctx, node: ExpNode): number {
  const night = ctx.state.time.phase === 'night';
  let cost = night || node.biome === 'corrupted' ? NODE_ENERGY * 2 : NODE_ENERGY;
  cost += travelBonuses(ctx).energy_cost;
  return Math.max(0, cost);
}

/** Pay for the node just played: energy, time, companions who cannot go on. */
export function completeNode(ctx: Ctx): NodeCompletion {
  const s = ctx.state;
  const exp = s.expedition;
  const node = exp ? currentNode(exp) : null;
  if (!exp || !node) throw new Error('not on a node');
  const bonuses = travelBonuses(ctx);
  const withdrawn: string[] = [];
  const rested = node.type === 'rest';
  if (rested) {
    sleepUntilMorning(ctx);
    s.player.energy = Math.min(maxEnergy(s, ctx.content), s.player.energy + REST_ENERGY);
    for (const id of s.party) {
      const v = villagerState(s, ctx.content, id);
      v.energy = Math.min(ctx.content.villagers[id]?.profile.energy ?? 6, v.energy + REST_ENERGY);
    }
  } else {
    const cost = nodeEnergyCost(ctx, node);
    s.player.energy = Math.max(0, s.player.energy - cost);
    for (const id of [...s.party]) {
      const v = villagerState(s, ctx.content, id);
      v.energy = Math.max(0, v.energy - cost);
      // spent at the very gates: they have arrived, no need to turn back
      if (v.energy <= 0 && !node.final) {
        withdrawn.push(id);
        s.party = s.party.filter((x) => x !== id);
        exp.withdrawn.push(id);
        exp.log.push(`${ctx.content.villagers[id]?.profile.name ?? id} turned back, spent.`);
      }
    }
    if (bonuses.heal_per_node) s.player.hp = Math.min(maxHp(s, ctx.content), s.player.hp + bonuses.heal_per_node);
  }
  // spent before the day turns: dawn refills energy, but the road home was decided at dusk
  const exhausted = !rested && s.player.energy <= 0 && !node.final;
  if (!rested) advancePhases(ctx, 1);
  exp.atCheckpoint = node.checkpoint;
  return { withdrawn, exhausted, checkpoint: node.checkpoint, final: node.final, rested };
}

// --- the caravan ------------------------------------------------------------------

/** Chance the haul is ambushed: the base for how it travels, less every kind of protection. */
export function caravanRisk(ctx: Ctx, base: number, region: Region | undefined): number {
  let r = base;
  r -= (townBonuses(ctx.state, ctx.content).caravan_safety + residentTotals(ctx).caravan_safety) / 100;
  r += travelBonuses(ctx).ambush_chance / 100;
  r -= ctx.state.player.stats.luck * 0.01;
  if (region?.biomes.includes('corrupted')) r += 0.05 * ctx.state.world.corruption;
  return Math.max(0.05, Math.min(0.9, Math.round(r * 100) / 100));
}

function rollLoss(ctx: Ctx, caravan: Pick<Caravan, 'resources' | 'items' | 'risk'>): { arrived: Partial<Record<Resource, number>>; lost: Partial<Record<Resource, number>>; ambushed: boolean } {
  const arrived: Partial<Record<Resource, number>> = {};
  const lost: Partial<Record<Resource, number>> = {};
  const ambushed = ctx.rng.chance(caravan.risk);
  const [lo, hi] = ctx.content.progression.caravan.loss_fraction;
  const fraction = ambushed ? lo + ctx.rng.next() * (hi - lo) : 0;
  for (const [r, n] of Object.entries(caravan.resources) as [Resource, number][]) {
    if (!n) continue;
    const gone = ambushed ? Math.min(n, Math.max(n >= 2 ? 1 : 0, Math.floor(n * fraction))) : 0;
    if (gone) lost[r] = gone;
    if (n - gone) arrived[r] = n - gone;
  }
  return { arrived, lost, ambushed };
}

function deliver(ctx: Ctx, caravan: Pick<Caravan, 'resources' | 'items' | 'risk' | 'region'>, how: string): string {
  const { arrived, lost, ambushed } = rollLoss(ctx, caravan);
  for (const [r, n] of Object.entries(arrived) as [Resource, number][]) ctx.state.town.resources[r] += n;
  for (const [id, n] of Object.entries(caravan.items)) ctx.state.town.storage[id] = (ctx.state.town.storage[id] ?? 0) + n;
  const name = ctx.content.regions[caravan.region]?.name ?? caravan.region;
  if (ambushed) return `${how} from ${name} was ambushed on the way. Lost: ${haulText(lost)}. Made it: ${haulText(arrived, caravan.items)}.`;
  return `${how} from ${name} arrived safely: ${haulText(arrived, caravan.items)}.`;
}

/** At a checkpoint: send everything gathered so far home ahead of you. */
export function sendHaulHome(ctx: Ctx): Caravan | null {
  const exp = ctx.state.expedition;
  if (!exp || !exp.atCheckpoint) return null;
  if (!Object.values(exp.haul).some((n) => (n ?? 0) > 0) && !Object.keys(exp.items).length) return null;
  const region = ctx.content.regions[exp.region];
  const node = currentNode(exp)!;
  const caravan: Caravan = {
    id: (ctx.state.caravans.reduce((m, c) => Math.max(m, c.id), 0) || 0) + 1,
    region: exp.region,
    resources: { ...exp.haul },
    items: { ...exp.items },
    arrivesDay: ctx.state.time.day + Math.max(1, node.segment + 1),
    risk: caravanRisk(ctx, ctx.content.progression.caravan.loss_chance_checkpoint, region),
  };
  ctx.state.caravans.push(caravan);
  exp.haul = {};
  exp.items = {};
  exp.log.push(`Sent a caravan home with ${haulText(caravan.resources, caravan.items)}.`);
  return caravan;
}

/** Morning: caravans that are due arrive (or do not, entirely). */
export function resolveCaravans(ctx: Ctx): void {
  const due = ctx.state.caravans.filter((c) => c.arrivesDay <= ctx.state.time.day);
  if (!due.length) return;
  ctx.state.caravans = ctx.state.caravans.filter((c) => c.arrivesDay > ctx.state.time.day);
  for (const c of due) ctx.state.notices.push(deliver(ctx, c, 'The caravan you sent'));
}

function homeSpawn(ctx: Ctx): { map: string; spawn: string } {
  const map = ctx.content.maps.withergate;
  const spawn = map?.entities.find((e) => e.type === 'spawn' && e.id === 'from_east_road') ?? map?.entities.find((e) => e.type === 'spawn');
  return { map: map ? 'withergate' : Object.keys(ctx.content.maps)[0]!, spawn: spawn?.id ?? 'default' };
}

function resetAtHome(ctx: Ctx): void {
  const s = ctx.state;
  s.player.hp = maxHp(s, ctx.content);
  s.player.energy = maxEnergy(s, ctx.content);
  s.party = [];
  s.expedition = null;
  ctx.requests.push({ kind: 'npc_refresh' });
}

/**
 * Turn for home from a checkpoint or a camp (or because you are spent). The way
 * back is quicker than the way out; the haul you carry is at risk once, at the end.
 */
export function headHome(ctx: Ctx): { days: number; report: string[] } {
  const exp = ctx.state.expedition;
  if (!exp) throw new Error('not on an expedition');
  const region = ctx.content.regions[exp.region];
  const days = Math.max(1, Math.ceil((exp.col + 1) / (NODES_PER_SEGMENT * 2)));
  for (let d = 0; d < days; d += 1) sleepUntilMorning(ctx);
  const report: string[] = [];
  if (Object.values(exp.haul).some((n) => (n ?? 0) > 0) || Object.keys(exp.items).length) {
    report.push(deliver(ctx, { resources: exp.haul, items: exp.items, risk: caravanRisk(ctx, ctx.content.progression.caravan.loss_chance_end, region), region: exp.region }, 'The haul you carried'));
  }
  report.push(`Home again after ${days} day${days === 1 ? '' : 's'} on the road.`);
  const home = homeSpawn(ctx);
  resetAtHome(ctx);
  ctx.requests.push({ kind: 'teleport', map: home.map, spawn: home.spawn });
  return { days, report };
}

/**
 * The final checkpoint: arrive at the destination town (the haul goes home by
 * caravan from there), or back at Withergate with the haul you carried.
 */
export function arrive(ctx: Ctx): { map: string; spawn: string; report: string[] } {
  const exp = ctx.state.expedition;
  if (!exp) throw new Error('not on an expedition');
  const region = ctx.content.regions[exp.region];
  const report: string[] = [];
  const hasHaul = Object.values(exp.haul).some((n) => (n ?? 0) > 0) || Object.keys(exp.items).length > 0;
  if (!exp.to || exp.to === 'withergate') {
    if (hasHaul) report.push(deliver(ctx, { resources: exp.haul, items: exp.items, risk: caravanRisk(ctx, ctx.content.progression.caravan.loss_chance_end, region), region: exp.region }, 'The haul you carried'));
    report.push(exp.to ? 'Withergate. Home.' : `Back from ${region?.name ?? 'the wild'}.`);
    const home = homeSpawn(ctx);
    resetAtHome(ctx);
    ctx.requests.push({ kind: 'teleport', map: home.map, spawn: home.spawn });
    return { ...home, report };
  }
  const townMap = Object.values(ctx.content.maps).find((m) => m.town === exp.to);
  if (hasHaul) {
    const caravan: Caravan = {
      id: (ctx.state.caravans.reduce((m, c) => Math.max(m, c.id), 0) || 0) + 1,
      region: exp.region,
      resources: { ...exp.haul },
      items: { ...exp.items },
      arrivesDay: ctx.state.time.day + Math.max(1, region ? routeDaysFor(ctx, region) : 1),
      risk: caravanRisk(ctx, ctx.content.progression.caravan.loss_chance_end, region),
    };
    ctx.state.caravans.push(caravan);
    report.push(`You hire a cart at the gates to carry the haul home: ${haulText(caravan.resources, caravan.items)}. It should arrive in ${caravan.arrivesDay - ctx.state.time.day} day${caravan.arrivesDay - ctx.state.time.day === 1 ? '' : 's'}.`);
  }
  ctx.state.expedition = null;
  ctx.requests.push({ kind: 'npc_refresh' });
  if (!townMap) {
    // No map for the town yet: the visit is abstract and you walk straight back.
    report.push(`[PLACEHOLDER: ${townName(exp.to)} has no map yet. You look around, and turn for home.]`);
    for (let d = 0; d < (region ? routeDaysFor(ctx, region) : 1); d += 1) sleepUntilMorning(ctx);
    const home = homeSpawn(ctx);
    resetAtHome(ctx);
    ctx.requests.push({ kind: 'teleport', map: home.map, spawn: home.spawn });
    return { ...home, report };
  }
  const spawn = townMap.entities.find((e) => e.type === 'spawn' && e.id === 'from_road') ?? townMap.entities.find((e) => e.type === 'spawn');
  report.push(`${townName(exp.to)}. ${ctx.state.party.length ? 'Your companions stretch and look around.' : ''}`.trim());
  ctx.requests.push({ kind: 'teleport', map: townMap.id, spawn: spawn?.id ?? 'default' });
  return { map: townMap.id, spawn: spawn?.id ?? 'default', report };
}

/** Death on the road: the haul is lost and the expedition is over (applyDefeat handles the rest). */
export function endExpeditionByDeath(ctx: Ctx): void {
  const exp = ctx.state.expedition;
  if (!exp) return;
  ctx.state.expedition = null;
  ctx.state.notices.push(`Whatever you gathered on ${ctx.content.regions[exp.region]?.name ?? 'the road'} is lost.`);
}

/** Text for the map header. */
export function expeditionSummary(ctx: Ctx, exp: ExpeditionState): { region: string; segment: number; segments: number; haul: string } {
  const region = ctx.content.regions[exp.region];
  const node = currentNode(exp);
  const segments = exp.columns.filter((c) => c[0]?.checkpoint).length;
  return { region: region?.name ?? exp.region, segment: (node?.segment ?? 0) + 1, segments, haul: haulText(exp.haul, exp.items) };
}

export function isInExpedition(state: GameState): boolean {
  return !!state.expedition;
}
