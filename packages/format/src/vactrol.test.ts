// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import {
  constructElement,
  CustomCompositeElm,
  modelsFor,
  VactrolElm,
  vactrolResistance,
} from '@perun/elements';
import { describe, expect, it } from 'vitest';
import { Circuit, readCircuit } from './circuit.ts';

/**
 * A vactrol at (400, 256) with its LED driven from a 0..5 V, 5 Hz square wave through 330 Ω
 * (about 9.5 mA, on for the first 100 ms of each period) and its resistor below 10 kΩ from 1 V.
 */
function bench(setup: (v: VactrolElm) => void = () => {}): string {
  const c = new Circuit();
  const v = constructElement('VactrolElm', 400, 256, c.sim) as VactrolElm;
  setup(v);
  c.elements = [v];
  const [a, k, r1, r2] = v.posts;
  const run = readCircuit(c.dumpXml());
  run.readRetain(
    `v 176 ${k.y + 64} 176 ${a.y} 0 2 5 2.5 2.5 0 0.5\n` +
      `r 176 ${a.y} 272 ${a.y} 0 330\n` +
      `w 272 ${a.y} ${a.x} ${a.y} 0\n` +
      `w ${k.x} ${k.y} ${k.x} ${k.y + 64} 0\n` +
      `w 176 ${k.y + 64} ${k.x} ${k.y + 64} 0\n` +
      `g 176 ${k.y + 64} 176 ${k.y + 96} 0\n` +
      `v 720 ${r2.y + 64} 720 ${r1.y} 0 0 40 1 0 0 0.5\n` +
      `r ${r1.x} ${r1.y} 720 ${r1.y} 0 10000\n` +
      `w ${r2.x} ${r2.y} ${r2.x} ${r2.y + 64} 0\n` +
      `w ${r2.x} ${r2.y + 64} 720 ${r2.y + 64} 0\n` +
      `g 720 ${r2.y + 64} 720 ${r2.y + 96} 0\n`,
  );
  return run.dumpXml();
}

interface Sample {
  t: number;
  /** Resistance from R1 to R2, measured from the divider. */
  r: number;
}

function trace(xml: string, until: number): { c: Circuit; samples: Sample[] } {
  const c = readCircuit(xml);
  c.reset();
  const sub = c.elements.find((e) => e instanceof CustomCompositeElm) as CustomCompositeElm;
  const samples: Sample[] = [];
  while (c.sim.t < until) {
    c.sim.step(1);
    expect(c.sim.stopMessage).toBeNull();
    const vout = sub.volts[2] - sub.volts[3];
    samples.push({ t: c.sim.t, r: (10000 * vout) / (1 - vout) });
  }
  return { c, samples };
}

/** First time at or after `from` that the test passes. */
function firstTime(samples: Sample[], from: number, test: (s: Sample) => boolean): number {
  return samples.find((s) => s.t >= from && test(s))?.t ?? Infinity;
}

describe('vactrol (not in upstream, docs/deviations/vactrol.md)', () => {
  it('follows the VTL5C3 datasheet: 1 kΩ at 10 mA, quick to light, slower to let go', () => {
    const { c, samples } = trace(bench(), 0.2);
    const v = c.elements.find((e) => e instanceof VactrolElm) as VactrolElm;
    expect(v.presetId).toBe('VTL5C3');
    // lit by about 9.5 mA: just over 1 kΩ, and the part says what the circuit measures
    const lit = samples.find((s) => s.t >= 0.09) as Sample;
    expect(lit.r).toBeGreaterThan(1000);
    expect(lit.r).toBeLessThan(1100);
    // 63 % of the final conductance in about 2.5 ms
    const tOn = firstTime(samples, 0, (s) => 1 / s.r >= 0.632 / lit.r);
    expect(tOn).toBeGreaterThan(1.8e-3);
    expect(tOn).toBeLessThan(3.2e-3);
    // back up to 100 kΩ in about 35 ms
    const tOff = firstTime(samples, 0.1, (s) => s.r >= 100e3) - 0.1;
    expect(tOff).toBeGreaterThan(0.028);
    expect(tOff).toBeLessThan(0.042);
    // and on towards the 10 MΩ dark resistance
    expect(samples.at(-1)?.r).toBeGreaterThan(1e6);
  });

  it('measures the resistance it shows', () => {
    const { c, samples } = trace(bench(), 0.05);
    const v = c.elements.find((e) => e instanceof VactrolElm) as VactrolElm;
    expect(samples.at(-1)?.r).toBeCloseTo(v.resistance(), 0);
    const arr: string[] = [];
    v.getInfo(arr);
    expect(arr[0]).toBe('vactrol (VTL5C3)');
  });

  it('opens in CircuitJS1 as a plain subcircuit that runs the same', () => {
    const xml = bench();
    expect(xml).toContain('<ccm nm="Vactrol VTL5C3"');
    expect(xml).toMatch(/<cc [^>]*mo="Vactrol VTL5C3"[^>]*vac="VTL5C3"/);
    // upstream ignores the extra attributes and builds the subcircuit from the model
    const plain = xml.replace(/ (vac|vs|von|vi|vdk|vsl|vat|vre)="[^"]*"/g, '');
    const a = trace(xml, 0.15).samples;
    const p = trace(plain, 0.15);
    const sub = p.c.elements.find((e) => e instanceof CustomCompositeElm);
    expect(sub).not.toBeInstanceOf(VactrolElm);
    expect(p.samples.map((s) => s.r)).toEqual(a.map((s) => s.r));
  });

  it('keeps its model out of the subcircuit list and saves it once', () => {
    const c = readCircuit(bench());
    const lib = modelsFor(c.sim).composite;
    expect(lib.getModelList(c.sim).map((m) => m.name)).not.toContain('Vactrol VTL5C3');
    const v = c.elements.find((e) => e instanceof VactrolElm) as VactrolElm;
    const copy = constructElement('VactrolElm', 400, 512, c.sim) as VactrolElm;
    c.elements.push(copy);
    const xml = c.dumpXml();
    expect(xml.match(/<ccm /g)?.length).toBe(1);
    expect(readCircuit(xml).elements.filter((e) => e instanceof VactrolElm)).toHaveLength(2);
    expect(v.modelName).toBe(copy.modelName);
  });

  it('round-trips presets and custom values', () => {
    const xml = bench((v) => {
      const ei = v.getEditInfo(0);
      const items = ei?.choice?.items ?? [];
      v.setEditValue(0, { ...ei, choice: { items, selected: items.indexOf('VTL5C4') } } as never);
      v.setEditValue(7, { value: 2 } as never);
    });
    const v = readCircuit(xml).elements.find((e) => e instanceof VactrolElm) as VactrolElm;
    expect(v.presetId).toBe('Custom');
    expect(v.params).toMatchObject({ ron: 125, rdark: 400e3, slope: 0.75, release: 2 });
    expect(v.modelName).toMatch(/^Vactrol [0-9a-f]{6}$/);
    // two differently set vactrols never share a model name
    expect(xml).toContain(`<ccm nm="${v.modelName}"`);
  });

  it('can be lit by a lamp', () => {
    const xml = bench((v) => {
      const ei = v.getEditInfo(0);
      const items = ei?.choice?.items ?? [];
      v.setEditValue(0, {
        ...ei,
        choice: { items, selected: items.indexOf('Lamp + LDR') },
      } as never);
    });
    const { c, samples } = trace(xml, 0.1);
    const v = c.elements.find((e) => e instanceof VactrolElm) as VactrolElm;
    expect(v.params.source).toBe(1);
    // a 12 V bulb on 5 V through 330 Ω barely glows: well above the 2 kΩ lit at 40 mA
    const r = samples.at(-1)?.r ?? 0;
    expect(r).toBeGreaterThan(2000);
    expect(r).toBeLessThan(1e6);
    expect(r).toBeCloseTo(v.resistance(), -1);
  });

  it('has a resistance curve with the datasheet end points', () => {
    const p = { source: 0, ron: 1000, iref: 0.01, rdark: 10e6, slope: 0.81, attack: 0, release: 0 };
    expect(vactrolResistance(p, 1)).toBeCloseTo(1000, -1);
    expect(vactrolResistance(p, 0)).toBeCloseTo(10e6, -3);
  });
});
