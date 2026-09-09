import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import type { z } from 'zod';
import type { AssetManifest, GeneratedIndex } from '../assets.ts';
import { PLACEHOLDER_RE, emptyBundle } from '../bundle.ts';
import type { ContentBundle, Issue } from '../bundle.ts';
import { GameMapSchema } from '../map.ts';
import {
  RawScriptSchema,
  forEachStep,
  normalizeEffects,
  normalizeLineEntry,
  normalizeScript,
  normalizeSteps,
} from '../script.ts';
import type { NormalizeCtx, PathSeg, RawLineEntry, Step } from '../script.ts';
import {
  BarksFileSchema,
  DiscussFileSchema,
  EventFileSchema,
  GiftsFileSchema,
  PoolFileSchema,
  ProfileSchema,
  RecruitFileSchema,
} from '../villager.ts';
import type { Barks, GiftOverride, HeartEvent, Pool, Topic, VillagerBundle } from '../villager.ts';
import {
  AscensionSchema,
  BiomesFileSchema,
  CutsceneSchema,
  EconomySchema,
  EncounterSchema,
  EnemySchema,
  FacilitiesFileSchema,
  IntroSchema,
  ItemsFileSchema,
  PowersFileSchema,
  ProgressionSchema,
  QuestSchema,
  RegionsFileSchema,
  TavernFileSchema,
  WeaponsFileSchema,
} from '../world.ts';
import type { Enemy, Quest } from '../world.ts';
import { buildCoverage } from './coverage.ts';
import type { CoverageReport } from './coverage.ts';
import { crossCheck } from './crossref.ts';
import { locateIn, parseYamlText, validateFile } from './yaml.ts';
import type { ParsedFile } from './yaml.ts';

export interface LoadOptions {
  /** Absolute path of the content directory. */
  root: string;
  /** Generated asset index, used to warn about missing busts/sprites. */
  assets?: GeneratedIndex | null;
  /** assets/manifest.json, used to warn about unknown asset ids in maps. */
  manifest?: AssetManifest | null;
  /** Compute the per-villager coverage report. */
  coverage?: boolean;
}

export interface LoadResult {
  bundle: ContentBundle;
  issues: Issue[];
  coverage?: CoverageReport;
}

const VILLAGER_FILES = new Set([
  'profile.yaml',
  'chat.yaml',
  'discuss.yaml',
  'flirt.yaml',
  'gifts.yaml',
  'recruit.yaml',
  'barks.yaml',
]);

/** Load, validate, normalise and cross-check everything under content/. */
export async function loadContent(opts: LoadOptions): Promise<LoadResult> {
  const root = opts.root;
  const issues: Issue[] = [];
  const bundle = emptyBundle();
  const parsed = new Map<string, ParsedFile>();

  const files = (
    await fg(['**/*.yaml', '**/*.yml', 'maps/*.map.json'], { cwd: root, onlyFiles: true })
  ).sort();
  bundle.stats.files = files.length;

  const read = async (rel: string): Promise<ParsedFile | undefined> => {
    const abs = path.join(root, rel);
    const text = await readFile(abs, 'utf8');
    const { file, issues: parseIssues } = parseYamlText(rel, abs, text);
    issues.push(...parseIssues);
    if (file) parsed.set(rel, file);
    return file;
  };

  const mkCtx = (pf: ParsedFile, defaultSpeaker: string): NormalizeCtx => ({
    defaultSpeaker,
    idPrefix: pf.rel,
    counter: { n: 0 },
    locate: (p: PathSeg[]) => {
      const pos = locateIn(pf, p);
      return pos ? `${pf.rel}:${pos.line}` : pf.rel;
    },
  });

  const single = async <S extends z.ZodType>(rel: string, schema: S): Promise<{ pf: ParsedFile; data: z.output<S> } | undefined> => {
    if (!files.includes(rel)) return undefined;
    const pf = await read(rel);
    if (!pf) return undefined;
    const data = validateFile(schema, pf, issues);
    return data === undefined ? undefined : { pf, data };
  };

  const dup = (kind: string, id: string, rel: string, table: Record<string, unknown>): boolean => {
    if (id in table) {
      issues.push({ level: 'error', file: rel, message: `duplicate ${kind} id "${id}"` });
      return true;
    }
    return false;
  };

  // --- villagers ---------------------------------------------------------
  const villagerDirs = new Map<string, string[]>();
  for (const f of files) {
    const m = /^villagers\/([^/]+)\/(.+)$/.exec(f);
    if (m) {
      const list = villagerDirs.get(m[1]!) ?? [];
      list.push(m[2]!);
      villagerDirs.set(m[1]!, list);
    }
  }

  for (const [folder, rels] of villagerDirs) {
    const base = `villagers/${folder}`;
    if (!rels.includes('profile.yaml')) {
      issues.push({ level: 'error', file: `${base}/`, message: 'villager folder has no profile.yaml' });
      continue;
    }
    const profilePf = await read(`${base}/profile.yaml`);
    if (!profilePf) continue;
    const profile = validateFile(ProfileSchema, profilePf, issues);
    if (!profile) continue;
    if (profile.id !== folder) {
      issues.push({
        level: 'error',
        file: profilePf.rel,
        line: locateIn(profilePf, ['id'])?.line,
        message: `profile id "${profile.id}" must match the folder name "${folder}"`,
      });
      continue;
    }
    if (dup('villager', profile.id, profilePf.rel, bundle.villagers)) continue;

    const vb: VillagerBundle = {
      profile,
      chat: [],
      flirt: [],
      discuss: [],
      gifts: { reactions: {}, overrides: {} },
      barks: {},
      events: [],
      files: { profile: profilePf.rel },
    };
    const speaker = profile.id;

    const poolsFrom = (
      data: z.output<typeof PoolFileSchema>,
      pf: ParsedFile,
    ): Pool[] =>
      data.pools.map((p, i) => {
        const ctx = mkCtx(pf, speaker);
        return {
          when: p.when,
          weight: p.weight ?? 1,
          effects: p.effects ? normalizeEffects(p.effects, ctx, ['pools', i, 'effects']) : undefined,
          lines: p.lines.map((l: RawLineEntry, j: number) => normalizeLineEntry(l, ctx, ['pools', i, 'lines', j])),
        };
      });

    for (const rel of rels) {
      const full = `${base}/${rel}`;
      if (rel === 'profile.yaml') continue;
      if (rel.startsWith('events/')) {
        const pf = await read(full);
        if (!pf) continue;
        const data = validateFile(EventFileSchema, pf, issues);
        if (!data) continue;
        const ctx = mkCtx(pf, speaker);
        const ev: HeartEvent = {
          id: data.id,
          villager: speaker,
          title: data.title,
          trigger: data.trigger,
          stage: data.stage,
          script: normalizeScript(data.script, ctx, ['script']),
        };
        vb.events.push(ev);
        vb.files[`event:${data.id}`] = pf.rel;
        continue;
      }
      if (!VILLAGER_FILES.has(rel)) {
        issues.push({ level: 'warning', file: full, message: 'unexpected file in a villager folder (ignored)' });
        continue;
      }
      const pf = await read(full);
      if (!pf) continue;
      vb.files[rel.replace('.yaml', '')] = pf.rel;
      switch (rel) {
        case 'chat.yaml': {
          const data = validateFile(PoolFileSchema, pf, issues);
          if (data) vb.chat = poolsFrom(data, pf);
          break;
        }
        case 'flirt.yaml': {
          const data = validateFile(PoolFileSchema, pf, issues);
          if (data) vb.flirt = poolsFrom(data, pf);
          break;
        }
        case 'discuss.yaml': {
          const data = validateFile(DiscussFileSchema, pf, issues);
          if (!data) break;
          const ctx = mkCtx(pf, speaker);
          const seen = new Set<string>();
          vb.discuss = data.topics.map((t, i): Topic => {
            if (seen.has(t.id)) {
              issues.push({ level: 'error', file: pf.rel, line: locateIn(pf, ['topics', i, 'id'])?.line, message: `duplicate topic id "${t.id}"` });
            }
            seen.add(t.id);
            return {
              id: t.id,
              label: t.label,
              marker: t.marker,
              requires: t.requires,
              once: t.repeatable ? false : t.once,
              repeatable: t.repeatable,
              cost: t.cost,
              script: normalizeScript(t.script, ctx, ['topics', i, 'script']),
            };
          });
          break;
        }
        case 'gifts.yaml': {
          const data = validateFile(GiftsFileSchema, pf, issues);
          if (!data) break;
          const ctx = mkCtx(pf, speaker);
          for (const [cat, lines] of Object.entries(data.reactions)) {
            if (!lines) continue;
            vb.gifts.reactions[cat as keyof typeof vb.gifts.reactions] = lines.map((l, j) =>
              normalizeLineEntry(l, ctx, ['reactions', cat, j]),
            );
          }
          for (const [item, ov] of Object.entries(data.overrides ?? {})) {
            const list = Array.isArray(ov) ? ov : [ov];
            vb.gifts.overrides[item] = list.map(
              (o, j): GiftOverride => ({
                when: o.when,
                lines: o.lines.map((l, k) => normalizeLineEntry(l, ctx, ['overrides', item, j, 'lines', k])),
                effects: o.effects ? normalizeEffects(o.effects, ctx, ['overrides', item, j, 'effects']) : undefined,
              }),
            );
          }
          break;
        }
        case 'recruit.yaml': {
          const data = validateFile(RecruitFileSchema, pf, issues);
          if (!data) break;
          const ctx = mkCtx(pf, speaker);
          vb.recruit = {
            topic_label: data.topic_label,
            script: normalizeScript(data.script, ctx, ['script']),
            unhappy: (data.unhappy ?? []).map((u, i) => ({
              when: u.when,
              lines: u.lines.map((l, j) => normalizeLineEntry(l, ctx, ['unhappy', i, 'lines', j])),
            })),
            farewell: data.farewell ? normalizeScript(data.farewell, ctx, ['farewell']) : undefined,
          };
          break;
        }
        case 'barks.yaml': {
          const data = validateFile(BarksFileSchema, pf, issues);
          if (!data) break;
          const ctx = mkCtx(pf, speaker);
          const barks: Barks = {};
          for (const [key, lines] of Object.entries(data)) {
            if (!lines) continue;
            barks[key as keyof Barks] = lines.map((l, j) => normalizeLineEntry(l, ctx, [key, j]));
          }
          vb.barks = barks;
          break;
        }
        default:
          break;
      }
    }
    if (profile.recruit && !vb.recruit) {
      issues.push({ level: 'warning', file: profilePf.rel, message: 'recruitable character has no recruit.yaml (a placeholder conversation will be used)' });
    }
    bundle.villagers[profile.id] = vb;
  }
  bundle.stats.villagers = Object.keys(bundle.villagers).length;

  // --- quests --------------------------------------------------------------
  for (const rel of files.filter((f) => /^quests\/[^/]+\.ya?ml$/.test(f))) {
    const pf = await read(rel);
    if (!pf) continue;
    const q = validateFile(QuestSchema, pf, issues);
    if (!q || dup('quest', q.id, rel, bundle.quests)) continue;
    const ctx = mkCtx(pf, 'narrate');
    const quest: Quest = {
      ...q,
      stages: q.stages.map((s, i) => ({
        ...s,
        on_enter: s.on_enter ? normalizeEffects(s.on_enter, ctx, ['stages', i, 'on_enter']) : undefined,
        on_complete: s.on_complete ? normalizeEffects(s.on_complete, ctx, ['stages', i, 'on_complete']) : undefined,
      })),
      rewards: q.rewards ? normalizeEffects(q.rewards, ctx, ['rewards']) : undefined,
    };
    bundle.quests[q.id] = quest;
  }

  // --- enemies -------------------------------------------------------------
  for (const rel of files.filter((f) => /^enemies\/[^/]+\.ya?ml$/.test(f))) {
    const pf = await read(rel);
    if (!pf) continue;
    const e = validateFile(EnemySchema, pf, issues);
    if (!e || dup('enemy', e.id, rel, bundle.enemies)) continue;
    const ctx = mkCtx(pf, 'narrate');
    const enemy: Enemy = {
      ...e,
      phases: e.phases?.map((p, i) => ({
        hp_below: p.hp_below,
        moves: p.moves,
        on_enter: p.on_enter ? normalizeScript(p.on_enter, ctx, ['phases', i, 'on_enter']) : undefined,
      })),
      intro: e.intro ? normalizeScript(e.intro, ctx, ['intro']) : undefined,
      defeat: e.defeat ? normalizeScript(e.defeat, ctx, ['defeat']) : undefined,
    };
    bundle.enemies[e.id] = enemy;
  }

  // --- encounters ----------------------------------------------------------
  for (const rel of files.filter((f) => /^encounters\/[^/]+\.ya?ml$/.test(f))) {
    const pf = await read(rel);
    if (!pf) continue;
    const e = validateFile(EncounterSchema, pf, issues);
    if (!e || dup('encounter', e.id, rel, bundle.encounters)) continue;
    const ctx = mkCtx(pf, 'narrate');
    bundle.encounters[e.id] = { ...e, script: normalizeScript(e.script, ctx, ['script']) };
  }

  // --- cutscenes -----------------------------------------------------------
  for (const rel of files.filter((f) => /^cutscenes\/[^/]+\.ya?ml$/.test(f))) {
    const pf = await read(rel);
    if (!pf) continue;
    const c = validateFile(CutsceneSchema, pf, issues);
    if (!c || dup('cutscene', c.id, rel, bundle.cutscenes)) continue;
    const ctx = mkCtx(pf, 'narrate');
    bundle.cutscenes[c.id] = { id: c.id, stage: c.stage, script: normalizeScript(c.script, ctx, ['script']) };
  }

  // --- shared dialog snippets ---------------------------------------------
  for (const rel of files.filter((f) => /^dialog\/.+\.ya?ml$/.test(f))) {
    const pf = await read(rel);
    if (!pf) continue;
    const s = validateFile(RawScriptSchema, pf, issues);
    if (!s) continue;
    const id = rel.replace(/^dialog\//, '').replace(/\.ya?ml$/, '');
    if (dup('shared script', id, rel, bundle.shared)) continue;
    bundle.shared[id] = normalizeScript(s, mkCtx(pf, 'narrate'), []);
  }

  // --- maps ----------------------------------------------------------------
  for (const rel of files.filter((f) => /^maps\/[^/]+\.map\.json$/.test(f))) {
    const pf = await read(rel);
    if (!pf) continue;
    const m = validateFile(GameMapSchema, pf, issues);
    if (!m) continue;
    const expected = rel.replace(/^maps\//, '').replace(/\.map\.json$/, '');
    if (m.id !== expected) {
      issues.push({ level: 'error', file: rel, line: locateIn(pf, ['id'])?.line, message: `map id "${m.id}" must match the file name "${expected}"` });
      continue;
    }
    if (dup('map', m.id, rel, bundle.maps)) continue;
    bundle.maps[m.id] = m;
  }
  bundle.stats.maps = Object.keys(bundle.maps).length;

  // --- single files --------------------------------------------------------
  const items = await single('items.yaml', ItemsFileSchema);
  for (const it of items?.data.items ?? []) if (!dup('item', it.id, 'items.yaml', bundle.items)) bundle.items[it.id] = it;
  const weapons = await single('weapons.yaml', WeaponsFileSchema);
  for (const w of weapons?.data.weapons ?? []) if (!dup('weapon', w.id, 'weapons.yaml', bundle.weapons)) bundle.weapons[w.id] = w;
  const powers = await single('powers.yaml', PowersFileSchema);
  for (const p of powers?.data.powers ?? []) if (!dup('power', p.id, 'powers.yaml', bundle.powers)) bundle.powers[p.id] = p;
  const facilities = await single('facilities.yaml', FacilitiesFileSchema);
  for (const f of facilities?.data.facilities ?? []) if (!dup('facility', f.id, 'facilities.yaml', bundle.facilities)) bundle.facilities[f.id] = f;
  const regions = await single('regions.yaml', RegionsFileSchema);
  for (const r of regions?.data.regions ?? []) if (!dup('region', r.id, 'regions.yaml', bundle.regions)) bundle.regions[r.id] = r;
  const biomes = await single('biomes.yaml', BiomesFileSchema);
  for (const b of biomes?.data.biomes ?? []) if (!dup('biome', b.id, 'biomes.yaml', bundle.biomes)) bundle.biomes[b.id] = b;
  const progression = await single('progression.yaml', ProgressionSchema);
  if (progression) bundle.progression = progression.data;
  else if (!files.includes('progression.yaml')) {
    issues.push({ level: 'warning', file: 'progression.yaml', message: 'missing; using built-in defaults' });
  }
  const economy = await single('economy.yaml', EconomySchema);
  if (economy) bundle.economy = economy.data;
  const intro = await single('intro.yaml', IntroSchema);
  if (intro) bundle.intro = intro.data.pages;
  const ascension = await single('ascension.yaml', AscensionSchema);
  if (ascension) {
    const ctx = mkCtx(ascension.pf, 'narrate');
    bundle.ascension = { ...ascension.data, epilogue: ascension.data.epilogue ? normalizeScript(ascension.data.epilogue, ctx, ['epilogue']) : undefined };
  }
  const tavern = await single('tavern.yaml', TavernFileSchema);
  if (tavern) {
    const ctx = mkCtx(tavern.pf, 'narrate');
    bundle.tavern = tavern.data.activities.map((a, i) => ({
      ...a,
      effects: a.effects ? normalizeEffects(a.effects, ctx, ['activities', i, 'effects']) : undefined,
      script: a.script ? normalizeScript(a.script, ctx, ['activities', i, 'script']) : undefined,
    }));
  }

  // --- stats ---------------------------------------------------------------
  let lines = 0;
  let placeholders = 0;
  const countSteps = (steps: Step[]) =>
    forEachStep(steps, (s) => {
      if (s.kind === 'line') {
        lines += 1;
        if (PLACEHOLDER_RE.test(s.text)) placeholders += 1;
      }
    });
  for (const v of Object.values(bundle.villagers)) {
    for (const p of [...v.chat, ...v.flirt]) for (const l of p.lines) countSteps(l);
    for (const t of v.discuss) for (const n of Object.values(t.script.nodes)) countSteps(n);
    for (const l of Object.values(v.gifts.reactions)) for (const e of l ?? []) countSteps(e);
    for (const ovs of Object.values(v.gifts.overrides)) for (const o of ovs) for (const e of o.lines) countSteps(e);
    if (v.recruit) {
      for (const n of Object.values(v.recruit.script.nodes)) countSteps(n);
      for (const u of v.recruit.unhappy) for (const e of u.lines) countSteps(e);
      if (v.recruit.farewell) for (const n of Object.values(v.recruit.farewell.nodes)) countSteps(n);
    }
    for (const ev of v.events) for (const n of Object.values(ev.script.nodes)) countSteps(n);
    for (const b of Object.values(v.barks)) for (const e of b ?? []) countSteps(e);
    if (PLACEHOLDER_RE.test(v.profile.bio)) placeholders += 1;
  }
  for (const e of Object.values(bundle.encounters)) for (const n of Object.values(e.script.nodes)) countSteps(n);
  for (const c of Object.values(bundle.cutscenes)) for (const n of Object.values(c.script.nodes)) countSteps(n);
  bundle.stats.lines = lines;
  bundle.stats.placeholders = placeholders;

  // --- cross references ----------------------------------------------------
  crossCheck(bundle, issues, opts.assets ?? null, opts.manifest ?? null);

  bundle.issues = issues;
  const result: LoadResult = { bundle, issues };
  if (opts.coverage) result.coverage = buildCoverage(bundle);
  return result;
}

/** Convenience: does a directory exist? */
export async function dirExists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

export { normalizeSteps };
