// Serves a directory outside the Vite root at a URL prefix (dev only).
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

export function staticDirPlugin(urlPrefix: string, dir: string, name: string): Plugin {
  const root = path.resolve(dir);
  return {
    name,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith(`${urlPrefix}/`)) return next();
        const rel = decodeURIComponent(url.slice(urlPrefix.length + 1).split('?')[0]!);
        const abs = path.resolve(root, rel);
        if (!abs.startsWith(root) || !existsSync(abs) || !statSync(abs).isFile()) return next();
        res.setHeader('Content-Type', MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(abs).pipe(res);
      });
    },
  };
}
