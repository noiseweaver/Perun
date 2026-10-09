// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import { WireElm } from '@perun/elements';
import { Circuit } from './circuit.ts';

// docs/deviations/wire-loops.md: upstream stops with "wire loop detected" for these circuits.
describe('a closed loop of wires', () => {
  const header = '$ 1 5.0E-6 10 50 5.0\n';
  const base =
    'v 96 224 96 96 0 0 40 5 0 0 0.5\n' +
    'r 224 96 224 224 0 1000\n' +
    'w 96 224 224 224 0\n' +
    'w 96 96 224 96 0\n';

  it('runs, with the current split between parallel wires summing to the branch current', () => {
    const c = new Circuit();
    // a second path from 96,96 to 224,96 over the top makes a loop of three wires
    c.read(header + base + 'w 96 96 96 32 0\n' + 'w 96 32 224 32 0\n' + 'w 224 32 224 96 0\n');
    const sim = c.sim;
    for (let k = 0; k < 5; k++) sim.step(10);
    expect(sim.stopMessage).toBeNull();
    const wires = c.elements.filter((e) => e instanceof WireElm);
    const direct = wires[1]?.getCurrent() ?? NaN;
    const over = wires[3]?.getCurrent() ?? NaN;
    expect(Math.abs(direct + over)).toBeCloseTo(0.005, 9);
  });

  it('runs with two wires drawn on top of each other', () => {
    const c = new Circuit();
    c.read(header + base + 'w 96 96 224 96 0\n');
    const sim = c.sim;
    for (let k = 0; k < 5; k++) sim.step(10);
    expect(sim.stopMessage).toBeNull();
    const wires = c.elements.filter((e) => e instanceof WireElm);
    const sum = (wires[1]?.getCurrent() ?? NaN) + (wires[2]?.getCurrent() ?? NaN);
    expect(Math.abs(sum)).toBeCloseTo(0.005, 9);
  });

  it('runs with a ring of wires touching nothing else', () => {
    const c = new Circuit();
    c.read(
      header +
        base +
        'w 320 96 416 96 0\nw 416 96 416 192 0\nw 416 192 320 192 0\nw 320 192 320 96 0\n',
    );
    const sim = c.sim;
    for (let k = 0; k < 5; k++) sim.step(10);
    expect(sim.stopMessage).toBeNull();
    for (const w of c.elements.filter((e) => e instanceof WireElm).slice(2))
      expect(w.getCurrent() ?? NaN).toBe(0);
  });
});
