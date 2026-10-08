// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CircuitElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: value formatting (getUnitText and friends,
// setDecimalDigits with the default 3 and 1 digits).
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { SCALE_1, SCALE_M, SCALE_MU } from '../constants.ts';

export const MU = 'μ';
export const OHM = 'Ω';

/**
 * GWT `NumberFormat` with pattern `####.###` (`fixed`: `####.000`): no grouping, up to (or
 * exactly) `digits` decimals. GWT keeps the leading zero (`0.5`, checked in the reference build).
 */
export function formatNumber(v: number, digits: number, fixed = false): string {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'NaN' : v > 0 ? '∞' : '-∞';
  let s = Math.abs(v).toFixed(digits);
  if (!fixed && s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return (v < 0 && /[1-9]/.test(s) ? '-' : '') + s;
}

/**
 * While set, the value helpers below return fixed-width text (see getFixedUnitText). The info box
 * turns it on around an element's getInfo, so every value in it keeps its width as it changes
 * (owner's rule for live values, CLAUDE.md), without touching each element's getInfo.
 */
let fixedWidth = false;

/** Runs `fn` with the value helpers giving fixed-width text. */
export function withFixedWidthValues<T>(fn: () => T): T {
  const was = fixedWidth;
  fixedWidth = true;
  try {
    return fn();
  } finally {
    fixedWidth = was;
  }
}

/** Upstream `showFormat` (3 decimals) and `shortFormat` (1 decimal). */
export const showFormat = (v: number): string => (fixedWidth ? fixedNumber(v) : formatNumber(v, 3));
export const shortFormat = (v: number): string => formatNumber(v, 1);
export const fixedFormat = (v: number): string => formatNumber(v, 3, true);

/** A bare number with a sign place, three decimals and room for four integer digits. */
function fixedNumber(v: number): string {
  let s = formatNumber(v, 3, true);
  if (s === '-0.000') s = '0.000';
  return s.padStart(9);
}

function exponentFormat(v: number): string {
  // GWT "#.##E000"
  const [m = '0', e = '0'] = v.toExponential(2).split('e');
  const mant = m.replace(/0+$/, '').replace(/\.$/, '');
  const exp = parseInt(e, 10);
  return `${mant}E${exp < 0 ? '-' : ''}${String(Math.abs(exp)).padStart(3, '0')}`;
}

function unitText(v: number, u: string, sf: boolean, fixed = false): string {
  const sp = sf ? '' : ' ';
  const f = fixed ? fixedFormat : sf ? shortFormat : showFormat;
  const va = Math.abs(v);
  // this used to return null, but then wires would display "null" with 0V
  if (va < 1e-14) return (fixed ? fixedFormat(0) : '0') + sp + u;
  if (va < 1e-9) return f(v * 1e12) + sp + 'p' + u;
  if (va < 1e-6) return f(v * 1e9) + sp + 'n' + u;
  if (va < 1e-3) return f(v * 1e6) + sp + MU + u;
  if (va < 1) return f(v * 1e3) + sp + 'm' + u;
  if (va < 1e3) return f(v) + sp + u;
  if (va < 1e6) return f(v * 1e-3) + sp + 'k' + u;
  if (va < 1e9) return f(v * 1e-6) + sp + 'M' + u;
  if (va < 1e12) return f(v * 1e-9) + sp + 'G' + u;
  return exponentFormat(v) + sp + u;
}

/** `1.5 kΩ` style text with three decimals. */
export function getUnitText(v: number, u: string): string {
  return fixedWidth ? getFixedUnitText(v, u) : unitText(v, u, false);
}

/**
 * Like getUnitText, but the same width whatever the value: a place for the sign, three integer
 * digits, always three decimals and a place for the prefix, filled with spaces. In monospace a
 * live value then never shifts as it changes (the scope cards, not upstream). Values of 1000 G
 * and up don't fit and fall back to getUnitText.
 */
export function getFixedUnitText(v: number, u: string): string {
  // every part has a budget: sign, three integer digits, three decimals, one prefix letter
  const prefixes: [number, string][] = [
    [1e-12, 'p'],
    [1e-9, 'n'],
    [1e-6, MU],
    [1e-3, 'm'],
    [1, ' '],
    [1e3, 'k'],
    [1e6, 'M'],
    [1e9, 'G'],
  ];
  if (Math.abs(v) >= 1e12) return unitText(v, u, false);
  let num = '0.000';
  let prefix = ' ';
  if (Math.abs(v) >= 1e-14 && Number.isFinite(v)) {
    let k = prefixes.length - 1;
    while (k > 0 && Math.abs(v) < (prefixes[k]?.[0] ?? 1)) k--;
    let [scale, p] = prefixes[k] ?? [1, ' '];
    num = formatNumber(v / scale, 3, true);
    // 999.9996 rounds up to 1000.000: say 1.000 of the next prefix instead
    if (/^-?1000\./.test(num) && k + 1 < prefixes.length) {
      [scale, p] = prefixes[k + 1] ?? [scale, p];
      num = formatNumber(v / scale, 3, true);
    }
    prefix = p;
  }
  if (num === '-0.000') num = '0.000';
  return `${num.padStart(8)} ${prefix}${u}`;
}

/** `1.5kΩ` style text with one decimal, used on the circuit. */
export function getShortUnitText(v: number, u: string): string {
  return unitText(v, u, true);
}

export function getUnitTextWithScale(val: number, utext: string, scale: number, fixed = false) {
  if (Math.abs(val) > 1e12) return getUnitText(val, utext);
  if (fixedWidth) {
    const p = scale === SCALE_1 ? ' ' : scale === SCALE_M ? 'm' : scale === SCALE_MU ? MU : null;
    if (p === null) return getFixedUnitText(val, utext);
    const k = scale === SCALE_M ? 1e3 : scale === SCALE_MU ? 1e6 : 1;
    return `${fixedNumber(val * k)
      .trimStart()
      .padStart(8)} ${p}${utext}`;
  }
  const nf = fixed ? fixedFormat : showFormat;
  if (scale === SCALE_1) return nf(val) + ' ' + utext;
  if (scale === SCALE_M) return nf(1e3 * val) + ' m' + utext;
  if (scale === SCALE_MU) return nf(1e6 * val) + ' ' + MU + utext;
  return getUnitText(val, utext);
}

/** Java `Double.toString` for the plain decimal range (`1.0`, `-2.5`). */
export function javaDoubleToString(v: number): string {
  const s = String(v);
  return Number.isInteger(v) && Math.abs(v) < 1e7 ? s + '.0' : s;
}

export function getVoltageText(v: number): string {
  return getUnitText(v, 'V');
}

export function getVoltageDText(v: number): string {
  return getUnitText(Math.abs(v), 'V');
}

export function getCurrentText(i: number): string {
  return getUnitText(i, 'A');
}

export function getCurrentDText(i: number): string {
  return getUnitText(Math.abs(i), 'A');
}

/**
 * Upstream `getTimeText`: seconds with a unit prefix, or h:mm:ss.sss from a minute up. The hour
 * and minute counts are doubles concatenated in GWT, so they print without ".0".
 */
export function getTimeText(v: number): string {
  if (fixedWidth && v >= 60) {
    // h:mm:ss.sss, padded to the width of the seconds form below an hour
    const was = fixedWidth;
    fixedWidth = false;
    const t = getTimeText(v);
    fixedWidth = was;
    return t.padStart(11);
  }
  if (v >= 60) {
    const h = Math.floor(v / 3600);
    v -= 3600 * h;
    const m = Math.floor(v / 60);
    v -= 60 * m;
    if (h === 0) return `${m}:${v >= 10 ? '' : '0'}${showFormat(v)}`;
    return `${h}:${m >= 10 ? '' : '0'}${m}:${v >= 10 ? '' : '0'}${showFormat(v)}`;
  }
  return getUnitText(v, 's');
}
