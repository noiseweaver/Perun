// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { afterEach, describe, expect, it } from 'vitest';
import { LS, catalogLanguage, parseLocale, setLocalization } from './i18n.ts';

describe('i18n', () => {
  afterEach(() => setLocalization(new Map()));

  it('parses catalogs like upstream processLocale', () => {
    const warnings: string[] = [];
    const m = parseLocale(
      '"Undo"="Rückgängig"\r\n\nbad line\n"x"="\\u03a9 ohm"\n"broken"=nope\n',
      (w) => warnings.push(w),
    );
    expect(m.get('Undo')).toBe('Rückgängig');
    expect(m.get('x')).toBe('Ω ohm');
    expect(m.size).toBe(2);
    expect(warnings).toHaveLength(2);
  });

  it('looks strings up with the ~ and … rules', () => {
    expect(LS('Undo')).toBe('Undo');
    setLocalization(parseLocale('"Undo"="Rückgängig"\n"Edit..."="Bearbeiten..."\n"Off"="Aus"'));
    expect(LS('Undo')).toBe('Rückgängig');
    expect(LS('Off~')).toBe('Aus');
    expect(LS('Nope~')).toBe('Nope');
    expect(LS('Edit…')).toBe('Bearbeiten…');
    expect(LS('Edit...')).toBe('Bearbeiten...');
    expect(LS('')).toBe('');
  });

  it('picks the catalog for a language tag', () => {
    expect(catalogLanguage('de-AT')).toBe('de');
    expect(catalogLanguage('zh-TW')).toBe('zh-tw');
    expect(catalogLanguage('zh-CN')).toBe('zh');
    expect(catalogLanguage('en-US')).toBe('en');
    expect(catalogLanguage('xx')).toBe('en');
  });
});
