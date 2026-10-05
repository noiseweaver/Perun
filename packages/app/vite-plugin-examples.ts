// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * Serves upstream's example circuits (`setuplist.txt` and `circuits/*`) and its translations
 * (`locale_*.txt`) from the read-only reference clone, and copies them into the build.
 * GPL-2.0-or-later, like this app.
 */
export function upstreamExamples(publicDir: string): Plugin {
  const has = existsSync(join(publicDir, 'setuplist.txt'));
  const files = (): string[] =>
    has ? readdirSync(join(publicDir, 'circuits')).filter((f) => !f.startsWith('.')) : [];
  const locales = (): string[] =>
    has ? readdirSync(publicDir).filter((f) => /^locale_[a-z-]+\.txt$/.test(f)) : [];
  return {
    name: 'circuitjs-upstream-examples',
    configResolved(config) {
      if (!has)
        config.logger.warn(`upstream examples not found at ${publicDir} (submodule missing?)`);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
        let path: string | null = null;
        if (url === '/setuplist.txt') path = join(publicDir, 'setuplist.txt');
        else if (/^\/locale_[a-z-]+\.txt$/.test(url)) path = join(publicDir, url);
        else if (url.startsWith('/circuits/')) {
          const p = normalize(join(publicDir, url));
          if (p.startsWith(join(publicDir, 'circuits'))) path = p;
        }
        if (path === null || !has || !existsSync(path)) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(readFileSync(path));
      });
    },
    generateBundle() {
      if (!has) return;
      this.emitFile({
        type: 'asset',
        fileName: 'setuplist.txt',
        source: readFileSync(join(publicDir, 'setuplist.txt')),
      });
      for (const f of files())
        this.emitFile({
          type: 'asset',
          fileName: `circuits/${f}`,
          source: readFileSync(join(publicDir, 'circuits', f)),
        });
      for (const f of locales())
        this.emitFile({ type: 'asset', fileName: f, source: readFileSync(join(publicDir, f)) });
    },
  };
}

export const UPSTREAM_PUBLIC = fileURLToPath(
  new URL('../../reference/circuitjs1/src/com/lushprojects/circuitjs1/public', import.meta.url),
);
