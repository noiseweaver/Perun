// SPDX-License-Identifier: GPL-2.0-or-later
// The golden circuit set: tools/golden/manifest.json lists every circuit with its run settings.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunSettings } from './types.ts';

export const GOLDEN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(GOLDEN_DIR, '../..');
export const UPSTREAM_DIR = join(REPO_ROOT, 'reference/circuitjs1');
export const FIXTURE_DIR = join(REPO_ROOT, 'fixtures/golden');

export interface ManifestEntry extends RunSettings {
  name: string;
  description: string;
  /** Path relative to tools/golden, or `upstream:<path relative to the submodule root>`. */
  source: string;
  /** `linear` (Phase 2), `nonlinear` (Phase 3), `upstream-example`, `xml`, ... */
  tags: string[];
}

interface ManifestFile {
  defaults: RunSettings;
  circuits: (Partial<RunSettings> & Omit<ManifestEntry, keyof RunSettings>)[];
}

const NAME = /^[a-z0-9][a-z0-9-]*$/;

export function parseManifest(text: string): ManifestEntry[] {
  const file = JSON.parse(text) as ManifestFile;
  const seen = new Set<string>();
  return file.circuits.map((c) => {
    if (!NAME.test(c.name)) throw new Error(`manifest: bad circuit name "${c.name}"`);
    if (seen.has(c.name)) throw new Error(`manifest: duplicate circuit name "${c.name}"`);
    seen.add(c.name);
    const entry: ManifestEntry = { ...file.defaults, ...c };
    for (const key of ['seed', 'stepsPerSample', 'samples'] as const) {
      if (!Number.isInteger(entry[key]) || entry[key] < (key === 'seed' ? 0 : 1))
        throw new Error(`manifest: ${c.name}: bad ${key}`);
    }
    return entry;
  });
}

export function loadManifest(): ManifestEntry[] {
  return parseManifest(readFileSync(join(GOLDEN_DIR, 'manifest.json'), 'utf8'));
}

export function readCircuitSource(source: string): string {
  const path = source.startsWith('upstream:')
    ? join(UPSTREAM_DIR, source.slice('upstream:'.length))
    : join(GOLDEN_DIR, source);
  return readFileSync(path, 'utf8');
}

/** Select entries by name or by `tag:<tag>`; no selectors selects everything. */
export function selectEntries(entries: ManifestEntry[], selectors: string[]): ManifestEntry[] {
  if (selectors.length === 0) return entries;
  const picked = entries.filter((e) =>
    selectors.some((s) => (s.startsWith('tag:') ? e.tags.includes(s.slice(4)) : e.name === s)),
  );
  const unknown = selectors.filter(
    (s) => !s.startsWith('tag:') && !entries.some((e) => e.name === s),
  );
  if (unknown.length) throw new Error(`unknown circuit(s): ${unknown.join(', ')}`);
  return picked;
}
