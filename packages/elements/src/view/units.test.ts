// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import { formatNumber, getShortUnitText, getUnitText, javaDoubleToString } from './units.ts';

describe('value formatting', () => {
  it('formats like GWT NumberFormat', () => {
    expect(formatNumber(0.5, 3)).toBe('0.5');
    expect(formatNumber(2, 3)).toBe('2');
    expect(formatNumber(1.23456, 3)).toBe('1.235');
    expect(formatNumber(-0.0001, 3)).toBe('0');
    expect(formatNumber(1.5, 3, true)).toBe('1.500');
  });

  it('scales units like getUnitText', () => {
    expect(getUnitText(0, 'V')).toBe('0 V');
    expect(getUnitText(0.0125, 'A')).toBe('12.5 mA');
    expect(getUnitText(4.7e-6, 'F')).toBe('4.7 μF');
    expect(getUnitText(-5, 'V')).toBe('-5 V');
    expect(getShortUnitText(1500, '')).toBe('1.5k');
    expect(getShortUnitText(1e7, 'Ω')).toBe('10MΩ');
    expect(getUnitText(2e13, 'Hz')).toBe('2E013 Hz');
  });

  it('prints doubles like Java', () => {
    expect(javaDoubleToString(1)).toBe('1.0');
    expect(javaDoubleToString(-2.5)).toBe('-2.5');
  });
});
