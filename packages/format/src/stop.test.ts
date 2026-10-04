// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import { Circuit } from './circuit.ts';

describe('a simulation that stops itself', () => {
  it('stops with "max current exceeded" for a diode across a voltage source, without throwing', () => {
    const c = new Circuit();
    c.read(
      '$ 1 5.0E-6 10 50 5.0\n' +
        'v 96 224 96 96 0 0 40 5 0 0 0.5\n' +
        'w 96 96 224 96 0\n' +
        'w 96 224 224 224 0\n' +
        'd 224 96 224 224 2 default\n',
    );
    const sim = c.sim;
    let done = 0;
    expect(() => {
      for (let k = 0; k < 20 && sim.stopMessage === null; k++) done += sim.step(50);
    }).not.toThrow();
    expect(sim.stopMessage).toBe('max current exceeded');
    expect(done).toBeGreaterThan(0);
    // further steps do nothing until the circuit changes
    expect(sim.step(10)).toBe(0);
  });
});
