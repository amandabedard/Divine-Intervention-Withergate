import { PLACEHOLDER_RE } from '../bundle.ts';
import type { ContentBundle } from '../bundle.ts';
import { matchesOrdered } from '../condition.ts';
import { GIFT_CATEGORIES, ROMANCE_STATES, TIERS } from '../ids.ts';
import type { GiftCategory, Tier } from '../ids.ts';
import { collectEffects, forEachStep } from '../script.ts';
import type { Step } from '../script.ts';

export interface VillagerCoverage {
  id: string;
  name: string;
  romanceable: boolean;
  recruitable: boolean;
  chatByTier: Record<Tier, number>;
  topics: number;
  heartTopics: number;
  questTopics: number;
  flirtStates: string[];
  giftCategories: GiftCategory[];
  giftOverrides: number;
  events: number;
  hasRecruitScript: boolean;
  barks: number;
  placeholders: number;
  missing: string[];
}

export interface CoverageReport {
  villagers: VillagerCoverage[];
  tags: string[];
  flags: string[];
  totals: { lines: number; placeholders: number; villagers: number };
}

const CORE_TIERS: Tier[] = ['stranger', 'acquaintance', 'friend', 'best_friend'];

export function buildCoverage(bundle: ContentBundle): CoverageReport {
  const tags = new Set<string>();
  const flags = new Set<string>();

  const scan = (steps: Step[]) => {
    for (const e of collectEffects(steps)) {
      for (const t of e.tags ?? []) tags.add(t);
      for (const t of e.remove_tags ?? []) tags.add(t);
      for (const f of Object.keys(e.flags ?? {})) flags.add(f);
      for (const f of Object.keys(e.increment ?? {})) flags.add(f);
      for (const f of e.clear_flags ?? []) flags.add(f);
    }
  };
  const countPlaceholders = (steps: Step[]): number => {
    let n = 0;
    forEachStep(steps, (s) => {
      if (s.kind === 'line' && PLACEHOLDER_RE.test(s.text)) n += 1;
      if (s.kind === 'choice') for (const o of s.options) if (PLACEHOLDER_RE.test(o.text)) n += 1;
    });
    return n;
  };

  const villagers: VillagerCoverage[] = [];
  for (const v of Object.values(bundle.villagers)) {
    const p = v.profile;
    for (const t of Object.keys(p.tag_affinity ?? {})) tags.add(t);
    const chatByTier = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>;
    let placeholders = PLACEHOLDER_RE.test(p.bio) ? 1 : 0;
    for (const pool of v.chat) {
      const applies = pool.when?.tier
        ? TIERS.filter((t) => matchesOrdered(TIERS, t, pool.when!.tier!))
        : [...TIERS];
      for (const t of applies) chatByTier[t] += pool.lines.length;
      for (const l of pool.lines) {
        scan(l);
        placeholders += countPlaceholders(l);
      }
    }
    const flirtStates = new Set<string>();
    for (const pool of v.flirt) {
      const r = pool.when?.romance;
      const applies = r ? ROMANCE_STATES.filter((s) => matchesOrdered(ROMANCE_STATES, s, r)) : [...ROMANCE_STATES];
      for (const s of applies) flirtStates.add(s);
      for (const l of pool.lines) {
        scan(l);
        placeholders += countPlaceholders(l);
      }
    }
    let heartTopics = 0;
    let questTopics = 0;
    for (const t of v.discuss) {
      if (t.marker === 'heart') heartTopics += 1;
      if (t.marker === 'quest') questTopics += 1;
      for (const n of Object.values(t.script.nodes)) {
        scan(n);
        placeholders += countPlaceholders(n);
      }
    }
    const giftCategories = GIFT_CATEGORIES.filter((c) => (v.gifts.reactions[c]?.length ?? 0) > 0);
    for (const l of Object.values(v.gifts.reactions)) for (const e of l ?? []) placeholders += countPlaceholders(e);
    for (const ovs of Object.values(v.gifts.overrides)) for (const o of ovs) for (const e of o.lines) placeholders += countPlaceholders(e);
    for (const ev of v.events) {
      for (const n of Object.values(ev.script.nodes)) {
        scan(n);
        placeholders += countPlaceholders(n);
      }
    }
    if (v.recruit) {
      for (const n of Object.values(v.recruit.script.nodes)) {
        scan(n);
        placeholders += countPlaceholders(n);
      }
    }
    let barks = 0;
    for (const b of Object.values(v.barks)) barks += b?.length ?? 0;

    const missing: string[] = [];
    for (const t of CORE_TIERS) if (chatByTier[t] < 4) missing.push(`chat ${t} (${chatByTier[t]}/4)`);
    if (v.discuss.length < 6) missing.push(`topics (${v.discuss.length}/6)`);
    if (p.romanceable) {
      for (const s of ROMANCE_STATES) if (!flirtStates.has(s)) missing.push(`flirt ${s}`);
    }
    for (const c of GIFT_CATEGORIES) if (!giftCategories.includes(c)) missing.push(`gift ${c}`);
    const wantEvents = p.romanceable ? 4 : 3;
    if (v.events.length < wantEvents) missing.push(`heart events (${v.events.length}/${wantEvents})`);
    if (p.recruit && !v.recruit) missing.push('recruit script');
    if (p.recruit && barks < 6) missing.push(`barks (${barks}/6)`);

    villagers.push({
      id: p.id,
      name: p.name,
      romanceable: p.romanceable,
      recruitable: !!p.recruit,
      chatByTier,
      topics: v.discuss.length,
      heartTopics,
      questTopics,
      flirtStates: [...flirtStates],
      giftCategories,
      giftOverrides: Object.keys(v.gifts.overrides).length,
      events: v.events.length,
      hasRecruitScript: !!v.recruit,
      barks,
      placeholders,
      missing,
    });
  }

  for (const e of Object.values(bundle.encounters)) for (const n of Object.values(e.script.nodes)) scan(n);
  for (const c of Object.values(bundle.cutscenes)) for (const n of Object.values(c.script.nodes)) scan(n);
  for (const q of Object.values(bundle.quests)) {
    if (q.rewards) for (const t of q.rewards.tags ?? []) tags.add(t);
  }

  return {
    villagers,
    tags: [...tags].sort(),
    flags: [...flags].sort(),
    totals: {
      lines: bundle.stats.lines,
      placeholders: bundle.stats.placeholders,
      villagers: villagers.length,
    },
  };
}
