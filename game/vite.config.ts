import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { contentPlugin } from './plugins/content';
import { staticDirPlugin } from './plugins/static-dir';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

export default defineConfig({
  plugins: [
    react(),
    contentPlugin({
      contentDir: path.join(repoRoot, 'content'),
      generatedDir: path.join(here, 'public', 'generated'),
      assetsDir: path.join(repoRoot, 'assets'),
    }),
    // Repo assets (manifest + editor uploads) at /art/... in dev. A build step copies them later.
    staticDirPlugin('/art', path.join(repoRoot, 'assets'), 'withergate-art'),
  ],
  server: {
    fs: { allow: [repoRoot] },
  },
  build: {
    chunkSizeWarningLimit: 2500,
  },
});
