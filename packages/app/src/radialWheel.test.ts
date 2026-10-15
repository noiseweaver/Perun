// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import { WHEEL_DEAD_ZONE, wedgeAt, wedgeVertical } from './radialWheel.ts';

describe('radial wheel', () => {
  it('picks the wedge in the direction of the pointer, the first at the top', () => {
    expect(wedgeAt(0, -60, 8)).toBe(0);
    expect(wedgeAt(42, -42, 8)).toBe(1);
    expect(wedgeAt(60, 0, 8)).toBe(2);
    expect(wedgeAt(0, 60, 8)).toBe(4);
    expect(wedgeAt(-60, 0, 8)).toBe(6);
    expect(wedgeAt(-42, -42, 8)).toBe(7);
    // just either side of the boundary between the top and top-right wedges (22.5°)
    expect(wedgeAt(60 * Math.sin(0.38), -60 * Math.cos(0.38), 8)).toBe(0);
    expect(wedgeAt(60 * Math.sin(0.41), -60 * Math.cos(0.41), 8)).toBe(1);
  });

  it('lights nothing near the centre', () => {
    expect(wedgeAt(0, -(WHEEL_DEAD_ZONE - 1), 8)).toBe(-1);
    expect(wedgeAt(5, 5, 8)).toBe(-1);
    expect(wedgeAt(60, 0, 0)).toBe(-1);
  });

  it('places parts flicked up or down upright, the rest lying down', () => {
    expect([...Array(8).keys()].map((i) => wedgeVertical(i, 8))).toEqual([
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });
});
