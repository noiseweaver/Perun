// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// This port's own example circuits (packages/app/examples/) and how they join upstream's list.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CapacitorElm } from '@circuitjs-next/elements';
import { readCircuit } from '@circuitjs-next/format';
import { describe, expect, it } from 'vitest';
import { mergeSetupLists } from '../vite-plugin-examples.ts';
import { measureFrequency } from './analysis/sweep.ts';
import { findExample, parseSetupList } from './examples.ts';

const EXAMPLES = fileURLToPath(new URL('../examples/', import.meta.url));
const read = (f: string): string => readFileSync(`${EXAMPLES}${f}`, 'utf8');
const OURS = read('setuplist.txt');

/** The ramp voltage's frequency after settling, at an ambient temperature. */
function frequencyAt(file: string, temperature: number): number | null {
  const c = readCircuit(read(`circuits/${file}`));
  expect(c.warnings).toEqual([]);
  c.sim.temperature = temperature;
  c.sim.setElements(c.elements);
  const cap = c.elements.find((e) => e instanceof CapacitorElm) as CapacitorElm;
  const ts: number[] = [];
  const vs: number[] = [];
  c.sim.onTimeStep = () => {
    if (c.sim.t > 0.01) {
      ts.push(c.sim.t);
      vs.push(cap.volts[0] as number);
    }
  };
  expect(c.sim.step(60_000)).toBe(60_000);
  return measureFrequency(ts, vs);
}

/** Each run steps 60 000 times; a busy CI runner needs more than vitest's 5 s for several. */
const SIM_TIMEOUT = 30_000;

describe('our own examples', () => {
  it('adds a menu after upstream’s last one, before its trailing circuits', () => {
    const upstream = '+Basics\nres.txt Resistors\n-\nblank.txt Blank Circuit\n';
    const merged = mergeSetupLists(upstream, OURS);
    expect(merged).not.toContain('#');
    const list = parseSetupList(merged);
    const titles = list.root.items.map((i) => (i.kind === 'menu' ? i.title : i.title));
    expect(titles).toEqual(['Basics', 'Temperature Compensation', 'Blank Circuit']);
    expect(findExample(list.root, 'vco-expo-tempco.txt')?.title).toBe(
      'Expo Converter VCO, Pair with Tempco Resistor',
    );
  });

  it('keeps upstream’s list as it is when there is nothing to add', () => {
    expect(mergeSetupLists('+Basics\nres.txt Resistors\n-\n', '# only a comment\n')).toBe(
      '+Basics\nres.txt Resistors\n-\n',
    );
  });

  it('lists a file for every circuit it names', () => {
    for (const line of OURS.split('\n'))
      if (/^[a-z0-9-]+\.txt /.test(line))
        expect(() => read(`circuits/${line.split(' ')[0]}`)).not.toThrow();
  });

  it(
    'runs the VCO circuits at about 1 kHz at 27 °C',
    () => {
      for (const f of ['vco-expo-single.txt', 'vco-expo-pair.txt', 'vco-expo-tempco.txt']) {
        const hz = frequencyAt(f, 27);
        expect(hz).toBeGreaterThan(800);
        expect(hz).toBeLessThan(1200);
      }
    },
    SIM_TIMEOUT,
  );

  it(
    'shows what the matched pair and the tempco resistor are worth',
    () => {
      const pairCold = frequencyAt('vco-expo-pair.txt', -20) as number;
      const pairHot = frequencyAt('vco-expo-pair.txt', 60) as number;
      const tcCold = frequencyAt('vco-expo-tempco.txt', -20) as number;
      const tcHot = frequencyAt('vco-expo-tempco.txt', 60) as number;
      // the pair still drifts about 1.4 %/°C; one transistor runs away far more than that
      expect(pairHot / pairCold).toBeGreaterThan(2);
      expect(frequencyAt('vco-expo-single.txt', 60) as number).toBeGreaterThan(5 * pairHot);
      // the tempco resistor takes it to under 0.05 %/°C, at least 20 times better
      expect(tcHot / tcCold).toBeLessThan(1.04);
      expect(tcHot / tcCold - 1).toBeLessThan((pairHot / pairCold - 1) / 20);
    },
    SIM_TIMEOUT,
  );
});
