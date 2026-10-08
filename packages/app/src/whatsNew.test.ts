// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import { checkUpdated } from './whatsNew.ts';

describe('checkUpdated', () => {
  it('says nothing on a first install, then only when the version changes', () => {
    const m = new Map<string, string>();
    const storage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    expect(checkUpdated('1.0.0', storage)).toBe(false);
    expect(checkUpdated('1.0.0', storage)).toBe(false);
    expect(checkUpdated('1.1.0', storage)).toBe(true);
    expect(checkUpdated('1.1.0', storage)).toBe(false);
  });
});
