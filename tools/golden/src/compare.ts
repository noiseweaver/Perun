// SPDX-License-Identifier: GPL-2.0-or-later
// Compares an engine trace with a golden fixture, value by value, with absolute and relative
// tolerances. Reports structural problems, the first divergence and the worst value.

import type { EngineTrace, GoldenFixture } from './types.ts';

export interface Tolerance {
  abs: number;
  rel: number;
}

export interface Tolerances {
  /** Node and element voltages, in volts. */
  voltage: Tolerance;
  /** Element currents, in amperes. */
  current: Tolerance;
  /** Simulated time of each sample, in seconds. */
  time: Tolerance;
}

/**
 * Defaults allow for last-bit differences in Math.exp/Math.pow and summation order (PLAN.md
 * section 8) while still catching any real modelling difference.
 */
export const DEFAULT_TOLERANCES: Tolerances = {
  voltage: { abs: 1e-6, rel: 1e-6 },
  current: { abs: 1e-9, rel: 1e-6 },
  time: { abs: 1e-12, rel: 1e-9 },
};

export interface Divergence {
  sample: number;
  step: number;
  t: number;
  /** e.g. `node 3`, `elm 2 ResistorElm v[0]`, `elm 2 ResistorElm i[1]`, `elm 2 ResistorElm current`. */
  quantity: string;
  expected: number;
  actual: number;
  /** |expected - actual| */
  error: number;
  /** error / allowed error; above 1 fails. */
  excess: number;
}

export interface CompareResult {
  name: string;
  pass: boolean;
  /** Values compared. */
  compared: number;
  /** Values outside tolerance. */
  failed: number;
  /** Structural problems: sample count, topology, stop state. Any problem fails the circuit. */
  problems: string[];
  firstDivergence: Divergence | null;
  /** The value with the largest excess, even if within tolerance. */
  worst: Divergence | null;
}

/** How far `actual` is from `expected`, as a multiple of the allowed error. */
export function excessOf(expected: number, actual: number, tol: Tolerance): number {
  if (Number.isNaN(expected) || Number.isNaN(actual))
    return Number.isNaN(expected) && Number.isNaN(actual) ? 0 : Infinity;
  if (!Number.isFinite(expected) || !Number.isFinite(actual))
    return expected === actual ? 0 : Infinity;
  const error = Math.abs(expected - actual);
  if (error === 0) return 0;
  const allowed = tol.abs + tol.rel * Math.max(Math.abs(expected), Math.abs(actual));
  return allowed > 0 ? error / allowed : Infinity;
}

export function compareTrace(
  fixture: GoldenFixture,
  trace: EngineTrace,
  tolerances: Tolerances = DEFAULT_TOLERANCES,
): CompareResult {
  const problems: string[] = [];
  let compared = 0;
  let failed = 0;
  let firstDivergence: Divergence | null = null;
  let worst: Divergence | null = null;

  const ref = fixture.topology;
  if (trace.topology) {
    if (trace.topology.nodeCount !== ref.nodeCount)
      problems.push(`node count: expected ${ref.nodeCount}, got ${trace.topology.nodeCount}`);
    if (trace.topology.elements.length !== ref.elements.length)
      problems.push(
        `element count: expected ${ref.elements.length}, got ${trace.topology.elements.length}`,
      );
    ref.elements.forEach((e, i) => {
      const a = trace.topology?.elements[i];
      if (a && JSON.stringify(a.nodes) !== JSON.stringify(e.nodes))
        problems.push(`elm ${i} ${e.type} nodes: expected [${e.nodes}], got [${a.nodes}]`);
    });
  }

  const want = fixture.stop;
  const got = trace.stop;
  if (want && !got)
    problems.push(`expected stop "${want.message}" at step ${want.step}, engine ran on`);
  else if (!want && got) problems.push(`engine stopped at step ${got.step}: ${got.message}`);
  else if (want && got && (want.message !== got.message || want.step !== got.step))
    problems.push(
      `stop: expected "${want.message}" at step ${want.step}, got "${got.message}" at step ${got.step}`,
    );

  if (trace.samples.length !== fixture.samples.length)
    problems.push(`samples: expected ${fixture.samples.length}, got ${trace.samples.length}`);

  const n = Math.min(trace.samples.length, fixture.samples.length);
  for (let k = 0; k < n; k++) {
    const exp = fixture.samples[k];
    const act = trace.samples[k];
    if (!exp || !act) break;
    if (exp.step !== act.step) {
      problems.push(`sample ${k}: expected step ${exp.step}, got ${act.step}`);
      break;
    }
    const check = (
      quantity: string,
      e: number | undefined,
      a: number | undefined,
      tol: Tolerance,
    ) => {
      compared++;
      const expected = e ?? NaN;
      const actual = a ?? NaN;
      // A value missing on either side always fails.
      const excess =
        e === undefined || a === undefined ? Infinity : excessOf(expected, actual, tol);
      const d: Divergence = {
        sample: k,
        step: exp.step,
        t: exp.t,
        quantity,
        expected,
        actual,
        error: Math.abs(expected - actual),
        excess,
      };
      if (excess > 1) {
        failed++;
        firstDivergence ??= d;
      }
      if (!worst || excess > worst.excess) worst = d;
    };
    check('t', exp.t, act.t, tolerances.time);
    const nodeCount = Math.max(exp.nodes.length, act.nodes.length);
    for (let j = 0; j < nodeCount; j++)
      check(`node ${j}`, exp.nodes[j], act.nodes[j], tolerances.voltage);
    exp.elements.forEach((ee, i) => {
      const ae = act.elements[i];
      const label = `elm ${i} ${ref.elements[i]?.type ?? '?'}`;
      const vn = Math.max(ee.volts.length, ae?.volts.length ?? 0);
      for (let j = 0; j < vn; j++)
        check(`${label} v[${j}]`, ee.volts[j], ae?.volts[j], tolerances.voltage);
      const cn = Math.max(ee.currents.length, ae?.currents.length ?? 0);
      for (let j = 0; j < cn; j++)
        check(`${label} i[${j}]`, ee.currents[j], ae?.currents[j], tolerances.current);
      check(`${label} current`, ee.current, ae?.current, tolerances.current);
    });
    if (k === 0 && act.elements.length !== exp.elements.length)
      problems.push(
        `elements per sample: expected ${exp.elements.length}, got ${act.elements.length}`,
      );
  }

  // Report each structural problem once even if it repeats per sample.
  const unique = [...new Set(problems)];
  return {
    name: fixture.name,
    pass: unique.length === 0 && failed === 0,
    compared,
    failed,
    problems: unique,
    firstDivergence,
    worst,
  };
}

const num = (x: number) => String(Number.isFinite(x) ? Number(x.toPrecision(6)) : x);

function describe(d: Divergence): string {
  return `${d.quantity} at t=${num(d.t)} (step ${d.step}): expected ${num(d.expected)}, got ${num(d.actual)}`;
}

/** One-paragraph human-readable report for one circuit. */
export function formatResult(r: CompareResult): string {
  const lines = [
    `${r.pass ? 'PASS' : 'FAIL'} ${r.name}  (${r.compared - r.failed}/${r.compared} values within tolerance)`,
  ];
  for (const p of r.problems) lines.push(`     problem: ${p}`);
  if (r.firstDivergence) lines.push(`     first divergence: ${describe(r.firstDivergence)}`);
  if (r.worst && r.worst.excess > 0)
    lines.push(`     worst: ${describe(r.worst)} (${num(r.worst.excess)}x tolerance)`);
  return lines.join('\n');
}
