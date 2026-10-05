// SPDX-License-Identifier: GPL-2.0-or-later
// Bulk run of every bundled upstream example circuit (PLAN.md Phase 8): the fixture format, the
// sample schedule and the comparison. The reference side is recorded by record-examples.ts into
// fixtures/examples/; examples-cli.ts runs this port against them and writes the pass-rate report.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { excessOf, DEFAULT_TOLERANCES, type Tolerances } from './compare.ts';
import { REPO_ROOT } from './manifest.ts';
import type { StopInfo } from './types.ts';

export const EXAMPLES_DIR = join(
  REPO_ROOT,
  'reference/circuitjs1/src/com/lushprojects/circuitjs1/public/circuits',
);
export const EXAMPLE_FIXTURE_DIR = join(REPO_ROOT, 'fixtures/examples');

/**
 * Steps completed at each sample. Early samples catch load and start-up differences, later ones
 * drift; a thousand steps keeps the reference run of all examples to a few minutes.
 */
export const EXAMPLE_SCHEDULE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000] as const;
export const EXAMPLE_SEED = 1;

/** Significant digits stored; far below the compare tolerance, and keeps fixtures small. */
export const EXAMPLE_DIGITS = 12;

export interface ExampleSample {
  step: number;
  t: number;
  /** Voltage of every node by upstream node index. */
  nodes: number[];
}

export interface ExampleFixture {
  file: string;
  reference: { upstreamSha: string; harnessPatchSha256: string; browser: string };
  /** Upstream's XML save right after loading. */
  export: string;
  topology: { nodeCount: number; elements: { type: string; nodes: number[] }[] };
  stop: StopInfo | null;
  samples: ExampleSample[];
}

/** Every bundled example, in file-name order. */
export function exampleFiles(): string[] {
  return readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith('.txt'))
    .sort();
}

export function readExample(file: string): string {
  return readFileSync(join(EXAMPLES_DIR, file), 'utf8');
}

export function fixtureName(file: string): string {
  return file.replace(/\.txt$/, '.json');
}

/** Round to EXAMPLE_DIGITS significant digits; non-finite values become strings. */
export function roundValue(v: number): number | string {
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? 'Infinity' : '-Infinity';
  if (v === 0) return 0;
  return Number(v.toPrecision(EXAMPLE_DIGITS));
}

const unround = (v: number | string): number => (typeof v === 'number' ? v : Number(v));

/** The fixture as stored: rounded numbers, one sample per line. */
export function formatExampleFixture(f: ExampleFixture): string {
  const head = {
    file: f.file,
    reference: f.reference,
    export: f.export,
    topology: f.topology,
    stop: f.stop,
  };
  const lines = f.samples.map((s) =>
    JSON.stringify({ step: s.step, t: roundValue(s.t), nodes: s.nodes.map(roundValue) }),
  );
  const headJson = JSON.stringify(head, null, 1);
  return `${headJson.slice(0, -2)},\n "samples": [\n  ${lines.join(',\n  ')}\n ]\n}\n`;
}

export function parseExampleFixture(text: string): ExampleFixture {
  const raw = JSON.parse(text) as Omit<ExampleFixture, 'samples'> & {
    samples: { step: number; t: number | string; nodes: (number | string)[] }[];
  };
  return {
    ...raw,
    samples: raw.samples.map((s) => ({
      step: s.step,
      t: unround(s.t),
      nodes: s.nodes.map(unround),
    })),
  };
}

/** What this port produced for one example. */
export interface ExampleRun {
  export: string;
  topology: ExampleFixture['topology'];
  stop: StopInfo | null;
  samples: ExampleSample[];
  warnings: string[];
}

export type ExampleStatus = 'pass' | 'fail' | 'error';

export interface ExampleResult {
  file: string;
  status: ExampleStatus;
  /** Why it failed: the first problem found. */
  reason: string | null;
  /** The save matches upstream's byte for byte. */
  sameSave: boolean;
  warnings: string[];
}

/** Compare one run with its fixture: topology, stop state, then every node voltage. */
export function compareExample(
  fixture: ExampleFixture,
  run: ExampleRun,
  tol: Tolerances = DEFAULT_TOLERANCES,
): { pass: boolean; reason: string | null } {
  const ft = fixture.topology;
  const rt = run.topology;
  if (ft.nodeCount !== rt.nodeCount)
    return { pass: false, reason: `node count ${rt.nodeCount}, upstream ${ft.nodeCount}` };
  if (ft.elements.length !== rt.elements.length)
    return {
      pass: false,
      reason: `${rt.elements.length} elements, upstream ${ft.elements.length}`,
    };
  for (let i = 0; i < ft.elements.length; i++) {
    const fe = ft.elements[i];
    const re = rt.elements[i];
    if (fe === undefined || re === undefined) continue;
    if (fe.nodes.join(' ') !== re.nodes.join(' '))
      return {
        pass: false,
        reason: `element ${i} (${fe.type}) nodes [${re.nodes.join(' ')}], upstream [${fe.nodes.join(' ')}]`,
      };
  }
  const fs = fixture.stop;
  const rs = run.stop;
  if (
    (fs === null) !== (rs === null) ||
    (fs && rs && (fs.message !== rs.message || fs.step !== rs.step))
  )
    return {
      pass: false,
      reason: `stop ${rs ? `"${rs.message}" at step ${rs.step}` : 'none'}, upstream ${fs ? `"${fs.message}" at step ${fs.step}` : 'none'}`,
    };
  if (fixture.samples.length !== run.samples.length)
    return {
      pass: false,
      reason: `${run.samples.length} samples, upstream ${fixture.samples.length}`,
    };
  for (let k = 0; k < fixture.samples.length; k++) {
    const fsm = fixture.samples[k];
    const rsm = run.samples[k];
    if (fsm === undefined || rsm === undefined) continue;
    if (excessOf(fsm.t, rsm.t, tol.time) > 1)
      return { pass: false, reason: `t ${rsm.t}, upstream ${fsm.t} at step ${fsm.step}` };
    for (let n = 0; n < fsm.nodes.length; n++) {
      const e = fsm.nodes[n] ?? 0;
      const a = rsm.nodes[n] ?? 0;
      // stored values are rounded, so allow for that as well
      const roundTol = { abs: tol.voltage.abs, rel: tol.voltage.rel + 10 ** -(EXAMPLE_DIGITS - 1) };
      if (excessOf(e, a, roundTol) > 1)
        return {
          pass: false,
          reason: `node ${n} ${a.toPrecision(6)} V, upstream ${e.toPrecision(6)} V at step ${fsm.step}`,
        };
    }
  }
  return { pass: true, reason: null };
}
