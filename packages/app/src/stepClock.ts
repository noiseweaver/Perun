// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/*
 * How much simulation runs per animation frame, after CircuitJS1's updateCircuit pacing. Shared
 * by the editor's canvas and circuits in Obsidian notes (packages/obsidian), so both run a circuit
 * at the same speed.
 */

/** Simulation time per frame before the frame is cut short (upstream `frameTimeLimit`). */
export const FRAME_BUDGET_MS = 50;
/** Steps per sim.step() call; small enough to check the clock often. */
export const MAX_CHUNK = 500;

/** The part of the simulation the clock drives. */
export interface SteppedSim {
  /** Run `n` steps; returns how many ran. */
  step(n: number): number;
  readonly stopMessage: string | null;
  /** A stop trigger fired: the run should pause. */
  pauseRequested: boolean;
  /** The circuit changed and needs analyzing. */
  readonly analyzeFlag: boolean;
}

export interface Advance {
  /** Steps that ran. */
  steps: number;
  /** A stop trigger paused the run (pauseRequested is cleared). */
  paused: boolean;
}

/** Steps owed between frames: the circuit's speed times the time that passed. */
export class StepClock {
  private owed = 0;

  /** Run `elapsedMs` of wall-clock time at `stepsPerSecond` (160 × the circuit's iterCount). */
  advance(sim: SteppedSim, stepsPerSecond: number, elapsedMs: number): Advance {
    let steps = 0;
    this.owed += (stepsPerSecond * elapsedMs) / 1000;
    // after loading, resetting or a switch flip, run at least one step so the drawing is current
    if (sim.analyzeFlag && this.owed < 1) this.owed = 1;
    const start = performance.now();
    while (this.owed >= 1) {
      const k = Math.min(Math.floor(this.owed), MAX_CHUNK);
      steps += sim.step(k);
      this.owed -= k;
      if (sim.stopMessage !== null) break;
      if (sim.pauseRequested) {
        // a stop trigger fired: pause, as upstream's setSimRunning(false)
        sim.pauseRequested = false;
        this.owed = 0;
        return { steps, paused: true };
      }
      if (performance.now() - start > FRAME_BUDGET_MS) {
        // the circuit is too slow for this speed: drop the backlog rather than spiral
        this.owed = 0;
        break;
      }
    }
    return { steps, paused: false };
  }

  /** Forget the backlog (a new circuit, a reset). */
  reset(): void {
    this.owed = 0;
  }
}
