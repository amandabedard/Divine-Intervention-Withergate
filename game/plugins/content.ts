// Vite plugin: compiles content/ into a virtual module and hot-reloads it when a file changes.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { loadContent } from '@withergate/shared/node';
import type { AssetManifest, GeneratedIndex } from '@withergate/shared';

export const CONTENT_MODULE = 'virtual:withergate-content';
const RESOLVED = `\0${CONTENT_MODULE}`;

export function contentPlugin(opts: { contentDir: string; generatedDir: string; assetsDir?: string }): Plugin {
  const contentDir = opts.contentDir.replace(/\\/g, '/');
  let cached: string | null = null;

  const readJson = async <T>(file: string): Promise<T | null> => {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as T;
    } catch {
      return null;
    }
  };

  const build = async (): Promise<string> => {
    const assets = await readJson<GeneratedIndex>(path.join(opts.generatedDir, 'index.json'));
    const manifest = opts.assetsDir ? await readJson<AssetManifest>(path.join(opts.assetsDir, 'manifest.json')) : null;
    const result = await loadContent({ root: opts.contentDir, assets, manifest });
    const errors = result.issues.filter((i) => i.level === 'error').length;
    for (const i of result.issues) {
      const where = i.line ? `${i.file}:${i.line}` : i.file;
      console.log(`[content] ${where}  ${i.level}: ${i.message}`);
    }
    const s = result.bundle.stats;
    console.log(
      `[content] ${s.files} files, ${s.villagers} characters, ${s.maps} maps, ${s.lines} lines` +
        (errors ? `, ${errors} ERROR${errors === 1 ? '' : 'S'}` : ''),
    );
    return `export default ${JSON.stringify(result.bundle)};`;
  };

  return {
    name: 'withergate-content',
    resolveId(id) {
      return id === CONTENT_MODULE ? RESOLVED : undefined;
    },
    async load(id) {
      if (id !== RESOLVED) return undefined;
      cached ??= await build();
      return cached;
    },
    configureServer(server) {
      server.watcher.add(opts.contentDir);
    },
    handleHotUpdate({ file, server }) {
      if (!file.replace(/\\/g, '/').startsWith(contentDir)) return undefined;
      cached = null;
      const mod = server.moduleGraph.getModuleById(RESOLVED);
      if (!mod) return undefined;
      server.moduleGraph.invalidateModule(mod);
      return [mod];
    },
  };
}
