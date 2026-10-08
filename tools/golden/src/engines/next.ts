// SPDX-License-Identifier: GPL-2.0-or-later
// The Perun engine: loads the circuit with @perun/format and runs it with the
// same step-and-sample loop the reference harness uses.

import { runCircuit } from '@perun/format';
import type { EngineInput, EngineTrace, GoldenEngine } from '../types.ts';

export const nextEngine: GoldenEngine = {
  name: 'next',
  description: 'Perun engine (packages/engine, elements, format)',
  run(input: EngineInput): EngineTrace {
    const r = runCircuit(input.circuit, input.settings);
    return { topology: r.topology, stop: r.stop, samples: r.samples };
  },
};
