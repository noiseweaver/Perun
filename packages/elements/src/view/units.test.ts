// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import {
  formatNumber,
  getFixedUnitText,
  getShortUnitText,
  getUnitText,
  javaDoubleToString,
} from './units.ts';

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

describe('getFixedUnitText', () => {
  it('keeps the same width for any sign, size and prefix', () => {
    const values = [0, -0, 1.855, -1.726e-3, 312.4e-6, -999.9996, 9.9999, 1e-15, 12.5e3, -0.5];
    const texts = values.map((v) => getFixedUnitText(v, 'V'));
    expect(texts).toEqual([
      '   0.000  V',
      '   0.000  V',
      '   1.855  V',
      '  -1.726 mV',
      ` 312.400 ${'μ'}V`,
      '  -1.000 kV',
      '  10.000  V',
      '   0.000  V',
      '  12.500 kV',
      '-500.000 mV',
    ]);
    for (const t of texts) expect(t.length).toBe(texts[0]?.length);
  });
});
