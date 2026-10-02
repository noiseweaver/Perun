// SPDX-License-Identifier: GPL-2.0-or-later
// Stub engine: simulates nothing. Returns all-zero voltages and currents in the reference shape,
// so `pnpm golden:compare --engine stub` exercises the comparator end to end and fails cleanly.

import type { EngineInput, EngineTrace, GoldenEngine } from '../types.ts';

export const stubEngine: GoldenEngine = {
  name: 'stub',
  description: 'all zeros in the reference shape (fails every non-trivial circuit)',
  run(input: EngineInput): EngineTrace {
    const topo = input.referenceTopology;
    const { stepsPerSample } = input.settings;
    return {
      topology: topo,
      stop: null,
      samples: input.sampleTimes.map((t, k) => ({
        step: (k + 1) * stepsPerSample,
        t,
        timeStep: 0,
        nodes: new Array<number>(topo.nodeCount).fill(0),
        elements: topo.elements.map((e) => ({
          volts: new Array<number>(e.nodes.length).fill(0),
          currents: new Array<number>(e.posts).fill(0),
          current: 0,
        })),
      })),
    };
  },
};
