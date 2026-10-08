// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { LANGUAGES } from '@circuitjs-next/elements';
import { describe, expect, it } from 'vitest';
import { EXTRA, EXTRA_KEYS, extraCatalog } from './i18nExtra.ts';
import { RELEASES } from './whatsNew.ts';

const placeholders = (s: string): string[] => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();

describe('extra translations', () => {
  it('cover every language with a catalog', () => {
    for (const l of LANGUAGES) if (l.code !== 'en') expect(EXTRA[l.code], l.code).toBeDefined();
  });

  it('list one text per key, keeping every placeholder', () => {
    for (const [code, list] of Object.entries(EXTRA)) {
      expect(list.length, code).toBe(EXTRA_KEYS.length);
      EXTRA_KEYS.forEach((k, i) => {
        expect(placeholders(list[i] ?? ''), `${code}: ${k}`).toEqual(placeholders(k));
      });
    }
  });

  it('translate the latest release notes', () => {
    const de = extraCatalog('de');
    for (const n of RELEASES[0]?.notes ?? []) expect(de.has(n), n).toBe(true);
  });
});
