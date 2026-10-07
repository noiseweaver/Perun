// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Live formula cards (PLAN.md Phase 19): each law's numbers agree with the engine, and every
// value keeps its width as the circuit runs.

import {
  CapacitorElm,
  DiodeElm,
  formulasFor,
  getFixedUnitText,
  CurrentElm,
  InductorElm,
  MosfetElm,
  OpAmpElm,
  TransformerElm,
  VoltageElm,
  ResistorElm,
  TransistorElm,
  type CircuitElm,
  type FormulaLaw,
} from '@circuitjs-next/elements';
import { describe, expect, it } from 'vitest';
import { readCircuit } from './circuit.ts';

const HEADER = '$ 1 0.000005 10.2 50 5 50 5e-11\n';

/** 5 V through a 1 kΩ resistor into `part` (a line from (256,96) to (256,320)), to ground. */
function loop(part: string, volts = 5): string {
  return (
    HEADER +
    `v 96 320 96 96 0 0 40 ${volts} 0 0 0.5\n` +
    'r 96 96 256 96 0 1000\n' +
    `${part}\n` +
    'w 256 320 96 320 0\n' +
    'g 96 320 96 352 0\n'
  );
}

function run<T extends CircuitElm>(
  text: string,
  cls: abstract new (...a: never[]) => T,
  steps = 200,
) {
  const c = readCircuit(text);
  expect(c.warnings).toEqual([]);
  c.sim.setElements(c.elements);
  c.sim.step(steps);
  const elms = c.elements.filter((e): e is T => e instanceof cls);
  return { c, elm: elms[elms.length - 1] as T };
}

/** The value on a law's last line, read back from its fixed-width text. */
function result(law: FormulaLaw | undefined): string {
  const l = law?.lines[law.lines.length - 1];
  return l?.tokens.join(' ').trim() ?? '';
}

/** Widths of every token, to compare across time. */
function widths(laws: FormulaLaw[]): number[] {
  return laws.flatMap((l) => l.lines.flatMap((x) => x.tokens.map((t) => t.length)));
}

/** The posts of a part on its own, to wire a circuit up to them. */
function postsOf(line: string): { x: number; y: number }[] {
  const e = readCircuit(HEADER + line + '\n').elements[0];
  if (!e) throw new Error('no element');
  e.setPoints();
  return Array.from({ length: e.getPostCount() }, (_, n) => e.getPost(n));
}

describe('formula cards', () => {
  it("shows Ohm's law and power for a resistor", () => {
    const { elm } = run(loop('w 256 96 256 320 0'), ResistorElm);
    const laws = formulasFor(elm);
    expect(laws.map((l) => l.formula)).toEqual(['I = V / R', 'P = V · I']);
    expect(laws[0]?.lines[0]?.tokens).toEqual([
      getFixedUnitText(5, 'V'),
      '/',
      getFixedUnitText(1000, 'Ω'),
    ]);
    expect(result(laws[0])).toBe(getFixedUnitText(5e-3, 'A').trim());
    expect(result(laws[1])).toBe(getFixedUnitText(25e-3, 'W').trim());
  });

  it('follows a charging capacitor without changing width', () => {
    const { c, elm } = run(loop('c 256 96 256 320 0 0.00001 0'), CapacitorElm, 10);
    const before = formulasFor(elm);
    const q0 = elm.simCapacitance() * elm.voltdiff;
    expect(result(before[0])).toBe(getFixedUnitText(q0, 'C').trim());
    expect(result(before[1])).toBe(getFixedUnitText(elm.getCurrent(), 'A').trim());
    c.sim.step(2000);
    const after = formulasFor(elm);
    expect(elm.voltdiff).toBeGreaterThan(0.5);
    expect(widths(after)).toEqual(widths(before));
    // the current falls as it charges: dV/dt = I / C
    const dvdt = elm.getCurrent() / elm.simCapacitance();
    expect(after[1]?.lines[0]?.tokens[2]).toBe(getFixedUnitText(dvdt, 'V/s'));
  });

  it('gives an inductor V = L dI/dt', () => {
    const { elm } = run(loop('l 256 96 256 320 0 1 0'), InductorElm, 20);
    const laws = formulasFor(elm);
    expect(laws[0]?.formula).toBe('V = L · dI/dt');
    expect(result(laws[0])).toBe(getFixedUnitText(elm.getVoltageDiff(), 'V').trim());
  });

  it("matches the engine's diode current with Shockley's equation", () => {
    const { elm } = run(loop('d 256 96 256 320 2 default'), DiodeElm);
    const laws = formulasFor(elm);
    expect(laws.map((l) => l.name)).toEqual(['Shockley diode equation']);
    expect(result(laws[0])).toBe(getFixedUnitText(elm.getCurrent(), 'A').trim());
  });

  it('adds the series resistance of an LED model', () => {
    const { elm } = run(loop('d 256 96 256 320 2 default-led'), DiodeElm);
    const laws = formulasFor(elm);
    expect(laws.map((l) => l.name)).toEqual(['Series resistance', 'Shockley diode equation']);
    expect(laws[1]?.formula).toContain('Vj');
    expect(result(laws[1])).toBe(getFixedUnitText(elm.getCurrent(), 'A').trim());
  });

  it('shows breakdown for a reversed Zener', () => {
    const { elm } = run(loop('z 256 320 256 96 1 0.805904783 5.6', 12), DiodeElm);
    const laws = formulasFor(elm);
    expect(laws.map((l) => l.name)).toEqual(['Zener breakdown']);
    expect(elm.getVoltageDiff()).toBeLessThan(-5);
  });

  it("gives a transistor's current gain and Kirchhoff's current law", () => {
    // find the posts of a lone transistor, then wire it up
    const probe = readCircuit(HEADER + 't 304 240 352 240 0 1 0 0 100 default\n');
    const t0 = probe.elements[0] as TransistorElm;
    t0.setPoints();
    const [b, col, em] = [0, 1, 2].map((n) => t0.getPost(n));
    if (!b || !col || !em) throw new Error('no posts');
    const text =
      HEADER +
      't 304 240 352 240 0 1 0 0 100 default\n' +
      'v 200 400 200 240 0 0 40 1 0 0 0.5\n' +
      'r 200 240 304 240 0 10000\n' +
      `r ${col.x} ${col.y} ${col.x} 96 0 1000\n` +
      `w ${col.x} 96 512 96 0\n` +
      'v 512 400 512 96 0 0 40 10 0 0 0.5\n' +
      `w ${em.x} ${em.y} ${em.x} 400 0\n` +
      `w 200 400 ${em.x} 400 0\n` +
      `w ${em.x} 400 512 400 0\n` +
      'g 200 400 200 432 0\n';
    const { elm } = run(text, TransistorElm, 400);
    const laws = formulasFor(elm);
    expect(laws.map((l) => l.formula)).toEqual(['β = Ic / Ib', 'Ie = Ib + Ic']);
    const beta = Number(result(laws[0]));
    expect(beta).toBeGreaterThan(80);
    expect(beta).toBeLessThan(120);
    expect(result(laws[1])).toBe(getFixedUnitText(-elm.ie, 'A').trim());
  });

  /** An n-channel MOSFET (Vt 1.5 V, β 20 mA/V²) with its gate at `vg` and 1k to 10 V. */
  function mosfetAt(vg: number): MosfetElm {
    const f = 'f 304 240 352 240 0 1.5 0.02';
    const [g, a, b] = postsOf(f);
    if (!g || !a || !b) throw new Error('no posts');
    const [top, bot] = a.y < b.y ? [a, b] : [b, a];
    const text =
      HEADER +
      f +
      '\n' +
      `v 200 400 200 ${g.y} 0 0 40 ${vg} 0 0 0.5\n` +
      `w 200 ${g.y} ${g.x} ${g.y} 0\n` +
      `r ${top.x} ${top.y} ${top.x} 96 0 1000\n` +
      `w ${top.x} 96 512 96 0\n` +
      'v 512 400 512 96 0 0 40 10 0 0 0.5\n' +
      `w ${bot.x} ${bot.y} ${bot.x} 400 0\n` +
      `w 200 400 ${bot.x} 400 0\n` +
      `w ${bot.x} 400 512 400 0\n` +
      'g 200 400 200 432 0\n';
    return run(text, MosfetElm, 400).elm;
  }

  it("follows a MOSFET's region: cutoff, square law, linear", () => {
    expect(formulasFor(mosfetAt(1)).map((l) => l.name)).toEqual(['Cutoff']);
    const sat = mosfetAt(2);
    const s = formulasFor(sat);
    expect(s.map((l) => l.name)).toEqual(['Saturation (square law)']);
    // ½ · 20 mA/V² · (0.5 V)² = 2.5 mA
    expect(result(s[0])).toBe(getFixedUnitText(Math.abs(sat.getCurrent()), 'A').trim());
    expect(Math.abs(sat.getCurrent())).toBeCloseTo(2.5e-3, 5);
    const lin = mosfetAt(5);
    const l = formulasFor(lin);
    expect(l.map((x) => x.name)).toEqual(['Linear region']);
    expect(result(l[0])).toBe(getFixedUnitText(Math.abs(lin.getCurrent()), 'A').trim());
  });

  /** An op-amp with V+ at 1 V, and V− either on its output (a follower) or on ground. */
  function opampWith(follower: boolean): OpAmpElm {
    const a = 'a 304 240 400 240 0 15 -15 1000000 0 0 100000';
    const [minus, plus, out] = postsOf(a);
    if (!minus || !plus || !out) throw new Error('no posts');
    const text =
      HEADER +
      a +
      '\n' +
      `v 160 400 160 ${plus.y} 0 0 40 1 0 0 0.5\n` +
      `w 160 ${plus.y} ${plus.x} ${plus.y} 0\n` +
      `r ${out.x} ${out.y} ${out.x} 400 0 1000\n` +
      `w 160 400 ${out.x} 400 0\n` +
      'g 160 400 160 432 0\n' +
      (follower
        ? `w ${minus.x} ${minus.y} ${minus.x} 160 0\nw ${minus.x} 160 ${out.x} 160 0\nw ${out.x} 160 ${out.x} ${out.y} 0\n`
        : `w ${minus.x} ${minus.y} 240 ${minus.y} 0\nw 240 ${minus.y} 240 400 0\n`);
    return run(text, OpAmpElm, 400).elm;
  }

  it("shows an op-amp's tiny input difference, or its output at the limit", () => {
    const f = opampWith(true);
    const laws = formulasFor(f);
    expect(laws.map((l) => l.formula)).toEqual(['Vd = V+ − V−', 'Vout = A · Vd']);
    expect(result(laws[1])).toBe(getFixedUnitText(f.volts[2] ?? NaN, 'V').trim());
    expect(Math.abs((f.volts[1] ?? 0) - (f.volts[0] ?? 0))).toBeLessThan(1e-4);
    const open = formulasFor(opampWith(false));
    expect(open.map((l) => l.formula)).toEqual(['Vd = V+ − V−', 'Vout ≈ Vmax']);
  });

  it("predicts a transformer's secondary from its turns ratio", () => {
    const tline = 'T 304 208 400 272 0 4 2 0 0 0.999';
    const [p1, s1, p2, s2] = postsOf(tline);
    if (!p1 || !s1 || !p2 || !s2) throw new Error('no posts');
    const text =
      HEADER +
      tline +
      '\n' +
      `v 160 ${p2.y} 160 ${p1.y} 0 1 60 10 0 0 0.5\n` +
      `w 160 ${p1.y} ${p1.x} ${p1.y} 0\n` +
      `w 160 ${p2.y} ${p2.x} ${p2.y} 0\n` +
      `r ${s1.x} ${s1.y} ${s2.x} ${s2.y} 0 1000\n` +
      `g 160 ${p2.y} 160 ${p2.y + 32} 0\n`;
    const { elm } = run(text, TransformerElm, 1500);
    const law = formulasFor(elm)[0];
    expect(law?.formula).toBe('V2 ≈ V1 · N2/N1');
    const v1 = (elm.volts[0] ?? 0) - (elm.volts[2] ?? 0);
    const v2 = (elm.volts[1] ?? 0) - (elm.volts[3] ?? 0);
    expect(Math.abs(v1)).toBeGreaterThan(1);
    expect(v2 / v1).toBeGreaterThan(1.9);
    expect(v2 / v1).toBeLessThan(2.1);
    expect(law?.lines[2]?.tokens[0]).toBe(getFixedUnitText(v2, 'V'));
  });

  it('shows the power a voltage source and a current source deliver as positive', () => {
    const v = run(loop('w 256 96 256 320 0'), VoltageElm).elm;
    expect(result(formulasFor(v)[0])).toBe(getFixedUnitText(25e-3, 'W').trim());
    const i = run(
      HEADER +
        'i 96 320 96 96 0 0.01\n' +
        'r 96 96 256 96 0 100\n' +
        'w 256 96 256 320 0\n' +
        'w 256 320 96 320 0\n' +
        'g 96 320 96 352 0\n',
      CurrentElm,
    ).elm;
    // 10 mA through 100 Ω: 10 mW
    expect(result(formulasFor(i)[0])).toBe(getFixedUnitText(10e-3, 'W').trim());
  });

  it('has no card for a wire', () => {
    const { c } = run(loop('w 256 96 256 320 0'), ResistorElm);
    const wire = c.elements.find((e) => e.getClassName() === 'WireElm');
    expect(wire && formulasFor(wire)).toEqual([]);
  });
});
