// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * Serves upstream's example circuits (`setuplist.txt` and `circuits/*`) and its translations
 * (`locale_*.txt`) from the read-only reference clone, and copies them into the build.
 * Catalogs upstream doesn't ship (Catalan) live in `packages/app/locales/` and are served the same
 * way. GPL-2.0-or-later, like this app.
 */
export function upstreamExamples(publicDir: string): Plugin {
  const has = existsSync(join(publicDir, 'setuplist.txt'));
  const files = (): string[] =>
    has ? readdirSync(join(publicDir, 'circuits')).filter((f) => !f.startsWith('.')) : [];
  const isLocale = (f: string): boolean => /^locale_[a-z-]+\.txt$/.test(f);
  /** File name to path; the app's own catalogs come after upstream's. */
  const locales = (): Map<string, string> => {
    const m = new Map<string, string>();
    if (has) for (const f of readdirSync(publicDir).filter(isLocale)) m.set(f, join(publicDir, f));
    for (const f of readdirSync(APP_LOCALES).filter(isLocale)) m.set(f, join(APP_LOCALES, f));
    return m;
  };
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
        else if (isLocale(url.slice(1))) path = locales().get(url.slice(1)) ?? null;
        else if (url.startsWith('/circuits/')) {
          const p = normalize(join(publicDir, url));
          if (p.startsWith(join(publicDir, 'circuits'))) path = p;
        }
        if (path === null || !existsSync(path)) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(readFileSync(path));
      });
    },
    generateBundle() {
      for (const [f, p] of locales())
        this.emitFile({ type: 'asset', fileName: f, source: readFileSync(p) });
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
    },
  };
}

const APP_LOCALES = fileURLToPath(new URL('./locales', import.meta.url));

export const UPSTREAM_PUBLIC = fileURLToPath(
  new URL('../../reference/circuitjs1/src/com/lushprojects/circuitjs1/public', import.meta.url),
);
