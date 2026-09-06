import { describe, expect, it } from 'vitest';
import { RawScriptSchema, RawStepSchema, normalizeScript, normalizeStep } from '../src/script';
import type { NormalizeCtx } from '../src/script';

const ctx = (): NormalizeCtx => ({ defaultSpeaker: 'mara', idPrefix: 'test', counter: { n: 0 } });

describe('step schema', () => {
  it('accepts every shorthand', () => {
    const steps = [
      'Plain line.',
      { mara: 'Hi.' },
      { 'mara(sad)': 'Oh.' },
      { you: 'Hello.' },
      { narrate: 'Wind.' },
      { say: 'mara', mood: 'soft', text: 'Long form.' },
      { choice: [{ text: 'A', effects: { friendship: 5 } }, { text: 'B', requires: { tier: 'friend+' } }] },
      { if: { flags: ['x'] }, then: ['yes'], else: ['no'] },
      { check: { stat: 'charisma', dc: 12 }, success: ['ok'], fail: ['nope'] },
      { effects: { flags: { mara_told: true }, tags: ['kind'] } },
      { goto: 'hub' },
      { run: 'shared/awkward' },
      { random: [['a'], { weight: 2, then: ['b'] }] },
      'end',
      { end: 'close' },
      { battle: { enemy: 'hollow_wolf', on_win: ['won'] } },
      { move: { who: 'mara', to: 'wheel', wait: true } },
      { fade: 'out' },
      { wait: 0.5 },
      { emote: { who: 'mara', icon: '!' } },
    ];
    for (const s of steps) {
      const r = RawStepSchema.safeParse(s);
      expect(r.success, JSON.stringify(s)).toBe(true);
    }
  });

  it('rejects malformed steps', () => {
    expect(RawStepSchema.safeParse({ mara: 'a', tobin: 'b' }).success).toBe(false);
    expect(RawStepSchema.safeParse({ choice: 'nope' }).success).toBe(false);
    expect(RawStepSchema.safeParse({ 'Mara Holt': 'caps and spaces' }).success).toBe(false);
  });

  it('requires a start node in node form', () => {
    expect(RawScriptSchema.safeParse({ nodes: { hub: ['x'] } }).success).toBe(false);
    expect(RawScriptSchema.safeParse({ nodes: { start: ['x'] } }).success).toBe(true);
  });
});

describe('normalisation', () => {
  it('fills the default speaker and parses moods', () => {
    expect(normalizeStep('Hello.', ctx(), [])).toMatchObject({ kind: 'line', speaker: 'mara', text: 'Hello.' });
    expect(normalizeStep({ 'tobin(angry)': 'Out!' }, ctx(), [])).toMatchObject({
      kind: 'line',
      speaker: 'tobin',
      mood: 'angry',
      text: 'Out!',
    });
    expect(normalizeStep('end', ctx(), [])).toMatchObject({ kind: 'end', mode: 'menu' });
  });

  it('wraps a bare list into a start node and ids options', () => {
    const s = normalizeScript(
      [{ choice: [{ text: 'A' }, { text: 'B', then: [{ choice: [{ text: 'C' }] }] }] }],
      ctx(),
      [],
    );
    const first = s.nodes.start![0]!;
    expect(first.kind).toBe('choice');
    if (first.kind === 'choice') {
      expect(first.options.map((o) => o.id)).toEqual(['test#1', 'test#2']);
      const nested = first.options[1]!.then![0]!;
      if (nested.kind === 'choice') expect(nested.options[0]!.id).toBe('test#3');
    }
  });
});
