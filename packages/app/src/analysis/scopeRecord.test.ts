// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { readCircuit } from '@circuitjs-next/format';
import { describe, expect, it } from 'vitest';
import { ScopeRecorder } from './scopeRecord.ts';

/** A 40 Hz, 5 V sine across a resistor, with a scope on the resistor (voltage and current). */
const SINE = `$ 1 0.000005 10.20027730826997 50 5 43 5e-11
v 96 352 96 80 0 1 40 5 0 0 0.5
r 96 80 256 80 0 1000
w 256 80 256 352 0
w 256 352 96 352 0
o 1 64 0 4099 5 0.05 0 2 1 3
`;

function setup(maxRows?: number) {
  const c = readCircuit(SINE);
  c.reset();
  const scope = c.scopes.scopes[0];
  if (scope === undefined) throw new Error('no scope');
  scope.calcVisiblePlots();
  const rec = new ScopeRecorder(scope, c.sim, 1e-3, maxRows);
  const prev = c.sim.onTimeStep;
  c.sim.onTimeStep = () => {
    prev?.();
    rec.sample();
  };
  return { c, rec };
}

describe('full-resolution scope recording', () => {
  it('keeps every timestep for the chosen time, named after the part', () => {
    const { c, rec } = setup();
    expect(rec.columns).toEqual(['resistor, 1 kΩ: V (V)', 'resistor, 1 kΩ: I (A)']);
    while (!rec.done) c.sim.step(50);
    expect(rec.end).toBe('done');
    // 1 ms at 5 μs a step: 201 rows, one per timestep (the first at the first step)
    expect(rec.rows).toBeGreaterThanOrEqual(200);
    expect(rec.rows).toBeLessThanOrEqual(202);
    const lines = rec.csv().trim().split('\n');
    expect(lines[0]).toBe('"time (s)","resistor, 1 kΩ: V (V)","resistor, 1 kΩ: I (A)"');
    expect(lines).toHaveLength(rec.rows + 1);
    const [t1, v1, i1] = (lines[1] ?? '').split(',').map(Number);
    const [t2] = (lines[2] ?? '').split(',').map(Number);
    expect((t2 ?? 0) - (t1 ?? 0)).toBeCloseTo(5e-6, 12);
    // Ohm's law row by row, and the sine itself
    expect(Math.abs(v1 ?? 0) / 1000).toBeCloseTo(Math.abs(i1 ?? 0), 9);
    const last = (lines.at(-1) ?? '').split(',').map(Number);
    expect(Math.abs(last[1] ?? 0)).toBeCloseTo(
      5 * Math.abs(Math.sin(2 * Math.PI * 40 * (last[0] ?? 0))),
      1,
    );
  });

  it('stops when full, or when the simulation is reset', () => {
    const a = setup(10);
    while (!a.rec.done) a.c.sim.step(5);
    expect(a.rec.end).toBe('full');
    expect(a.rec.rows).toBe(10);
    const b = setup();
    b.c.sim.step(20);
    b.c.reset();
    b.c.sim.step(5);
    expect(b.rec.end).toBe('reset');
  });
});
