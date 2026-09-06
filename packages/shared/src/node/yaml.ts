import { LineCounter, isNode, parseDocument } from 'yaml';
import type { Document } from 'yaml';
import type { z } from 'zod';
import type { Issue } from '../bundle.ts';
import type { PathSeg } from '../script.ts';

export interface ParsedFile {
  /** Path relative to the content root, posix separators. */
  rel: string;
  abs: string;
  doc: Document.Parsed;
  lc: LineCounter;
  data: unknown;
}

/** Parse YAML (or JSON, which is valid YAML) keeping line information. */
export function parseYamlText(rel: string, abs: string, text: string): { file?: ParsedFile; issues: Issue[] } {
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc, prettyErrors: true });
  const issues: Issue[] = [];
  for (const e of doc.errors) {
    const pos = e.linePos?.[0];
    issues.push({ level: 'error', file: rel, line: pos?.line, col: pos?.col, message: e.message.split('\n')[0]! });
  }
  for (const w of doc.warnings) {
    const pos = w.linePos?.[0];
    issues.push({ level: 'warning', file: rel, line: pos?.line, col: pos?.col, message: w.message.split('\n')[0]! });
  }
  if (doc.errors.length) return { issues };
  return { file: { rel, abs, doc, lc, data: doc.toJS() }, issues };
}

/** Line/column of the YAML node at `path`, falling back to the nearest ancestor. */
export function locateIn(pf: ParsedFile, path: readonly PathSeg[]): { line: number; col: number } | undefined {
  for (let i = path.length; i >= 0; i -= 1) {
    const node = i === 0 ? pf.doc.contents : pf.doc.getIn(path.slice(0, i), true);
    if (isNode(node) && node.range) {
      return pf.lc.linePos(node.range[0]);
    }
  }
  return undefined;
}

type ZodIssueLike = { code: string; path: PropertyKey[]; message: string; errors?: ZodIssueLike[][] };

/** Flatten a zod error, picking the most plausible alternative for unions. */
export function flattenZodIssues(error: z.ZodError): { path: PathSeg[]; message: string }[] {
  const out: { path: PathSeg[]; message: string }[] = [];
  const toSegs = (p: PropertyKey[]): PathSeg[] => p.map((k) => (typeof k === 'symbol' ? String(k) : k));
  const visit = (issue: ZodIssueLike, prefix: PathSeg[]) => {
    const own = toSegs(issue.path);
    const full = startsWith(own, prefix) ? own : [...prefix, ...own];
    if (issue.code === 'invalid_union' && issue.errors && issue.errors.length) {
      const scored = issue.errors.map((list) => ({
        list,
        score:
          list.length +
          (list.some((i) => i.code === 'unrecognized_keys' || (i.code === 'invalid_type' && i.path.length <= issue.path.length))
            ? 100
            : 0),
      }));
      scored.sort((a, b) => a.score - b.score);
      const best = scored[0]!;
      if (best.score < 100 && best.list.length) {
        for (const nested of best.list) visit(nested, full);
        return;
      }
      out.push({
        path: full,
        message: 'not a valid step or value here (see docs/content/dialog-format.md)',
      });
      return;
    }
    out.push({ path: full, message: issue.message });
  };
  for (const issue of error.issues as unknown as ZodIssueLike[]) visit(issue, []);
  return out;
}

function startsWith(path: PathSeg[], prefix: PathSeg[]): boolean {
  if (prefix.length === 0) return true;
  if (path.length < prefix.length) return false;
  return prefix.every((seg, i) => path[i] === seg);
}

/** Validate parsed data against a schema, reporting issues with line numbers. */
export function validateFile<S extends z.ZodType>(
  schema: S,
  pf: ParsedFile,
  issues: Issue[],
): z.output<S> | undefined {
  const result = schema.safeParse(pf.data);
  if (result.success) return result.data as z.output<S>;
  for (const { path, message } of flattenZodIssues(result.error)) {
    const pos = locateIn(pf, path);
    issues.push({
      level: 'error',
      file: pf.rel,
      line: pos?.line,
      col: pos?.col,
      path: path.join('.'),
      message,
    });
  }
  return undefined;
}

export function formatPath(path: readonly PathSeg[]): string {
  return path.map((p) => (typeof p === 'number' ? `[${p}]` : p)).join('.').replace(/\.\[/g, '[');
}
