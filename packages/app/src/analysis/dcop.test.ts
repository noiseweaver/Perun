// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { readCircuit } from '@perun/format';
import { describe, expect, it } from 'vitest';
import { operatingPointCsv, solveOperatingPoint, type OperatingPoint } from './dcop.ts';

// 10 V across two 1k resistors; the middle is labeled "mid"
const DIVIDER = `$ 1 5.0E-6 10 50 5.0 50
v 96 320 96 96 0 0 40.0 10.0 0.0 0.0 0.5
r 96 96 256 96 0 1000.0
r 256 96 256 320 0 1000.0
w 96 320 256 320 0
g 96 320 96 352 0
207 256 96 320 96 0 mid
`;

// voltage-divider bias: 12 V, R1 47k, R2 10k, Rc 2.2k, Re 1k, beta 100. A 1 µF cap couples the
// base to a 1k resistor to ground, which must carry no DC current.
const NPN_BIAS = `$ 1 5.0E-6 10 50 5.0 50
R 352 64 352 32 0 0 40.0 12.0 0.0 0.0 0.5
w 352 64 208 64 0
r 352 64 352 224 0 2200.0
r 208 64 208 240 0 47000.0
r 208 240 208 400 0 10000.0
w 208 240 304 240 0
t 304 240 352 240 0 1 0 0 100 default
r 352 256 352 400 0 1000.0
w 208 400 352 400 0
g 352 400 352 432 0
c 208 240 128 240 0 1.0E-6 0.0
r 128 240 128 400 0 1000.0
w 128 400 208 400 0
`;

// 5 V, 100 ohm and 10 mH in series: the inductor is a short at DC
const RL = `$ 1 5.0E-6 10 50 5.0 50
v 96 320 96 96 0 0 40.0 5.0 0.0 0.0 0.5
r 96 96 256 96 0 100.0
l 256 96 256 320 0 0.01 0.0
w 96 320 256 320 0
g 96 320 96 352 0
`;

// an AC source with a 2 V offset: at DC only the offset is left
const AC_OFFSET = `$ 1 5.0E-6 10 50 5.0 50
v 96 320 96 96 0 1 1000.0 5.0 2.0 0.0 0.5
r 96 96 256 96 0 1000.0
r 256 96 256 320 0 1000.0
w 96 320 256 320 0
g 96 320 96 352 0
`;

function kinds(text: string): string[] {
  return readCircuit(text).elements.map((e) => e.getClassName());
}

function part(op: OperatingPoint, text: string, cls: string, nth = 0) {
  const k = kinds(text);
  let seen = -1;
  const index = k.findIndex((c) => c === cls && ++seen === nth);
  const p = op.parts.find((x) => x.element === index);
  if (p === undefined) throw new Error(`no ${cls} ${nth}`);
  return p;
}

describe('solveOperatingPoint', () => {
  it('solves a resistor divider', () => {
    const op = solveOperatingPoint(DIVIDER);
    expect(op.error).toBeNull();
    expect(op.settled).toBe(true);
    expect(op.nodes.map((n) => n.name)).toEqual(['GND', 'mid', 'N1']);
    const v = Object.fromEntries(op.nodes.map((n) => [n.name, n.v]));
    expect(v['GND']).toBe(0);
    expect(v['mid']).toBeCloseTo(5, 9);
    expect(v['N1']).toBeCloseTo(10, 9);
    const r1 = part(op, DIVIDER, 'ResistorElm', 0);
    const r2 = part(op, DIVIDER, 'ResistorElm', 1);
    expect(Math.abs(r1.i)).toBeCloseTo(5e-3, 9);
    expect(Math.abs(r2.i)).toBeCloseTo(5e-3, 9);
    expect(r1.p).toBeCloseTo(25e-3, 9);
    expect(r2.v).toBeCloseTo(5, 9);
    // the source delivers what the resistors take
    const src = part(op, DIVIDER, kinds(DIVIDER)[0] ?? '');
    expect(src.p).toBeCloseTo(-50e-3, 9);
    // the label shares its node with both resistors
    const mid = op.nodes.find((n) => n.name === 'mid');
    expect(mid?.elements.length).toBe(3);
  });

  it('matches the hand calculation for a transistor bias circuit', () => {
    const op = solveOperatingPoint(NPN_BIAS);
    expect(op.error).toBeNull();
    expect(op.settled).toBe(true);
    const q = part(op, NPN_BIAS, 'TransistorElm');
    const t = q.terminals ?? [];
    expect(t.map((x) => x.label)).toEqual(['B', 'C', 'E']);
    const [b, c, e] = t;
    if (b === undefined || c === undefined || e === undefined) throw new Error('terminals');
    const vbe = b.v - e.v;
    expect(vbe).toBeGreaterThan(0.55);
    expect(vbe).toBeLessThan(0.75);
    // Thevenin equivalent of the base divider
    const vth = (12 * 10e3) / 57e3;
    const rth = (47e3 * 10e3) / 57e3;
    const beta = 100;
    const ib = (vth - vbe) / (rth + (beta + 1) * 1e3);
    expect(b.i / ib).toBeCloseTo(1, 2);
    expect(c.i / (beta * ib)).toBeCloseTo(1, 2);
    expect(e.v / ((beta + 1) * ib * 1e3)).toBeCloseTo(1, 2);
    expect(c.v / (12 - beta * ib * 2.2e3)).toBeCloseTo(1, 2);
    // the textbook answer with Vbe = 0.65 V, within 5%
    const ibText = (vth - 0.65) / (rth + (beta + 1) * 1e3);
    expect(Math.abs(c.i / (beta * ibText) - 1)).toBeLessThan(0.05);
    // currents into the transistor sum to zero
    expect(b.i + c.i + e.i).toBeCloseTo(0, 9);
    // capacitors carry no DC current, so neither does the resistor behind the cap
    const cap = part(op, NPN_BIAS, 'CapacitorElm');
    expect(cap.i).toBe(0);
    expect(cap.v).toBeCloseTo(b.v, 9);
    expect(Math.abs(part(op, NPN_BIAS, 'ResistorElm', 4).i)).toBeLessThan(1e-15);
  });

  it('shorts inductors', () => {
    const op = solveOperatingPoint(RL);
    expect(op.settled).toBe(true);
    const l = part(op, RL, 'InductorElm');
    expect(Math.abs(l.i)).toBeCloseTo(0.05, 6);
    expect(Math.abs(l.v)).toBeLessThan(1e-6);
  });

  it('keeps only the DC offset of an AC source', () => {
    const op = solveOperatingPoint(AC_OFFSET);
    const r2 = part(op, AC_OFFSET, 'ResistorElm', 1);
    expect(Math.abs(r2.v)).toBeCloseTo(1, 9);
  });

  it('leaves a node behind two capacitors at 0 V instead of failing', () => {
    const text = `$ 1 5.0E-6 10 50 5.0 50
v 96 320 96 96 0 0 40.0 5.0 0.0 0.0 0.5
c 96 96 256 96 0 1.0E-6 0.0
c 256 96 256 320 0 1.0E-6 0.0
w 96 320 256 320 0
g 96 320 96 352 0
`;
    const op = solveOperatingPoint(text);
    expect(op.error).toBeNull();
    expect(op.nodes.map((n) => n.v)).toEqual([0, 5, 0]);
  });

  it('writes CSV', () => {
    const op = solveOperatingPoint(DIVIDER);
    const csv = operatingPointCsv(op, (i) => `part ${i}`);
    expect(csv.split('\n')[0]).toBe('node,voltage_V');
    expect(csv).toContain('mid,5');
    expect(csv).toContain('part,pin,voltage_V,current_A,power_W');
  });
});
