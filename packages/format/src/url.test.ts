// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import { readCircuit } from './circuit.ts';
import {
  compressCircuit,
  decompressCircuit,
  parseQuery,
  queryBoolean,
  startCircuitFromQuery,
} from './url.ts';

describe('query parameters', () => {
  it('splits like upstream QueryParameters', () => {
    const q = parseQuery('?a=1&b=x%20y&c=p=q&a=2');
    expect(q.get('a')).toBe('2');
    expect(q.get('b')).toBe('x y');
    expect(q.get('c')).toBe('p'); // only the text up to the next "="
    // decodeURI leaves reserved escapes alone
    expect(parseQuery('?cct=%24%2B').get('cct')).toBe('%24%2B');
    // a parameter without "=" stops reading
    expect([...parseQuery('?a=1&flag&b=2').keys()]).toEqual(['a']);
    expect(parseQuery('').size).toBe(0);
  });

  it('reads booleans like getBooleanValue', () => {
    const q = parseQuery('?a=1&b=TRUE&c=yes&d=0');
    expect(queryBoolean(q, 'a', false)).toBe(true);
    expect(queryBoolean(q, 'b', false)).toBe(true);
    expect(queryBoolean(q, 'c', true)).toBe(false);
    expect(queryBoolean(q, 'd', true)).toBe(false);
    expect(queryBoolean(q, 'missing', true)).toBe(true);
  });
});

describe('start circuit', () => {
  const text = '$ 1 0.000005 10 50 5 50\nr 0 0 0 64 0 100\n';

  it('round-trips ctz', () => {
    const z = compressCircuit(text);
    expect(z).toMatch(/^[\w+$-]+$/);
    expect(decompressCircuit(z)).toBe(text);
    expect(decompressCircuit('')).toBeNull();
  });

  it('follows upstream precedence', () => {
    const z = compressCircuit(text);
    expect(startCircuitFromQuery(parseQuery(`?cct=a%24b&ctz=${z}`))).toEqual({
      kind: 'text',
      text,
    });
    expect(startCircuitFromQuery(parseQuery('?cct=a%24b'))).toEqual({ kind: 'text', text: 'a$b' });
    expect(
      startCircuitFromQuery(parseQuery('?startCircuitLink=http://x/c.txt&startCircuit=lrc.txt')),
    ).toEqual({ kind: 'link', url: 'http://x/c.txt' });
    expect(startCircuitFromQuery(parseQuery('?startCircuit=lrc.txt&startLabel=LRC'))).toEqual({
      kind: 'example',
      file: 'lrc.txt',
      label: 'LRC',
    });
    expect(startCircuitFromQuery(parseQuery('?running=0'))).toEqual({ kind: 'default' });
  });
});

describe('Circuit.reset', () => {
  it('restarts time and clears element state', () => {
    const c = readCircuit(
      '$ 1 0.000005 10 50 5 50\nv 0 64 0 0 0 0 40 5 0 0 0.5\nr 0 0 64 0 0 100\nc 64 0 64 64 0 0.00001 0\nw 0 64 64 64 0\n',
    );
    for (let i = 0; i < 20; i++) c.sim.step(10);
    expect(c.sim.t).toBeGreaterThan(0);
    const cap = c.elements[2];
    if (!cap) throw new Error('no capacitor');
    expect(Math.abs(cap.getVoltageDiff())).toBeGreaterThan(0.1);
    c.reset();
    expect(c.sim.t).toBe(0);
    expect(c.sim.analyzeFlag).toBe(true);
    expect(cap.getVoltageDiff()).toBe(0);
  });
});
