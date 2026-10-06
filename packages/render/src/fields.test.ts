// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import { fadeIn } from './fields.ts';

describe('fadeIn', () => {
  it('fades each mark in over its own share of the level, without steps', () => {
    expect(fadeIn(0, 0, 3)).toBe(0);
    expect(fadeIn(1 / 3, 0, 3)).toBeCloseTo(1);
    expect(fadeIn(1 / 3, 1, 3)).toBeCloseTo(0);
    expect(fadeIn(1, 2, 3)).toBe(1);
    // continuous: small level changes give small opacity changes
    for (let l = 0; l < 1; l += 0.001)
      for (let k = 0; k !== 3; k++)
        expect(Math.abs(fadeIn(l + 0.001, k, 3) - fadeIn(l, k, 3))).toBeLessThan(0.01);
  });
});
