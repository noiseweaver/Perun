// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// The behavioural op-amps (packages/elements/src/elm/opAmpMacro.ts, models/OpAmpModel.ts)
// against their datasheet figures: gain, bandwidth, slew rate, clipping, bias and supply current;
// and custom op-amp models: editing, saving, the kept library, and what CircuitJS1 reads.

import {
  type EditInfo,
  type ModelEditRequest,
  OPAMP_PARTS,
  type OpAmpModel,
  OpAmpModels,
  type OpAmpPart,
  OpAmpRealElm,
  RailElm,
  modelEditor,
  modelsFor,
} from '@perun/elements';
import { describe, expect, it } from 'vitest';
import { readCircuit, type Circuit } from './circuit.ts';

/** A post position. */
type Point = { x: number; y: number };

const header = (dt: number): string => `$ 1 ${dt} 10.2 50 5 50 5e-11\n`;
/** An LM741; build() then picks the model. */
const OPAMP = '409 208 224 400 224 0 0.6 0 0.0231 0\n';

/** Pick `name` in the op-amp's model list, the way the property panel does. */
function pick(op: OpAmpRealElm, name: string): void {
  const ei = op.getEditInfo(0) as EditInfo;
  if (ei.choice === null) throw new Error('no choice');
  const i = ei.choice.items.findIndex((s) => s === name || s.startsWith(name + ' ('));
  if (i < 0) throw new Error(`no model ${name}`);
  ei.choice.selected = i;
  op.setEditValue(0, ei);
}

/** A DC rail at `v` volts whose terminal is at p. */
const rail = (p: Point, v: number): string =>
  `R ${p.x} ${p.y} ${p.x - 32} ${p.y} 0 0 40.0 ${v} 0 0 0.5\n`;
const wire = (a: Point, b: Point): string => `w ${a.x} ${a.y} ${b.x} ${b.y} 0\n`;
const resistor = (a: Point, b: Point, r: number): string =>
  `r ${a.x} ${a.y} ${b.x} ${b.y} 0 ${r}\n`;
const ground = (p: Point): string => `g ${p.x} ${p.y} ${p.x} ${p.y + 32} 0\n`;
const at = (x: number, y: number): Point => ({ x, y });

/** The op-amp's posts: inverting input, non-inverting input, output, V+, V-. */
function postsOf(): Point[] {
  const c = readCircuit(header(5e-6) + OPAMP);
  const op = c.elements[0];
  return [0, 1, 2, 3, 4].map((i) => op.getPost(i));
}

/** An op-amp using model `type` with ±`supply` rails and the rest of the circuit from `rest`. */
function build(
  type: string,
  dt: number,
  rest: (p: Point[]) => string,
  vpos = 15,
  vneg = -15,
  supplyR = 0,
): { c: Circuit; op: OpAmpRealElm } {
  const p = postsOf();
  // with supplyR, each rail feeds its pin through that resistance
  const supply = (q: Point, v: number): string => {
    if (supplyR === 0) return rail(q, v);
    const f = at(q.x, q.y + (v > 0 ? -96 : 96));
    return rail(f, v) + resistor(f, q, supplyR);
  };
  const c = readCircuit(header(dt) + OPAMP + supply(p[3], vpos) + supply(p[4], vneg) + rest(p));
  const op = c.elements.find((e) => e instanceof OpAmpRealElm);
  if (op === undefined) throw new Error('no op-amp');
  pick(op, type);
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

/** Slew rate (V/µs) of a follower stepped to 10 V, measured between 2 V and 8 V. */
function slewOf(c: Circuit, op: OpAmpRealElm, dt: number): number {
  while (out(op) < 2) run(c, 1);
  let steps = 0;
  while (out(op) < 8) {
    run(c, 1);
    steps++;
  }
  return 6 / (steps * dt) / 1e6;
}

describe.each(OPAMP_PARTS.map((p) => [p.name, p] as const))('%s', (type, spec: OpAmpPart) => {
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
    const dt = spec.slewRate < 1 ? 1e-8 : 1e-9;
    const { c, op } = build(type, dt, follower(10));
    // measure between 2 V and 8 V, well inside the swing
    const sr = slewOf(c, op, dt);
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
    const inp = postsOf()[1];
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

  it(`draws its ${String(spec.iq * 1e3)} mA supply current from V+ into V-, plus what the load takes`, () => {
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

  it(`limits the output current to ${String(spec.ilim * 1e3)} mA`, () => {
    const { c, op } = build(
      type,
      5e-6,
      (p) =>
        follower(5)(p) +
        resistor(p[2], at(p[2].x + 64, p[2].y), 1) +
        ground(at(p[2].x + 64, p[2].y)),
    );
    run(c, 400);
    // within 3 %: the soft limit lets a little more through with a low output resistance
    expect(Math.abs(op.getCurrentIntoNode(2)) / spec.ilim).toBeGreaterThan(0.98);
    expect(Math.abs(op.getCurrentIntoNode(2)) / spec.ilim).toBeLessThan(1.03);
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

  it(`takes ${String(spec.ib * 1e9)} nA of bias current into each input`, () => {
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
  it('offers upstream models first, then the datasheet ones by name, with their figures', () => {
    const c = readCircuit(header(5e-6) + OPAMP);
    const op = c.elements[0] as OpAmpRealElm;
    const ei = op.getEditInfo(0) as EditInfo;
    expect(ei.choice?.items.map((s) => s.split(' (')[0])).toEqual([
      'LM741',
      'LM324',
      'LM358',
      'LM833',
      'NE5532',
      'OPA2134',
      'RC4558',
      'TL072',
      'TL082',
    ]);
    pick(op, 'NE5532');
    expect(op.model?.name).toBe('NE5532');
    expect(op.model?.slewRate).toBe(9);
    // a datasheet model offers a copy to edit, not editing itself
    expect(op.getEditInfo(2)?.button?.label).toBe('Create New Model');
    expect(op.getEditInfo(3)).toBeNull();
    pick(op, 'LM741');
    expect(op.model).toBeNull();
    expect(op.modelType).toBe(OpAmpRealElm.MODEL_741);
    expect(op.slewRate).toBe(0.6);
  });

  it('saves a datasheet model by name, as an LM741 with its slew rate for CircuitJS1', () => {
    const c = readCircuit(header(5e-6) + OPAMP);
    pick(c.elements[0] as OpAmpRealElm, 'RC4558');
    const xml = c.dumpXml();
    expect(xml).toMatch(/<OpAmpReal [^>]*slr="1" cl="0.025" mt="0" om="RC4558"/);
    // a built-in model needs no record
    expect(xml).not.toContain('<om ');
    const back = readCircuit(xml).elements[0] as OpAmpRealElm;
    expect(back.model?.name).toBe('RC4558');
  });

  it('reads the model numbers of the first preview build', () => {
    const c = readCircuit(header(5e-6) + '409 208 224 400 224 0 13 0 0.026 3\n');
    expect((c.elements[0] as OpAmpRealElm).model?.name).toBe('TL072');
    const x = readCircuit(c.dumpXml().replace('mt="0" om="TL072"', 'mt="4"'));
    expect((x.elements[0] as OpAmpRealElm).model?.name).toBe('NE5532');
  });
});

/** Press a button of the op-amp's property panel and return the model dialog it opens. */
function pressButton(op: OpAmpRealElm, label: string): ModelEditRequest {
  let req: ModelEditRequest | null = null;
  modelEditor.open = (r) => (req = r);
  for (let n = 0; n < 10; n++) {
    const b = op.getEditInfo(n)?.button;
    if (b?.label === label) b.onClick();
  }
  modelEditor.open = null;
  if (req === null) throw new Error(`no ${label}`);
  return req;
}

/** Type values into the model dialog (field number to value) and press OK. */
function fillDialog(req: ModelEditRequest, values: Record<number, number | string>): void {
  for (const [k, v] of Object.entries(values)) {
    const n = Number(k);
    const ei = req.target.getEditInfo(n) as EditInfo;
    if (typeof v === 'string') ei.text = v;
    else ei.value = v;
    req.target.setEditValue(n, ei);
  }
  req.onApply?.();
}

describe('custom op-amp models', () => {
  it('Create New Model copies the model; the op-amp then runs with the edited figures', () => {
    const { c, op } = build('TL072', 1e-9, follower(10));
    const req = pressButton(op, 'Create New Model');
    // name, slew rate
    fillDialog(req, { 0: 'my-fast-072', 2: 26 });
    expect(op.model?.name).toBe('my-fast-072');
    expect(op.model?.gbw).toBe(3e6);
    c.sim.analyzeFlag = true;
    expect(slewOf(c, op, 1e-9) / 26).toBeCloseTo(1, 1);
    // the datasheet model is untouched
    expect(modelsFor(c.sim).opamp.getModelWithName('TL072').slewRate).toBe(13);
    expect(op.getEditInfo(3)?.button?.label).toBe('Edit Model');
  });

  it('Edit Model changes every op-amp using the model', () => {
    const { c, op } = build('TL072', 1e-9, follower(10));
    fillDialog(pressButton(op, 'Create New Model'), { 0: 'slow' });
    fillDialog(pressButton(op, 'Edit Model'), { 2: 2 });
    // the app rebuilds the op-amps after a model edit (CirSim.updateModels)
    op.updateModels();
    c.sim.analyzeFlag = true;
    expect(slewOf(c, op, 1e-9) / 2).toBeCloseTo(1, 1);
  });

  it('a model left unnamed, or named like a datasheet model, gets a free name', () => {
    const c = readCircuit(header(5e-6) + OPAMP + OPAMP.replace('208 224 400', '208 324 400'));
    const [a, b] = c.elements as OpAmpRealElm[];
    fillDialog(pressButton(a, 'Create New Model'), { 0: '' });
    expect(a.model?.name).toBe('opampmodel');
    fillDialog(pressButton(b, 'Create New Model'), { 0: 'TL072' });
    expect(b.model?.name).toBe('TL072-2');
    expect(modelsFor(c.sim).opamp.getModelWithName('TL072').builtIn).toBe(true);
  });

  it('saves a custom model in the circuit, ahead of the op-amp, and reads it back', () => {
    const c = readCircuit(header(5e-6) + OPAMP);
    const op = c.elements[0] as OpAmpRealElm;
    fillDialog(pressButton(op, 'Create New Model'), {
      0: 'my 4558',
      1: 4e6,
      2: 1.5,
      3: 150e3,
      4: 6e6,
      5: 30e-9,
      6: 2e-3,
      7: 20e-3,
      8: 60,
      9: 0.9,
      10: 1.1,
    });
    const xml = c.dumpXml();
    expect(xml).toContain(
      '<om nm="my 4558" gbw="4000000" sr="1.5" av="150000" rin="6000000" ib="3e-8" iq="0.002" ' +
        'il="0.02" ro="60" hh="0.9" hl="1.1"/>',
    );
    expect(xml.indexOf('<om ')).toBeLessThan(xml.indexOf('<OpAmpReal '));
    expect(xml).toMatch(/<OpAmpReal [^>]*slr="1.5" cl="0.02" mt="0" om="my 4558"/);
    const back = readCircuit(xml);
    const m = (back.elements[0] as OpAmpRealElm).model as OpAmpModel;
    expect(m.name).toBe('my 4558');
    expect([m.gbw, m.slewRate, m.avol, m.rin, m.ib, m.iq, m.ilim, m.rout]).toEqual([
      4e6, 1.5, 150e3, 6e6, 30e-9, 2e-3, 20e-3, 60,
    ]);
    expect([m.headroomHigh, m.headroomLow, m.readOnly]).toEqual([0.9, 1.1, false]);
  });

  it('a circuit cannot change a datasheet model', () => {
    const c = readCircuit(
      '<cir f="1" ts="0.000005" ic="10.2" cb="50" pb="50" vr="5" mts="5e-11">\n' +
        '  <om nm="TL072" gbw="1" sr="1"/>\n' +
        '  <OpAmpReal x="208 224 400 224" f="0" slr="13" cl="0.026" mt="0" om="TL072"/>\n' +
        '</cir>',
    );
    expect((c.elements[0] as OpAmpRealElm).model?.slewRate).toBe(13);
  });
});

describe('kept op-amp models (My Models)', () => {
  /** Browser storage, in memory. */
  function memoryStorage(): NonNullable<OpAmpModels['storage']> {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    };
  }

  it('a kept model is in every later library, under its new name after a rename', () => {
    const storage = memoryStorage();
    const lib = new OpAmpModels();
    lib.storage = storage;
    const m = lib.createCopy(lib.getModelWithName('NE5532'));
    expect(m.name).toBe('NE5532 copy');
    lib.rename(m, 'warm 5532');
    expect(m.getEditInfo(11)?.checkbox?.state).toBe(false);
    const keep = m.getEditInfo(11) as EditInfo;
    if (keep.checkbox === null) throw new Error('no checkbox');
    keep.checkbox.state = true;
    m.setEditValue(11, keep);
    const slew = m.getEditInfo(2) as EditInfo;
    slew.value = 4;
    m.setEditValue(2, slew);
    const name = m.getEditInfo(0) as EditInfo;
    name.text = 'warmer 5532';
    m.setEditValue(0, name);

    const later = new OpAmpModels();
    later.storage = storage;
    later.loadModelsFromStorage();
    expect(later.modelMap.has('warm 5532')).toBe(false);
    const k = later.getModelWithName('warmer 5532');
    expect(k.slewRate).toBe(4);
    expect(k.gbw).toBe(10e6);
    expect(k.isSaved()).toBe(true);
  });

  it('datasheet models offer no keep checkbox and are never stored', () => {
    const lib = new OpAmpModels();
    const storage = memoryStorage();
    lib.storage = storage;
    const tl = lib.getModelWithName('TL072');
    lib.setSaved(tl, true);
    expect(storage.length).toBe(0);
    expect(new OpAmpModels().getModelWithName('LM358').getEditInfo(11)).toBeNull();
  });
});
