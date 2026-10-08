// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/** A rectangle in circuit coordinates. */
export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ArrangeOptions {
  /** Card size. */
  width: number;
  height: number;
  /** Space between the circuit and the cards. */
  margin: number;
  /** Space between neighbouring cards. */
  gap: number;
  /** Cards snap to this grid. */
  grid: number;
}

type Side = 'top' | 'bottom' | 'left' | 'right';
const SIDES: Side[] = ['top', 'bottom', 'left', 'right'];

/**
 * Spread cards around a circuit, one per target point: each goes on the side of the circuit
 * nearest its target (the sides share the cards out when one fills up), and the cards on a side
 * sit level with their targets where they can, so their leader lines run straight in. Cards that
 * would overlap are packed side by side, an even gap apart, in the order of their targets, so no
 * two leaders cross. Returns one box per target, in the same order.
 */
export function arrangeCards(
  bounds: Box,
  targets: readonly { x: number; y: number }[],
  o: ArrangeOptions,
): Box[] {
  const bw = bounds.x2 - bounds.x1;
  const bh = bounds.y2 - bounds.y1;
  const room: Record<Side, number> = {
    top: Math.max(1, Math.floor((bw + o.gap) / (o.width + o.gap))),
    bottom: Math.max(1, Math.floor((bw + o.gap) / (o.width + o.gap))),
    left: Math.max(1, Math.floor((bh + o.gap) / (o.height + o.gap))),
    right: Math.max(1, Math.floor((bh + o.gap) / (o.height + o.gap))),
  };
  const dist = (t: { x: number; y: number }, s: Side): number => {
    switch (s) {
      case 'top':
        return t.y - bounds.y1;
      case 'bottom':
        return bounds.y2 - t.y;
      case 'left':
        return t.x - bounds.x1;
      case 'right':
        return bounds.x2 - t.x;
    }
  };
  // the targets with most to lose from a worse side choose first
  const prefs = targets.map((t, i) => {
    const order = [...SIDES].sort((a, b) => dist(t, a) - dist(t, b));
    const d0 = dist(t, order[0] ?? 'top');
    const d1 = dist(t, order[1] ?? 'top');
    return { i, order, regret: d1 - d0 };
  });
  prefs.sort((a, b) => b.regret - a.regret || a.i - b.i);
  const side = new Array<Side>(targets.length);
  const count: Record<Side, number> = { top: 0, bottom: 0, left: 0, right: 0 };
  for (const p of prefs) {
    // when every side is full, the top and bottom rows grow sideways
    const s =
      p.order.find((s) => count[s] < room[s]) ??
      p.order.find((s) => s === 'top' || s === 'bottom') ??
      'top';
    side[p.i] = s;
    count[s]++;
  }
  const snap = (v: number): number => Math.round(v / o.grid) * o.grid;
  const out = new Array<Box>(targets.length);
  for (const s of SIDES) {
    const across = s === 'top' || s === 'bottom';
    const size = across ? o.width : o.height;
    const ids = targets.map((_, i) => i).filter((i) => side[i] === s);
    if (ids.length === 0) continue;
    const at = (i: number): number => {
      const t = targets[i];
      return t === undefined ? 0 : across ? t.x : t.y;
    };
    ids.sort((a, b) => at(a) - at(b) || a - b);
    const starts = pack(
      ids.map((i) => at(i) - size / 2),
      size,
      o.gap,
      across ? bounds.x1 : bounds.y1,
      across ? bounds.x2 : bounds.y2,
    );
    const row =
      s === 'top'
        ? snap(bounds.y1 - o.margin - o.height)
        : s === 'bottom'
          ? snap(bounds.y2 + o.margin)
          : s === 'left'
            ? snap(bounds.x1 - o.margin - o.width)
            : snap(bounds.x2 + o.margin);
    ids.forEach((i, k) => {
      const a = snap(starts[k] ?? 0);
      out[i] = across
        ? { x1: a, y1: row, x2: a + o.width, y2: row + o.height }
        : { x1: row, y1: a, x2: row + o.width, y2: a + o.height };
    });
  }
  return out;
}

/**
 * Starts for items of one size a fixed gap apart, in order, each as near its wanted start as it can be:
 * items that would overlap merge into a run centred on their wanted starts, and a run is kept
 * within [lo, hi] when it fits (centred on that span when it doesn't).
 */
function pack(wanted: number[], size: number, gap: number, lo: number, hi: number): number[] {
  const pitch = size + gap;
  interface Run {
    first: number;
    n: number;
    start: number;
  }
  const place = (r: Run): void => {
    let sum = 0;
    for (let k = 0; k < r.n; k++) sum += (wanted[r.first + k] ?? 0) - k * pitch;
    r.start = sum / r.n;
    const len = r.n * pitch - gap;
    if (len > hi - lo) r.start = (lo + hi - len) / 2;
    else r.start = Math.min(Math.max(r.start, lo), hi - len);
  };
  const runs: Run[] = [];
  wanted.forEach((_, i) => {
    const r: Run = { first: i, n: 1, start: 0 };
    place(r);
    runs.push(r);
    // merge backwards while the new run overlaps the one before it
    for (;;) {
      const b = runs[runs.length - 1];
      const a = runs[runs.length - 2];
      if (a === undefined || b === undefined || a.start + a.n * pitch <= b.start) break;
      runs.pop();
      a.n += b.n;
      place(a);
    }
  });
  const out: number[] = [];
  for (const r of runs) for (let k = 0; k < r.n; k++) out.push(r.start + k * pitch);
  return out;
}
