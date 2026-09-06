import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { staticDirPlugin } from '../../game/plugins/static-dir';
import { editorApiPlugin } from './plugins/api';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

export default defineConfig({
  plugins: [
    react(),
    editorApiPlugin({ repoRoot }),
    staticDirPlugin('/art', path.join(repoRoot, 'assets'), 'withergate-art'),
    staticDirPlugin('/generated', path.join(repoRoot, 'game', 'public', 'generated'), 'withergate-generated'),
  ],
  server: {
    fs: { allow: [repoRoot] },
  },
});
