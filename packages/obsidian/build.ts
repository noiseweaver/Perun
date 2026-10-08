// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/*
 * Builds the Obsidian plugin into dist/ (main.js, manifest.json, styles.css: what Obsidian loads
 * from .obsidian/plugins/perun/):
 *  1. the app with `vite build --mode embed` (packages/app/dist-embed),
 *  2. that build as one page, generated/editor.html, with the example circuits, translations
 *     and license inlined, since a frame inside Obsidian has no server to fetch them from,
 *  3. the plugin, a CommonJS bundle with the page inside it.
 */

import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { CONFIG_MARKER, shimScript } from './src/shim.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const appDir = join(here, '../app');
const embedDir = join(appDir, 'dist-embed');

await build({
  root: appDir,
  configFile: join(appDir, 'vite.config.ts'),
  mode: 'embed',
  logLevel: 'warn',
});

const html = readFileSync(join(embedDir, 'index.html'), 'utf8');
const asset = (re: RegExp): string => {
  const m = re.exec(html);
  if (!m?.[1]) throw new Error(`build.ts: ${String(re)} not found in the embed build's index.html`);
  return readFileSync(join(embedDir, m[1]), 'utf8');
};
const js = asset(/<script[^>]+src="\.?\/?(assets\/[^"]+\.js)"/);
const css = asset(/<link[^>]+href="\.?\/?(assets\/[^"]+\.css)"/);

const files: Record<string, string> = {};
const text = (name: string): void => {
  files[name] = readFileSync(join(embedDir, name), 'utf8');
};
for (const name of readdirSync(embedDir)) {
  if (name.endsWith('.txt')) text(name);
}
for (const name of readdirSync(join(embedDir, 'circuits'))) text(`circuits/${name}`);

const page =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
  '<meta name="theme-color" content="">' +
  `<title>Perun</title><style>${css}</style>${CONFIG_MARKER}${shimScript(files)}</head>` +
  // the app is a module script; `</script` inside it would end it early
  `<body><div id="root"></div><script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
mkdirSync(join(here, 'generated'), { recursive: true });
writeFileSync(join(here, 'generated/editor.html'), page);

await build({
  root: here,
  configFile: false,
  logLevel: 'warn',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    minify: true,
    lib: { entry: join(here, 'src/main.ts'), formats: ['cjs'], fileName: () => 'main.js' },
    rolldownOptions: {
      // provided by Obsidian
      external: ['obsidian', 'electron', /^@codemirror\//, /^@lezer\//],
      output: { exports: 'default' },
    },
  },
});
for (const f of ['manifest.json', 'styles.css']) copyFileSync(join(here, f), join(here, 'dist', f));
const size = readFileSync(join(here, 'dist/main.js')).length;
console.log(`Obsidian plugin in packages/obsidian/dist (main.js ${(size / 1e6).toFixed(1)} MB)`);
