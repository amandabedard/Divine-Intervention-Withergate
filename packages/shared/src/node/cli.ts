// Content validator CLI.
//   npm run validate                 schema + cross-reference check
//   npm run validate -- --coverage   also print the per-villager coverage report
//   npm run validate -- --json       machine-readable output
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetManifest, GeneratedIndex } from '../assets.ts';
import type { Issue } from '../bundle.ts';
import { loadContent } from './loader.ts';
import type { CoverageReport } from './coverage.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(name);

function loadAssetsIndex(): GeneratedIndex | null {
  const p = path.join(repoRoot, 'game', 'public', 'generated', 'index.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as GeneratedIndex;
  } catch {
    return null;
  }
}

function loadManifest(): AssetManifest | null {
  const p = path.join(repoRoot, 'assets', 'manifest.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as AssetManifest;
  } catch {
    return null;
  }
}

function formatIssue(i: Issue): string {
  const where = i.line ? `${i.file}:${i.line}${i.col ? `:${i.col}` : ''}` : i.file;
  return `${where}  [${i.level}]  ${i.message}${i.path ? `  (${i.path})` : ''}`;
}

function printCoverage(c: CoverageReport): void {
  console.log('\nCoverage');
  console.log('--------');
  for (const v of c.villagers) {
    const chat = (['stranger', 'acquaintance', 'friend', 'best_friend'] as const)
      .map((t) => `${t.slice(0, 3)}:${v.chatByTier[t]}`)
      .join(' ');
    console.log(
      `${v.name} (${v.id})${v.romanceable ? ' ♥' : ''}${v.recruitable ? ' [recruitable]' : ''}\n` +
        `  chat ${chat} | topics ${v.topics} (♥${v.heartTopics} !${v.questTopics}) | flirt ${v.flirtStates.join('/') || '-'} | gifts ${v.giftCategories.length}/5 +${v.giftOverrides} | events ${v.events} | barks ${v.barks} | placeholders ${v.placeholders}`,
    );
    if (v.missing.length) console.log(`  still to write: ${v.missing.join(', ')}`);
  }
  console.log(`\nTags in use: ${c.tags.join(', ') || '-'}`);
  console.log(`Flags in use: ${c.flags.join(', ') || '-'}`);
  console.log(`Lines: ${c.totals.lines}, placeholders: ${c.totals.placeholders}`);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'validate';
  const root = path.resolve(arg('--root') ?? path.join(repoRoot, 'content'));
  const coverage = flag('--coverage');
  const json = flag('--json');

  const result = await loadContent({ root, assets: loadAssetsIndex(), manifest: loadManifest(), coverage });
  const errors = result.issues.filter((i) => i.level === 'error');
  const warnings = result.issues.filter((i) => i.level === 'warning');

  if (command === 'build') {
    const out = path.join(repoRoot, 'game', 'public', 'generated', 'content.json');
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(result.bundle));
    console.log(`wrote ${path.relative(repoRoot, out)}`);
  }

  if (json) {
    console.log(JSON.stringify({ issues: result.issues, stats: result.bundle.stats, coverage: result.coverage }, null, 2));
  } else {
    const sorted = [...result.issues].sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
    for (const i of sorted) console.log(formatIssue(i));
    const s = result.bundle.stats;
    console.log(
      `\n${s.files} files, ${s.villagers} characters, ${s.maps} maps, ${s.lines} lines (${s.placeholders} placeholders): ` +
        `${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`,
    );
    if (result.coverage) printCoverage(result.coverage);
  }
  process.exitCode = errors.length ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
