// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { compareTrace, excessOf, formatResult, DEFAULT_TOLERANCES } from './compare.ts';
import type { EngineTrace, GoldenFixture, Sample } from './types.ts';

function sample(step: number, v: number, i: number): Sample {
  return {
    step,
    t: step * 1e-5,
    timeStep: 1e-5,
    nodes: [0, v],
    elements: [{ volts: [0, v], currents: [-i, i], current: i }],
  };
}

function fixture(samples: Sample[]): GoldenFixture {
  return {
    schemaVersion: 1,
    name: 'test',
    description: '',
    source: 'test',
    tags: [],
    reference: {
      upstreamSha: 'x',
      harnessPatchSha256: 'y',
      build: 'java-master',
      browser: 'chromium 1',
    },
    settings: {
      seed: 1,
      stepsPerSample: 1,
      samples: samples.length,
      timeStep: 1e-5,
      maxTimeStep: 1e-5,
      minTimeStep: 1e-10,
      adjustTimeStep: false,
    },
    circuit: '',
    export: '',
    topology: {
      nodeCount: 2,
      elements: [{ type: 'ResistorElm', dumpType: 114, posts: 2, nodes: [0, 1] }],
    },
    stop: null,
    samples,
  };
}

const ref = fixture([sample(1, 1, 0.001), sample(2, 2, 0.002), sample(3, 3, 0.003)]);
const trace = (samples: Sample[], extra: Partial<EngineTrace> = {}): EngineTrace => ({
  stop: null,
  samples,
  ...extra,
});

describe('excessOf', () => {
  const tol = { abs: 1e-6, rel: 1e-6 };
  it('is 0 for identical values, including NaN and infinities', () => {
    expect(excessOf(1.5, 1.5, tol)).toBe(0);
    expect(excessOf(NaN, NaN, tol)).toBe(0);
    expect(excessOf(Infinity, Infinity, tol)).toBe(0);
  });
  it('scales by abs + rel * magnitude', () => {
    expect(excessOf(0, 1e-6, tol)).toBeCloseTo(1, 5);
    expect(excessOf(0, 2e-6, tol)).toBeCloseTo(2, 5);
    expect(excessOf(1000, 1000.002, tol)).toBeCloseTo(0.002 / (1e-6 + 1e-3), 3);
  });
  it('is infinite when only one side is NaN or infinite', () => {
    expect(excessOf(NaN, 0, tol)).toBe(Infinity);
    expect(excessOf(1, Infinity, tol)).toBe(Infinity);
  });
});

describe('compareTrace', () => {
  it('passes an identical trace', () => {
    const r = compareTrace(ref, trace(ref.samples, { topology: ref.topology }));
    expect(r.pass).toBe(true);
    expect(r.failed).toBe(0);
    expect(r.problems).toEqual([]);
    expect(r.compared).toBe(3 * (1 + 2 + 2 + 2 + 1));
    expect(formatResult(r)).toMatch(/^PASS test/);
  });

  it('passes differences inside tolerance', () => {
    const r = compareTrace(
      ref,
      trace(
        ref.samples.map((s) =>
          sample(s.step, (s.nodes[1] ?? 0) + 1e-7, s.elements[0]?.current ?? 0),
        ),
      ),
    );
    expect(r.pass).toBe(true);
    expect(r.worst?.quantity).toBe('node 1');
  });

  it('reports the first divergence and the worst value', () => {
    const r = compareTrace(
      ref,
      trace([sample(1, 1, 0.001), sample(2, 2.1, 0.002), sample(3, 3.5, 0.003)]),
    );
    expect(r.pass).toBe(false);
    expect(r.firstDivergence).toMatchObject({
      sample: 1,
      step: 2,
      quantity: 'node 1',
      expected: 2,
      actual: 2.1,
    });
    expect(r.worst).toMatchObject({ sample: 2, quantity: 'node 1', expected: 3, actual: 3.5 });
    expect(r.failed).toBe(4); // node 1 and v[1] in samples 1 and 2
    const text = formatResult(r);
    expect(text).toMatch(/^FAIL test/);
    expect(text).toContain('first divergence: node 1 at t=0.00002 (step 2)');
  });

  it('labels element quantities with index and type', () => {
    const bad = sample(1, 1, 0.001);
    bad.elements[0]?.currents.splice(1, 1, 0.5);
    const r = compareTrace(ref, trace([bad, ...ref.samples.slice(1)]));
    expect(r.firstDivergence?.quantity).toBe('elm 0 ResistorElm i[1]');
  });

  it('flags missing samples and values', () => {
    const short = sample(1, 1, 0.001);
    short.nodes = [0];
    const r = compareTrace(ref, trace([short]));
    expect(r.pass).toBe(false);
    expect(r.problems).toContain('samples: expected 3, got 1');
    expect(r.firstDivergence?.quantity).toBe('node 1');
    expect(r.firstDivergence?.excess).toBe(Infinity);
  });

  it('flags topology differences', () => {
    const r = compareTrace(
      ref,
      trace(ref.samples, {
        topology: {
          nodeCount: 3,
          elements: [{ type: 'ResistorElm', dumpType: 114, posts: 2, nodes: [1, 0] }],
        },
      }),
    );
    expect(r.pass).toBe(false);
    expect(r.problems).toEqual([
      'node count: expected 2, got 3',
      'elm 0 ResistorElm nodes: expected [0,1], got [1,0]',
    ]);
  });

  it('flags a stop mismatch', () => {
    const stopped = { ...ref, stop: { message: 'Convergence failed!', step: 4, t: 4e-5 } };
    expect(compareTrace(stopped, trace(ref.samples)).problems).toEqual([
      'expected stop "Convergence failed!" at step 4, engine ran on',
    ]);
    expect(
      compareTrace(
        ref,
        trace(ref.samples, { stop: { message: 'Singular matrix!', step: 3, t: 3e-5 } }),
      ).problems,
    ).toEqual(['engine stopped at step 3: Singular matrix!']);
  });

  it('stops comparing at a step mismatch', () => {
    const r = compareTrace(
      ref,
      trace([sample(1, 1, 0.001), sample(5, 2, 0.002), sample(6, 3, 0.003)]),
    );
    expect(r.problems).toEqual(['sample 1: expected step 2, got 5']);
  });

  it('uses default tolerances suited to doubles', () => {
    expect(DEFAULT_TOLERANCES.voltage.rel).toBeLessThan(1e-3);
  });
});
