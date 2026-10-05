// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// pnpm bench [--alloc] [--json out.json] [file.txt ...]
// Profiles the engine on every bundled upstream example (PLAN.md Phase 9): matrix sizes, steps
// per second, and how much of a 60 Hz frame the circuit's own speed setting needs on this
// machine. --alloc also samples heap allocations per step and names the functions that make them.

import { Session } from 'node:inspector/promises';
import { writeFileSync } from 'node:fs';
import { JavaRandom, readCircuit } from '@circuitjs-next/format';
import { exampleFiles, readExample } from '../../golden/src/examples.ts';

export interface BenchResult {
  file: string;
  elements: number;
  matrices: number;
  /** Rows of the largest matrix. */
  maxSize: number;
  /** Rows over all matrices. */
  totalSize: number;
  nonLinear: boolean;
  sparse: boolean;
  stepsPerSecond: number;
  /** Steps per second the circuit asks for at its saved speed (upstream: 160 × iterCount). */
  wantedPerSecond: number;
  /** Share of each 16.7 ms frame the simulation needs to keep up (1 = all of it). */
  frameLoad: number;
  stopped: string | null;
  bytesPerStep?: number;
}

const WARMUP_STEPS = 100;
const MEASURE_MS = 250;

function bench(file: string): BenchResult {
  const circuit = readCircuit(readExample(file));
  const sim = circuit.sim;
  sim.random = new JavaRandom(1);
  sim.step(WARMUP_STEPS);
  const ms = sim.matrices ?? [];
  let steps = 0;
  const start = performance.now();
  let now = start;
  // batches of steps, like a frame does
  while (now - start < MEASURE_MS && sim.stopMessage === null) {
    const done = sim.step(50);
    steps += done;
    now = performance.now();
    if (done < 50) break;
  }
  const sps = steps / ((now - start) / 1000);
  const wanted = 160 * circuit.getIterCount();
  return {
    file,
    elements: circuit.elements.length,
    matrices: ms.length,
    maxSize: Math.max(0, ...ms.map((m) => m.size)),
    totalSize: ms.reduce((a, m) => a + m.size, 0),
    nonLinear: ms.some((m) => m.nonLinear),
    sparse: ms.some((m) => m.sparseLU !== null),
    stepsPerSecond: Math.round(sps),
    wantedPerSecond: Math.round(wanted),
    frameLoad: sps > 0 ? wanted / sps : Infinity,
    stopped: sim.stopMessage,
  };
}

interface ProfileNode {
  callFrame: { functionName: string; url: string; lineNumber: number };
  selfSize: number;
  children: ProfileNode[];
}

/** Bytes allocated per step in steady state, by allocating function. */
async function allocations(
  session: Session,
  file: string,
  steps: number,
): Promise<{ perStep: number; byFunction: Map<string, number> }> {
  const circuit = readCircuit(readExample(file));
  const sim = circuit.sim;
  sim.random = new JavaRandom(1);
  sim.step(WARMUP_STEPS);
  await session.post('HeapProfiler.startSampling', {
    samplingInterval: 256,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  let done = 0;
  while (done < steps && sim.stopMessage === null) {
    const n = sim.step(50);
    done += n;
    if (n < 50) break;
  }
  const { profile } = (await session.post('HeapProfiler.stopSampling')) as unknown as {
    profile: { head: ProfileNode };
  };
  const byFunction = new Map<string, number>();
  let total = 0;
  const walk = (n: ProfileNode): void => {
    if (n.selfSize > 0) {
      const url = n.callFrame.url.replace(/^.*\/packages\//, '');
      const key = `${n.callFrame.functionName || '(anonymous)'} ${url}:${n.callFrame.lineNumber + 1}`;
      byFunction.set(key, (byFunction.get(key) ?? 0) + n.selfSize);
      total += n.selfSize;
    }
    for (const c of n.children) walk(c);
  };
  walk(profile.head);
  return { perStep: done > 0 ? total / done : 0, byFunction };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const alloc = args.includes('--alloc');
  const jsonAt = args.indexOf('--json');
  const jsonPath = jsonAt >= 0 ? args[jsonAt + 1] : undefined;
  const picked = args.filter(
    (a, i) => !a.startsWith('--') && i !== jsonAt + 1 && a.endsWith('.txt'),
  );
  const files = picked.length > 0 ? picked : exampleFiles();
  const results: BenchResult[] = [];
  const session = alloc ? new Session() : null;
  session?.connect();
  const totals = new Map<string, number>();
  for (const f of files) {
    let r: BenchResult;
    try {
      r = bench(f);
    } catch (e) {
      console.log(`error ${f}: ${String(e)}`);
      continue;
    }
    if (session) {
      const a = await allocations(session, f, 2000);
      r.bytesPerStep = Math.round(a.perStep);
      for (const [k, v] of a.byFunction) totals.set(k, (totals.get(k) ?? 0) + v);
    }
    results.push(r);
  }
  session?.disconnect();

  const by = (k: (r: BenchResult) => number) => [...results].sort((a, b) => k(b) - k(a));
  const sizes = results.map((r) => r.maxSize).sort((a, b) => a - b);
  const loads = results.map((r) => r.frameLoad).sort((a, b) => a - b);
  const q = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  console.log(`${results.length} examples`);
  console.log(
    `largest matrix: median ${q(sizes, 0.5)}, 90th percentile ${q(sizes, 0.9)}, max ${sizes.at(-1)} rows`,
  );
  console.log(
    `frame load at saved speed: median ${(100 * (q(loads, 0.5) ?? 0)).toFixed(1)}%, ` +
      `90th percentile ${(100 * (q(loads, 0.9) ?? 0)).toFixed(1)}%, ` +
      `over 50%: ${results.filter((r) => r.frameLoad > 0.5).length}, ` +
      `over 100%: ${results.filter((r) => r.frameLoad > 1).length}`,
  );
  console.log('\nheaviest (share of a frame at the saved speed):');
  for (const r of by((r) => r.frameLoad).slice(0, 15))
    console.log(
      `  ${(100 * r.frameLoad).toFixed(0).padStart(5)}%  ${r.file.padEnd(28)} ${String(r.stepsPerSecond).padStart(8)} steps/s, ` +
        `wants ${r.wantedPerSecond}, ${r.matrices} matrices, max ${r.maxSize} rows${r.sparse ? ' (sparse)' : ''}${r.nonLinear ? ', nonlinear' : ''}`,
    );
  if (alloc) {
    const bps = results.map((r) => r.bytesPerStep ?? 0).sort((a, b) => a - b);
    console.log(
      `\nallocation per step: median ${q(bps, 0.5)} B, 90th percentile ${q(bps, 0.9)} B, max ${bps.at(-1)} B`,
    );
    console.log('most allocating examples:');
    for (const r of by((r) => r.bytesPerStep ?? 0).slice(0, 10))
      console.log(`  ${String(r.bytesPerStep).padStart(8)} B/step  ${r.file}`);
    const sum = [...totals.values()].reduce((a, b) => a + b, 0);
    console.log('allocating functions (all examples):');
    for (const [k, v] of [...totals].sort((a, b) => b[1] - a[1]).slice(0, 25))
      console.log(`  ${((100 * v) / sum).toFixed(1).padStart(5)}%  ${k}`);
  }
  if (jsonPath) writeFileSync(jsonPath, JSON.stringify(results, null, 1) + '\n');
}

await main();
