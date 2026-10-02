// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import { escapeToken, unescapeToken } from './escape.ts';
import { javaDoubleToInt, parseJavaBoolean, parseJavaDouble, parseJavaInt } from './java.ts';
import { classNameForXmlTag, constructElement, createCe } from './registry.ts';
import { StringTokenizer } from './StringTokenizer.ts';

describe('Java number parsing', () => {
  it('accepts what Double.parseDouble accepts', () => {
    expect(parseJavaDouble('1.0E-5')).toBe(1e-5);
    expect(parseJavaDouble(' 5 ')).toBe(5);
    expect(parseJavaDouble('.5')).toBe(0.5);
    expect(parseJavaDouble('2.')).toBe(2);
    expect(parseJavaDouble('1d')).toBe(1);
    expect(parseJavaDouble('-Infinity')).toBe(-Infinity);
    expect(parseJavaDouble('-0.0')).toBe(-0);
  });

  it('rejects what Double.parseDouble rejects', () => {
    for (const s of ['', 'abc', '5V', '1e', '0x10', 'true'])
      expect(() => parseJavaDouble(s)).toThrow();
  });

  it('parses ints strictly', () => {
    expect(parseJavaInt('-42')).toBe(-42);
    expect(parseJavaInt('+7')).toBe(7);
    for (const s of ['', '1.0', ' 1', '1e3', '2147483648', 'false'])
      expect(() => parseJavaInt(s)).toThrow();
  });

  it('converts like Java casts and Boolean.parseBoolean', () => {
    expect(javaDoubleToInt(-2.7)).toBe(-2);
    expect(javaDoubleToInt(NaN)).toBe(0);
    expect(javaDoubleToInt(-Infinity)).toBe(-2147483648);
    expect(parseJavaBoolean('TRUE')).toBe(true);
    expect(parseJavaBoolean('yes')).toBe(false);
  });
});

describe('StringTokenizer', () => {
  it('splits on any delimiter and skips runs', () => {
    const st = new StringTokenizer('r 1+2\t 3', ' +\t\n\r\f');
    const out: string[] = [];
    while (st.hasMoreTokens()) out.push(st.nextToken());
    expect(out).toEqual(['r', '1', '2', '3']);
    expect(() => st.nextToken()).toThrow();
  });
});

describe('text escapes', () => {
  it('round-trips awkward strings', () => {
    for (const s of ['', 'a b', 'x+y=z#1&2', 'back\\slash', 'two\nlines\r'])
      expect(unescapeToken(escapeToken(s))).toBe(s);
    expect(escapeToken('a b')).toBe('a\\sb');
  });
});

describe('element registry', () => {
  it('maps dump types and XML tags as upstream registers them', () => {
    expect(classNameForXmlTag('v')).toBe('VoltageElm');
    expect(classNameForXmlTag('ln')).toBe('LabeledNodeElm');
    expect(classNameForXmlTag('pt')).toBe('PotElm');
    expect(constructElement('VoltageElm', 0, 0)?.getClassName()).toBe('DCVoltageElm');
    const st = new StringTokenizer('0 40.0 5.0 0.0');
    expect(createCe(118, 0, 0, 0, 64, 0, st)?.getClassName()).toBe('VoltageElm');
    expect(createCe(999, 0, 0, 0, 64, 0, new StringTokenizer(''))).toBeNull();
  });
});
