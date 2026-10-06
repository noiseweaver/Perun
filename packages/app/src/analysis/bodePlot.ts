// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import type { Theme } from '@circuitjs-next/theme';
import { interpolate, type BodePoint } from './bode.ts';

/** Where the plot puts things, so the pointer can be mapped back to a frequency. */
export interface BodeLayout {
  left: number;
  right: number;
  gainTop: number;
  gainBottom: number;
  phaseTop: number;
  phaseBottom: number;
  logMin: number;
  logMax: number;
}

export function bodeLayout(w: number, h: number, fStart: number, fStop: number): BodeLayout {
  const left = 52;
  const right = w - 18;
  const top = 10;
  const bottom = h - 22;
  const gap = 16;
  const mid = (top + bottom) / 2;
  return {
    left,
    right,
    gainTop: top,
    gainBottom: mid - gap / 2,
    phaseTop: mid + gap / 2,
    phaseBottom: bottom,
    logMin: Math.log10(fStart),
    logMax: Math.log10(fStop),
  };
}

export function freqAtX(l: BodeLayout, x: number): number {
  const k = Math.min(1, Math.max(0, (x - l.left) / (l.right - l.left)));
  return Math.pow(10, l.logMin + k * (l.logMax - l.logMin));
}

function xAtFreq(l: BodeLayout, f: number): number {
  return l.left + ((Math.log10(f) - l.logMin) / (l.logMax - l.logMin)) * (l.right - l.left);
}

/** Axis label for a frequency: 10, 100, 1k, 10k, 1M. */
export function freqLabel(f: number): string {
  const units: [number, string][] = [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
  ];
  for (const [scale, p] of units) {
    if (f >= scale * 0.999) return `${Number((f / scale).toPrecision(3))}${p}`;
  }
  return f.toPrecision(2);
}

/** A tidy axis range covering lo..hi with about `target` divisions. */
export function niceRange(
  lo: number,
  hi: number,
  steps: readonly number[],
  minSpan: number,
  target = 4,
): { lo: number; hi: number; step: number } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: -1, hi: 1, step: 1 };
  if (hi - lo < minSpan) {
    const c = (hi + lo) / 2;
    lo = c - minSpan / 2;
    hi = c + minSpan / 2;
  }
  const want = (hi - lo) / target;
  const step = steps.find((s) => s >= want) ?? steps[steps.length - 1] ?? 1;
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}

const GAIN_STEPS = [1, 2, 3, 5, 10, 20, 30, 40, 50, 100];
const PHASE_STEPS = [5, 10, 15, 30, 45, 90, 180];

export interface BodeDrawOptions {
  points: readonly BodePoint[];
  fStart: number;
  fStop: number;
  cutoffs: readonly number[];
  cursor: number | null;
  theme: Theme;
}

/** Draw the gain and phase panes into a canvas of `w` x `h` CSS pixels. */
export function drawBode(g: CanvasRenderingContext2D, w: number, h: number, o: BodeDrawOptions) {
  const sc = o.theme.scope;
  const l = bodeLayout(w, h, o.fStart, o.fStop);
  const mono = o.theme.style.monoFont;
  g.clearRect(0, 0, w, h);
  g.fillStyle = sc.background;
  g.fillRect(0, 0, w, h);

  const finite = o.points.filter((p) => Number.isFinite(p.gainDb));
  let gLo = Infinity;
  let gHi = -Infinity;
  let pLo = Infinity;
  let pHi = -Infinity;
  for (const p of finite) {
    gLo = Math.min(gLo, p.gainDb);
    gHi = Math.max(gHi, p.gainDb);
    pLo = Math.min(pLo, p.phaseDeg);
    pHi = Math.max(pHi, p.phaseDeg);
  }
  if (finite.length === 0) {
    gLo = -40;
    gHi = 0;
    pLo = -90;
    pHi = 0;
  }
  const gr = niceRange(gLo, gHi, GAIN_STEPS, 6);
  const pr = niceRange(pLo, pHi, PHASE_STEPS, 45);
  const yGain = (v: number): number =>
    l.gainBottom - ((v - gr.lo) / (gr.hi - gr.lo)) * (l.gainBottom - l.gainTop);
  const yPhase = (v: number): number =>
    l.phaseBottom - ((v - pr.lo) / (pr.hi - pr.lo)) * (l.phaseBottom - l.phaseTop);

  g.font = `11px ${mono}`;
  g.lineWidth = 1;

  // frequency grid: decades strong, 2..9 faint, the same in both panes
  const panes: [number, number][] = [
    [l.gainTop, l.gainBottom],
    [l.phaseTop, l.phaseBottom],
  ];
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (let d = Math.floor(l.logMin); d <= Math.ceil(l.logMax); d++) {
    for (let m = 1; m <= 9; m++) {
      const f = m * Math.pow(10, d);
      const lf = Math.log10(f);
      if (lf < l.logMin - 1e-9 || lf > l.logMax + 1e-9) continue;
      const x = Math.round(xAtFreq(l, f)) + 0.5;
      g.strokeStyle = m === 1 ? sc.gridMajor : sc.grid;
      g.beginPath();
      for (const [a, b] of panes) {
        g.moveTo(x, a);
        g.lineTo(x, b);
      }
      g.stroke();
      if (m === 1) {
        g.fillStyle = sc.text;
        g.fillText(freqLabel(f), x, l.phaseBottom + 6);
      }
    }
  }

  // value grids and labels
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  const hLines = (
    r: { lo: number; hi: number; step: number },
    y: (v: number) => number,
    unit: string,
  ) => {
    for (let v = r.lo; v <= r.hi + r.step / 2; v += r.step) {
      const yy = Math.round(y(v)) + 0.5;
      g.strokeStyle = v === 0 ? sc.gridMajor : sc.grid;
      g.beginPath();
      g.moveTo(l.left, yy);
      g.lineTo(l.right, yy);
      g.stroke();
      g.fillStyle = sc.text;
      g.fillText(`${Math.round(v * 10) / 10}${unit}`, l.left - 6, yy);
    }
  };
  hLines(gr, yGain, ' dB');
  hLines(pr, yPhase, '°');

  // -3 dB markers
  if (o.cutoffs.length > 0) {
    g.strokeStyle = sc.trigger;
    g.setLineDash([4, 4]);
    g.beginPath();
    for (const f of o.cutoffs) {
      const x = Math.round(xAtFreq(l, f)) + 0.5;
      g.moveTo(x, l.gainTop);
      g.lineTo(x, l.phaseBottom);
    }
    g.stroke();
    g.setLineDash([]);
  }

  const gainColor = sc.traces[0] ?? sc.text;
  const phaseColor = sc.traces[1] ?? sc.current;
  const trace = (y: (p: BodePoint) => number, color: string, top: number, bottom: number) => {
    g.save();
    g.beginPath();
    g.rect(l.left, top - 1, l.right - l.left, bottom - top + 2);
    g.clip();
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.beginPath();
    let first = true;
    for (const p of finite) {
      const x = xAtFreq(l, p.f);
      if (first) g.moveTo(x, y(p));
      else g.lineTo(x, y(p));
      first = false;
    }
    g.stroke();
    // points that never settled: hollow rings
    g.lineWidth = 1.5;
    for (const p of finite) {
      if (p.settled) continue;
      g.beginPath();
      g.arc(xAtFreq(l, p.f), y(p), 3.5, 0, 2 * Math.PI);
      g.fillStyle = sc.background;
      g.fill();
      g.stroke();
    }
    g.restore();
  };
  trace((p) => yGain(p.gainDb), gainColor, l.gainTop, l.gainBottom);
  trace((p) => yPhase(p.phaseDeg), phaseColor, l.phaseTop, l.phaseBottom);

  // cursor
  if (o.cursor !== null) {
    const v = interpolate(finite, o.cursor);
    const x = Math.round(xAtFreq(l, o.cursor)) + 0.5;
    g.strokeStyle = sc.text;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, l.gainTop);
    g.lineTo(x, l.phaseBottom);
    g.stroke();
    if (v !== null && Number.isFinite(v.gainDb)) {
      const dot = (y: number, c: string) => {
        g.beginPath();
        g.arc(x, y, 4, 0, 2 * Math.PI);
        g.fillStyle = c;
        g.fill();
      };
      dot(yGain(v.gainDb), gainColor);
      dot(yPhase(v.phaseDeg), phaseColor);
    }
  }

  // pane frames
  g.strokeStyle = sc.gridMajor;
  g.lineWidth = 1;
  for (const [a, b] of panes) g.strokeRect(l.left + 0.5, a + 0.5, l.right - l.left, b - a);
}
