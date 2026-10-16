// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// The named audio parts (packages/elements/src/models/audioParts.ts) against datasheet figures,
// and the promise that a circuit using one still opens with the same numbers in CircuitJS1.

import {
  type CircuitElm,
  DiodeElm,
  type EditInfo,
  JfetElm,
  MosfetElm,
  TransistorElm,
  modelsFor,
} from '@perun/elements';
import { describe, expect, it } from 'vitest';
import { readCircuit, type Circuit } from './circuit.ts';

const HEADER = '$ 1 0.000005 10.2 50 5 50 5e-11\n';

/** Pick `name` in the element's model list, the way the property panel does. */
function pickModel(elm: CircuitElm, name: string): void {
  for (let n = 0; n < 10; n++) {
    const ei: EditInfo | null = elm.getEditInfo(n);
    const choice = ei?.choice;
    if (ei === null || choice === undefined || choice === null) continue;
    const i = choice.items.findIndex((s) => s === name || s.startsWith(name + ' ('));
    if (i < 0) continue;
    choice.selected = i;
    elm.setEditValue(n, ei);
    return;
  }
  throw new Error(`no model ${name}`);
}

function find<T>(c: Circuit, cls: abstract new (...a: never[]) => T): T {
  const e = c.elements.find((x) => x instanceof cls);
  if (e === undefined) throw new Error('missing element');
  return e as T;
}

function run(c: Circuit, steps = 20): void {
  c.sim.setElements(c.elements);
  c.sim.step(steps);
  expect(c.sim.stopMessage).toBeNull();
}

/** A rail at `v` volts whose terminal is at (x, y). */
const rail = (x: number, y: number, v: number): string =>
  `R ${x} ${y} ${x} ${y - 48} 0 0 40.0 ${v} 0 0 0.5\n`;

/** Forward voltage of a diode model at `amps`, driven by an ideal current source. */
function diodeDrop(model: string, amps: number): number {
  const c = readCircuit(
    HEADER +
      `R 96 96 96 48 0 0 40.0 1000 0 0 0.5\n` +
      `r 96 96 240 96 0 ${1000 / amps}\n` +
      'd 240 96 240 240 2 default\n' +
      'g 240 240 240 288 0\n',
  );
  const d = find(c, DiodeElm);
  pickModel(d, model);
  run(c);
  return d.volts[0] - d.volts[1];
}

/**
 * Ic, Ib and VBE of a transistor part with VCE = 5 V (sign flipped for PNP) and base current
 * about ib, or the base open for ib = 0. Runs 20 ms so the junction capacitances settle.
 */
function bjtPoint(
  model: string,
  ib: number,
  vce = 5,
): { ic: number; ib: number; vbe: number; elm: TransistorElm } {
  const probe = readCircuit(HEADER + 't 208 224 256 224 0 1 0 0 100 default\n');
  const t0 = find(probe, TransistorElm);
  pickModel(t0, model);
  const pn = t0.pnp;
  const col = t0.getPost(1);
  const emi = t0.getPost(2);
  const vb = 100 * pn;
  const c = readCircuit(
    HEADER +
      `t 208 224 256 224 0 ${pn} 0 0 100 ${model}\n` +
      (ib > 0 ? `r 208 224 112 224 0 ${(100 - 0.6) / ib}\n` + rail(112, 224, vb) : '') +
      `w ${col.x} ${col.y} 400 ${col.y} 0\n` +
      rail(400, col.y, vce * pn) +
      `w ${emi.x} ${emi.y} 320 ${emi.y} 0\n` +
      `g 320 ${emi.y} 320 ${emi.y + 48} 0\n`,
  );
  const t = find(c, TransistorElm);
  pickModel(t, model);
  run(c, 4000);
  return { ic: t.ic * pn, ib: t.ib * pn, vbe: (t.volts[0] - t.volts[2]) * pn, elm: t };
}

/** Collector current at a target `ic`, found by adjusting the base current. */
function bjtAt(model: string, ic: number, vce = 5): { hfe: number; vbe: number } {
  let ib = ic / 200;
  let p = bjtPoint(model, ib, vce);
  for (let i = 0; i < 6; i++) {
    ib *= ic / p.ic;
    p = bjtPoint(model, ib, vce);
  }
  expect(p.ic).toBeCloseTo(ic, 6);
  return { hfe: p.ic / p.ib, vbe: p.vbe };
}

/** Drain current of a JFET part at VGS and VDS (signs flipped for P-channel), and gate current. */
function jfetPoint(model: string, vgs: number, vds: number): { id: number; ig: number } {
  const probe = readCircuit(HEADER + 'j 208 224 256 224 0 -4 0.00125\n');
  const j0 = find(probe, JfetElm);
  pickModel(j0, model);
  const pn = j0.pnp;
  const src = j0.getPost(1);
  const drn = j0.getPost(2);
  const c = readCircuit(
    HEADER +
      `j 208 224 256 224 ${pn === -1 ? 1 : 0} -4 0.00125\n` +
      rail(208, 224, vgs * pn) +
      `w ${drn.x} ${drn.y} 400 ${drn.y} 0\n` +
      rail(400, drn.y, vds * pn) +
      `w ${src.x} ${src.y} 320 ${src.y} 0\n` +
      `g 320 ${src.y} 320 ${src.y + 48} 0\n`,
  );
  const j = find(c, JfetElm);
  pickModel(j, model);
  expect(j.pnp).toBe(pn);
  run(c);
  return { id: Math.abs(j.getCurrentIntoNode(2)), ig: Math.abs(j.getCurrentIntoNode(0)) };
}

describe('audio diodes', () => {
  it('1N914 matches the 1N4148 (same die): 0.62 V at 1 mA, at most 1 V at 10 mA', () => {
    expect(diodeDrop('1N914', 1e-3)).toBeCloseTo(diodeDrop('1N4148', 1e-3), 9);
    expect(diodeDrop('1N914', 10e-3)).toBeLessThan(1);
  });

  it('1N34A germanium: 0.17 V at 0.1 mA, 0.27 V at 1 mA, 0.5 V at 10 mA (fitted)', () => {
    expect(diodeDrop('1N34A', 1e-4)).toBeCloseTo(0.17, 2);
    expect(diodeDrop('1N34A', 1e-3)).toBeCloseTo(0.27, 2);
    expect(diodeDrop('1N34A', 10e-3)).toBeCloseTo(0.5, 2);
    expect(diodeDrop('1N34A', 5e-3)).toBeLessThan(1);
  });

  it('1N4001: 0.57 V at 1 mA, at most 1.1 V at 1 A (fitted)', () => {
    expect(diodeDrop('1N4001', 1e-3)).toBeCloseTo(0.57, 2);
    expect(diodeDrop('1N4001', 1)).toBeGreaterThan(0.85);
    expect(diodeDrop('1N4001', 1)).toBeLessThan(1.1);
  });

  it('Schottky diodes: 1N5817 at most 0.45 V at 1 A, BAT41 at most 0.45 V at 1 mA', () => {
    expect(diodeDrop('1N5817', 1e-3)).toBeCloseTo(0.18, 2);
    expect(diodeDrop('1N5817', 1)).toBeCloseTo(0.4, 2);
    expect(diodeDrop('1N5817', 1)).toBeLessThan(0.45);
    expect(diodeDrop('BAT41', 1e-3)).toBeCloseTo(0.32, 2);
    expect(diodeDrop('BAT41', 1e-3)).toBeLessThan(0.45);
    expect(diodeDrop('BAT41', 0.2)).toBeLessThan(1);
  });

  it('OA91 germanium: about 0.3 V at 1 mA, below a silicon diode at 10 mA (fitted)', () => {
    expect(diodeDrop('OA91', 1e-3)).toBeCloseTo(0.32, 1);
    expect(diodeDrop('OA91', 10e-3)).toBeLessThan(diodeDrop('1N914', 10e-3));
  });

  it('LEDs clip at their colour forward voltages', () => {
    expect(diodeDrop('led-red', 1e-3)).toBeCloseTo(1.65, 2);
    expect(diodeDrop('led-red', 20e-3)).toBeCloseTo(1.95, 2);
    expect(diodeDrop('led-green', 1e-3)).toBeCloseTo(1.85, 2);
    expect(diodeDrop('led-green', 20e-3)).toBeCloseTo(2.15, 2);
    expect(diodeDrop('led-blue', 1e-3)).toBeCloseTo(2.6, 2);
    expect(diodeDrop('led-blue', 20e-3)).toBeCloseTo(3.1, 2);
    expect(diodeDrop('led-yellow', 1e-3)).toBeCloseTo(1.8, 2);
    expect(diodeDrop('led-yellow', 20e-3)).toBeCloseTo(2.05, 2);
    expect(diodeDrop('led-white', 1e-3)).toBeCloseTo(2.65, 2);
    expect(diodeDrop('led-white', 20e-3)).toBeCloseTo(3.2, 2);
  });
});

describe('audio transistors (hFE ranges from the datasheets)', () => {
  it('2N3904: hFE 100 to 300 at 10 mA, VBE 0.6 to 0.75 V at 1 mA', () => {
    const p = bjtAt('2N3904', 10e-3, 1);
    expect(p.hfe).toBeGreaterThan(100);
    expect(p.hfe).toBeLessThan(300);
    const q = bjtAt('2N3904', 1e-3, 5);
    expect(q.vbe).toBeGreaterThan(0.6);
    expect(q.vbe).toBeLessThan(0.75);
  });

  it('2N3906 is a PNP with hFE 100 to 300 at 10 mA', () => {
    const p = bjtAt('2N3906', 10e-3, 1);
    expect(p.hfe).toBeGreaterThan(100);
    expect(p.hfe).toBeLessThan(300);
    expect(p.vbe).toBeGreaterThan(0.6);
  });

  it('2N2222A: hFE 100 to 300 at 10 mA', () => {
    const p = bjtAt('2N2222A', 10e-3, 10);
    expect(p.hfe).toBeGreaterThan(100);
    expect(p.hfe).toBeLessThan(300);
  });

  it('2N5088: hFE at least 350 at 1 mA', () => {
    const p = bjtAt('2N5088', 1e-3, 5);
    expect(p.hfe).toBeGreaterThan(350);
    expect(p.hfe).toBeLessThan(1400);
  });

  it('BC547B: hFE 200 to 450 at 2 mA', () => {
    const p = bjtAt('BC547B', 2e-3, 5);
    expect(p.hfe).toBeGreaterThan(200);
    expect(p.hfe).toBeLessThan(450);
  });

  it('AC128 germanium: hFE 55 to 175, low VBE, fuzz-range leakage', () => {
    const p = bjtAt('AC128', 1e-3, 5);
    expect(p.hfe).toBeGreaterThan(55);
    expect(p.hfe).toBeLessThan(175);
    expect(p.vbe).toBeGreaterThan(0.15);
    expect(p.vbe).toBeLessThan(0.3);
    // ICEO: collector current with the base open
    const leak = bjtPoint('AC128', 0, 5).ic;
    expect(leak).toBeGreaterThan(100e-6);
    expect(leak).toBeLessThan(250e-6);
  });

  it('BC549C: hFE 420 to 800 at 2 mA', () => {
    const p = bjtAt('BC549C', 2e-3, 5);
    expect(p.hfe).toBeGreaterThan(420);
    expect(p.hfe).toBeLessThan(800);
  });

  it('BC557B is a PNP with hFE 220 to 475 at 2 mA', () => {
    const p = bjtAt('BC557B', 2e-3, 5);
    expect(p.hfe).toBeGreaterThan(220);
    expect(p.hfe).toBeLessThan(475);
  });

  it('2N5089: hFE 450 to 1800 at 1 mA, above the 2N5088', () => {
    const p = bjtAt('2N5089', 1e-3, 5);
    expect(p.hfe).toBeGreaterThan(450);
    expect(p.hfe).toBeLessThan(1800);
    expect(p.hfe).toBeGreaterThan(bjtAt('2N5088', 1e-3, 5).hfe);
  });

  it('MPSA18: hFE 500 to 1500 at 1 mA', () => {
    const p = bjtAt('MPSA18', 1e-3, 5);
    expect(p.hfe).toBeGreaterThan(500);
    expect(p.hfe).toBeLessThan(1500);
  });

  it('NKT275 and OC44 germanium: Fuzz Face and Rangemaster gain and leakage', () => {
    const nkt = bjtAt('NKT275', 1e-3, 5);
    expect(nkt.hfe).toBeGreaterThan(65);
    expect(nkt.hfe).toBeLessThan(110);
    expect(nkt.vbe).toBeLessThan(0.3);
    const nktLeak = bjtPoint('NKT275', 0, 5).ic;
    expect(nktLeak).toBeGreaterThan(100e-6);
    expect(nktLeak).toBeLessThan(250e-6);
    const oc = bjtAt('OC44', 1e-3, 5);
    expect(oc.hfe).toBeGreaterThan(60);
    expect(oc.hfe).toBeLessThan(110);
    expect(oc.vbe).toBeLessThan(0.3);
    const ocLeak = bjtPoint('OC44', 0, 5).ic;
    expect(ocLeak).toBeGreaterThan(40e-6);
    expect(ocLeak).toBeLessThan(150e-6);
  });

  it('picking a part sets the transistor beta and polarity', () => {
    const c = readCircuit(HEADER + 't 208 224 256 224 0 1 0 0 100 default\n');
    const t = find(c, TransistorElm);
    pickModel(t, '2N3906');
    expect(t.pnp).toBe(-1);
    expect(t.beta).toBe(180.7);
    pickModel(t, '2N5088');
    expect(t.pnp).toBe(1);
    expect(t.beta).toBe(1122);
  });
});

describe('audio JFETs (IDSS and VGS(off) ranges from the datasheets)', () => {
  const cases: [string, number, number, number][] = [
    // name, IDSS min and max (A), IGSS max (A)
    ['2N3819', 2e-3, 20e-3, 2e-9],
    ['2N5457', 1e-3, 5e-3, 1e-9],
    ['J201', 0.2e-3, 1e-3, 100e-12],
    ['2N5460', 1e-3, 5e-3, 5e-9],
    ['2N5458', 2e-3, 9e-3, 1e-9],
    ['MPF102', 2e-3, 20e-3, 2e-9],
    ['J113', 2e-3, 20e-3, 1e-9],
    ['2SK30A', 2.6e-3, 6.5e-3, 1e-9],
  ];
  for (const [name, lo, hi, igss] of cases) {
    it(`${name}: IDSS within ${lo * 1e3} to ${hi * 1e3} mA, cut off at VTO, gate leakage under ${igss} A`, () => {
      const idss = jfetPoint(name, 0, 10).id;
      expect(idss).toBeGreaterThan(lo);
      expect(idss).toBeLessThan(hi);
      const vto = modelsFor(readCircuit(HEADER).sim).mosfet.getModelWithName(name).threshold;
      // below VTO only upstream's 100 MΩ drain-source leak is left
      expect(jfetPoint(name, vto - 0.05, 10).id).toBeLessThan(0.2e-6);
      expect(jfetPoint(name, -10, 0).ig).toBeLessThan(igss);
    });
  }

  it('2N5460 is P-channel; picking it flips the JFET', () => {
    const c = readCircuit(HEADER + 'j 208 224 256 224 0 -4 0.00125\n');
    const j = find(c, JfetElm);
    pickModel(j, '2N5460');
    expect(j.pnp).toBe(-1);
  });
});

/** Drain current of a MOSFET part at VGS and VDS. */
function mosfetId(model: string, vgs: number, vds: number): number {
  const probe = readCircuit(HEADER + 'f 208 224 256 224 32 1.5 0.02\n');
  const m0 = find(probe, MosfetElm);
  const src = m0.getPost(1);
  const drn = m0.getPost(2);
  const c = readCircuit(
    HEADER +
      'f 208 224 256 224 32 1.5 0.02\n' +
      rail(208, 224, vgs) +
      `w ${drn.x} ${drn.y} 400 ${drn.y} 0\n` +
      rail(400, drn.y, vds) +
      `w ${src.x} ${src.y} 320 ${src.y} 0\n` +
      `g 320 ${src.y} 320 ${src.y + 48} 0\n`,
  );
  const m = find(c, MosfetElm);
  pickModel(m, model);
  run(c);
  return Math.abs(m.getCurrentIntoNode(2));
}

describe('audio MOSFETs', () => {
  for (const name of ['2N7000', 'BS170']) {
    it(`${name}: VGS(th) 0.8 to 3 V, RDS(on) under 5 ohms at VGS 10 V`, () => {
      // VGS(th) is where 1 mA flows at VDS = VGS (datasheet test condition is 1 mA)
      let lo = 0.8;
      let hi = 3;
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (mosfetId(name, mid, mid) > 1e-3) hi = mid;
        else lo = mid;
      }
      expect(lo).toBeGreaterThan(0.8);
      expect(hi).toBeLessThan(3);
      const rdson = 0.1 / mosfetId(name, 10, 0.1);
      expect(rdson).toBeGreaterThan(0.5);
      expect(rdson).toBeLessThan(5);
    });
  }
});

describe('saving a circuit that uses a named part', () => {
  it('writes the part as a model record, so CircuitJS1 opens it with the same numbers', () => {
    const c = readCircuit(HEADER + 't 208 224 256 224 0 1 0 0 100 default\n');
    pickModel(find(c, TransistorElm), '2N3904');
    const xml = c.dumpXml();
    expect(xml).toContain('<tm nm="2N3904"');
    expect(xml).toContain('is="6.734e-15"');
    const back = readCircuit(xml);
    expect(find(back, TransistorElm).getModel().satCur).toBe(6.734e-15);
  });

  it('keeps the JFET gate current in an extra attribute', () => {
    const c = readCircuit(HEADER + 'j 208 224 256 224 0 -4 0.00125\n');
    pickModel(find(c, JfetElm), '2N3819');
    const xml = c.dumpXml();
    expect(xml).toMatch(/<mm nm="2N3819"[^>]* gis="3.357e-14"/);
  });

  it("doesn't save upstream's own models", () => {
    const c = readCircuit(HEADER + 't 208 224 256 224 0 1 0 0 100 default\n');
    expect(c.dumpXml()).not.toContain('<tm ');
  });
});
