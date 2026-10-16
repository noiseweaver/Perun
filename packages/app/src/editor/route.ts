// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { TextElm, WireElm, type CircuitElm, type Rect } from '@perun/elements';

/**
 * Not in upstream: a grid router for plain wires, used when a wire is drawn (it finds its way
 * round parts). Unlike upstream's routed wire, which is one element with a stored path, the
 * result is a list of corners that become ordinary wires, so the circuit opens in CircuitJS1 as
 * it is.
 *
 * A route runs along grid lines. It never enters a part's body, never touches a post or a wire
 * end (that would connect to it), may cross a wire at a right angle but never runs along one or
 * turns on one, so the only connections it makes are at its two ends.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Right, down, left, up. */
export const RIGHT = 0;
export const DOWN = 1;
export const LEFT = 2;
export const UP = 3;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

const BODY = 1;
/** A post or a wire end: touching it connects. */
const NODE = 2;
const HWIRE = 4;
const VWIRE = 8;
/** Right by a part's body: a route may pass, but would rather keep a step away. */
const NEAR = 16;
const NEAR_COST = 1.5;

/** A bend costs as much as this many grid steps. */
const BEND = 3;
/** Stop looking after this many steps (a route that would take longer is not worth waiting for). */
const MAX_VISITS = 400_000;

export interface RouteGridOptions {
  gridSize: number;
  /** An element's hit box (its view's bounding box), or null if it has none. */
  bbox(e: CircuitElm): Rect | null;
  /** Points the grid must cover besides the elements (where a wire is being drawn). */
  extent?: readonly Pt[];
  /** Grid steps of free space around everything. */
  margin?: number;
}

export interface RouteOptions {
  /** Leave the start this way if it costs no more than a bend (a part's lead, the drag). */
  startDir?: number | null;
  /** The way into each target cell that needs no extra bend (into a part's lead). */
  arriveDir?: (p: Pt) => number | null;
}

/** Does the element have a body a wire must go round? */
export function hasBody(e: CircuitElm): boolean {
  if (e instanceof WireElm) return false;
  return e.getPostCount() > 0 || e instanceof TextElm;
}

/** The grid with everything a route must avoid. */
export class RouteGrid {
  readonly gs: number;
  private ox = 0;
  private oy = 0;
  readonly cols: number;
  readonly rows: number;
  private readonly cell: Uint8Array;

  constructor(elements: readonly CircuitElm[], o: RouteGridOptions) {
    const gs = (this.gs = o.gridSize);
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    const cover = (x: number, y: number): void => {
      x1 = Math.min(x1, x);
      y1 = Math.min(y1, y);
      x2 = Math.max(x2, x);
      y2 = Math.max(y2, y);
    };
    for (const e of elements) {
      cover(e.x, e.y);
      cover(e.x2, e.y2);
      const b = hasBody(e) ? o.bbox(e) : null;
      if (b !== null) {
        cover(b.x1, b.y1);
        cover(b.x2, b.y2);
      }
    }
    for (const p of o.extent ?? []) cover(p.x, p.y);
    if (x1 > x2) x1 = y1 = x2 = y2 = 0;
    const m = (o.margin ?? 8) * gs;
    this.ox = Math.floor((x1 - m) / gs) * gs;
    this.oy = Math.floor((y1 - m) / gs) * gs;
    this.cols = Math.floor((x2 + m - this.ox) / gs) + 1;
    this.rows = Math.floor((y2 + m - this.oy) / gs) + 1;
    this.cell = new Uint8Array(this.cols * this.rows);
    for (const e of elements) this.add(e, o.bbox);
  }

  /** Mark an element: a wire's line, or a part's body and posts. */
  add(e: CircuitElm, bbox: (e: CircuitElm) => Rect | null): void {
    if (e instanceof WireElm) {
      this.addWire(e.x, e.y, e.x2, e.y2);
      return;
    }
    if (hasBody(e)) {
      const b = bbox(e);
      if (b !== null) this.addBody(b);
    }
    for (let i = 0; i !== e.getPostCount(); i++) {
      const p = e.getPost(i);
      this.mark(p.x, p.y, NODE);
    }
  }

  /** Grid points strictly inside the box, and those just round it as near. */
  addBody(b: Rect): void {
    const gs = this.gs;
    for (let y = Math.floor(b.y1 / gs) * gs; y <= b.y2 + gs - 1; y += gs)
      for (let x = Math.floor(b.x1 / gs) * gs; x <= b.x2 + gs - 1; x += gs) this.mark(x, y, NEAR);
    for (let y = Math.floor(b.y1 / gs + 1) * gs; y < b.y2; y += gs)
      for (let x = Math.floor(b.x1 / gs + 1) * gs; x < b.x2; x += gs) this.mark(x, y, BODY);
  }

  /** A wire from a to b: its ends connect, its middle may only be crossed. */
  addWire(ax: number, ay: number, bx: number, by: number): void {
    this.mark(ax, ay, NODE);
    this.mark(bx, by, NODE);
    const gs = this.gs;
    if (ay === by) {
      for (let x = Math.min(ax, bx) + gs; x < Math.max(ax, bx); x += gs) this.mark(x, ay, HWIRE);
    } else if (ax === bx) {
      for (let y = Math.min(ay, by) + gs; y < Math.max(ay, by); y += gs) this.mark(ax, y, VWIRE);
    } else {
      // a slanted wire: no route goes through the grid points on it
      const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / gs;
      for (let i = 1; i < n; i++) {
        const x = ax + ((bx - ax) * i) / n;
        const y = ay + ((by - ay) * i) / n;
        if (x % gs === 0 && y % gs === 0) this.mark(x, y, HWIRE | VWIRE);
      }
    }
  }

  /** Does a straight run from a to b (across or down) stay out of every part's body? */
  clearOfBodies(a: Pt, b: Pt): boolean {
    if (a.x !== b.x && a.y !== b.y) return false;
    const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / this.gs;
    for (let k = 1; k < n; k++) {
      const i = this.index(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
      if (i >= 0 && (this.cell[i] & BODY) !== 0) return false;
    }
    return true;
  }

  /** Is the point inside the grid? */
  covers(p: Pt): boolean {
    return this.index(p.x, p.y) >= 0;
  }

  /** Is the point free for a wire to pass straight through (nothing there at all)? */
  isFree(p: Pt): boolean {
    const i = this.index(p.x, p.y);
    return i >= 0 && (this.cell[i] & ~NEAR) === 0;
  }

  private index(x: number, y: number): number {
    const c = (x - this.ox) / this.gs;
    const r = (y - this.oy) / this.gs;
    if (!Number.isInteger(c) || !Number.isInteger(r)) return -1;
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private mark(x: number, y: number, flag: number): void {
    const i = this.index(x, y);
    if (i >= 0) this.cell[i] |= flag;
  }

  /**
   * The cheapest route from `start` to any of `targets`, as its corners (start first, the target
   * reached last), or null if there is none. Length counts one per grid step, each bend
   * `BEND`. Ends that are not on grid points have no route.
   */
  route(start: Pt, targets: readonly Pt[], ro: RouteOptions = {}): Pt[] | null {
    const s = this.index(start.x, start.y);
    if (s < 0) return null;
    const cols = this.cols;
    const goal = new Map<number, Pt>();
    let tc1 = Infinity;
    let tr1 = Infinity;
    let tc2 = -Infinity;
    let tr2 = -Infinity;
    for (const t of targets) {
      const i = this.index(t.x, t.y);
      if (i < 0 || i === s) continue;
      goal.set(i, t);
      const c = i % cols;
      const r = (i - c) / cols;
      tc1 = Math.min(tc1, c);
      tc2 = Math.max(tc2, c);
      tr1 = Math.min(tr1, r);
      tr2 = Math.max(tr2, r);
    }
    if (goal.size === 0) return null;
    const h = (i: number): number => {
      const c = i % cols;
      const r = (i - c) / cols;
      return Math.max(0, tc1 - c, c - tc2) + Math.max(0, tr1 - r, r - tr2);
    };
    const arrive = new Map<number, number | null>();
    for (const [i, p] of goal) arrive.set(i, ro.arriveDir?.(p) ?? null);

    const n = this.cell.length * 4;
    const dist = new Float64Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const heap = new MinHeap();
    const startCol = s % cols;
    const startRow = (s - startCol) / cols;
    const step = (state: number, g: number, prev: number): void => {
      if (g >= dist[state]) return;
      dist[state] = g;
      from[state] = prev;
      heap.push(g + h(state >> 2), state);
    };
    const enter = (i: number, d: number, g: number, prev: number): void => {
      const target = arrive.has(i);
      if (!target && !this.passable(i, d)) return;
      let cost = g + 1 + ((this.cell[i] & NEAR) !== 0 ? NEAR_COST : 0);
      const want = target ? arrive.get(i) : null;
      if (want !== null && want !== undefined && want !== d) cost += BEND;
      step(i * 4 + d, cost, prev);
    };
    for (let d = 0; d < 4; d++) {
      const c = startCol + DX[d];
      const r = startRow + DY[d];
      if (c < 0 || r < 0 || c >= cols || r >= this.rows) continue;
      const pref = ro.startDir ?? null;
      enter(r * cols + c, d, pref === null || pref === d ? 0 : BEND, -1 - s);
    }
    let visits = 0;
    while (heap.size > 0) {
      const [f, state] = heap.pop();
      const i = state >> 2;
      const d = state & 3;
      const g = dist[state];
      if (f - h(i) > g) continue;
      if (arrive.has(i)) return this.trace(state, from, goal.get(i) ?? start);
      if (++visits > MAX_VISITS) return null;
      const c = i % cols;
      const r = (i - c) / cols;
      // no bend where the route crosses a wire
      const canTurn = (this.cell[i] & (HWIRE | VWIRE)) === 0;
      for (let nd = 0; nd < 4; nd++) {
        if (nd === (d + 2) % 4) continue;
        if (nd !== d && !canTurn) continue;
        const nc = c + DX[nd];
        const nr = r + DY[nd];
        if (nc < 0 || nr < 0 || nc >= cols || nr >= this.rows) continue;
        enter(nr * cols + nc, nd, g + (nd === d ? 0 : BEND), state);
      }
    }
    return null;
  }

  /** May a route pass through cell i heading d (it is not one of the ends)? */
  private passable(i: number, d: number): boolean {
    const v = this.cell[i];
    if ((v & (BODY | NODE)) !== 0) return false;
    // (NEAR only costs more)
    return (v & (d === LEFT || d === RIGHT ? HWIRE : VWIRE)) === 0;
  }

  private trace(state: number, from: Int32Array, end: Pt): Pt[] {
    const cells: number[] = [];
    let s = state;
    let startCell = -1;
    while (s >= 0) {
      cells.push(s >> 2);
      const p = from[s];
      if (p < 0) startCell = -1 - p;
      s = p;
    }
    cells.push(startCell);
    cells.reverse();
    const pt = (i: number): Pt => {
      const c = i % this.cols;
      return { x: this.ox + c * this.gs, y: this.oy + ((i - c) / this.cols) * this.gs };
    };
    const pts = cells.map(pt);
    pts[pts.length - 1] = { x: end.x, y: end.y };
    return corners(pts);
  }
}

/** The ends and bends of a path through neighbouring grid points. */
export function corners(path: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of path) {
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/** The way a wire leaves the post at p of an element with box b, or null if it is inside. */
export function leadDir(p: Pt, b: Rect): number | null {
  if (p.x <= b.x1) return LEFT;
  if (p.x >= b.x2) return RIGHT;
  if (p.y <= b.y1) return UP;
  if (p.y >= b.y2) return DOWN;
  return null;
}

/** The opposite direction. */
export function reverse(d: number): number {
  return (d + 2) % 4;
}

/** Binary heap of (priority, value). */
class MinHeap {
  private pri: number[] = [];
  private val: number[] = [];

  get size(): number {
    return this.pri.length;
  }

  push(p: number, v: number): void {
    const pri = this.pri;
    const val = this.val;
    let k = pri.length;
    pri.push(p);
    val.push(v);
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (pri[up] <= p) break;
      pri[k] = pri[up];
      val[k] = val[up];
      k = up;
    }
    pri[k] = p;
    val[k] = v;
  }

  pop(): [number, number] {
    const pri = this.pri;
    const val = this.val;
    const top: [number, number] = [pri[0], val[0]];
    const p = pri.pop() as number;
    const v = val.pop() as number;
    const n = pri.length;
    if (n > 0) {
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= n) break;
        if (c + 1 < n && pri[c + 1] < pri[c]) c++;
        if (pri[c] >= p) break;
        pri[k] = pri[c];
        val[k] = val[c];
        k = c;
      }
      pri[k] = p;
      val[k] = v;
    }
    return top;
  }
}
