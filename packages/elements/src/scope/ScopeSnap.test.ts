// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import type { Scope } from './Scope.ts';
import type { ScopePlot } from './ScopePlot.ts';
import { periodColumns, snapToWave, waveEvents } from './ScopeSnap.ts';

/** A scope stand-in showing one plot with the given column values. */
function fakeScope(values: number[]): { scope: Scope; plot: ScopePlot } {
  const n = values.length;
  const plot = {
    elm: {},
    maxValues: Float64Array.from(values),
    minValues: Float64Array.from(values),
  } as unknown as ScopePlot;
  const scope = {
    rect: { x: 10, y: 0, width: n, height: 100 },
    scopePointCount: n,
    displayStartIndex: () => 0,
    validDataCount: () => n,
    visiblePlots: [plot],
    selectedPlot: 0,
    speed: 1,
    sim: { maxTimeStep: 1e-3 },
  } as unknown as Scope;
  return { scope, plot };
}

// 2.5 periods of 40 columns, a quarter period in: rises at 0, 40, 80
const sine = Array.from({ length: 128 }, (_, i) => Math.sin((2 * Math.PI * i) / 40));

describe('waveform ruler', () => {
  it('finds peaks, troughs and crossings of a sine', () => {
    const { scope, plot } = fakeScope(sine);
    const ev = waveEvents(scope, plot);
    const peaks = ev.filter((e) => e.kind === 'peak').map((e) => e.col);
    const rises = ev.filter((e) => e.kind === 'rise').map((e) => Math.round(e.col));
    const falls = ev.filter((e) => e.kind === 'fall').map((e) => Math.round(e.col));
    expect(peaks).toEqual([10, 50, 90]);
    expect(rises).toEqual([40, 80, 120]);
    expect(falls).toEqual([20, 60, 100]);
    const p = ev.find((e) => e.kind === 'peak' && e.col === 50);
    expect(p && periodColumns(ev, p)).toBe(40);
  });

  it('snaps the cursor and reads the period', () => {
    const { scope } = fakeScope(sine);
    const s = snapToWave(scope, 10 + 57);
    expect(s?.x).toBeCloseTo(10 + 60, 0);
    expect(s?.snap.kind).toBe('fall');
    expect(s?.snap.period).toBeCloseTo(0.04, 6);
    // nothing within reach of a flat line
    expect(snapToWave(fakeScope(new Array(64).fill(1)).scope, 30)).toBeNull();
  });

  it('ignores the plateaus of a square wave but snaps to its edges', () => {
    const square = Array.from({ length: 128 }, (_, i) => (Math.floor(i / 20) % 2 === 0 ? 1 : -1));
    const { scope, plot } = fakeScope(square);
    const ev = waveEvents(scope, plot);
    expect(ev.filter((e) => e.kind === 'peak' || e.kind === 'trough')).toEqual([]);
    expect(ev.map((e) => [e.kind, Math.round(e.col)])).toEqual([
      ['fall', 20],
      ['rise', 40],
      ['fall', 60],
      ['rise', 80],
      ['fall', 100],
      ['rise', 120],
    ]);
  });
});
