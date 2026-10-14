// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// The behavioural TL072, NE5532 and RC4558 op-amps (packages/elements/src/elm/opAmpMacro.ts)
// against their datasheet figures: gain, bandwidth, slew rate, clipping, bias and supply current.

import { type EditInfo, OPAMP_MACROS, OpAmpRealElm, RailElm } from '@perun/elements';
import { describe, expect, it } from 'vitest';
import { readCircuit, type Circuit } from './circuit.ts';

const TL072 = OpAmpRealElm.MODEL_TL072;
const NE5532 = OpAmpRealElm.MODEL_NE5532;
const RC4558 = OpAmpRealElm.MODEL_RC4558;
const MACROS = [TL072, NE5532, RC4558];

/** A post position. */
type Point = { x: number; y: number };

const header = (dt: number): string => `$ 1 ${dt} 10.2 50 5 50 5e-11\n`;
const OPAMP = (type: number): string => {
  const spec = OPAMP_MACROS[type];
  return `409 208 224 400 224 0 ${spec.slewRate} 0 ${spec.ilim} ${type}\n`;
};

/** A DC rail at `v` volts whose terminal is at p. */
const rail = (p: Point, v: number): string =>
  `R ${p.x} ${p.y} ${p.x - 32} ${p.y} 0 0 40.0 ${v} 0 0 0.5\n`;
const wire = (a: Point, b: Point): string => `w ${a.x} ${a.y} ${b.x} ${b.y} 0\n`;
const resistor = (a: Point, b: Point, r: number): string =>
  `r ${a.x} ${a.y} ${b.x} ${b.y} 0 ${r}\n`;
const ground = (p: Point): string => `g ${p.x} ${p.y} ${p.x} ${p.y + 32} 0\n`;
const at = (x: number, y: number): Point => ({ x, y });

/** The op-amp's posts: inverting input, non-inverting input, output, V+, V-. */
function postsOf(type: number): Point[] {
  const c = readCircuit(header(5e-6) + OPAMP(type));
  const op = c.elements[0];
  return [0, 1, 2, 3, 4].map((i) => op.getPost(i));
}

/** An op-amp of `type` with ±`supply` rails and the rest of the circuit from `rest`. */
function build(
  type: number,
  dt: number,
  rest: (p: Point[]) => string,
  vpos = 15,
  vneg = -15,
  supplyR = 0,
): { c: Circuit; op: OpAmpRealElm } {
  const p = postsOf(type);
  // with supplyR, each rail feeds its pin through that resistance
  const supply = (q: Point, v: number): string => {
    if (supplyR === 0) return rail(q, v);
    const f = at(q.x, q.y + (v > 0 ? -96 : 96));
    return rail(f, v) + resistor(f, q, supplyR);
  };
  const c = readCircuit(
    header(dt) + OPAMP(type) + supply(p[3], vpos) + supply(p[4], vneg) + rest(p),
  );
  const op = c.elements.find((e) => e instanceof OpAmpRealElm);
  if (op === undefined) throw new Error('no op-amp');
  c.sim.setElements(c.elements);
  return { c, op };
}

function run(c: Circuit, steps: number): void {
  c.sim.step(steps);
  expect(c.sim.stopMessage).toBeNull();
}

const out = (op: OpAmpRealElm): number => op.volts[2];

/** A follower: output to the inverting input, `vin` on the non-inverting input. */
const follower =
  (vin: number) =>
  (p: Point[]): string =>
    rail(p[1], vin) +
    wire(p[2], at(p[2].x, p[0].y - 64)) +
    wire(at(p[2].x, p[0].y - 64), at(p[0].x, p[0].y - 64)) +
    wire(at(p[0].x, p[0].y - 64), p[0]);

/** Non-inverting gain 1 + rf / rg, `vin` on the non-inverting input. */
const nonInverting =
  (vin: number, rf: number, rg: number) =>
  (p: Point[]): string => {
    const top = at(p[0].x, p[0].y - 64);
    const topOut = at(p[2].x, p[0].y - 64);
    const gnd = at(p[0].x - 96, p[0].y);
    return (
      rail(p[1], vin) +
      wire(p[2], topOut) +
      resistor(topOut, top, rf) +
      wire(top, p[0]) +
      resistor(p[0], gnd, rg) +
      ground(gnd)
    );
  };

describe.each(MACROS.map((t) => [OPAMP_MACROS[t].label, t] as const))('%s', (label, type) => {
  const spec = OPAMP_MACROS[type];

  it('follows its input to within the open-loop gain', () => {
    const { c, op } = build(type, 5e-6, follower(1));
    run(c, 400);
    // 1 / (1 + Avol) error, plus the bias current through nothing (the input is a rail)
    expect(out(op)).toBeCloseTo(1 - 1 / (1 + spec.avol), 4);
  });

  it('has its datasheet unity-gain bandwidth: gain 101 settles with tau = 101 / (2 pi GBW)', () => {
    const dt = 1e-8;
    const { c, op } = build(type, dt, nonInverting(0.01, 100e3, 1e3));
    const tau = 101 / (2 * Math.PI * spec.gbw);
    const final = 0.01 * 101;
    // time to 63 % of the final value
    let t = 0;
    while (out(op) < 0.632 * final && t < 20 * tau) {
      run(c, 1);
      t += dt;
    }
    // the closed loop is a single pole; 2 % covers the open-loop gain and the timestep
    expect(t / tau).toBeGreaterThan(0.97);
    expect(t / tau).toBeLessThan(1.05);
  });

  it(`slews at ${spec.slewRate} V/µs`, () => {
    const dt = 1e-9;
    const { c, op } = build(type, dt, follower(10));
    // measure between 2 V and 8 V, well inside the swing
    while (out(op) < 2) run(c, 1);
    let steps = 0;
    while (out(op) < 8) {
      run(c, 1);
      steps++;
    }
    const sr = 6 / (steps * dt) / 1e6;
    expect(sr / spec.slewRate).toBeGreaterThan(0.97);
    expect(sr / spec.slewRate).toBeLessThan(1.03);
  });

  it('clips at the rails minus its headroom, on ±15 V and on a single 9 V supply', () => {
    let b = build(type, 5e-6, nonInverting(1, 100e3, 1e3));
    run(b.c, 400);
    expect(out(b.op)).toBeCloseTo(15 - spec.headroomHigh, 1);
    b = build(type, 5e-6, nonInverting(-1, 100e3, 1e3));
    run(b.c, 400);
    expect(out(b.op)).toBeCloseTo(-15 + spec.headroomLow, 1);
    b = build(type, 5e-6, nonInverting(1, 100e3, 1e3), 9, 0);
    run(b.c, 400);
    expect(out(b.op)).toBeCloseTo(9 - spec.headroomHigh, 1);
  });

  it('comes straight out of clipping', () => {
    // gain 101 driven hard positive, then the input steps to 0
    const { c, op } = build(type, 1e-7, nonInverting(1, 100e3, 1e3));
    run(c, 2000);
    expect(out(op)).toBeGreaterThan(10);
    const inp = postsOf(type)[1];
    const inputRail = c.elements.find(
      (e) => e instanceof RailElm && e.getPost(0).x === inp.x && e.getPost(0).y === inp.y,
    );
    if (!(inputRail instanceof RailElm)) throw new Error('no input rail');
    inputRail.maxVoltage = 0;
    c.sim.analyzeFlag = true;
    // slewing down from the clip level, then seven closed-loop time constants: without the
    // clamp the gain node would have wound up to thousands of volts and take far longer
    const tau = 101 / (2 * Math.PI * spec.gbw);
    run(c, Math.ceil((14 / spec.slewRate / 1e6 + 7 * tau) / 1e-7));
    expect(Math.abs(out(op))).toBeLessThan(0.05);
  });

  it(`draws its ${spec.iq * 1e3} mA supply current from V+ into V-, plus what the load takes`, () => {
    // 1 kΩ in each supply lead: the pins sit lower by the current times 1 kΩ
    let b = build(type, 5e-6, follower(0), 15, -15, 1000);
    run(b.c, 400);
    expect(b.op.volts[3]).toBeCloseTo(15 - spec.iq * 1000, 2);
    expect(b.op.volts[4]).toBeCloseTo(-15 + spec.iq * 1000, 2);
    // sourcing 1 mA into 5 kΩ: V+ carries it, V- doesn't
    b = build(
      type,
      5e-6,
      (p) =>
        follower(5)(p) +
        resistor(p[2], at(p[2].x + 64, p[2].y), 5000) +
        ground(at(p[2].x + 64, p[2].y)),
      15,
      -15,
      1000,
    );
    run(b.c, 400);
    expect(b.op.volts[3]).toBeCloseTo(15 - (spec.iq + 1e-3) * 1000, 2);
    expect(b.op.volts[4]).toBeCloseTo(-15 + spec.iq * 1000, 2);
  });

  it(`limits the output current to ${spec.ilim * 1e3} mA`, () => {
    const { c, op } = build(
      type,
      5e-6,
      (p) =>
        follower(5)(p) +
        resistor(p[2], at(p[2].x + 64, p[2].y), 1) +
        ground(at(p[2].x + 64, p[2].y)),
    );
    run(c, 400);
    expect(Math.abs(op.getCurrentIntoNode(2))).toBeCloseTo(spec.ilim, 3);
  });

  it('runs a hard-clipping 1 kHz gain stage at the default timestep without trouble', () => {
    // gain 101 on ±15 V with a 0.5 V sine: clips every half cycle for 20 ms
    const { c, op } = build(type, 5e-6, (p) =>
      nonInverting(
        0,
        100e3,
        1e3,
      )(p).replace(
        rail(p[1], 0),
        `R ${p[1].x} ${p[1].y} ${p[1].x - 32} ${p[1].y} 0 1 1000 0.5 0 0 0.5\n`,
      ),
    );
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < 4000; i++) {
      run(c, 1);
      lo = Math.min(lo, out(op));
      hi = Math.max(hi, out(op));
    }
    expect(hi).toBeCloseTo(15 - spec.headroomHigh, 1);
    expect(lo).toBeCloseTo(-15 + spec.headroomLow, 1);
  });

  it(`takes ${spec.ib * 1e9} nA of bias current into each input`, () => {
    // a follower whose input sits on 1 MΩ to ground: the output shows -Ib x 1 MΩ
    const { c, op } = build(type, 5e-6, (p) => {
      const g = at(p[1].x - 96, p[1].y);
      return resistor(p[1], g, 1e6) + ground(g) + follower(0)(p).replace(rail(p[1], 0), '');
    });
    run(c, 400);
    expect(out(op)).toBeCloseTo(-spec.ib * 1e6, 4);
  });
});

describe('the op-amp model list', () => {
  it('offers upstream models first, then the behavioural ones, with their datasheet defaults', () => {
    const c = readCircuit(header(5e-6) + '409 208 224 400 224 0 0.6 0 0.0231 0\n');
    const op = c.elements[0] as OpAmpRealElm;
    const ei = op.getEditInfo(0) as EditInfo;
    expect(ei.choice?.items).toEqual(['LM741', 'LM324', 'TL072', 'NE5532', 'RC4558']);
    if (ei.choice === null) throw new Error('no choice');
    ei.choice.selected = 3;
    op.setEditValue(0, ei);
    expect(op.modelType).toBe(NE5532);
    expect(op.slewRate).toBe(9);
    expect(op.currentLimit).toBe(0.038);
    const back = op.getEditInfo(0) as EditInfo;
    if (back.choice === null) throw new Error('no choice');
    back.choice.selected = 0;
    op.setEditValue(0, back);
    expect(op.modelType).toBe(OpAmpRealElm.MODEL_741);
    expect(op.slewRate).toBe(0.6);
  });

  it('saves the model number and reads it back', () => {
    const c = readCircuit(header(5e-6) + OPAMP(RC4558));
    const xml = c.dumpXml();
    expect(xml).toContain('mt="5"');
    const back = readCircuit(xml).elements[0] as OpAmpRealElm;
    expect(back.modelType).toBe(RC4558);
    expect(back.slewRate).toBe(1);
  });
});
