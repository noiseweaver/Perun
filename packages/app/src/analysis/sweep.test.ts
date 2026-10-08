// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { CapacitorElm, ResistorElm } from '@perun/elements';
import { readCircuit } from '@perun/format';
import { describe, expect, it } from 'vitest';
import { cutoffFrequencies } from './bode.ts';
import {
  MultiRun,
  measureFrequency,
  monteCarloRuns,
  rangeValues,
  seededRandom,
  spread,
  sweepCsv,
  sweepItems,
  timeConstant,
  valueAt,
  valueRuns,
  type Measure,
  type RunSpec,
  type SweepTarget,
  TEMPERATURE_TARGET,
} from './sweep.ts';

/** The value, failing the test when it is missing. */
function need<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('missing value');
  return v;
}

function runAll(
  text: string,
  runs: RunSpec[],
  m: Measure,
  target: SweepTarget | null = { element: 1, item: 0 },
) {
  const s = new MultiRun(text, runs, m, target);
  while (s.run(1_000_000));
  return s;
}

// a 5 V step into 1k and 1u: tau = 1 ms
const RC_STEP = `$ 1 5.0E-6 10 50 5.0 50
v 96 320 96 96 0 0 40.0 5.0 0.0 0.0 0.5
r 96 96 256 96 0 1000.0
c 256 96 256 320 0 1.0E-6 0.0
w 96 320 256 320 0
g 96 320 96 352 0
`;

// 1k into 100n: fc = 1591.5 Hz
const RC_LOWPASS = `$ 1 5.0E-6 10 50 5.0 50
v 96 320 96 96 0 1 1000.0 5.0 0.0 0.0 0.5
r 96 96 256 96 0 1000.0
c 256 96 256 320 0 1.0E-7 0.0
w 96 320 256 320 0
g 96 320 96 352 0
`;

describe('rangeValues', () => {
  it('spaces values linearly or on a log scale, both ends included', () => {
    expect(rangeValues(1, 5, 5, false)).toEqual([1, 2, 3, 4, 5]);
    const log = rangeValues(100, 10000, 3, true);
    expect(log[1]).toBeCloseTo(1000, 6);
    expect(rangeValues(0, 10, 3, true)).toEqual([]);
    expect(rangeValues(7, 9, 1, false)).toEqual([7]);
  });
});

describe('sweepItems', () => {
  it('offers the numeric values a slider could drive', () => {
    const c = readCircuit(RC_STEP);
    const cap = c.elements[2] as CapacitorElm;
    const names = sweepItems(cap).map((s) => s.ei.name);
    expect(names).toContain('Capacitance (F)');
    expect(names).not.toContain('Trapezoidal Approximation');
  });
});

describe('parameter sweep, transient', () => {
  it('steps R in an RC step response: each run has tau = RC within 2%', () => {
    const values = [1000, 2200, 4700];
    const s = runAll(
      RC_STEP,
      valueRuns({ element: 1, item: 0 }, values, (v) => `R=${v}`),
      { kind: 'transient', output: 2, quantity: 'voltage', duration: 0.04 },
    );
    expect(s.state).toBe('done');
    expect(s.results).toHaveLength(3);
    values.forEach((r, i) => {
      const res = need(s.results[i]);
      expect(res.done).toBe(true);
      expect(res.y).toHaveLength(s.times.length);
      const tau = need(timeConstant(s.times, res.y));
      expect(Math.abs(tau / (r * 1e-6) - 1)).toBeLessThan(0.02);
    });
    // the live text is untouched: a fresh copy still has 1k
    expect((readCircuit(RC_STEP).elements[1] as ResistorElm).resistance).toBe(1000);
  });

  it('steps the circuit temperature: a diode drop falls as it warms (Phase 15)', () => {
    // 5 V through 1k into a diode
    const text = `$ 1 5.0E-6 10 50 5.0 50
v 96 320 96 96 0 0 40.0 5.0 0.0 0.0 0.5
r 96 96 256 96 0 1000.0
d 256 96 256 320 2 spice-default
w 96 320 256 320 0
g 96 320 96 352 0
`;
    const temps = [-20, 27, 85];
    const target = { element: TEMPERATURE_TARGET, item: 0 };
    const s = runAll(
      text,
      valueRuns(target, temps, (v) => `${v} °C`),
      { kind: 'transient', output: 2, quantity: 'voltage', duration: 0.001 },
      target,
    );
    const drops = s.results.map((r) => Math.abs(need(r.y.at(-1))));
    expect(drops[0]).toBeGreaterThan(need(drops[1]));
    expect(drops[1]).toBeGreaterThan(need(drops[2]));
    // about 2 mV per degree
    const perDegree = (need(drops[2]) - need(drops[0])) / 105;
    expect(perDegree).toBeLessThan(-1.5e-3);
    expect(perDegree).toBeGreaterThan(-2.5e-3);
    // the live circuit stays at 27 °C
    expect(readCircuit(text).sim.temperature).toBe(27);
  });

  it('records current too, and reads values between samples', () => {
    const s = runAll(RC_STEP, valueRuns({ element: 1, item: 0 }, [1000], String), {
      kind: 'transient',
      output: 1,
      quantity: 'current',
      duration: 0.005,
    });
    const y = need(s.results[0]).y;
    // 5 mA at the start, decaying
    expect(Math.abs(need(y[0]))).toBeGreaterThan(4e-3);
    expect(Math.abs(need(y[y.length - 1]))).toBeLessThan(0.1e-3);
    const mid = need(valueAt(s.times, y, 0.001));
    expect(Math.abs(mid)).toBeCloseTo(5e-3 * Math.exp(-1), 4);
    expect(sweepCsv(s).split('\n')[0]).toBe('time_s,"1000"');
  });
});

describe('parameter sweep, AC', () => {
  it('steps C in an RC low-pass: the -3 dB point follows 1/(2 pi R C) within 2%', () => {
    const caps = [1e-7, 2.2e-7, 4.7e-7];
    const s = runAll(
      RC_LOWPASS,
      valueRuns({ element: 2, item: 0 }, caps, String),
      {
        kind: 'ac',
        bode: {
          source: 0,
          output: 2,
          fStart: 10,
          fStop: 100000,
          pointsPerDecade: 10,
          amplitude: 1,
        },
      },
      { element: 2, item: 0 },
    );
    expect(s.state).toBe('done');
    caps.forEach((c, i) => {
      const fc = need(cutoffFrequencies(need(s.results[i]).points)[0]);
      expect(Math.abs(fc / (1 / (2 * Math.PI * 1000 * c)) - 1)).toBeLessThan(0.02);
    });
  });
});

describe('Monte Carlo', () => {
  const tolerant = (): string => {
    const c = readCircuit(RC_STEP);
    (c.elements[1] as ResistorElm).tolerance = 5;
    (c.elements[2] as CapacitorElm).tolerance = 10;
    return c.dumpXml();
  };

  it('keeps every value within its tolerance, and the same seed gives the same runs', () => {
    const els = readCircuit(tolerant()).elements;
    const a = monteCarloRuns(els, 200, 42, 'uniform', (i) => `#${i}`, 'nominal');
    const b = monteCarloRuns(els, 200, 42, 'uniform', (i) => `#${i}`, 'nominal');
    const c = monteCarloRuns(els, 200, 43, 'uniform', (i) => `#${i}`, 'nominal');
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a[0]).toMatchObject({ nominal: true, params: [] });
    let rMin = Infinity;
    let rMax = -Infinity;
    for (const run of a.slice(1)) {
      const r = need(run.params[0]);
      const cap = need(run.params[1]);
      expect(r.element).toBe(1);
      expect(cap.element).toBe(2);
      expect(r.value).toBeGreaterThanOrEqual(950);
      expect(r.value).toBeLessThanOrEqual(1050);
      expect(cap.value).toBeGreaterThanOrEqual(0.9e-6);
      expect(cap.value).toBeLessThanOrEqual(1.1e-6);
      rMin = Math.min(rMin, r.value);
      rMax = Math.max(rMax, r.value);
    }
    // the spread uses most of the band
    expect(rMax - rMin).toBeGreaterThan(80);
    const g = monteCarloRuns(els, 200, 42, 'gaussian', String, 'n');
    for (const run of g.slice(1)) {
      expect(need(run.params[0]).value).toBeGreaterThanOrEqual(950);
      expect(need(run.params[0]).value).toBeLessThanOrEqual(1050);
    }
  });

  it('runs the spread: each tau is the product of its drawn R and C', () => {
    const text = tolerant();
    const runs = monteCarloRuns(readCircuit(text).elements, 5, 7, 'uniform', String, 'n');
    const s = runAll(
      text,
      runs,
      { kind: 'transient', output: 2, quantity: 'voltage', duration: 0.008 },
      null,
    );
    expect(s.state).toBe('done');
    for (const res of s.results) {
      const r = res.spec.params[0]?.value ?? 1000;
      const c = res.spec.params[1]?.value ?? 1e-6;
      const tau = need(timeConstant(s.times, res.y));
      expect(Math.abs(tau / (r * c) - 1)).toBeLessThan(0.02);
    }
    const at = spread(s.results.map((r) => valueAt(s.times, r.y, 0.001)));
    expect(need(at).count).toBe(6);
    expect(need(at).min).toBeLessThan(need(at).mean);
    expect(need(at).mean).toBeLessThan(need(at).max);
  });

  it('seededRandom is uniform in [0, 1)', () => {
    const r = seededRandom(1);
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 10000).toBeCloseTo(0.5, 1);
  });
});

describe('tolerance attribute (not in upstream, DEVIATIONS.md)', () => {
  it('saves tol only when set, and reads it back', () => {
    const c = readCircuit(RC_STEP);
    expect(c.dumpXml()).not.toMatch(/ tol=/);
    (c.elements[1] as ResistorElm).tolerance = 1;
    const xml = c.dumpXml();
    expect(xml).toMatch(/ tol="1"/);
    const d = readCircuit(xml);
    expect((d.elements[1] as ResistorElm).tolerance).toBe(1);
    expect((d.elements[2] as CapacitorElm).tolerance).toBe(0);
  });
});

describe('measureFrequency', () => {
  const sampled = (f: number, dt: number, n: number, offset = 0) => {
    const ts = Array.from({ length: n }, (_, i) => i * dt);
    return { ts, vs: ts.map((t) => offset + Math.sin(2 * Math.PI * f * t)) };
  };

  it('reads a sine to well under a part per thousand', () => {
    const { ts, vs } = sampled(1234, 1e-6, 20_000, 3);
    expect(need(measureFrequency(ts, vs)) / 1234).toBeCloseTo(1, 4);
  });

  it('reads a square wave and ignores the level it sits at', () => {
    const ts = Array.from({ length: 10_000 }, (_, i) => i * 1e-6);
    const vs = ts.map((t) => (Math.floor(t * 2000) % 2 === 0 ? 9 : 4));
    expect(need(measureFrequency(ts, vs)) / 1000).toBeCloseTo(1, 2);
  });

  it('gives null for a flat line or too few cycles', () => {
    expect(measureFrequency([0, 1, 2, 3], [1, 1, 1, 1])).toBeNull();
    const { ts, vs } = sampled(100, 1e-4, 150);
    expect(measureFrequency(ts, vs)).toBeNull();
  });

  it('ignores noise near the crossing level', () => {
    const { ts, vs } = sampled(500, 1e-6, 20_000);
    const noisy = vs.map((v, i) => v + (i % 2 === 0 ? 0.02 : -0.02));
    expect(need(measureFrequency(ts, noisy)) / 500).toBeCloseTo(1, 3);
  });

  it('measures each transient run of a sweep', () => {
    const s = runAll(RC_LOWPASS, valueRuns({ element: 1, item: 0 }, [1000, 2000], String), {
      kind: 'transient',
      output: 2,
      quantity: 'voltage',
      duration: 0.01,
    });
    for (const r of s.results) expect(need(r.frequency) / 1000).toBeCloseTo(1, 3);
  });

  it('gives no frequency for a run that settles', () => {
    const s = runAll(RC_STEP, valueRuns({ element: 1, item: 0 }, [1000], String), {
      kind: 'transient',
      output: 2,
      quantity: 'voltage',
      duration: 0.01,
    });
    expect(s.results[0]?.frequency).toBeNull();
  });
});
