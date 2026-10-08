// SPDX-License-Identifier: GPL-2.0-or-later
// Runs one bundled example in this port the way record-examples.ts runs it in the reference.

import { JavaRandom, readCircuit } from '@perun/format';
import {
  EXAMPLE_SCHEDULE,
  EXAMPLE_SEED,
  compareExample,
  readExample,
  type ExampleFixture,
  type ExampleResult,
  type ExampleRun,
} from './examples.ts';

export function runExample(text: string): ExampleRun {
  const circuit = readCircuit(text);
  const sim = circuit.sim;
  const exported = circuit.dumpXml();
  sim.random = new JavaRandom(EXAMPLE_SEED);
  const samples: ExampleRun['samples'] = [];
  let topology: ExampleRun['topology'] | null = null;
  let stop: ExampleRun['stop'] = null;
  let step = 0;
  for (const target of EXAMPLE_SCHEDULE) {
    const want = target - step;
    const done = sim.step(want);
    step += done;
    const nodes = sim.nodeVoltages();
    const topo = {
      nodeCount: nodes.length,
      elements: circuit.elements.map((e) => ({
        type: e.getClassName(),
        nodes: e.nodes.map((n) => n.index),
      })),
    };
    topology ??= topo;
    if (done < want) {
      stop = { message: sim.stopMessage ?? 'stopped', step, t: sim.t };
      break;
    }
    samples.push({ step, t: sim.t, nodes });
  }
  return {
    export: exported,
    topology: topology ?? { nodeCount: 0, elements: [] },
    stop,
    samples,
    warnings: circuit.warnings,
  };
}

/** Run one example and compare it with its fixture. Never throws. */
export function checkExample(fixture: ExampleFixture): ExampleResult {
  let run: ExampleRun;
  try {
    run = runExample(readExample(fixture.file));
  } catch (e) {
    return {
      file: fixture.file,
      status: 'error',
      reason: `exception: ${String(e)}`,
      sameSave: false,
      warnings: [],
    };
  }
  const warnings = [...new Set(run.warnings)];
  const sameSave = run.export === fixture.export;
  // unsupported records are the likely cause; name them first
  const unsupported = warnings.filter((w) => /unrecognized|not supported/.test(w));
  const r = compareExample(fixture, run);
  return {
    file: fixture.file,
    status: r.pass ? 'pass' : 'fail',
    reason: r.pass ? null : unsupported.length > 0 ? unsupported.join('; ') : r.reason,
    sameSave,
    warnings,
  };
}
