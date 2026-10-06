// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/util/Locale.java,
// circuitjs1.java (loadLocale, processLocale, convertUnicodeEscapes) and EditOptions.java (the
// language list) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

/** English text to the current language's text. English needs no catalog. */
let localizationMap = new Map<string, string>();

/** Replace the string catalog (an empty map is English). */
export function setLocalization(map: Map<string, string>): void {
  localizationMap = map;
}

/**
 * The current language's text for an English string (upstream `Locale.LS`). A trailing `~` tells
 * apart strings that read the same in English but translate differently; it is dropped when the
 * catalog has no entry. Strings ending in `…` also match catalog keys ending in `...`, which is
 * how upstream writes them.
 */
export function LS(s: string): string {
  if (s.length === 0) return s;
  const sm = localizationMap.get(s);
  if (sm !== undefined) return sm;
  if (s.endsWith('…')) {
    const dots = localizationMap.get(s.slice(0, -1) + '...');
    if (dots !== undefined) return dots.endsWith('...') ? dots.slice(0, -3) + '…' : dots;
    return s;
  }
  const ix = s.indexOf('~');
  if (ix !== s.length - 1) return s;
  const base = s.slice(0, ix);
  return localizationMap.get(base) ?? base;
}

function convertUnicodeEscapes(input: string): string {
  if (!input.includes('\\u')) return input;
  let result = '';
  let i = 0;
  while (i < input.length) {
    if (i + 5 < input.length && input[i] === '\\' && input[i + 1] === 'u') {
      const hex = input.slice(i + 2, i + 6);
      const code = /^[0-9a-fA-F]{4}$/.test(hex) ? parseInt(hex, 16) : NaN;
      result += Number.isNaN(code) ? '\\u' + hex : String.fromCharCode(code);
      i += 6;
    } else {
      result += input[i];
      i++;
    }
  }
  return result;
}

/** Parse a `locale_xx.txt` string catalog: one `"English"="translation"` per line. */
export function parseLocale(data: string, warn?: (msg: string) => void): Map<string, string> {
  const map = new Map<string, string>();
  for (let line of data.split(/\r?\n/)) {
    if (line.length === 0) continue;
    if (line[0] !== '"') {
      warn?.(`ignoring line in string catalog: ${line}`);
      continue;
    }
    line = convertUnicodeEscapes(line);
    const q2 = line.indexOf('"', 1);
    if (q2 < 0 || line[q2 + 1] !== '=' || line[q2 + 2] !== '"' || !line.endsWith('"')) {
      warn?.(`ignoring line in string catalog: ${line}`);
      continue;
    }
    map.set(line.slice(1, q2), line.slice(q2 + 3, line.length - 1));
  }
  return map;
}

/**
 * The catalog name for a language tag (upstream `loadLocale`): Taiwan Chinese keeps its region,
 * every other tag drops it. English, and any tag without a catalog, is `en`.
 */
export function catalogLanguage(tag: string): string {
  const t = tag.toLowerCase();
  if (t === 'zh-tw' || t === 'zh-cht') return 'zh-tw';
  const lang = t.replace(/-.*/, '');
  return LANGUAGES.some((l) => l.code === lang) ? lang : 'en';
}

/**
 * The languages upstream ships a catalog for, in its Options order, with their own names, plus
 * Catalan (packages/app/locales/locale_ca.txt, this app's own catalog).
 */
export const LANGUAGES: readonly { code: string; name: string }[] = [
  // Czech is csx instead of cs upstream, so browsers set to Czech don't pick it automatically yet
  { code: 'ca', name: 'Català' },
  { code: 'csx', name: 'Čeština' },
  { code: 'da', name: 'Dansk' },
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fi', name: 'Suomi' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'nb', name: 'Norsk bokmål' },
  { code: 'pl', name: 'Polski' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh', name: '中文 (简体)' },
  { code: 'zh-tw', name: '中文 (繁體)' },
  { code: 'ja', name: '日本語' },
  { code: 'kr', name: '한국어' },
];
