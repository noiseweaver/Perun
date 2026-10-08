// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { getShortUnitText } from '@perun/elements';
import type { Theme } from '@perun/theme';
import { interpolate, type BodePoint } from './bode.ts';
import { bodeLayout, drawBodeGrid, xAtFreq, type BodeLayout } from './bodePlot.ts';
import { valueAt, type RunResult } from './sweep.ts';

/** How the runs are told apart: a color each (sweep), or one spread under the nominal (Monte Carlo). */
export type RunStyle = 'values' | 'montecarlo';

/** Run `i`'s color: the scope's trace colors in turn. */
export function runColor(theme: Theme, i: number): string {
  const tr = theme.scope.traces;
  return tr.length > 0 ? (tr[i % tr.length] ?? theme.scope.text) : theme.scope.text;
}

/** Monte Carlo: the spread in the first trace color, the nominal run in the second. */
export function spreadColors(theme: Theme): { spread: string; nominal: string } {
  const tr = theme.scope.traces;
  return { spread: tr[0] ?? theme.scope.text, nominal: tr[1] ?? theme.scope.current };
}

interface Stroke {
  color: string;
  width: number;
  alpha: number;
}

function strokeFor(theme: Theme, style: RunStyle, r: RunResult, i: number): Stroke {
  if (style === 'values') return { color: runColor(theme, i), width: 2, alpha: 1 };
  const c = spreadColors(theme);
  return r.spec.nominal
    ? { color: c.nominal, width: 2.5, alpha: 1 }
    : { color: c.spread, width: 1, alpha: 0.4 };
}

/** Draw order: the nominal run last, on top of the spread. */
function order(results: readonly RunResult[]): number[] {
  const idx = results.map((_, i) => i);
  return [
    ...idx.filter((i) => !results[i]?.spec.nominal),
    ...idx.filter((i) => results[i]?.spec.nominal),
  ];
}

// ---- transient ----------------------------------------------------------------------------------

export interface TimeLayout {
  left: number;
  right: number;
  top: number;
  bottom: number;
  duration: number;
}

export function timeLayout(w: number, h: number, duration: number): TimeLayout {
  return { left: 64, right: w - 18, top: 10, bottom: h - 22, duration };
}

export function timeAtX(l: TimeLayout, x: number): number {
  const k = Math.min(1, Math.max(0, (x - l.left) / (l.right - l.left)));
  return k * l.duration;
}

/** A 1-2-5 axis covering lo..hi with about `target` divisions. */
export function niceLinear(
  lo: number,
  hi: number,
  target = 5,
): { lo: number; hi: number; step: number } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: -1, hi: 1, step: 0.5 };
  if (hi - lo < Math.max(Math.abs(hi), Math.abs(lo)) * 1e-6 || hi === lo) {
    const pad = Math.abs(hi) > 0 ? Math.abs(hi) * 0.1 : 1;
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = ([1, 2, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  return { lo: Math.floor(lo / step + 1e-9) * step, hi: Math.ceil(hi / step - 1e-9) * step, step };
}

export interface TransientDrawOptions {
  times: readonly number[];
  results: readonly RunResult[];
  style: RunStyle;
  unit: string;
  cursor: number | null;
  theme: Theme;
}

const axisText = (v: number, unit: string): string =>
  getShortUnitText(Math.abs(v) < 1e-15 ? 0 : v, unit).replace(/\s+/g, '');

/** Every run's output against time, in a canvas of `w` x `h` CSS pixels. */
export function drawTransientRuns(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  o: TransientDrawOptions,
): void {
  const sc = o.theme.scope;
  const duration = o.times[o.times.length - 1] ?? 1;
  const l = timeLayout(w, h, duration);
  g.clearRect(0, 0, w, h);
  g.fillStyle = sc.background;
  g.fillRect(0, 0, w, h);

  let lo = Infinity;
  let hi = -Infinity;
  for (const r of o.results)
    for (const v of r.y) {
      if (!Number.isFinite(v)) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  if (lo > hi) {
    lo = -1;
    hi = 1;
  }
  const yr = niceLinear(lo, hi);
  const xr = niceLinear(0, duration, Math.max(3, Math.floor((l.right - l.left) / 90)));
  const y = (v: number): number => l.bottom - ((v - yr.lo) / (yr.hi - yr.lo)) * (l.bottom - l.top);
  const x = (t: number): number => l.left + (t / duration) * (l.right - l.left);

  g.font = `11px ${o.theme.style.monoFont}`;
  g.lineWidth = 1;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (let t = 0; t <= duration * (1 + 1e-9); t += xr.step) {
    const xx = Math.round(x(t)) + 0.5;
    g.strokeStyle = t === 0 ? sc.gridMajor : sc.grid;
    g.beginPath();
    g.moveTo(xx, l.top);
    g.lineTo(xx, l.bottom);
    g.stroke();
    g.fillStyle = sc.text;
    g.fillText(axisText(t, 's'), xx, l.bottom + 6);
  }
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  for (let v = yr.lo; v <= yr.hi + yr.step / 2; v += yr.step) {
    const yy = Math.round(y(v)) + 0.5;
    g.strokeStyle = Math.abs(v) < yr.step * 1e-6 ? sc.gridMajor : sc.grid;
    g.beginPath();
    g.moveTo(l.left, yy);
    g.lineTo(l.right, yy);
    g.stroke();
    g.fillStyle = sc.text;
    g.fillText(axisText(v, o.unit), l.left - 6, yy);
  }

  g.save();
  g.beginPath();
  g.rect(l.left, l.top - 1, l.right - l.left, l.bottom - l.top + 2);
  g.clip();
  g.lineJoin = 'round';
  for (const i of order(o.results)) {
    const r = o.results[i] as RunResult;
    if (r.y.length < 2) continue;
    const s = strokeFor(o.theme, o.style, r, i);
    g.strokeStyle = s.color;
    g.lineWidth = s.width;
    g.globalAlpha = s.alpha;
    g.beginPath();
    r.y.forEach((v, k) => {
      const t = o.times[k] ?? 0;
      if (k === 0) g.moveTo(x(t), y(v));
      else g.lineTo(x(t), y(v));
    });
    g.stroke();
  }
  g.globalAlpha = 1;
  g.restore();

  if (o.cursor !== null) {
    const xx = Math.round(x(o.cursor)) + 0.5;
    g.strokeStyle = sc.text;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(xx, l.top);
    g.lineTo(xx, l.bottom);
    g.stroke();
    for (const i of order(o.results)) {
      const r = o.results[i] as RunResult;
      if (o.style === 'montecarlo' && !r.spec.nominal) continue;
      const v = valueAt(o.times, r.y, o.cursor);
      if (v === null) continue;
      g.beginPath();
      g.arc(xx, y(v), 4, 0, 2 * Math.PI);
      g.fillStyle = strokeFor(o.theme, o.style, r, i).color;
      g.fill();
    }
  }

  g.strokeStyle = sc.gridMajor;
  g.lineWidth = 1;
  g.strokeRect(l.left + 0.5, l.top + 0.5, l.right - l.left, l.bottom - l.top);
}

// ---- AC -----------------------------------------------------------------------------------------

export interface AcDrawOptions {
  results: readonly RunResult[];
  fStart: number;
  fStop: number;
  style: RunStyle;
  cursor: number | null;
  theme: Theme;
}

export function acLayout(w: number, h: number, fStart: number, fStop: number): BodeLayout {
  return bodeLayout(w, h, fStart, fStop);
}

/** Every run's gain and phase, in the Bode plot's two panes. */
export function drawAcRuns(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  o: AcDrawOptions,
): void {
  const sc = o.theme.scope;
  const l = bodeLayout(w, h, o.fStart, o.fStop);
  g.clearRect(0, 0, w, h);
  g.fillStyle = sc.background;
  g.fillRect(0, 0, w, h);
  const all = o.results.flatMap((r) => r.points.filter((p) => Number.isFinite(p.gainDb)));
  const { yGain, yPhase, panes } = drawBodeGrid(g, l, all, o.theme);

  const pane = (
    pts: readonly BodePoint[],
    yv: (p: BodePoint) => number,
    top: number,
    bottom: number,
    s: Stroke,
  ) => {
    g.save();
    g.beginPath();
    g.rect(l.left, top - 1, l.right - l.left, bottom - top + 2);
    g.clip();
    g.strokeStyle = s.color;
    g.lineWidth = s.width;
    g.globalAlpha = s.alpha;
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach((p, k) => {
      if (k === 0) g.moveTo(xAtFreq(l, p.f), yv(p));
      else g.lineTo(xAtFreq(l, p.f), yv(p));
    });
    g.stroke();
    g.restore();
  };
  for (const i of order(o.results)) {
    const r = o.results[i] as RunResult;
    const pts = r.points.filter((p) => Number.isFinite(p.gainDb));
    if (pts.length < 2) continue;
    const s = strokeFor(o.theme, o.style, r, i);
    pane(pts, (p) => yGain(p.gainDb), l.gainTop, l.gainBottom, s);
    pane(pts, (p) => yPhase(p.phaseDeg), l.phaseTop, l.phaseBottom, s);
  }

  if (o.cursor !== null) {
    const x = Math.round(xAtFreq(l, o.cursor)) + 0.5;
    g.strokeStyle = sc.text;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, l.gainTop);
    g.lineTo(x, l.phaseBottom);
    g.stroke();
    for (const i of order(o.results)) {
      const r = o.results[i] as RunResult;
      if (o.style === 'montecarlo' && !r.spec.nominal) continue;
      const v = interpolate(r.points, o.cursor);
      if (v === null || !Number.isFinite(v.gainDb)) continue;
      g.fillStyle = strokeFor(o.theme, o.style, r, i).color;
      for (const yy of [yGain(v.gainDb), yPhase(v.phaseDeg)]) {
        g.beginPath();
        g.arc(x, yy, 4, 0, 2 * Math.PI);
        g.fill();
      }
    }
  }

  g.strokeStyle = sc.gridMajor;
  g.lineWidth = 1;
  for (const [a, b] of panes) g.strokeRect(l.left + 0.5, a + 0.5, l.right - l.left, b - a);
}
