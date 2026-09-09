// Ascension (Phase 8): when the shrine lets you go, and what the game names you.
// The title is generated from the five hidden axes (decided: earned, not chosen; a
// secret until now, F5). Words come from content/ascension.yaml.
import { DOMAINS, DOMAIN_LABELS } from '@withergate/shared';
import type { Domain } from '@withergate/shared';
import { evaluate } from './conditions';
import type { Ctx } from './ctx';
import { faithLevel, residents } from './state';

export interface DeityTitle {
  /** "Name the Beloved, Goddess of Hearth and Kin" */
  title: string;
  primary: Domain;
  secondary: Domain | null;
  points: Record<Domain, number>;
}

export interface EndingSummary extends DeityTitle {
  name: string;
  day: number;
  residents: number;
  faithLevel: number;
  corruption: number;
  questsDone: number;
}

/** Why the shrine will not let you ascend yet, or null when it will. */
export function canAscend(ctx: Ctx): string | null {
  const a = ctx.content.ascension;
  if (a.requires && !evaluate(a.requires, ctx)) return a.not_yet;
  return null;
}

/** The strongest axis gives the epithet; it and the runner-up (if at least half as strong) give the domains. */
export function deityTitle(ctx: Ctx): DeityTitle {
  const s = ctx.state;
  const points = { ...s.player.domainPoints };
  const ranked = [...DOMAINS].sort((a, b) => points[b] - points[a] || DOMAINS.indexOf(a) - DOMAINS.indexOf(b));
  const primary = ranked[0]!;
  const runnerUp = ranked[1]!;
  const secondary = points[runnerUp] > 0 && points[runnerUp] * 2 >= points[primary] ? runnerUp : null;
  const words = ctx.content.ascension.titles;
  const epithet = words[primary]?.epithet ?? `the ${DOMAIN_LABELS[primary]}`;
  const domains = [primary, secondary].filter((d): d is Domain => !!d).map((d) => words[d]?.domain ?? DOMAIN_LABELS[d]);
  const godhood = s.player.form === 'masc' ? 'God' : 'Goddess';
  return { title: `${s.player.name} ${epithet}, ${godhood} of ${domains.join(' and ')}`, primary, secondary, points };
}

/** Seal the game: the ending summary, recorded on the save. */
export function ascend(ctx: Ctx): EndingSummary {
  const s = ctx.state;
  const t = deityTitle(ctx);
  const summary: EndingSummary = {
    ...t,
    name: s.player.name,
    day: s.time.day,
    residents: residents(s).length,
    faithLevel: faithLevel(s, ctx.content),
    corruption: s.world.corruption,
    questsDone: Object.values(s.quests).filter((q) => q.status === 'done').length,
  };
  s.ended = { day: s.time.day, title: t.title };
  return summary;
}
