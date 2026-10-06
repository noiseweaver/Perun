// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// pnpm i18n [--missing]
// How much of the interface each upstream string catalog translates. It collects the English
// strings the app looks up (t('...'), tf('...'), palette names and groups, menu labels) and
// checks them against reference/.../public/locale_*.txt (and packages/app/locales/) the way the app does (exact, then any
// capitalisation, `…` matching `...`). --missing prints the strings no catalog has, the list a
// translator would start from.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LANGUAGES, parseLocale } from '../../../packages/elements/src/i18n.ts';

const ROOT = new URL('../../../', import.meta.url).pathname;
const APP = join(ROOT, 'packages/app/src');
const PUBLIC = join(ROOT, 'reference/circuitjs1/src/com/lushprojects/circuitjs1/public');
const APP_LOCALES = join(ROOT, 'packages/app/locales');

/** The app's own catalogs (Catalan) are in packages/app/locales, upstream's in reference/. */
function catalog(code: string): string {
  const own = join(APP_LOCALES, `locale_${code}.txt`);
  return existsSync(own) ? own : join(PUBLIC, `locale_${code}.txt`);
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f) ? [p] : [];
  });
}

/** Single-quoted literals passed to t/tf, or given as a label="..." to a translating component. */
function strings(): Set<string> {
  const out = new Set<string>();
  const lit = String.raw`'((?:[^'\\]|\\.)+)'`;
  const patterns = [
    new RegExp(String.raw`\bt[f]?\(\s*${lit}`, 'g'),
    new RegExp(String.raw`\bt\([^()]*\?\s*${lit}\s*:\s*${lit}`, 'g'),
    /\b(?:label|caption)="([^"]+)"/g,
  ];
  for (const file of sources(APP)) {
    const text = readFileSync(file, 'utf8');
    for (const re of patterns)
      for (const m of text.matchAll(re))
        for (const g of m.slice(1)) if (g !== undefined) out.add(g.replace(/\\'/g, "'"));
  }
  // palette names and groups (src/editor/catalog.ts)
  const catalog = readFileSync(join(APP, 'editor/catalog.ts'), 'utf8');
  for (const m of catalog.matchAll(/\['\w+Elm', '([^']+)'/g)) out.add(m[1]);
  for (const m of catalog.matchAll(/^ {4}'([^']+)',$/gm)) out.add(m[1]);
  return out;
}

function translated(map: Map<string, string>, folded: Map<string, string>, s: string): boolean {
  const keys = [s, `Add ${s}`, `&nbsp;</div>${s}`];
  if (s.endsWith('…')) keys.push(s.slice(0, -1) + '...');
  return keys.some((k) => map.has(k) || folded.has(k.toLowerCase()));
}

const wanted = [...strings()].sort();
const missingEverywhere = new Set(wanted);
console.log(`${wanted.length} interface strings`);
for (const { code, name } of LANGUAGES) {
  if (code === 'en') continue;
  const map = parseLocale(readFileSync(catalog(code), 'utf8'));
  const folded = new Map([...map].map(([k, v]) => [k.toLowerCase(), v]));
  let n = 0;
  for (const s of wanted)
    if (translated(map, folded, s)) {
      n++;
      missingEverywhere.delete(s);
    }
  console.log(`${code.padEnd(6)} ${((100 * n) / wanted.length).toFixed(0).padStart(3)}%  ${name}`);
}
if (process.argv.includes('--missing')) {
  console.log(`\nin no catalog (${missingEverywhere.size}):`);
  for (const s of missingEverywhere) console.log(`"${s}"=""`);
}
