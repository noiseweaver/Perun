// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import {
  formatNumber,
  getFixedUnitText,
  getShortUnitText,
  getTimeText,
  getUnitText,
  getUnitTextWithScale,
  getVoltageText,
  javaDoubleToString,
  showFormat,
  withFixedWidthValues,
} from './units.ts';
import { SCALE_M } from '../constants.ts';

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

describe('withFixedWidthValues', () => {
  it('makes the info helpers fixed width, and only inside', () => {
    const width = (v: number) => withFixedWidthValues(() => getVoltageText(v)).length;
    expect(new Set([0, 1e-3, -1e-3, 5, -12.3456, 999.9999, 2.5e6, -7e-12].map(width))).toEqual(
      new Set([width(0)]),
    );
    expect(withFixedWidthValues(() => getUnitText(-0.0123, 'A'))).toBe(
      getFixedUnitText(-0.0123, 'A'),
    );
    expect(getVoltageText(5)).toBe('5 V');
    const sf = (v: number) => withFixedWidthValues(() => showFormat(v));
    expect(sf(0.5)).toBe('    0.500');
    expect(sf(-12.25).length).toBe(sf(1).length);
    const t = (v: number) => withFixedWidthValues(() => getTimeText(v));
    expect(t(59.5).length).toBe(t(1e-6).length);
    expect(t(61).length).toBe(t(1e-6).length);
    const ws = (v: number, scale: number) =>
      withFixedWidthValues(() => getUnitTextWithScale(v, 'V', scale));
    expect(ws(-0.0021, SCALE_M)).toBe('  -2.100 mV');
    expect(ws(0.0021, SCALE_M).length).toBe(ws(-0.0021, SCALE_M).length);
  });
});
