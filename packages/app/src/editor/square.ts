// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { RoutedWireElm, WireElm, type CircuitElm, type Rect } from '@perun/elements';

/**
 * Not in upstream: the first step of "Tidy up". It squares a circuit into rows and columns while
 * keeping its layout: every plain wire and two-post part becomes level or upright by lining its two
 * ends up, and every point stays as near as it can to where it was.
 *
 * The points are the posts of parts and the ends of wires. A level wire or part ties its two ends
 * to one row, an upright one to one column, and a part with fixed geometry (a transistor, a chip,
 * a ground, a part drawn at exactly 45 degrees, which is how bridges are drawn) ties its posts
 * together at their present offsets. Each row and column then goes to the grid line nearest the
 * average of its points. Rows and columns keep their order, and parts keep at least their length,
 * so if one has to move it pushes the ones after it along rather than through them.
 *
 * Wires between points form runs (through bends where just two wires meet). A run that is nearly
 * level or upright becomes one straight wire. One that slants a long way, or at exactly 45 degrees
 * (two wires crossing over as an X), keeps its corners and only its ends move; tidy.ts reroutes it
 * afterwards. A run out to a loose end keeps its shape and moves with the point it leaves.
 *
 * Whatever this would make touch that didn't touch before (two points on one spot, a point on a
 * wire's middle, wires lying on each other, a wire through a part, two parts on top of each
 * other) is pulled apart along the direction they were apart in, and the rows and columns are
 * placed again. If that can't be settled, nothing changes here. What connects to what never
 * changes: only part positions and wire ends move, and a connection is two ends on one point.
 */

export interface SquareOptions {
  gridSize: number;
  bbox(e: CircuitElm): Rect | null;
  only: ReadonlySet<CircuitElm> | null;
  keep: ReadonlySet<CircuitElm>;
}

interface Pt {
  x: number;
  y: number;
}

type Axis = 'x' | 'y';

/**
 * A stretchy two-post part, or a run of wire between two points: when tied, its ends share a row
 * (along x) or a column (along y).
 */
interface Link {
  a: number;
  b: number;
  along: Axis;
  min: number;
  /** The part, or null for a run of wire. */
  e: CircuitElm | null;
  wires: WireElm[];
  tied: boolean;
  /** A wire out to a loose end: it keeps its shape and goes where the point it leaves goes. */
  carried?: boolean;
  /** A run's bends, from a to b. */
  route?: Pt[];
}

/** Points that keep their offsets from each other: the posts of a part with fixed geometry. */
interface Rigid {
  e: CircuitElm;
  nodes: number[];
}

/** coord(b) >= coord(a) + gap. */
interface Rule {
  axis: Axis;
  a: number;
  b: number;
  gap: number;
}

/** Union-find with offsets: coord(node) = coord(root) + off(node). */
class Lines {
  parent: number[];
  off: number[];
  pin = new Map<number, number>();
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.off = new Array<number>(n).fill(0);
  }
  find(i: number): number {
    const p = this.parent[i];
    if (p === i) return i;
    const r = this.find(p);
    this.off[i] += this.off[p];
    this.parent[i] = r;
    return r;
  }
  /** Tie b to a so that coord(b) = coord(a) + d; false if that contradicts what's tied already. */
  tie(a: number, b: number, d: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    const shift = this.off[a] + d - this.off[b];
    if (ra === rb) return shift === 0;
    const pa = this.pin.get(ra);
    const pb = this.pin.get(rb);
    if (pa !== undefined && pb !== undefined && pb !== pa + shift) return false;
    this.parent[rb] = ra;
    this.off[rb] = shift;
    if (pa === undefined && pb !== undefined) this.pin.set(ra, pb - shift);
    this.pin.delete(rb);
    return true;
  }
  /** Fix a node where it is. */
  fix(i: number, v: number): boolean {
    const r = this.find(i);
    const want = v - this.off[i];
    const have = this.pin.get(r);
    if (have !== undefined) return have === want;
    this.pin.set(r, want);
    return true;
  }
}

const key = (p: Pt): string => `${p.x},${p.y}`;
const same = (a: Pt, b: Pt): boolean => a.x === b.x && a.y === b.y;

function posts(e: CircuitElm): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i !== e.getPostCount(); i++) {
    const p = e.getPost(i);
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

interface Item {
  nodes: number[];
  /** The span it covers, where it is now and where it was. */
  now: Rect;
  was: Rect;
  /** Its own net (posts of one part are on different nets), or -1 for a part's body. */
  net: number;
  owner: CircuitElm | null;
}

const lo = (r: Rect, a: Axis): number => (a === 'x' ? r.x1 : r.y1);
const hi = (r: Rect, a: Axis): number => (a === 'x' ? r.x2 : r.y2);

function spanOf(ps: readonly Pt[]): Rect {
  return {
    x1: Math.min(...ps.map((p) => p.x)),
    y1: Math.min(...ps.map((p) => p.y)),
    x2: Math.max(...ps.map((p) => p.x)),
    y2: Math.max(...ps.map((p) => p.y)),
  };
}

/** Is p strictly inside segment ab (axis-aligned or not)? */
function inside(a: Pt, b: Pt, p: Pt): boolean {
  if ((p.x === a.x && p.y === a.y) || (p.x === b.x && p.y === b.y)) return false;
  if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) !== 0) return false;
  return (
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}

/** Do two segments lie on one line and share more than a point? */
function overlap(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx * (c.y - a.y) - dy * (c.x - a.x) !== 0) return false;
  if (dx * (d.y - a.y) - dy * (d.x - a.x) !== 0) return false;
  const h = Math.abs(dx) >= Math.abs(dy);
  const s1 = h ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
  const s2 = h ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
  const t1 = h ? Math.min(c.x, d.x) : Math.min(c.y, d.y);
  const t2 = h ? Math.max(c.x, d.x) : Math.max(c.y, d.y);
  return Math.min(s2, t2) - Math.max(s1, t1) > 0;
}

/** Does segment ab pass through the open inside of box r? */
function crosses(a: Pt, b: Pt, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q > 0;
    const t = q / p;
    if (p < 0) {
      if (t >= t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t <= t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, a.x - r.x1) &&
    clip(dx, r.x2 - a.x) &&
    clip(-dy, a.y - r.y1) &&
    clip(dy, r.y2 - a.y) &&
    t1 > t0
  );
}

const boxesOverlap = (a: Rect, b: Rect): boolean =>
  a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

/** Square the circuit up in place. Returns the parts it moved, and whether anything moved. */
export function square(
  elements: readonly CircuitElm[],
  o: SquareOptions,
): { parts: Set<CircuitElm>; changed: boolean } {
  const g = o.gridSize;
  const mayChange = (e: CircuitElm): boolean => o.only === null || o.only.has(e);
  const isFree = (e: CircuitElm): e is WireElm =>
    e instanceof WireElm && !(e instanceof RoutedWireElm) && mayChange(e) && !o.keep.has(e);

  // ---- points --------------------------------------------------------------------------------

  const nodeOf = new Map<string, number>();
  const pts: Pt[] = [];
  const node = (p: Pt): number => {
    const k = key(p);
    let n = nodeOf.get(k);
    if (n === undefined) {
      n = pts.length;
      nodeOf.set(k, n);
      pts.push({ x: p.x, y: p.y });
    }
    return n;
  };

  const links: Link[] = [];
  const rigids: Rigid[] = [];
  const pinned: number[] = [];
  const parts: CircuitElm[] = [];
  const stretchy = new Map<CircuitElm, Link>();

  // wire ends that are only a bend between two wires don't count as points: the wires through
  // them form one run between two points
  const free = elements.filter(isFree).filter((w) => w.x !== w.x2 || w.y !== w.y2);
  const solid = new Set<string>();
  for (const e of elements)
    if (e.getPostCount() > 0 && !isFree(e)) for (const p of posts(e)) solid.add(key(p));
  const ends = new Map<string, WireElm[]>();
  for (const w of free)
    for (const k of [key({ x: w.x, y: w.y }), key({ x: w.x2, y: w.y2 })]) {
      const l = ends.get(k);
      if (l) l.push(w);
      else ends.set(k, [w]);
    }
  const isPoint = (k: string): boolean => solid.has(k) || ends.get(k)?.length !== 2;

  for (const e of elements) {
    if (e instanceof WireElm || e.getPostCount() === 0) continue;
    const ps = posts(e);
    const ns = ps.map(node);
    parts.push(e);
    if (!mayChange(e)) {
      pinned.push(...ns);
      continue;
    }
    const two =
      ps.length === 2 &&
      ps[0].x === e.x &&
      ps[0].y === e.y &&
      ps[1].x === e.x2 &&
      ps[1].y === e.y2 &&
      ns[0] !== ns[1];
    const dx = e.x2 - e.x;
    const dy = e.y2 - e.y;
    if (two && !(dx !== 0 && dy !== 0 && Math.abs(dx) === Math.abs(dy))) {
      const along: Axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      const straight = dx === 0 || dy === 0;
      const len = straight
        ? Math.abs(along === 'x' ? dx : dy)
        : Math.max(g, Math.round(Math.hypot(dx, dy) / g) * g);
      const l: Link = { a: ns[0], b: ns[1], along, min: len, e, wires: [], tied: true };
      links.push(l);
      stretchy.set(e, l);
    } else rigids.push({ e, nodes: ns });
  }
  for (const e of elements)
    if (e instanceof WireElm && !isFree(e)) pinned.push(...posts(e).map(node));

  // runs of wire between points
  const seen = new Set<WireElm>();
  for (const start of free) {
    if (seen.has(start)) continue;
    const walk = (from: Pt, via: WireElm): { end: Pt; wires: WireElm[]; loop: boolean } => {
      const ws: WireElm[] = [];
      let w = via;
      let p = from;
      for (;;) {
        const next = p.x === w.x && p.y === w.y ? { x: w.x2, y: w.y2 } : { x: w.x, y: w.y };
        ws.push(w);
        seen.add(w);
        if (isPoint(key(next))) return { end: next, wires: ws, loop: false };
        const more = ends.get(key(next))?.find((x) => x !== w);
        if (more === undefined || more === start) return { end: next, wires: ws, loop: true };
        w = more;
        p = next;
      }
    };
    const s = { x: start.x, y: start.y };
    const fwd = walk(s, start);
    if (fwd.loop) continue;
    let back = { end: s, wires: [] as WireElm[] };
    if (!isPoint(key(s))) {
      const prev = ends.get(key(s))?.find((x) => x !== start);
      if (prev !== undefined) {
        const r = walk(s, prev);
        if (r.loop) continue;
        back = r;
      }
    }
    const ws = [...back.wires.reverse(), ...fwd.wires];
    // the run's bends, from one end to the other
    const route: Pt[] = [back.end];
    for (const w of ws) {
      const last = route[route.length - 1];
      route.push(last.x === w.x && last.y === w.y ? { x: w.x2, y: w.y2 } : { x: w.x, y: w.y });
    }
    const a = node(back.end);
    const b = node(fwd.end);
    if (a === b) continue;
    const A = pts[a];
    const B = pts[b];
    const dx = Math.abs(B.x - A.x);
    const dy = Math.abs(B.y - A.y);
    const major = Math.max(dx, dy);
    const minor = Math.min(dx, dy);
    // a run to a loose end joins nothing (it goes later, or points at a label): it keeps its
    // shape and follows the point it leaves
    if ([back.end, fwd.end].some((p) => !solid.has(key(p)) && ends.get(key(p))?.length === 1)) {
      ws.forEach((w, i) => {
        const p = route[i];
        const q = route[i + 1];
        const along: Axis = Math.abs(q.x - p.x) >= Math.abs(q.y - p.y) ? 'x' : 'y';
        links.push({
          a: node(p),
          b: node(q),
          along,
          min: 0,
          e: null,
          wires: [w],
          tied: true,
          carried: true,
        });
      });
      continue;
    }
    const slants = ws.some((w) => w.x !== w.x2 && w.y !== w.y2);
    if (slants && minor <= 2 * g && dx !== dy) {
      // nearly level or upright: one wire between its ends (one at 45 degrees is drawn that way,
      // as two wires crossing over are)
      const along: Axis = dx >= dy ? 'x' : 'y';
      links.push({ a, b, along, min: Math.min(g, major), e: null, wires: ws, tied: true });
      continue;
    }
    // one that slants a long way turns a corner later (an L, or a way round)
    if (slants) {
      links.push({
        a,
        b,
        along: dx >= dy ? 'x' : 'y',
        min: 0,
        e: null,
        wires: ws,
        tied: false,
        route,
      });
      continue;
    }
    // a run drawn level and upright keeps its corners: each of its wires stays as it is drawn
    ws.forEach((w, i) => {
      const p = route[i];
      const q = route[i + 1];
      const wdx = Math.abs(q.x - p.x);
      const wdy = Math.abs(q.y - p.y);
      links.push({
        a: node(p),
        b: node(q),
        along: wdx >= wdy ? 'x' : 'y',
        min: Math.min(g, Math.max(wdx, wdy)),
        e: null,
        wires: [w],
        tied: true,
      });
    });
  }
  if (links.length === 0) return { parts: new Set(), changed: false };

  // nets: points joined by wires
  const netParent = pts.map((_, i) => i);
  const net = (i: number): number => {
    let r = i;
    while (netParent[r] !== r) r = netParent[r];
    netParent[i] = r;
    return r;
  };
  for (const l of links) if (l.e === null) netParent[net(l.a)] = net(l.b);
  for (const e of elements)
    if (e instanceof WireElm && !isFree(e)) {
      const [p, q] = posts(e);
      netParent[net(node(p))] = net(node(q));
    }

  // ---- rows and columns ----------------------------------------------------------------------

  const lines: Record<Axis, Lines> = { x: new Lines(pts.length), y: new Lines(pts.length) };
  const coord = (i: number, a: Axis): number => (a === 'x' ? pts[i].x : pts[i].y);
  for (const a of ['x', 'y'] as const) {
    const L = lines[a];
    for (const n of pinned) L.fix(n, coord(n, a));
    for (const r of rigids)
      for (const n of r.nodes.slice(1)) L.tie(r.nodes[0], n, coord(n, a) - coord(r.nodes[0], a));
    for (const l of links) if (l.carried) L.tie(l.a, l.b, coord(l.b, a) - coord(l.a, a));
    // parts before wires: a wire left out becomes an L, a part left out stays slanted
    for (const wire of [false, true])
      for (const l of links)
        if ((l.e === null) === wire && l.tied && !l.carried && l.along !== a) L.tie(l.a, l.b, 0);
  }

  // ---- placing the rows and columns ----------------------------------------------------------

  const rules: Rule[] = [];
  for (const l of links) {
    if (!l.tied || l.carried) continue;
    const [a, b] = coord(l.a, l.along) <= coord(l.b, l.along) ? [l.a, l.b] : [l.b, l.a];
    rules.push({ axis: l.along, a, b, gap: l.min });
  }

  const place = (axis: Axis): Map<number, number> => {
    const L = lines[axis];
    const members = new Map<number, number[]>();
    for (let i = 0; i < pts.length; i++) {
      const r = L.find(i);
      const list = members.get(r);
      if (list) list.push(i);
      else members.set(r, [i]);
    }
    const target = new Map<number, number>();
    const mean = new Map<number, number>();
    const avgOff = new Map<number, number>();
    for (const [r, ms] of members) {
      const m = ms.reduce((s, i) => s + coord(i, axis) - L.off[i], 0) / ms.length;
      mean.set(r, m);
      avgOff.set(r, ms.reduce((s, i) => s + L.off[i], 0) / ms.length);
      const pin = L.pin.get(r);
      const base = coord(r, axis);
      target.set(r, pin ?? base + Math.round((m - base) / g) * g);
    }
    // constraints between lines
    const edges = new Map<number, { to: number; w: number }[]>();
    const add = (ra: number, rb: number, w: number): void => {
      if (ra === rb) return;
      const list = edges.get(ra);
      if (list) list.push({ to: rb, w });
      else edges.set(ra, [{ to: rb, w }]);
    };
    for (const r of rules)
      if (r.axis === axis) add(L.find(r.a), L.find(r.b), L.off[r.a] + r.gap - L.off[r.b]);
    // keep the order they were in
    const was = (r: number): number => (mean.get(r) ?? 0) + (avgOff.get(r) ?? 0);
    const order = [...members.keys()].sort((p, q) => was(p) - was(q));
    for (let i = 0; i + 1 < order.length; i++) {
      const p = order[i];
      const q = order[i + 1];
      if (was(p) < was(q)) add(p, q, (avgOff.get(p) ?? 0) - (avgOff.get(q) ?? 0));
    }
    // longest path, in order of where they were
    const indeg = new Map<number, number>();
    for (const r of members.keys()) indeg.set(r, 0);
    for (const list of edges.values())
      for (const { to } of list) indeg.set(to, (indeg.get(to) ?? 0) + 1);
    const at = new Map<number, number>();
    const bound = new Map<number, number>();
    const left = new Set(members.keys());
    while (left.size > 0) {
      let pick: number | null = null;
      for (const r of left)
        if ((indeg.get(r) ?? 0) === 0 && (pick === null || was(r) < was(pick))) pick = r;
      // a loop of rules: take the leftmost and drop what still points at it
      if (pick === null) for (const r of left) if (pick === null || was(r) < was(pick)) pick = r;
      if (pick === null) break;
      left.delete(pick);
      const t = target.get(pick) ?? 0;
      const pin = L.pin.get(pick);
      const need = bound.get(pick);
      let v = t;
      if (pin !== undefined) v = pin;
      else if (need !== undefined && need > t) v = t + Math.ceil((need - t) / g) * g;
      at.set(pick, v);
      for (const { to, w } of edges.get(pick) ?? []) {
        if (!left.has(to)) continue;
        indeg.set(to, (indeg.get(to) ?? 0) - 1);
        bound.set(to, Math.max(bound.get(to) ?? -Infinity, v + w));
      }
    }
    const out = new Map<number, number>();
    for (let i = 0; i < pts.length; i++) out.set(i, (at.get(L.find(i)) ?? 0) + L.off[i]);
    return out;
  };

  // ---- what touches what ---------------------------------------------------------------------

  const bodies = new Map<CircuitElm, Rect>();
  for (const e of parts) {
    const b = o.bbox(e);
    if (b !== null) bodies.set(e, b);
  }

  /** Where each part's body would be with its posts on these points. */
  const bodyAt = (e: CircuitElm, p: (n: number) => Pt): Rect | null => {
    const b = bodies.get(e);
    if (b === undefined) return null;
    const ps = posts(e);
    const l = stretchy.get(e);
    if (l === undefined) {
      const n0 = nodeOf.get(key(ps[0]));
      if (n0 === undefined) return b;
      const q = p(n0);
      const dx = q.x - ps[0].x;
      const dy = q.y - ps[0].y;
      return { x1: b.x1 + dx, y1: b.y1 + dy, x2: b.x2 + dx, y2: b.y2 + dy };
    }
    const old = [e.x, e.y, e.x2, e.y2] as const;
    const a = p(l.a);
    const c = p(l.b);
    [e.x, e.y, e.x2, e.y2] = [a.x, a.y, c.x, c.y];
    e.setPoints();
    const nb = o.bbox(e);
    [e.x, e.y, e.x2, e.y2] = old;
    e.setPoints();
    return nb;
  };

  const items = (p: (n: number) => Pt, was: boolean): Item[] => {
    const out: Item[] = [];
    pts.forEach((_, i) => {
      const q = p(i);
      out.push({
        nodes: [i],
        now: { x1: q.x, y1: q.y, x2: q.x, y2: q.y },
        was: spanOf([pts[i]]),
        net: net(i),
        owner: null,
      });
    });
    for (const l of links)
      out.push({
        nodes: [l.a, l.b],
        now: spanOf([p(l.a), p(l.b)]),
        was: spanOf([pts[l.a], pts[l.b]]),
        net: l.e === null ? net(l.a) : -1,
        owner: l.e,
      });
    for (const e of parts) {
      const now = was ? (bodies.get(e) ?? null) : bodyAt(e, p);
      const old = bodies.get(e);
      if (now === null || old === undefined) continue;
      const ns = posts(e)
        .map((q) => nodeOf.get(key(q)))
        .filter((n): n is number => n !== undefined);
      out.push({ nodes: ns, now, was: old, net: -2, owner: e });
    }
    return out;
  };

  /** Pairs of things that touch where they mustn't, as `i:j` keys into the item list. */
  const clashes = (list: readonly Item[], p: (n: number) => Pt): Set<string> => {
    const out = new Set<string>();
    const pointN = pts.length;
    const linkN = links.length;
    const shares = (i: number, j: number): boolean =>
      list[i].nodes.some((n) => list[j].nodes.includes(n));
    // two points on one spot, from different nets
    const spot = new Map<string, number[]>();
    for (let i = 0; i < pointN; i++) {
      const k = key(p(i));
      const l = spot.get(k);
      if (l) l.push(i);
      else spot.set(k, [i]);
    }
    for (const l of spot.values())
      for (let i = 0; i < l.length; i++)
        for (let j = i + 1; j < l.length; j++)
          if (net(l[i]) !== net(l[j])) out.add(`${l[i]}:${l[j]}`);
    for (let j = pointN; j < pointN + linkN; j++) {
      const lk = links[j - pointN];
      // a run that turns a corner gets its route later
      if (!lk.tied) continue;
      const a = p(lk.a);
      const b = p(lk.b);
      // a point on the middle of a wire or part
      for (let i = 0; i < pointN; i++) if (inside(a, b, p(i))) out.add(`${i}:${j}`);
      // lying on another wire or part
      for (let k = j + 1; k < pointN + linkN; k++) {
        const lk2 = links[k - pointN];
        if (!lk2.tied || (lk.e === null && lk2.e === null && net(lk.a) === net(lk2.a))) continue;
        if (overlap(a, b, p(lk2.a), p(lk2.b))) out.add(`${j}:${k}`);
      }
      // a wire through a part's body
      if (lk.e === null)
        for (let k = pointN + linkN; k < list.length; k++)
          if (crosses(a, b, list[k].now)) out.add(`${j}:${k}`);
    }
    // parts on top of each other
    for (let i = pointN + linkN; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (!shares(i, j) && boxesOverlap(list[i].now, list[j].now)) out.add(`${i}:${j}`);
    return out;
  };

  const orig = (n: number): Pt => pts[n];
  const before = clashes(items(orig, true), orig);

  // ---- place, then pull apart what clashes, and place again -----------------------------------

  let pos: Map<number, number>[] = [];
  const now = (n: number): Pt => ({ x: pos[0].get(n) ?? 0, y: pos[1].get(n) ?? 0 });
  const tried = new Set<string>();
  let settled = false;
  for (let round = 0; round < 40; round++) {
    pos = [place('x'), place('y')];
    const list = items(now, false);
    const found = [...clashes(list, now)].filter((c) => !before.has(c));
    if (found.length === 0) {
      settled = true;
      break;
    }
    let added = false;
    for (const c of found) {
      if (tried.has(c)) continue;
      tried.add(c);
      const [i, j] = c.split(':').map(Number);
      const A = list[i];
      const B = list[j];
      // the way they were apart, and by how much
      let best: { axis: Axis; low: Item; high: Item; gap: number } | null = null;
      for (const axis of ['x', 'y'] as const)
        for (const [low, high] of [
          [A, B],
          [B, A],
        ] as const) {
          const gap = lo(high.was, axis) - hi(low.was, axis);
          if (gap > 0 && (best === null || gap > best.gap)) best = { axis, low, high, gap };
        }
      if (best === null) continue;
      const { axis, low, high } = best;
      // the point of `low` furthest along, and of `high` furthest back
      const p = (n: number): number => (axis === 'x' ? now(n).x : now(n).y);
      const a = low.nodes.reduce((m, n) => (p(n) > p(m) ? n : m), low.nodes[0]);
      const b = high.nodes.reduce((m, n) => (p(n) < p(m) ? n : m), high.nodes[0]);
      const reach = hi(low.now, axis) - p(a) + (p(b) - lo(high.now, axis));
      const pointy = low.owner === null || high.owner === null || low.net >= 0 || high.net >= 0;
      rules.push({ axis, a, b, gap: Math.ceil((reach + (pointy ? g : 0)) / g) * g || g });
      added = true;
    }
    if (!added) break;
  }
  if (!settled) return { parts: new Set(), changed: false };

  // ---- move ----------------------------------------------------------------------------------

  let moved = false;
  const movedParts = new Set<CircuitElm>();
  for (const e of parts) {
    if (!mayChange(e)) continue;
    const l = stretchy.get(e);
    if (l !== undefined) {
      const a = now(l.a);
      const b = now(l.b);
      if (a.x === e.x && a.y === e.y && b.x === e.x2 && b.y === e.y2) continue;
      [e.x, e.y, e.x2, e.y2] = [a.x, a.y, b.x, b.y];
      e.setPoints();
      movedParts.add(e);
      moved = true;
      continue;
    }
    const ps = posts(e);
    const n0 = nodeOf.get(key(ps[0]));
    if (n0 === undefined) continue;
    const q = now(n0);
    const dx = q.x - ps[0].x;
    const dy = q.y - ps[0].y;
    if (dx === 0 && dy === 0) continue;
    e.move(dx, dy);
    movedParts.add(e);
    moved = true;
  }
  // a run lined up whose ends moved becomes one wire between them, the rest of its wires shrinking
  // to nothing; one that slants a long way keeps its corners and only its ends move (both are
  // tidied later into a straight wire, an L or a route round parts)
  for (const l of links) {
    if (l.e !== null) continue;
    const p = now(l.a);
    const q = now(l.b);
    if (same(p, pts[l.a]) && same(q, pts[l.b])) continue;
    const r = l.tied || l.route === undefined ? [p, ...l.wires.map(() => q)] : [...l.route];
    r[0] = p;
    r[r.length - 1] = q;
    l.wires.forEach((w, i) => {
      [w.x, w.y, w.x2, w.y2] = [r[i].x, r[i].y, r[i + 1].x, r[i + 1].y];
      w.setPoints();
    });
    moved = true;
  }
  return { parts: movedParts, changed: moved };
}
