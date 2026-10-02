// SPDX-License-Identifier: GPL-2.0-or-later
// Golden fixture and trace types. A fixture is what the reference build recorded; a trace is what
// an engine under test produced for the same inputs. Both share the sample shape so they compare
// value by value.

export const SCHEMA_VERSION = 1;

/** State of one top-level element at one sample, in upstream elmList order. */
export interface ElementSample {
  /** Voltage at each of the element's nodes (posts first, then internal nodes). */
  volts: number[];
  /** Current flowing into each post, from `getCurrentIntoNode(post)`. */
  currents: number[];
  /** The element's `getCurrent()`. */
  current: number;
}

export interface Sample {
  /** Timesteps completed since the circuit was loaded. */
  step: number;
  /** Simulated time in seconds. */
  t: number;
  /** Timestep in effect after this step (differs from maxTimeStep only with adaptive steps). */
  timeStep: number;
  /** Voltage of every circuit node by upstream node index (0 is ground). */
  nodes: number[];
  elements: ElementSample[];
}

export interface ElementInfo {
  /** Upstream class name, e.g. `ResistorElm`. */
  type: string;
  /** Upstream `getDumpType()` (a char code for single-letter types). */
  dumpType: number;
  posts: number;
  /** Upstream node index of each of the element's nodes. */
  nodes: number[];
}

export interface Topology {
  nodeCount: number;
  elements: ElementInfo[];
}

/** Why the simulation stopped early, if it did. */
export interface StopInfo {
  message: string;
  /** Steps completed before the stop. */
  step: number;
  t: number;
}

export interface RunSettings {
  /** Seed passed to the seeded `java.util.Random`. */
  seed: number;
  /** Timesteps between samples. */
  stepsPerSample: number;
  /** Number of samples to take. */
  samples: number;
}

export interface GoldenFixture {
  schemaVersion: number;
  name: string;
  description: string;
  /** Where the circuit came from: `tools/golden/circuits/...` or `upstream:<path in the submodule>`. */
  source: string;
  tags: string[];
  reference: {
    upstreamSha: string;
    harnessPatchSha256: string;
    /** Always `java-master`: goldens are recorded from the Java (GWT) build of upstream master. */
    build: string;
  };
  settings: RunSettings & {
    /** Values the circuit file set, read back from the reference after loading. */
    timeStep: number;
    maxTimeStep: number;
    minTimeStep: number;
    adjustTimeStep: boolean;
  };
  /** The circuit exactly as loaded. */
  circuit: string;
  topology: Topology;
  stop: StopInfo | null;
  samples: Sample[];
}

/** What an engine under test returns for one circuit. */
export interface EngineTrace {
  topology?: Topology;
  stop: StopInfo | null;
  samples: Sample[];
}

export interface EngineInput {
  name: string;
  circuit: string;
  settings: RunSettings;
  /** Simulated times of the reference samples, for engines that sample by time. */
  sampleTimes: number[];
  /**
   * The reference topology. Only stub engines may use it; a real engine must derive its own
   * topology from the circuit, or the comparison proves nothing.
   */
  referenceTopology: Topology;
}

export interface GoldenEngine {
  name: string;
  description: string;
  run(input: EngineInput): EngineTrace | Promise<EngineTrace>;
}
