// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import {
  FACTOR_WIDTH,
  SPEED_MAX,
  factorText,
  paceOf,
  percentText,
  speedForSteps,
  stepsPerSecond,
  stepsText,
} from './speed.ts';

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

describe('speed against real time', () => {
  it('says how many times slower or faster in five characters', () => {
    // the default speed with the default 5 µs time step
    expect(paceOf(stepsPerSecond(117) * 5e-6)).toEqual({ kind: 'slower', factor: '1.21k' });
    expect(paceOf(0.5)).toEqual({ kind: 'slower', factor: ' 2.00' });
    expect(paceOf(3.2)).toEqual({ kind: 'faster', factor: ' 3.20' });
    expect(paceOf(1 / 120.4)).toEqual({ kind: 'slower', factor: '  120' });
    expect(paceOf(1.004)).toEqual({ kind: 'real', factor: '    1' });
    expect(paceOf(1 / 1.004).kind).toBe('real');
    expect(paceOf(0).kind).toBe('stopped');
    expect(paceOf(NaN).kind).toBe('stopped');
  });

  it('carries 999.5 into the next prefix and keeps the width', () => {
    expect(factorText(999.4)).toBe('  999');
    expect(factorText(999.6)).toBe('1.00k');
    expect(factorText(12345)).toBe('12.3k');
    expect(factorText(2.5e8)).toBe(' 250M');
    for (const f of [1.01, 9.996, 99.96, 1e3, 5.5e5, 3e9, 7e12])
      expect(factorText(f)).toHaveLength(FACTOR_WIDTH);
  });

  it('gives a percentage in seven characters', () => {
    expect(percentText(stepsPerSecond(117) * 5e-6)).toBe(' 0.0825');
    expect(percentText(1)).toBe('    100');
    expect(percentText(0.123)).toBe('   12.3');
    expect(percentText(3.2)).toBe('    320');
    expect(percentText(1e-9)).toBe(' <0.001');
    expect(percentText(1e4)).toBe(' >99999');
  });
});
