// SPDX-License-Identifier: GPL-2.0-or-later
// The circuitjs-next engine: loads the circuit with @circuitjs-next/format and runs it with the
// same step-and-sample loop the reference harness uses.

import { runCircuit } from '@circuitjs-next/format';
import type { EngineInput, EngineTrace, GoldenEngine } from '../types.ts';

export const nextEngine: GoldenEngine = {
  name: 'next',
  description: 'circuitjs-next engine (packages/engine, elements, format)',
  run(input: EngineInput): EngineTrace {
    const r = runCircuit(input.circuit, input.settings);
    return { topology: r.topology, stop: r.stop, samples: r.samples };
  },
};
