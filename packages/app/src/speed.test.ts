// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import { SPEED_MAX, speedForSteps, stepsPerSecond, stepsText } from './speed.ts';

describe('simulation speed in steps per second', () => {
  it('matches upstream at the default notch', () => {
    // 160 * getIterCount() for speed 117
    expect(stepsPerSecond(117)).toBeCloseTo(160 * 0.1 * Math.exp(56 / 24), 9);
    expect(stepsText(stepsPerSecond(117))).toBe('165');
    expect(stepsPerSecond(0)).toBe(0);
  });

  it('round-trips through the typed value', () => {
    for (const s of [1, 61, 117, 117.25, 200.5, SPEED_MAX])
      expect(speedForSteps(stepsPerSecond(s))).toBeCloseTo(s, 2);
    expect(Number.isInteger(speedForSteps(stepsPerSecond(117)))).toBe(true);
  });

  it('holds typed values to the slider range, and 0 stops', () => {
    expect(speedForSteps(0)).toBe(0);
    expect(speedForSteps(-5)).toBe(0);
    expect(speedForSteps(NaN)).toBe(0);
    expect(speedForSteps(0.01)).toBe(1);
    expect(speedForSteps(1e9)).toBe(SPEED_MAX);
    expect(stepsPerSecond(speedForSteps(1000))).toBeCloseTo(1000, -1);
  });

  it('formats in at most five characters', () => {
    expect(stepsText(1.3134)).toBe('1.31');
    expect(stepsText(42.06)).toBe('42.1');
    expect(stepsText(stepsPerSecond(SPEED_MAX))).toBe('61242');
  });
});
