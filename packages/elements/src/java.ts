// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/**
 * Java number parsing and conversion as upstream's GWT build does it. JS `parseFloat` and
 * `parseInt` accept trailing junk and return NaN instead of throwing; upstream loaders rely on
 * `NumberFormatException` to fall back to defaults, so these throw instead.
 */

const DOUBLE_RE = /^\s*[+-]?(NaN|Infinity|((\d+\.?\d*)|(\.\d+))([eE][+-]?\d+)?[dDfF]?)\s*$/;
const INT_RE = /^[+-]?\d+$/;

export class NumberFormatException extends Error {
  constructor(s: string) {
    super(`For input string: "${s}"`);
    this.name = 'NumberFormatException';
  }
}

/** `Double.parseDouble` (also `new Double(s)`). */
export function parseJavaDouble(s: string): number {
  if (!DOUBLE_RE.test(s)) throw new NumberFormatException(s);
  return parseFloat(s.trim().replace(/[dDfF]$/, ''));
}

/** `Integer.parseInt` (also `new Integer(s)`), radix 10. */
export function parseJavaInt(s: string): number {
  if (!INT_RE.test(s)) throw new NumberFormatException(s);
  const n = parseInt(s, 10);
  if (n < -2147483648 || n > 2147483647) throw new NumberFormatException(s);
  return n;
}

/** `Integer.parseInt(s, radix)`: an optional sign, then digits of that radix. */
export function parseJavaIntRadix(s: string, radix: number): number {
  const digits = '0123456789abcdefghijklmnopqrstuvwxyz'.substring(0, radix);
  const body = s.length > 0 && (s[0] === '-' || s[0] === '+') ? s.substring(1) : s;
  if (body.length === 0) throw new NumberFormatException(s);
  for (const c of body.toLowerCase()) if (!digits.includes(c)) throw new NumberFormatException(s);
  const n = parseInt(s, radix);
  if (n < -2147483648 || n > 2147483647) throw new NumberFormatException(s);
  return n;
}

/** Java `String.split(regex)`: like JS split, but trailing empty strings are dropped. */
export function javaSplit(s: string, re: RegExp | string): string[] {
  const parts = s.split(re);
  while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  // a string of separators only splits to nothing
  if (parts.length === 1 && parts[0] === '' && s.length > 0) return [];
  return parts;
}

/** `Boolean.parseBoolean`: true only for "true", ignoring case. */
export function parseJavaBoolean(s: string): boolean {
  return s.toLowerCase() === 'true';
}

/** Java's `(int) d`: truncate toward zero, NaN to 0, saturate at the int range. */
export function javaDoubleToInt(d: number): number {
  if (Number.isNaN(d)) return 0;
  if (d >= 2147483647) return 2147483647;
  if (d <= -2147483648) return -2147483648;
  return Math.trunc(d);
}
