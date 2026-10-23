// SPDX-License-Identifier: GPL-2.0-or-later
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { UPSTREAM_PUBLIC, upstreamExamples } from './vite-plugin-examples';
import { bundledLicenses } from './vite-plugin-licenses';
import { serviceWorker } from './vite-plugin-sw';

const root = (p: string): string => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const version = (JSON.parse(readFileSync(root('package.json'), 'utf8')) as { version: string })
  .version;

function commit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/** In the Obsidian plugin's editor frame, MathJax comes from the plugin (src/embedMathjax.ts). */
function mathjaxFromPlugin(): Plugin {
  const stub = fileURLToPath(new URL('./src/embedMathjax.ts', import.meta.url));
  return {
    name: 'perun-mathjax-from-plugin',
    enforce: 'pre',
    resolveId(source, importer) {
      return source === './mathjax.ts' && importer?.endsWith('/render/src/math.ts') ? stub : null;
    },
  };
}

// `vite build --mode embed` builds the copy the Obsidian plugin runs in a frame (packages/obsidian):
// relative paths, fonts inlined into the stylesheet, one script without MathJax (the plugin lends
// the frame its own), no service worker.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    upstreamExamples(UPSTREAM_PUBLIC),
    bundledLicenses(root('LICENSE')),
    ...(mode === 'embed' ? [mathjaxFromPlugin()] : [serviceWorker()]),
  ],
  ...(mode === 'embed'
    ? {
        base: './',
        build: {
          outDir: 'dist-embed',
          assetsInlineLimit: 1 << 24,
          rolldownOptions: { output: { codeSplitting: false } },
        },
      }
    : {}),
  server: { port: 5173, strictPort: true },
  define: {
    'import.meta.env.APP_VERSION': JSON.stringify(version),
    'import.meta.env.APP_COMMIT': JSON.stringify(commit()),
    'import.meta.env.APP_BUILD_DATE': JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
}));
