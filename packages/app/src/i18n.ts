// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Translations (PLAN.md Phase 9, i18n hooks). The interface looks up its English text in
// upstream's string catalogs (locale_xx.txt, served next to the app by vite-plugin-examples.ts)
// with `t`, which is upstream's Locale.LS. Like upstream, the language comes from ?lang=, then the
// saved choice (Options > Language), then the browser. Text this interface has and upstream
// lacks stays English until a catalog adds it (`pnpm i18n` lists those strings).

import { LS, catalogLanguage, parseLocale, setLocalization } from '@circuitjs-next/elements';
import { BASE } from './startup.ts';
import { useApp } from './store.ts';

/** The catalog again with lower-case keys: this interface capitalises fewer words than upstream. */
let folded = new Map<string, string>();

/**
 * The current language's text for an English string: upstream's lookup (`LS`), then the same
 * string in other capitalisation ("Show current" finds upstream's "Show Current").
 */
export function t(s: string): string {
  const r = LS(s);
  if (r !== s || folded.size === 0) return r;
  const key = s.toLowerCase();
  const f =
    folded.get(key) ?? (key.endsWith('…') ? folded.get(key.slice(0, -1) + '...') : undefined);
  if (f === undefined) return s;
  return s.endsWith('…') && f.endsWith('...') ? f.slice(0, -3) + '…' : f;
}

/** `t` with `{name}` placeholders filled in after the lookup. */
export function tf(s: string, values: Record<string, string | number>): string {
  return t(s).replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

/** The browser's preferred language tag (upstream `language()`). */
function browserLanguage(): string {
  if (navigator.languages !== undefined) return navigator.languages[0] ?? 'en-US';
  return navigator.language || 'en-US';
}

/** The catalog to show for a language setting (`auto` or a catalog code). */
export function resolveLanguage(setting: string): string {
  const q = new URLSearchParams(window.location.search).get('lang');
  if (q !== null) return catalogLanguage(q);
  return catalogLanguage(setting === 'auto' ? browserLanguage() : setting);
}

/**
 * Load a catalog and show the interface in it. The app tree is keyed by the language, so every
 * label is looked up again; a catalog that fails to load leaves the interface in English.
 */
export async function setLanguage(code: string): Promise<void> {
  let map = new Map<string, string>();
  if (code !== 'en') {
    try {
      const res = await fetch(`${BASE}locale_${code}.txt`);
      if (res.ok) map = parseLocale(await res.text(), (w) => console.warn(w));
      else code = 'en';
    } catch {
      code = 'en';
    }
  }
  setLocalization(map);
  addWord = findAddWord(map);
  folded = new Map();
  for (const [k, v] of map) {
    const key = k.toLowerCase();
    if (!folded.has(key)) folded.set(key, v);
  }
  document.documentElement.lang = code === 'kr' ? 'ko' : code === 'csx' ? 'cs' : code;
  useApp.setState({ language: code });
}

/**
 * How a catalog words upstream's "Add X" menu items: the word most of them start with
 * ("Ajouter Résistance") or end with ("Widerstand einfügen"), if most share one.
 */
let addWord: { prefix: string } | { suffix: string } | null = null;

function findAddWord(map: Map<string, string>): typeof addWord {
  const prefixes = new Map<string, number>();
  const suffixes = new Map<string, number>();
  const count = (m: Map<string, number>, k: string): void => void m.set(k, (m.get(k) ?? 0) + 1);
  let n = 0;
  for (const [k, v] of map) {
    if (!k.startsWith('Add ')) continue;
    const words = v.trim().split(/\s+/);
    if (words.length < 2) continue;
    n++;
    count(prefixes, words[0] + ' ');
    // two-word verbs ("Legg til")
    if (words.length > 2) count(prefixes, words[0] + ' ' + words[1] + ' ');
    count(suffixes, ' ' + words[words.length - 1]);
  }
  const top = (m: Map<string, number>): [string, number] =>
    [...m].reduce((a, b) => (b[1] > a[1] ? b : a), ['', 0]);
  let [p, pn] = top(prefixes);
  // "Legg til X" rather than "Legg": the longer verb when nearly all of them use it
  for (const [k, c] of prefixes) if (k.startsWith(p) && k !== p && c >= pn * 0.9) [p, pn] = [k, c];
  const [x, xn] = top(suffixes);
  if (pn >= xn && pn > n * 0.4) return { prefix: p };
  if (xn > n * 0.4) return { suffix: x };
  return null;
}

/**
 * A palette item's name: the catalog's entry for it, else upstream's menu text for it ("Add
 * Resistor") without the "Add" word, else the name in other capitalisation.
 */
export function tItem(label: string): string {
  const s = LS(label);
  if (s !== label) return s;
  const add = LS(`Add ${label}`);
  if (add !== `Add ${label}`) {
    if (addWord !== null && 'prefix' in addWord && add.startsWith(addWord.prefix))
      return add.slice(addWord.prefix.length);
    // "Verbindung einfügen (wire)": the verb can come before a note in brackets
    if (addWord !== null && 'suffix' in addWord) {
      const i = add.lastIndexOf(addWord.suffix);
      const rest = i < 0 ? '' : add.slice(i + addWord.suffix.length);
      if (i > 0 && (rest === '' || rest.startsWith(' ('))) return add.slice(0, i) + rest;
    }
    return add;
  }
  return t(label);
}

/** A palette group's title, which upstream's catalogs key with the menu's HTML in front. */
export function tGroup(title: string): string {
  const s = t(title);
  if (s !== title) return s;
  const html = '&nbsp;</div>';
  const m = LS(html + title);
  return m.startsWith(html) ? m.slice(html.length) : m === html + title ? title : m;
}
