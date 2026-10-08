// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Not in upstream, whose scope CSV holds only what is on screen (one min/max per pixel column).

import { plotName, type Scope, type ScopePlot, type Simulation } from '@perun/elements';

/** Most rows a recording keeps (about 40 MB of numbers with four plots). */
export const MAX_ROWS = 1_000_000;

/** Why a recording ended. */
export type RecordEnd = 'done' | 'stopped' | 'full' | 'reset';

/** Column names: the scope's label or the part, the plot's legend name and its unit. */
export function plotColumns(scope: Scope, plots: readonly ScopePlot[]): string[] {
  return plots.map((p) => {
    const part =
      scope.text !== null && scope.text !== ''
        ? scope.text
        : (p.elm?.getScopeText(p.value) ?? p.elm?.getClassName().replace('Elm', '') ?? '');
    const unit = p.unitSymbol();
    return `${part}: ${plotName(scope, p)}${unit !== '' ? ` (${unit})` : ''}`;
  });
}

/**
 * Every timestep of a scope's visible plots for a stretch of simulated time: the full-resolution
 * counterpart of `Scope.exportCSV`. Call `sample` after each timestep.
 */
export class ScopeRecorder {
  readonly plots: ScopePlot[];
  readonly columns: string[];
  /** Simulated time to record, in seconds. */
  readonly duration: number;
  /** Time of the first row, or null before it. */
  start: number | null = null;
  /** Time of the last row. */
  last = 0;
  rows = 0;
  end: RecordEnd | null = null;
  readonly scope: Scope;
  private readonly sim: Simulation;
  private readonly maxRows: number;
  private data = new Float64Array(0);
  private readonly width: number;

  constructor(scope: Scope, sim: Simulation, duration: number, maxRows = MAX_ROWS) {
    this.scope = scope;
    this.sim = sim;
    this.maxRows = maxRows;
    this.plots = [...scope.visiblePlots];
    this.columns = plotColumns(scope, this.plots);
    this.duration = duration;
    this.width = this.plots.length + 1;
  }

  get done(): boolean {
    return this.end !== null;
  }

  /** Simulated time recorded so far. */
  get elapsed(): number {
    return this.start === null ? 0 : this.last - this.start;
  }

  stop(): void {
    this.end ??= 'stopped';
  }

  sample(): void {
    if (this.end !== null) return;
    const t = this.sim.t;
    if (this.start !== null && t < this.last) {
      // the simulation was reset: time starts again
      this.end = 'reset';
      return;
    }
    if (this.rows === this.maxRows) {
      this.end = 'full';
      return;
    }
    if (this.start === null) this.start = t;
    const need = (this.rows + 1) * this.width;
    if (need > this.data.length) {
      const grown = new Float64Array(Math.max(need, this.data.length * 2, 4096 * this.width));
      grown.set(this.data);
      this.data = grown;
    }
    let i = this.rows * this.width;
    this.data[i++] = t;
    for (const p of this.plots) {
      // what the trace shows: after the AC coupling filter when it is on
      const live = this.scope.frozen === null;
      this.data[i++] =
        p.isAcCoupled() && live ? p.acLastOut : (p.elm?.getScopeValue(p.value) ?? Number.NaN);
    }
    this.rows++;
    this.last = t;
    if (t - this.start >= this.duration) this.end = 'done';
  }

  /** The rows as CSV: a time column, then one column per plot. */
  csv(): string {
    const head = ['time (s)', ...this.columns].map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
    const lines: string[] = [head];
    const w = this.width;
    for (let r = 0; r !== this.rows; r++) {
      let line = String(this.data[r * w]);
      for (let k = 1; k !== w; k++) line += ',' + String(this.data[r * w + k]);
      lines.push(line);
    }
    return lines.join('\n') + '\n';
  }
}
