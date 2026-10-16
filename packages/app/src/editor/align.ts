// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { WireElm, type CircuitElm, type Rect } from '@perun/elements';

/**
 * Not in upstream: line up a selection of parts along an edge or a centre, or spread them out
 * evenly. A part's extent is the box round its posts (so a resistor's line is its centre and
 * everything lands on the grid); parts without posts (text, boxes) use their drawn box.
 */
export type AlignKind = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';
export type SpreadAxis = 'x' | 'y';

export interface Offset {
  dx: number;
  dy: number;
}

/**
 * What lines up as one: a selected part with any selected part whose post sits on one of its
 * posts (no wire between), and the one-post parts (ground, rails, labels) on its posts, which
 * go along. Wires are never units: they follow.
 */
export type Unit = readonly CircuitElm[];

export function alignUnits(
  selected: readonly CircuitElm[],
  all: readonly CircuitElm[] = selected,
): Unit[] {
  const parts = selected.filter((e) => !(e instanceof WireElm));
  const key = (p: { x: number; y: number }): string => `${p.x},${p.y}`;
  const posts = (e: CircuitElm): string[] => {
    const out: string[] = [];
    for (let i = 0; i !== e.getPostCount(); i++) out.push(key(e.getPost(i)));
    return out;
  };
  // parts touching post to post join up
  const group = new Map<CircuitElm, number>();
  const at = new Map<string, CircuitElm[]>();
  for (const e of parts)
    for (const k of posts(e)) {
      const l = at.get(k);
      if (l === undefined) at.set(k, [e]);
      else l.push(e);
    }
  const units: CircuitElm[][] = [];
  for (const e of parts) {
    if (group.has(e)) continue;
    const unit: CircuitElm[] = [];
    group.set(e, units.length);
    const stack = [e];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) break;
      unit.push(cur);
      for (const k of posts(cur))
        for (const nb of at.get(k) ?? [])
          if (!group.has(nb)) {
            group.set(nb, units.length);
            stack.push(nb);
          }
    }
    units.push(unit);
  }
  // unselected one-post parts on a unit's posts go with it
  const inUnit = new Map<string, number>();
  units.forEach((u, i) => {
    for (const e of u) for (const k of posts(e)) inUnit.set(k, i);
  });
  for (const e of all) {
    if (group.has(e) || e instanceof WireElm || e.getPostCount() !== 1) continue;
    const i = inUnit.get(key(e.getPost(0)));
    if (i !== undefined) units[i].push(e);
  }
  return units;
}

/** The box a unit lines up by: its parts', leaving out the one-post parts riding along. */
export function unitExtent(unit: Unit, bbox: (e: CircuitElm) => Rect | null): Rect {
  const main = unit.filter((e) => e.getPostCount() !== 1);
  const rs = (main.length > 0 ? main : unit).map((e) => extent(e, bbox));
  return rs.reduce((a, r) => ({
    x1: Math.min(a.x1, r.x1),
    y1: Math.min(a.y1, r.y1),
    x2: Math.max(a.x2, r.x2),
    y2: Math.max(a.y2, r.y2),
  }));
}

/** The box a part lines up by. */
export function extent(e: CircuitElm, bbox: (e: CircuitElm) => Rect | null): Rect {
  const n = e.getPostCount();
  if (n > 0) {
    const p0 = e.getPost(0);
    const r = { x1: p0.x, y1: p0.y, x2: p0.x, y2: p0.y };
    for (let i = 1; i < n; i++) {
      const p = e.getPost(i);
      r.x1 = Math.min(r.x1, p.x);
      r.y1 = Math.min(r.y1, p.y);
      r.x2 = Math.max(r.x2, p.x);
      r.y2 = Math.max(r.y2, p.y);
    }
    return r;
  }
  return (
    bbox(e) ?? {
      x1: Math.min(e.x, e.x2),
      y1: Math.min(e.y, e.y2),
      x2: Math.max(e.x, e.x2),
      y2: Math.max(e.y, e.y2),
    }
  );
}

const snap = (v: number, gs: number): number => Math.round(v / gs) * gs;

/** How far each part moves to line up (parts already in line are left out). */
export function alignOffsets(
  units: readonly Unit[],
  kind: AlignKind,
  gridSize: number,
  bbox: (e: CircuitElm) => Rect | null,
): Map<Unit, Offset> {
  const out = new Map<Unit, Offset>();
  if (units.length < 2) return out;
  const rects = units.map((u) => unitExtent(u, bbox));
  const horiz = kind === 'left' || kind === 'centre' || kind === 'right';
  const pos = (r: Rect): number =>
    kind === 'left'
      ? r.x1
      : kind === 'right'
        ? r.x2
        : kind === 'top'
          ? r.y1
          : kind === 'bottom'
            ? r.y2
            : horiz
              ? (r.x1 + r.x2) / 2
              : (r.y1 + r.y2) / 2;
  const values = rects.map(pos);
  let target: number;
  if (kind === 'left' || kind === 'top') target = Math.min(...values);
  else if (kind === 'right' || kind === 'bottom') target = Math.max(...values);
  // centres meet in the middle of the outermost ones
  else target = snap((Math.min(...values) + Math.max(...values)) / 2, gridSize);
  units.forEach((e, i) => {
    const d = snap(target - values[i], gridSize);
    if (d !== 0) out.set(e, horiz ? { dx: d, dy: 0 } : { dx: 0, dy: d });
  });
  return out;
}

/**
 * How far each part moves to spread them out evenly between the outermost two, with equal gaps
 * (or, where they overlap, equal steps between centres).
 */
export function spreadOffsets(
  units: readonly Unit[],
  axis: SpreadAxis,
  gridSize: number,
  bbox: (e: CircuitElm) => Rect | null,
): Map<Unit, Offset> {
  const out = new Map<Unit, Offset>();
  if (units.length < 3) return out;
  const items = units.map((e) => {
    const r = unitExtent(e, bbox);
    const lo = axis === 'x' ? r.x1 : r.y1;
    const hi = axis === 'x' ? r.x2 : r.y2;
    return { e, lo, hi, mid: (lo + hi) / 2 };
  });
  items.sort((a, b) => a.mid - b.mid || a.lo - b.lo);
  const first = items[0];
  const last = items[items.length - 1];
  const sizes = items.reduce((s, it) => s + (it.hi - it.lo), 0);
  const gap = (last.hi - first.lo - sizes) / (items.length - 1);
  const set = (e: Unit, d: number): void => {
    if (d !== 0) out.set(e, axis === 'x' ? { dx: d, dy: 0 } : { dx: 0, dy: d });
  };
  if (gap >= 0) {
    let at = first.hi + gap;
    for (let i = 1; i < items.length - 1; i++) {
      const it = items[i];
      set(it.e, snap(at - it.lo, gridSize));
      at += it.hi - it.lo + gap;
    }
  } else {
    const step = (last.mid - first.mid) / (items.length - 1);
    for (let i = 1; i < items.length - 1; i++)
      set(items[i].e, snap(first.mid + i * step - items[i].mid, gridSize));
  }
  return out;
}
