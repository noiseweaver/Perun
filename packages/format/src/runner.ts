// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { JavaRandom } from '@circuitjs-next/elements';
import { readCircuit } from './circuit.ts';

/**
 * Headless runner. Mirrors what the golden harness does in the reference build
 * (tools/golden/src/reference.ts): load, save, seed, then step and sample. Results have the
 * golden fixture shape, so they compare value by value.
 */

export interface RunSettings {
  /** Seed for the simulation's java.util.Random. */
  seed: number;
  /** Timesteps between samples. */
  stepsPerSample: number;
  samples: number;
}

export interface RunElementInfo {
  type: string;
  dumpType: number;
  posts: number;
  nodes: number[];
}

export interface RunElementSample {
  volts: number[];
  currents: number[];
  current: number;
}

export interface RunSample {
  step: number;
  t: number;
  timeStep: number;
  nodes: number[];
  elements: RunElementSample[];
}

export interface RunResult {
  /** The circuit saved right after loading. */
  export: string;
  timeStep: number;
  maxTimeStep: number;
  minTimeStep: number;
  adjustTimeStep: boolean;
  topology: { nodeCount: number; elements: RunElementInfo[] };
  stop: { message: string; step: number; t: number } | null;
  samples: RunSample[];
  /** Load-time messages (unsupported records and the like). */
  warnings: string[];
}

export function runCircuit(text: string, settings: RunSettings): RunResult {
  const circuit = readCircuit(text);
  const sim = circuit.sim;
  const exported = circuit.dumpXml();
  sim.random = new JavaRandom(settings.seed);
  const timeStep = sim.timeStep;
  const maxTimeStep = sim.maxTimeStep;
  const minTimeStep = sim.minTimeStep;
  const adjustTimeStep = sim.adjustTimeStep;

  const samples: RunSample[] = [];
  let topology: RunResult['topology'] | null = null;
  let stop: RunResult['stop'] = null;
  let step = 0;
  for (let k = 0; k < settings.samples; k++) {
    const done = sim.step(settings.stepsPerSample);
    step += done;
    const nodes = sim.nodeVoltages();
    const els = circuit.elements;
    const info = els.map((e) => ({
      type: e.getClassName(),
      dumpType: e.getDumpType(),
      posts: e.getPostCount(),
      nodes: e.nodes.map((n) => n.index),
    }));
    const topo = { nodeCount: nodes.length, elements: info };
    if (topology === null) topology = topo;
    else if (JSON.stringify(topology) !== JSON.stringify(topo))
      throw new Error(`topology changed at step ${step}`);
    if (done < settings.stepsPerSample) {
      stop = { message: sim.stopMessage ?? 'stopped', step, t: sim.t };
      break;
    }
    samples.push({
      step,
      t: sim.t,
      timeStep: sim.timeStep,
      nodes,
      elements: els.map((e) => {
        const currents: number[] = [];
        for (let j = 0; j !== e.getPostCount(); j++) currents.push(e.getCurrentIntoNode(j));
        return {
          volts: e.nodes.map((n) => n.v),
          currents,
          current: e.getCurrent(),
        };
      }),
    });
  }
  return {
    export: exported,
    timeStep,
    maxTimeStep,
    minTimeStep,
    adjustTimeStep,
    topology: topology ?? { nodeCount: 0, elements: [] },
    stop,
    samples,
    warnings: circuit.warnings,
  };
}
