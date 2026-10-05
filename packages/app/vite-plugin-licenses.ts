// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

/** A package that ends up in the bundle, with its license text. */
interface BundledPackage {
  name: string;
  version: string;
  license: string;
  text: string;
}

/** The package.json directory that owns a module file, or null for this repo's own sources. */
function packageDir(id: string): string | null {
  const i = id.lastIndexOf('/node_modules/');
  if (i < 0) return null;
  const rest = id.slice(i + '/node_modules/'.length).split('/');
  const name = rest[0]?.startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  if (!name) return null;
  return id.slice(0, i) + '/node_modules/' + name;
}

function licenseText(dir: string): string {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  return file ? readFileSync(join(dir, file), 'utf8').trim() : '';
}

/**
 * Writes the licenses the app must carry next to it (GPL section 1 and the notices of what is
 * bundled): `LICENSE.txt` (this app's GPL-2.0 text) and `third-party-licenses.txt` (every
 * package whose code or fonts end up in the bundle, found from the modules Rollup actually
 * includes). The About dialog links to both.
 */
export function bundledLicenses(licenseFile: string): Plugin {
  return {
    name: 'circuitjs-licenses',
    configureServer(server) {
      // the dev server has no bundle to list; serve the GPL text and say where the list comes from
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url === '/LICENSE.txt') {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(readFileSync(licenseFile));
        } else if (url === '/third-party-licenses.txt') {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(
            'The list of bundled packages is written by the production build (vite build).\n',
          );
        } else next();
      });
    },
    generateBundle(_options, bundle) {
      const dirs = new Set<string>();
      for (const id of this.getModuleIds()) {
        const d = packageDir(id.replace(/\?.*$/, ''));
        if (d !== null) dirs.add(d);
      }
      // fonts arrive as assets from CSS, not as modules: find them by their source package
      for (const out of Object.values(bundle)) {
        if (out.type !== 'asset') continue;
        for (const src of out.originalFileNames) {
          const d = packageDir(src);
          if (d !== null) dirs.add(d);
        }
      }
      const pkgs: BundledPackage[] = [];
      const seen = new Set<string>();
      for (const d of dirs) {
        const pj = join(d, 'package.json');
        if (!existsSync(pj)) continue;
        const p = JSON.parse(readFileSync(pj, 'utf8')) as {
          name?: string;
          version?: string;
          license?: string;
        };
        if (!p.name || p.name.startsWith('@circuitjs-next/')) continue;
        // a package can be reached by more than one path (pnpm links)
        const key = `${p.name}@${p.version ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pkgs.push({
          name: p.name,
          version: p.version ?? '',
          license: p.license ?? 'see text',
          text: licenseText(d) || licenseText(dirname(d)),
        });
      }
      pkgs.sort((a, b) => a.name.localeCompare(b.name));
      const sep = '\n\n' + '-'.repeat(78) + '\n\n';
      const head =
        'circuitjs-next bundles the following packages. Each is listed with its license.\n' +
        'The example circuits come from CircuitJS1 (GPL-2.0-or-later), like the simulator.';
      const body = pkgs
        .map((p) => `${p.name} ${p.version} (${p.license})\n\n${p.text || '(no license file)'}`)
        .join(sep);
      this.emitFile({
        type: 'asset',
        fileName: 'third-party-licenses.txt',
        source: head + sep + body + '\n',
      });
      this.emitFile({
        type: 'asset',
        fileName: 'LICENSE.txt',
        source: readFileSync(licenseFile, 'utf8'),
      });
    },
  };
}
