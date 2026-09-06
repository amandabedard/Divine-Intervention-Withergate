import { describe, expect, it } from 'vitest';
import { ConditionSchema, matchesOrdered } from '../src/condition';
import { TIERS } from '../src/ids';

describe('tier expressions', () => {
  it('matches exact, at-least and at-most', () => {
    expect(matchesOrdered(TIERS, 'friend', 'friend')).toBe(true);
    expect(matchesOrdered(TIERS, 'best_friend', 'friend+')).toBe(true);
    expect(matchesOrdered(TIERS, 'acquaintance', 'friend+')).toBe(false);
    expect(matchesOrdered(TIERS, 'stranger', 'acquaintance-')).toBe(true);
    expect(matchesOrdered(TIERS, 'friend', 'acquaintance-')).toBe(false);
  });
});

describe('ConditionSchema', () => {
  it('accepts nested combinators', () => {
    const r = ConditionSchema.safeParse({
      any: [{ tier: 'best_friend' }, { romance: 'lover' }],
      not: { flags: ['mara_left'] },
      time: ['evening', 'night'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown keys and bad tiers', () => {
    expect(ConditionSchema.safeParse({ teir: 'friend' }).success).toBe(false);
    expect(ConditionSchema.safeParse({ tier: 'bestie' }).success).toBe(false);
    expect(ConditionSchema.safeParse({ tier: 'friend++' }).success).toBe(false);
  });
});
