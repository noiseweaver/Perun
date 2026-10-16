// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { Pt } from './route.ts';

/**
 * Not in upstream: alignment guides while something is dragged. A guide is a thin line from a
 * moving post to the nearest other post in the same column or row, so a part can be dropped in
 * line with another part's leads. Everything snaps to the grid already, so the guides only show
 * what lines up; they never pull.
 */
export interface Guide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Guides {
  lines: Guide[];
  /** The posts the moving ones line up with. */
  marks: Pt[];
}

export const NO_GUIDES: Guides = { lines: [], marks: [] };

/** Guides from each moving point to its nearest fixed neighbour across and down. */
export function alignmentGuides(moving: readonly Pt[], fixed: readonly Pt[]): Guides {
  if (moving.length === 0 || fixed.length === 0) return NO_GUIDES;
  const movingKeys = new Set(moving.map((p) => `${p.x},${p.y}`));
  const byX = new Map<number, number[]>();
  const byY = new Map<number, number[]>();
  for (const p of fixed) {
    // a post the moving one sits on is a connection, not an alignment
    if (movingKeys.has(`${p.x},${p.y}`)) continue;
    let ys = byX.get(p.x);
    if (ys === undefined) byX.set(p.x, (ys = []));
    ys.push(p.y);
    let xs = byY.get(p.y);
    if (xs === undefined) byY.set(p.y, (xs = []));
    xs.push(p.x);
  }
  const nearest = (list: number[] | undefined, v: number): number | null => {
    if (list === undefined) return null;
    let best: number | null = null;
    for (const u of list) if (best === null || Math.abs(u - v) < Math.abs(best - v)) best = u;
    return best;
  };
  // one line per column and row, spanning everything lined up on it
  const cols = new Map<number, [number, number]>();
  const rows = new Map<number, [number, number]>();
  const marks = new Map<string, Pt>();
  const widen = (m: Map<number, [number, number]>, at: number, a: number, b: number): void => {
    const span = m.get(at);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (span === undefined) m.set(at, [lo, hi]);
    else m.set(at, [Math.min(span[0], lo), Math.max(span[1], hi)]);
  };
  for (const p of moving) {
    const y = nearest(byX.get(p.x), p.y);
    if (y !== null) {
      widen(cols, p.x, p.y, y);
      marks.set(`${p.x},${y}`, { x: p.x, y });
    }
    const x = nearest(byY.get(p.y), p.x);
    if (x !== null) {
      widen(rows, p.y, p.x, x);
      marks.set(`${x},${p.y}`, { x, y: p.y });
    }
  }
  const lines: Guide[] = [];
  for (const [x, [y1, y2]] of cols) lines.push({ x1: x, y1, x2: x, y2 });
  for (const [y, [x1, x2]] of rows) lines.push({ x1, y1: y, x2, y2: y });
  return { lines, marks: [...marks.values()] };
}
