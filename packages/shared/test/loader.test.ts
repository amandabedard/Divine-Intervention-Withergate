import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/node/loader';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('repo content', () => {
  it('loads without errors', async () => {
    const result = await loadContent({ root: path.resolve(here, '../../../content'), coverage: true });
    const errors = result.issues.filter((i) => i.level === 'error');
    expect(errors.map((e) => `${e.file}:${e.line ?? '?'} ${e.message}`)).toEqual([]);
    expect(Object.keys(result.bundle.villagers)).toContain('aldric');
    expect(Object.keys(result.bundle.maps)).toContain('withergate');
    expect(result.coverage?.villagers.length).toBeGreaterThan(0);
  });
});

describe('broken fixture', () => {
  it('reports the planted mistakes with file and line', async () => {
    const result = await loadContent({ root: path.join(here, 'fixtures', 'broken') });
    const msgs = result.issues.filter((i) => i.level === 'error').map((i) => `${i.file}:${i.line ?? '?'} ${i.message}`);
    expect(msgs.some((m) => m.startsWith('villagers/bad/discuss.yaml:') && m.includes('unknown speaker "nobody"'))).toBe(true);
    expect(msgs.some((m) => m.includes('goto: no node named "missing"'))).toBe(true);
    expect(msgs.some((m) => m.includes('gifts.loved: unknown item "ghost_item"'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('villagers/bad/chat.yaml:') && m.includes('teir'))).toBe(true);
    expect(msgs.some((m) => m.includes('exit "east": unknown map "nowhere"'))).toBe(true);
  });
});
