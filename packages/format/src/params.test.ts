// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Subcircuit parameters (PLAN.md Phase 16) and circuit temperature (Phase 15): what they do to
// the simulation, and that files without them save exactly as before.

import {
  constructElement,
  CustomCompositeElm,
  DiodeElm,
  layoutNewModel,
  modelsFor,
  ResistorElm,
  type CustomCompositeModel,
} from '@circuitjs-next/elements';
import { describe, expect, it } from 'vitest';
import { Circuit, getCircuitAsComposite, readCircuit } from './circuit.ts';

/** A divider between labels "top" and "bot", tapped by "mid"; the lower resistor is RB. */
const DIVIDER =
  '$ 1 0.000005 10.2 50 5 50 5e-11\n' +
  '207 96 96 48 96 4 top\n' +
  'r 96 96 96 192 0 1000\n' +
  'r 96 192 96 320 0 1000\n' +
  '207 96 320 48 320 4 bot\n' +
  'w 96 192 192 192 0\n' +
  '207 192 192 240 192 4 mid\n';

function makeModel(): CustomCompositeModel {
  const c = readCircuit(DIVIDER);
  c.params = [{ name: 'RB', value: 1000 }];
  const lower = c.elements.filter((e) => e instanceof ResistorElm)[1] as ResistorElm;
  lower.paramExprs = new Map([[0, 'RB']]);
  const r = getCircuitAsComposite(c);
  if (!('model' in r)) throw new Error(`no model: ${r.error}`);
  expect(layoutNewModel(r.model)).toBeNull();
  r.model.name = 'div';
  return r.model;
}

/** Two copies of the divider, the second with RB = 3k, each across 10 V; their mid voltages. */
function runTwoCopies(): { xml: string; mids: () => number[] } {
  const model = makeModel();
  const c = new Circuit();
  modelsFor(c.sim).composite.localModelMap.set('div', model);
  const copies = [160, 480].map((x, i) => {
    const cc = constructElement('CustomCompositeElm', x, 160, c.sim) as CustomCompositeElm;
    cc.initWithModel('div');
    if (i === 1) {
      // the parameter is the item after the others, as the property panel shows it
      let n = 0;
      while (cc.getEditInfo(n)?.name !== 'RB') n++;
      const ei = cc.getEditInfo(n);
      if (ei === null) throw new Error('no RB item');
      ei.value = 3000;
      cc.setEditValue(n, ei);
    }
    cc.setPoints();
    return cc;
  });
  c.elements = copies;
  const xml = c.dumpXml();
  const run = readCircuit(xml);
  let src = '';
  for (const cc of copies) {
    const post = (name: string) => cc.getPost(model.extList.findIndex((e) => e.name === name));
    const top = post('top');
    const bot = post('bot');
    src +=
      `v ${bot.x} ${bot.y + 64} ${top.x} ${top.y - 64} 0 0 40 10 0 0 0.5\n` +
      `w ${top.x} ${top.y - 64} ${top.x} ${top.y} 0\n` +
      `w ${bot.x} ${bot.y + 64} ${bot.x} ${bot.y} 0\n` +
      `g ${bot.x} ${bot.y + 64} ${bot.x} ${bot.y + 96} 0\n`;
  }
  run.readRetain(src);
  run.sim.setElements(run.elements);
  run.sim.step(10);
  const mids = () =>
    run.elements
      .filter((e): e is CustomCompositeElm => e instanceof CustomCompositeElm)
      .map((sub) => {
        const mid = sub.getNode(model.extList.findIndex((e) => e.name === 'mid')).index;
        return run.sim.nodeVoltages()[mid];
      });
  return { xml, mids };
}

describe('subcircuit parameters', () => {
  it('gives each copy its own values', () => {
    const { mids } = runTwoCopies();
    const [a, b] = mids();
    expect(a).toBeCloseTo(5, 6); // 10 V * 1k / 2k
    expect(b).toBeCloseTo(7.5, 6); // 10 V * 3k / 4k
  });

  it('saves the list, the binding and the copy value as extra attributes', () => {
    const { xml } = runTwoCopies();
    expect(xml).toContain('prm="RB=1000"');
    expect(xml).toContain('px="0=RB"');
    expect(xml.match(/pv="/g)).toHaveLength(1);
    expect(xml).toContain('pv="RB=3000"');
    // the bound resistor keeps its default value for upstream
    expect(xml).toMatch(/<r nn="[^"]*" x="[^"]*" f="0" px="0=RB" r="1000"/);
  });

  it('reads them back', () => {
    const { xml } = runTwoCopies();
    const again = readCircuit(xml);
    expect(again.dumpXml()).toBe(xml);
  });

  it('lets a nested copy take its values from the outer model', () => {
    const inner = makeModel();
    const c = new Circuit();
    modelsFor(c.sim).composite.localModelMap.set('div', inner);
    const cc = constructElement('CustomCompositeElm', 160, 160, c.sim) as CustomCompositeElm;
    cc.initWithModel('div');
    cc.setPoints();
    let n = 0;
    while (cc.getEditInfo(n)?.name !== 'RB') n++;
    cc.paramExprs = new Map([[n, 'RO*2']]);
    c.elements = [cc];
    // pins of the outer model: labels on the copy's posts
    c.readRetain(
      inner.extList
        .map((e, i) => {
          const p = cc.getPost(i);
          return `207 ${p.x} ${p.y} ${p.x - 32} ${p.y} 4 ${e.name}\n`;
        })
        .join(''),
    );
    c.params = [{ name: 'RO', value: 1500 }];
    const r = getCircuitAsComposite(c);
    if (!('model' in r)) throw new Error(`no model: ${r.error}`);
    r.model.name = 'outer';
    modelsFor(c.sim).composite.localModelMap.set('outer', r.model);

    const resistances = (outer: CustomCompositeElm): number[] =>
      (outer.compElmList[0] as CustomCompositeElm).compElmList
        .filter((e): e is ResistorElm => e instanceof ResistorElm)
        .map((e) => e.resistance);
    const outer = constructElement('CustomCompositeElm', 480, 160, c.sim) as CustomCompositeElm;
    outer.initWithModel('outer');
    // the outer default RO = 1.5k makes the inner RB 3k
    expect(resistances(outer)).toEqual([1000, 3000]);
    let m = 0;
    while (outer.getEditInfo(m)?.name !== 'RO') m++;
    const ei = outer.getEditInfo(m);
    if (ei === null) throw new Error('no RO item');
    ei.value = 2000;
    outer.setEditValue(m, ei);
    expect(resistances(outer)).toEqual([1000, 4000]);
  });

  it('makes circuit parameters part of the file only when there are any', () => {
    const plain = readCircuit(DIVIDER);
    expect(plain.dumpXml()).not.toMatch(/prm=|px=|pv=|temp=/);
    plain.params = [{ name: 'X', value: 2 }];
    const xml = plain.dumpXml();
    expect(xml).toMatch(/<cir [^>]*prm="X=2"/);
    expect(readCircuit(xml).params).toEqual([{ name: 'X', value: 2 }]);
  });
});

/** A 1 mA current source into a diode to ground; the diode voltage after settling. */
function diodeVoltage(temp: number | null, model = 'spice-default'): number {
  const c = readCircuit(
    '$ 1 0.000005 10.2 50 5 50 5e-11\n' +
      'i 96 96 96 192 0 0.001\n' +
      `d 96 192 96 288 2 ${model}\n` +
      'w 96 96 96 64 0\nw 96 64 96 288 0\n' +
      'g 96 288 96 320 0\n',
  );
  if (temp !== null) c.sim.temperature = temp;
  const xml = c.dumpXml();
  const run = readCircuit(xml);
  run.sim.setElements(run.elements);
  run.sim.step(200);
  const d = run.elements.find((e) => e instanceof DiodeElm) as DiodeElm;
  return Math.abs(d.volts[0] - d.volts[1]);
}

describe('circuit temperature', () => {
  it('lowers a diode drop about 2 mV per degree', () => {
    const v27 = diodeVoltage(null);
    // 1 mA through IS = 1e-14: n Vt ln(I/IS)
    expect(v27).toBeCloseTo(0.025865 * Math.log(1e-3 / 1e-14 + 1), 3);
    const v77 = diodeVoltage(77);
    const perDegree = (v77 - v27) / 50;
    expect(perDegree).toBeLessThan(-1.5e-3);
    expect(perDegree).toBeGreaterThan(-2.5e-3);
    expect(diodeVoltage(-20)).toBeGreaterThan(v27);
  });

  it('is saved only when it is not 27 °C', () => {
    const c = readCircuit(DIVIDER);
    expect(c.dumpXml()).not.toContain('temp=');
    c.sim.temperature = -20;
    const xml = c.dumpXml();
    expect(xml).toMatch(/<cir [^>]*temp="-20"/);
    expect(readCircuit(xml).sim.temperature).toBe(-20);
    // a new circuit starts at 27 again
    expect(readCircuit(DIVIDER).sim.temperature).toBe(27);
  });

  it('moves a resistor by its coefficient', () => {
    const c = readCircuit(DIVIDER);
    const r = c.elements.find((e) => e instanceof ResistorElm) as ResistorElm;
    r.tempco = 4000;
    c.sim.temperature = 77;
    expect(r.simResistance()).toBeCloseTo(1000 * (1 + 4000e-6 * 50), 9);
    const xml = c.dumpXml();
    expect(xml).toContain('tc="4000"');
    c.sim.temperature = 27;
    expect(r.simResistance()).toBe(1000);
  });
});
