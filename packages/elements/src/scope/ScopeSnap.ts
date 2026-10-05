// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// The card look's waveform ruler, this port's own: the cursor snaps to peaks, troughs and
// crossings of the trace's mid level, and reads the period between like events.

import type { Scope } from './Scope.ts';
import type { ScopePlot } from './ScopePlot.ts';

export type WaveEventKind = 'peak' | 'trough' | 'rise' | 'fall';

/** A point of interest on a trace, at a (fractional) pixel column of the plot area. */
export interface WaveEvent {
  col: number;
  kind: WaveEventKind;
}

/** A snapped cursor: the event, and the period to the like event before it (in seconds). */
export interface WaveSnap {
  kind: WaveEventKind;
  period: number;
}

/** Pixels the cursor snaps across. */
export const WAVE_SNAP = 8;
/** Columns either side a peak must top. */
const PEAK_WINDOW = 3;

/** Peaks, troughs and mid-level crossings of a plot as shown, left to right. */
export function waveEvents(scope: Scope, plot: ScopePlot): WaveEvent[] {
  const w = scope.rect.width;
  const ipa = scope.displayStartIndex(plot, w);
  const n = plot.elm === null ? 0 : scope.validDataCount(plot, ipa, w);
  const spc = scope.scopePointCount;
  const hi = new Float64Array(n);
  const lo = new Float64Array(n);
  let vmax = -Infinity;
  let vmin = Infinity;
  for (let i = 0; i !== n; i++) {
    const ip = (i + ipa) & (spc - 1);
    hi[i] = plot.maxValues[ip];
    lo[i] = plot.minValues[ip];
    vmax = Math.max(vmax, hi[i]);
    vmin = Math.min(vmin, lo[i]);
  }
  const amp = vmax - vmin;
  const events: WaveEvent[] = [];
  if (n < 3 || !(amp > 1e-12 * Math.max(1, Math.abs(vmax)))) return events;
  const level = (vmax + vmin) / 2;
  // crossings of the mid level, with hysteresis so noise doesn't cross many times
  const band = amp * 0.1;
  let state = 0; // -1 below the band, 1 above, 0 not known yet
  for (let i = 0; i !== n; i++) {
    const mid = (hi[i] + lo[i]) / 2;
    const now = mid > level + band ? 1 : mid < level - band ? -1 : 0;
    if (now === 0 || now === state) continue;
    if (state !== 0) {
      // back up to where it crossed the level
      let j = i;
      while (
        j > 0 &&
        (now > 0 ? (hi[j - 1] + lo[j - 1]) / 2 >= level : (hi[j - 1] + lo[j - 1]) / 2 <= level)
      )
        j--;
      const a = j > 0 ? (hi[j - 1] + lo[j - 1]) / 2 : level;
      const b = (hi[j] + lo[j]) / 2;
      const frac = b !== a ? (level - a) / (b - a) : 0;
      events.push({ col: j - 1 + Math.min(1, Math.max(0, frac)), kind: now > 0 ? 'rise' : 'fall' });
    }
    state = now;
  }
  // peaks and troughs well away from the mid level
  for (let i = PEAK_WINDOW; i < n - PEAK_WINDOW; i++) {
    if (hi[i] > level + amp * 0.25 && hi[i] > hi[i - PEAK_WINDOW] && hi[i] > hi[i + PEAK_WINDOW]) {
      let top = true;
      for (let k = -PEAK_WINDOW; k <= PEAK_WINDOW && top; k++)
        if (hi[i + k] > hi[i] || (k < 0 && hi[i + k] === hi[i])) top = false;
      if (top) events.push({ col: i, kind: 'peak' });
    }
    if (lo[i] < level - amp * 0.25 && lo[i] < lo[i - PEAK_WINDOW] && lo[i] < lo[i + PEAK_WINDOW]) {
      let bottom = true;
      for (let k = -PEAK_WINDOW; k <= PEAK_WINDOW && bottom; k++)
        if (lo[i + k] < lo[i] || (k < 0 && lo[i + k] === lo[i])) bottom = false;
      if (bottom) events.push({ col: i, kind: 'trough' });
    }
  }
  events.sort((a, b) => a.col - b.col);
  return events;
}

/** The event nearest a column, within `reach` columns. */
export function nearestEvent(
  events: readonly WaveEvent[],
  col: number,
  reach: number,
): WaveEvent | null {
  let best: WaveEvent | null = null;
  for (const e of events)
    if (
      Math.abs(e.col - col) <= reach &&
      (best === null || Math.abs(e.col - col) < Math.abs(best.col - col))
    )
      best = e;
  return best;
}

/** Columns from an event to the like one before it (or after it, at the left edge), or 0. */
export function periodColumns(events: readonly WaveEvent[], ev: WaveEvent): number {
  const like = events.filter((e) => e.kind === ev.kind);
  const i = like.indexOf(ev);
  if (i > 0) return ev.col - like[i - 1].col;
  if (i >= 0 && i + 1 < like.length) return like[i + 1].col - ev.col;
  return 0;
}

/**
 * Snap a mouse x (canvas pixels) to the selected plot's nearest event. Returns the x to use
 * (fractional) and what it snapped to, or null to keep the mouse x.
 */
export function snapToWave(scope: Scope, mouseX: number): { x: number; snap: WaveSnap } | null {
  const vp = scope.visiblePlots;
  const plot = vp[scope.selectedPlot >= 0 ? scope.selectedPlot : 0];
  if (plot === undefined) return null;
  const events = waveEvents(scope, plot);
  const ev = nearestEvent(events, mouseX - scope.rect.x, WAVE_SNAP);
  if (ev === null) return null;
  const cols = periodColumns(events, ev);
  return {
    x: scope.rect.x + ev.col,
    snap: { kind: ev.kind, period: cols * scope.sim.maxTimeStep * scope.speed },
  };
}
