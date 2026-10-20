// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import {
  RoutedWireElm,
  WireElm,
  constructElement,
  type CircuitElm,
  type Rect,
} from '@perun/elements';

/**
 * Not in upstream: "Tidy up" straightens wires, removes kinks and nudges parts into line, without
 * changing what connects to what. It only ever replaces or removes plain wires and moves or turns
 * parts on the grid; the circuit file format is unchanged.
 *
 * A chain is a run of wires through bare joints (exactly two wire ends, no part's post). Its ends
 * (anchors) are part posts, junctions of three or more wires, or loose ends. Each chain is
 * redrawn as the simplest route between its anchors that is clear of everything else: a straight
 * wire, or an L with one bend. Parts whose posts only meet chains may then move a few grid steps
 * if that lets their wires be simpler. A two-post part drawn at an odd slant is turned to lie
 * along the grid first, and a wire with a loose end (joining nothing, pointing at nothing) goes.
 */

export interface TidyOptions {
  gridSize: number;
  /** An element's hit box (its view's bounding box), or null if it has none. */
  bbox(e: CircuitElm): Rect | null;
  /** Only these elements may change (the selection), or null for the whole circuit. */
  only: ReadonlySet<CircuitElm> | null;
  /** Wires referenced elsewhere (a scope plots them): they stay as they are. */
  keep: ReadonlySet<CircuitElm>;
}

export interface TidyResult {
  /** Plain wires the tidy could change, before and after. */
  wiresBefore: number;
  wiresAfter: number;
  partsMoved: number;
  changed: boolean;
}

interface Pt {
  x: number;
  y: number;
}

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

interface Chain {
  wires: WireElm[];
  flags: number;
  /** The route as drawn now, a polyline from one anchor to the other. */
  route: Pt[];
  changed: boolean;
  removed: boolean;
}

const key = (x: number, y: number): string => `${x},${y}`;
const parseKey = (k: string): Pt => {
  const [x, y] = k.split(',').map(Number);
  return { x: x ?? 0, y: y ?? 0 };
};
const same = (a: Pt, b: Pt): boolean => a.x === b.x && a.y === b.y;

/** Drop joints where the route carries straight on (not where it doubles back). */
function simplify(route: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of route) {
    if (out.length > 0 && same(out[out.length - 1], p)) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x);
      const dot = (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y);
      if (cross === 0 && dot > 0) out[out.length - 1] = p;
      else out.push(p);
    } else out.push(p);
  }
  return out;
}

/** Wires and bends, with a slanted wire counting as four (an L, at three, beats it). */
function cost(route: readonly Pt[]): number {
  let c = 0;
  for (let i = 0; i + 1 < route.length; i++) {
    const a = route[i];
    const b = route[i + 1];
    c += a.x === b.x || a.y === b.y ? 1 : 4;
    if (i > 0) c += 1;
  }
  return c;
}

function segments(route: readonly Pt[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i + 1 < route.length; i++)
    out.push({ ax: route[i].x, ay: route[i].y, bx: route[i + 1].x, by: route[i + 1].y });
  return out;
}

/** Is p on segment s, not at its ends? Exact for any slope. */
function onInterior(s: Seg, p: Pt): boolean {
  if ((p.x === s.ax && p.y === s.ay) || (p.x === s.bx && p.y === s.by)) return false;
  const cross = (s.bx - s.ax) * (p.y - s.ay) - (s.by - s.ay) * (p.x - s.ax);
  if (cross !== 0) return false;
  return (
    p.x >= Math.min(s.ax, s.bx) &&
    p.x <= Math.max(s.ax, s.bx) &&
    p.y >= Math.min(s.ay, s.by) &&
    p.y <= Math.max(s.ay, s.by)
  );
}

/** Do two segments lie on one line and share more than a point? */
function overlaps(s: Seg, t: Seg): boolean {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  if (dx * (t.ay - s.ay) - dy * (t.ax - s.ax) !== 0) return false;
  if (dx * (t.by - s.ay) - dy * (t.bx - s.ax) !== 0) return false;
  // project on the segment's longer axis
  const horiz = Math.abs(dx) >= Math.abs(dy);
  const s1 = horiz ? Math.min(s.ax, s.bx) : Math.min(s.ay, s.by);
  const s2 = horiz ? Math.max(s.ax, s.bx) : Math.max(s.ay, s.by);
  const t1 = horiz ? Math.min(t.ax, t.bx) : Math.min(t.ay, t.by);
  const t2 = horiz ? Math.max(t.ax, t.bx) : Math.max(t.ay, t.by);
  return Math.min(s2, t2) - Math.max(s1, t1) > 0;
}

/** Does the segment pass through the inside of the box (not just along or up to its edge)? */
function crossesBox(s: Seg, b: Rect): boolean {
  // Liang-Barsky against the open box
  let t0 = 0;
  let t1 = 1;
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q > 0;
    const r = q / p;
    if (p < 0) {
      if (r >= t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r <= t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return (
    clip(-dx, s.ax - b.x1) &&
    clip(dx, b.x2 - s.ax) &&
    clip(-dy, s.ay - b.y1) &&
    clip(dy, b.y2 - s.ay) &&
    t1 > t0
  );
}

/** Do the open insides of two boxes overlap? */
function boxesOverlap(a: Rect, b: Rect): boolean {
  return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
}

const shift = (b: Rect, dx: number, dy: number): Rect => ({
  x1: b.x1 + dx,
  y1: b.y1 + dy,
  x2: b.x2 + dx,
  y2: b.y2 + dy,
});

/** Posts of an element. */
function posts(e: CircuitElm): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i !== e.getPostCount(); i++) {
    const p = e.getPost(i);
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/** What a candidate route must stay clear of. */
interface World {
  /** Every point something ends at: posts, and the joints of chains other than the one moving. */
  points: Set<string>;
  pts: Pt[];
  /** Wires other than the ones being routed. */
  segs: Seg[];
  /** Bodies of parts. */
  boxes: Rect[];
  /** The way part leads point out of their posts, by post. */
  leads: Map<string, Pt[]>;
  /** Points where two or more wires meet: only one of them can carry on along a lead. */
  junctions: Set<string>;
}

const dir = (from: Pt, to: Pt): Pt => ({
  x: Math.sign(to.x - from.x),
  y: Math.sign(to.y - from.y),
});

/**
 * Where a part's leads point out of its posts: away from its body, for a post on the edge of its
 * box (a ground's lead points up, an op-amp's inputs left). A wire carrying on that way looks
 * straight; one leaving sideways or along the body makes a visible bend at the part.
 */
function addLeads(leads: Map<string, Pt[]>, ps: readonly Pt[], box: Rect): void {
  for (const p of ps) {
    const ds: Pt[] = [];
    if (p.x === box.x1 && box.x1 < box.x2) ds.push({ x: -1, y: 0 });
    if (p.x === box.x2 && box.x1 < box.x2) ds.push({ x: 1, y: 0 });
    if (p.y === box.y1 && box.y1 < box.y2) ds.push({ x: 0, y: -1 });
    if (p.y === box.y2 && box.y1 < box.y2) ds.push({ x: 0, y: 1 });
    if (ds.length === 0) continue;
    const k = key(p.x, p.y);
    const list = leads.get(k);
    if (list) list.push(...ds);
    else leads.set(k, ds);
  }
}

/** A route's wires and bends, plus a bend for each end that meets a part's lead sideways. */
function routeCost(route: readonly Pt[], w: World): number {
  let c = cost(route);
  const n = route.length;
  for (const [p, q] of [
    [route[0], route[1]],
    [route[n - 1], route[n - 2]],
  ] as const) {
    if (p === undefined || q === undefined) continue;
    const k = key(p.x, p.y);
    const ds = w.junctions.has(k) ? undefined : w.leads.get(k);
    const d = dir(p, q);
    if (ds !== undefined && !ds.some((x) => x.x === d.x && x.y === d.y)) c++;
  }
  return c;
}

function routeClear(route: readonly Pt[], w: World): boolean {
  const segs = segments(route);
  // a new bend must not land on something: it would connect there
  for (let i = 1; i + 1 < route.length; i++) {
    const p = route[i];
    if (w.points.has(key(p.x, p.y))) return false;
    for (const t of w.segs) if (onInterior(t, p)) return false;
  }
  for (const s of segs) {
    for (const t of w.segs) if (overlaps(s, t)) return false;
    for (const b of w.boxes) if (crossesBox(s, b)) return false;
  }
  // nothing may sit on a wire's middle (it would look connected but isn't)
  for (const p of w.pts) for (const s of segs) if (onInterior(s, p)) return false;
  return true;
}

/**
 * The simplest clear route from a to b: straight, or an L. Between two equally simple Ls, the
 * one whose first leg runs the way the current route starts.
 */
function bestRoute(a: Pt, b: Pt, current: readonly Pt[], w: World): Pt[] | null {
  if (same(a, b)) return null;
  if (a.x === b.x || a.y === b.y) {
    const r = [a, b];
    return routeClear(r, w) ? r : null;
  }
  const horizFirst = current.length < 2 || current[1].y === current[0].y;
  const h = [a, { x: b.x, y: a.y }, b];
  const v = [a, { x: a.x, y: b.y }, b];
  let best: Pt[] | null = null;
  for (const r of horizFirst ? [h, v] : [v, h])
    if (routeClear(r, w) && (best === null || routeCost(r, w) < routeCost(best, w))) best = r;
  return best;
}

export function tidy(elements: CircuitElm[], o: TidyOptions): TidyResult {
  const mayChange = (e: CircuitElm): boolean => o.only === null || o.only.has(e);
  const isFree = (e: CircuitElm): e is WireElm =>
    e instanceof WireElm && !(e instanceof RoutedWireElm) && mayChange(e) && !o.keep.has(e);

  const free = elements.filter(isFree);
  const wiresBefore = free.length;
  const fixed = elements.filter((e) => !isFree(e) && e.getPostCount() > 0);

  // ---- chains --------------------------------------------------------------------------------

  const fixedPosts = new Map<string, CircuitElm[]>();
  for (const e of fixed)
    for (const p of posts(e)) {
      const k = key(p.x, p.y);
      const list = fixedPosts.get(k);
      if (list) list.push(e);
      else fixedPosts.set(k, [e]);
    }

  const ends = new Map<string, WireElm[]>();
  const zeroLength: WireElm[] = [];
  for (const w of free) {
    if (w.x === w.x2 && w.y === w.y2) {
      zeroLength.push(w);
      continue;
    }
    for (const k of [key(w.x, w.y), key(w.x2, w.y2)]) {
      const list = ends.get(k);
      if (list) list.push(w);
      else ends.set(k, [w]);
    }
  }
  // a wire with a loose end carries nothing and joins nothing: it goes, and so does the next one
  // if that leaves it loose
  const dead = new Set<WireElm>();
  const allSegs: Seg[] = elements
    .filter((e) => e instanceof WireElm && !(e instanceof RoutedWireElm))
    .map((e) => ({ ax: e.x, ay: e.y, bx: e.x2, by: e.y2 }));
  // a wire ending next to a label or another part points at it (a pin drawn out to its name)
  const near: Rect[] = [];
  for (const e of elements) {
    if (e instanceof WireElm) continue;
    const b = o.bbox(e);
    const m = 2 * o.gridSize;
    if (b !== null) near.push({ x1: b.x1 - m, y1: b.y1 - m, x2: b.x2 + m, y2: b.y2 + m });
  }
  const loose = (p: Pt): boolean => {
    const k = key(p.x, p.y);
    if (fixedPosts.has(k) || ends.get(k)?.length !== 1) return false;
    if (near.some((b) => p.x >= b.x1 && p.x <= b.x2 && p.y >= b.y1 && p.y <= b.y2)) return false;
    // an end on another wire's middle looks joined (it isn't): left as drawn
    return !allSegs.some((s) => onInterior(s, p));
  };
  for (let again = true; again;) {
    again = false;
    for (const w of free) {
      if (dead.has(w) || zeroLength.includes(w)) continue;
      if (!loose({ x: w.x, y: w.y }) && !loose({ x: w.x2, y: w.y2 })) continue;
      // a post on its middle (a bad connection) stays as drawn
      const s = { ax: w.x, ay: w.y, bx: w.x2, by: w.y2 };
      if ([...fixedPosts.keys()].some((k) => onInterior(s, parseKey(k)))) continue;
      dead.add(w);
      for (const k of [key(w.x, w.y), key(w.x2, w.y2)]) {
        const list = ends.get(k)?.filter((x) => x !== w) ?? [];
        if (list.length > 0) ends.set(k, list);
        else ends.delete(k);
      }
      again = true;
    }
  }

  const isAnchor = (k: string): boolean => fixedPosts.has(k) || ends.get(k)?.length !== 2;

  const chains: Chain[] = [];
  const seen = new Set<WireElm>();
  for (const start of free) {
    if (seen.has(start) || zeroLength.includes(start) || dead.has(start)) continue;
    // walk to an anchor in each direction
    const walk = (from: Pt, via: WireElm): { pts: Pt[]; wires: WireElm[]; loop: boolean } => {
      const pts: Pt[] = [];
      const wires: WireElm[] = [];
      let w = via;
      let p = from;
      for (;;) {
        const next = p.x === w.x && p.y === w.y ? { x: w.x2, y: w.y2 } : { x: w.x, y: w.y };
        wires.push(w);
        pts.push(next);
        const k = key(next.x, next.y);
        if (isAnchor(k)) return { pts, wires, loop: false };
        const other = ends.get(k)?.find((x) => x !== w);
        if (other === undefined) return { pts, wires, loop: false };
        if (other === start) return { pts, wires, loop: true };
        w = other;
        p = next;
      }
    };
    const fwd = walk({ x: start.x, y: start.y }, start);
    if (fwd.loop) {
      for (const w of fwd.wires) seen.add(w);
      continue;
    }
    const startKey = key(start.x, start.y);
    let back: { pts: Pt[]; wires: WireElm[] } = { pts: [], wires: [] };
    const prev = isAnchor(startKey) ? undefined : ends.get(startKey)?.find((x) => x !== start);
    if (prev !== undefined) back = walk({ x: start.x, y: start.y }, prev);
    const wires = [...back.wires.reverse(), ...fwd.wires];
    const route = [...back.pts.reverse(), { x: start.x, y: start.y }, ...fwd.pts];
    for (const w of wires) seen.add(w);
    chains.push({ wires, flags: wires[0].flags, route, changed: false, removed: false });
  }

  let changed = zeroLength.length > 0 || dead.size > 0;

  // a chain whose wires don't all look the same (current or voltage shown) stays as it is
  const movable = (c: Chain): boolean => c.wires.every((w) => w.flags === c.flags);

  // two chains joining the same two anchors: keep the simpler one
  const byEnds = new Map<string, Chain>();
  for (const c of chains) {
    if (!movable(c)) continue;
    const a = c.route[0];
    const b = c.route[c.route.length - 1];
    if (same(a, b)) continue;
    const ka = key(a.x, a.y);
    const kb = key(b.x, b.y);
    const k = ka < kb ? `${ka};${kb}` : `${kb};${ka}`;
    const prev = byEnds.get(k);
    if (prev === undefined) {
      byEnds.set(k, c);
      continue;
    }
    const drop = cost(simplify(prev.route)) <= cost(simplify(c.route)) ? c : prev;
    drop.removed = true;
    if (drop === prev) byEnds.set(k, c);
    changed = true;
  }
  // a chain that leaves an anchor and comes back to it joins nothing
  for (const c of chains) {
    if (!movable(c) || c.removed) continue;
    if (same(c.route[0], c.route[c.route.length - 1])) {
      c.removed = true;
      changed = true;
    }
  }
  const live = (): Chain[] => chains.filter((c) => !c.removed);

  // straight runs through bare joints become one wire
  for (const c of live()) {
    if (!movable(c)) continue;
    const s = simplify(c.route);
    if (s.length !== c.route.length) {
      c.route = s;
      c.changed = true;
      changed = true;
    }
  }

  // ---- the world a route must keep clear of --------------------------------------------------

  const fixedSegs: Seg[] = [];
  for (const e of fixed)
    if (e instanceof WireElm && !(e instanceof RoutedWireElm))
      fixedSegs.push({ ax: e.x, ay: e.y, bx: e.x2, by: e.y2 });
  const boxOf = new Map<CircuitElm, Rect>();
  for (const e of fixed) {
    if (e instanceof WireElm) continue;
    const b = o.bbox(e);
    if (b !== null) boxOf.set(e, b);
  }

  /**
   * Everything except the given chains and parts. Ghosts keep their posts and leads but not their
   * bodies: parts that share a post with one that's moving, whose boxes may touch it there.
   */
  const world = (
    skip: ReadonlySet<Chain>,
    without: ReadonlySet<CircuitElm>,
    ghosts: ReadonlySet<CircuitElm> = new Set(),
  ): World => {
    const points = new Set<string>();
    const pts: Pt[] = [];
    const add = (p: Pt): void => {
      const k = key(p.x, p.y);
      if (points.has(k)) return;
      points.add(k);
      pts.push(p);
    };
    for (const e of fixed) if (!without.has(e)) for (const p of posts(e)) add(p);
    const segs = [...fixedSegs];
    for (const c of live()) {
      if (skip.has(c)) continue;
      for (const p of c.route) add(p);
      segs.push(...segments(c.route));
    }
    const boxes: Rect[] = [];
    for (const [e, b] of boxOf) if (!without.has(e) && !ghosts.has(e)) boxes.push(b);
    const leads = new Map<string, Pt[]>();
    for (const [e, b] of boxOf) if (!without.has(e)) addLeads(leads, posts(e), b);
    const wireEnds = new Map<string, number>();
    const count = (p: Pt): void => {
      const k = key(p.x, p.y);
      wireEnds.set(k, (wireEnds.get(k) ?? 0) + 1);
    };
    for (const sg of fixedSegs)
      [
        { x: sg.ax, y: sg.ay },
        { x: sg.bx, y: sg.by },
      ].forEach(count);
    for (const c of live()) [c.route[0], c.route[c.route.length - 1]].forEach(count);
    const junctions = new Set([...wireEnds].filter(([, n]) => n >= 2).map(([k]) => k));
    return { points, pts, segs, boxes, leads, junctions };
  };

  // ---- placing parts and junctions somewhere else --------------------------------------------

  const g = o.gridSize;
  const none = new Set<CircuitElm>();

  const reindex = (): void => {
    fixedPosts.clear();
    for (const f of fixed)
      for (const p of posts(f)) {
        const k = key(p.x, p.y);
        const list = fixedPosts.get(k);
        if (list) list.push(f);
        else fixedPosts.set(k, [f]);
      }
  };

  /** The live chains with an end on one of these points. */
  const attachedTo = (psKeys: ReadonlySet<string>): Chain[] =>
    live().filter((c) => {
      const a = c.route[0];
      const b = c.route[c.route.length - 1];
      return psKeys.has(key(a.x, a.y)) || psKeys.has(key(b.x, b.y));
    });

  const chainsCost = (cs: readonly Chain[], w: World): number =>
    cs.reduce((s, c) => s + routeCost(c.route, w), 0);

  /** A part moving: its posts and body where they would go. */
  interface Move {
    e: CircuitElm;
    newPs: Pt[];
    box: Rect;
  }

  /**
   * The routes of the attached chains, and what they cost, if the points in `to` (posts or
   * junctions, by key) went where it says and the parts in `moves` with them; or null if they
   * can't: a moved point would land on something, or a body on another body or a wire.
   */
  const place = (
    moves: readonly Move[],
    to: ReadonlyMap<string, Pt>,
    attached: readonly Chain[],
    base: World,
  ): { routes: Pt[][]; cost: number } | null => {
    const inside = (p: Pt, b: Rect): boolean =>
      p.x > b.x1 && p.x < b.x2 && p.y > b.y1 && p.y < b.y2;
    for (const [k, p] of to) {
      if (key(p.x, p.y) === k) continue;
      if (base.points.has(key(p.x, p.y))) return null;
      if (base.segs.some((s) => onInterior(s, p))) return null;
      if (base.boxes.some((b) => inside(p, b))) return null;
    }
    for (const { box } of moves) {
      if (base.boxes.some((b) => boxesOverlap(box, b))) return null;
      if (base.segs.some((s) => crossesBox(s, box))) return null;
      if (base.pts.some((p) => inside(p, box))) return null;
    }
    const w: World = {
      points: new Set(base.points),
      pts: [...base.pts],
      segs: [...base.segs],
      boxes: [...base.boxes, ...moves.map((m) => m.box)],
      leads: new Map([...base.leads].map(([k, v]) => [k, [...v]])),
      junctions: new Set(base.junctions),
    };
    for (const m of moves) {
      addLeads(w.leads, m.newPs, m.box);
      for (const p of m.newPs) {
        if (w.points.has(key(p.x, p.y))) continue;
        w.points.add(key(p.x, p.y));
        w.pts.push(p);
      }
    }
    for (const [k, p] of to) if (base.junctions.has(k)) w.junctions.add(key(p.x, p.y));
    const mv = (p: Pt): Pt => to.get(key(p.x, p.y)) ?? p;
    // reroute the attached chains one by one
    const routes: Pt[][] = [];
    for (const c of attached) {
      const a = c.route[0];
      const b = c.route[c.route.length - 1];
      let r = bestRoute(mv(a), mv(b), c.route, w);
      // a chain whose ends both stay may keep its route if nothing simpler is clear
      if (same(mv(a), a) && same(mv(b), b) && routeClear(c.route, w))
        if (r === null || routeCost(r, w) >= routeCost(c.route, w)) r = c.route;
      if (r === null) return null;
      routes.push(r);
      w.segs.push(...segments(r));
      for (const p of r) {
        const k = key(p.x, p.y);
        if (w.points.has(k)) continue;
        w.points.add(k);
        w.pts.push(p);
      }
    }
    return { routes, cost: routes.reduce((s, r) => s + routeCost(r, w), 0) };
  };

  const settle = (es: Iterable<CircuitElm>, attached: readonly Chain[], routes: Pt[][]): void => {
    reindex();
    for (const e of es) {
      const b = o.bbox(e);
      if (b !== null) boxOf.set(e, b);
    }
    attached.forEach((c, i) => {
      c.route = routes[i];
      c.changed = true;
    });
    changed = true;
  };

  /**
   * The parts joined post to post with the one at `k` (not `e`), which would move with it: null
   * if that can't be, because one is a wire that stays, mustn't change, or leads back to `e`.
   */
  const unitAt = (k: string, e: CircuitElm): Set<CircuitElm> | null => {
    const unit = new Set<CircuitElm>();
    const todo = [k];
    const seenKeys = new Set(todo);
    while (todo.length > 0) {
      const at = todo.pop() ?? '';
      for (const f of fixedPosts.get(at) ?? []) {
        if (f === e) {
          if (at === k) continue;
          return null;
        }
        if (unit.has(f)) continue;
        if (f instanceof WireElm || !mayChange(f) || !boxOf.has(f)) return null;
        unit.add(f);
        if (unit.size > 12) return null;
        for (const p of posts(f)) {
          const pk = key(p.x, p.y);
          if (!seenKeys.has(pk)) {
            seenKeys.add(pk);
            todo.push(pk);
          }
        }
      }
    }
    return unit;
  };

  // ---- straighten slanted parts ----------------------------------------------------------------

  // A two-post part drawn at an odd slant turns to lie along the grid, about where it was, and its
  // wires follow; parts joined straight onto a post that moves (another part, a label) go along.
  // One at exactly 45 degrees is left alone: that's how bridges are drawn.
  const moved = new Set<CircuitElm>();
  for (const e of fixed) {
    const box = boxOf.get(e);
    if (e instanceof WireElm || !mayChange(e) || box === undefined || e.getPostCount() !== 2)
      continue;
    const ps = posts(e);
    const [p0, p1] = ps;
    if (p0.x !== e.x || p0.y !== e.y || p1.x !== e.x2 || p1.y !== e.y2) continue;
    const dx = e.x2 - e.x;
    const dy = e.y2 - e.y;
    if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) continue;
    const len = Math.max(g, Math.round(Math.hypot(dx, dy) / g) * g);
    const lens = [
      ...new Set([len, Math.max(g, Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / g) * g)]),
    ];
    const down = (v: number): number => Math.floor(v / g) * g;
    const up = (v: number): number => Math.ceil(v / g) * g;
    const cx = (e.x + e.x2) / 2;
    const cy = (e.y + e.y2) / 2;
    const own = attachedTo(new Set(ps.map((p) => key(p.x, p.y))));
    const old = [e.x, e.y, e.x2, e.y2] as const;
    const set = (q: readonly number[]): void => {
      [e.x, e.y, e.x2, e.y2] = q as [number, number, number, number];
      e.setPoints();
    };
    let best: {
      q: number[];
      units: { unit: Set<CircuitElm>; d: Pt }[];
      attached: Chain[];
      routes: Pt[][];
      gain: number;
      shift: number;
    } | null = null;
    for (const axis of Math.abs(dy) > Math.abs(dx) ? ['v', 'h'] : ['h', 'v']) {
      const h = axis === 'h';
      const u = h ? Math.sign(dx) : Math.sign(dy);
      // in line with either post, the middle, or where its wires lead
      const acrossAt = new Set([
        h ? p0.y : p0.x,
        h ? p1.y : p1.x,
        down(h ? cy : cx),
        up(h ? cy : cx),
      ]);
      for (const c of own)
        for (const p of [c.route[0], c.route[c.route.length - 1]]) acrossAt.add(h ? p.y : p.x);
      const tries = new Map<string, number[]>();
      for (const l of lens) {
        const mid = (h ? cx : cy) - (u * l) / 2;
        // one post stays where it runs along, or the part turns about its middle
        for (const s of new Set([h ? p0.x : p0.y, (h ? p1.x : p1.y) - u * l, down(mid), up(mid)]))
          for (const a of acrossAt) {
            const q = h ? [s, a, s + u * l, a] : [a, s, a, s + u * l];
            tries.set(q.join(','), q);
          }
      }
      for (const q of tries.values()) {
        const newPs = [
          { x: q[0], y: q[1] },
          { x: q[2], y: q[3] },
        ];
        // parts on a post that moves go with it
        const units: { unit: Set<CircuitElm>; d: Pt }[] = [];
        const ghosts = new Set<CircuitElm>();
        let ok = true;
        ps.forEach((p, i) => {
          const k = key(p.x, p.y);
          const others = (fixedPosts.get(k) ?? []).filter((x) => x !== e);
          if (same(p, newPs[i])) {
            for (const f of others) ghosts.add(f);
            return;
          }
          if (others.length === 0) return;
          const unit = unitAt(k, e);
          if (unit === null) ok = false;
          else units.push({ unit, d: { x: newPs[i].x - p.x, y: newPs[i].y - p.y } });
        });
        if (!ok) continue;
        const without = new Set<CircuitElm>([e]);
        for (const { unit } of units) for (const f of unit) without.add(f);
        if (without.size !== 1 + units.reduce((s, x) => s + x.unit.size, 0)) continue;
        const to = new Map<string, Pt>();
        ps.forEach((p, i) => to.set(key(p.x, p.y), newPs[i]));
        set(q);
        const myBox = o.bbox(e);
        set(old);
        if (myBox === null) continue;
        const moves: Move[] = [{ e, newPs, box: myBox }];
        let shiftBy = ps.reduce((s, p, i) => s + Math.hypot(p.x - newPs[i].x, p.y - newPs[i].y), 0);
        for (const { unit, d } of units)
          for (const f of unit) {
            const fPs = posts(f);
            const fNew = fPs.map((p) => ({ x: p.x + d.x, y: p.y + d.y }));
            fPs.forEach((p, i) => to.set(key(p.x, p.y), fNew[i]));
            moves.push({ e: f, newPs: fNew, box: shift(boxOf.get(f) as Rect, d.x, d.y) });
            shiftBy += fPs.length * Math.hypot(d.x, d.y);
          }
        const attached = attachedTo(new Set(to.keys()));
        if (!attached.every(movable)) continue;
        const before = chainsCost(attached, world(new Set(attached), none));
        const placed = place(moves, to, attached, world(new Set(attached), without, ghosts));
        if (placed === null) continue;
        const gain = before - placed.cost;
        if (best === null || gain > best.gain || (gain === best.gain && shiftBy < best.shift))
          best = { q, units, attached, routes: placed.routes, gain, shift: shiftBy };
      }
      if (best !== null) break;
    }
    if (best === null) continue;
    set(best.q);
    const all = new Set<CircuitElm>([e]);
    for (const { unit, d } of best.units)
      for (const f of unit) {
        f.move(d.x, d.y);
        all.add(f);
      }
    settle(all, best.attached, best.routes);
    for (const f of all) moved.add(f);
  }

  // ---- reroute each chain --------------------------------------------------------------------

  for (const c of live()) {
    if (!movable(c)) continue;
    const a = c.route[0];
    const b = c.route[c.route.length - 1];
    const w = world(new Set([c]), none);
    const r = bestRoute(a, b, c.route, w);
    if (r !== null && routeCost(r, w) < routeCost(c.route, w)) {
      c.route = r;
      c.changed = true;
      changed = true;
    }
  }

  // ---- slide junctions -----------------------------------------------------------------------

  // A junction of wires (no part's post) may slide so a wire leaving it runs straight: a T whose
  // leg comes in with a jog moves along its bar to meet it.
  for (let round = 0; round < 100; round++) {
    let pick: { attached: Chain[]; routes: Pt[][]; gain: number } | null = null;
    const ends = new Map<string, number>();
    for (const c of live())
      for (const p of [c.route[0], c.route[c.route.length - 1]])
        ends.set(key(p.x, p.y), (ends.get(key(p.x, p.y)) ?? 0) + 1);
    for (const [k, n] of ends) {
      if (n < 3 || fixedPosts.has(k)) continue;
      const attached = attachedTo(new Set([k]));
      if (!attached.every(movable)) continue;
      const j = parseKey(k);
      const base = world(new Set(attached), none);
      const before = chainsCost(attached, base);
      const tries = new Map<string, Pt>();
      for (const c of attached) {
        const far = same(c.route[0], j) ? c.route[c.route.length - 1] : c.route[0];
        for (const p of [
          { x: far.x, y: j.y },
          { x: j.x, y: far.y },
        ])
          if (!same(p, j)) tries.set(key(p.x, p.y), p);
      }
      for (const p of tries.values()) {
        const placed = place([], new Map([[k, p]]), attached, base);
        if (placed === null) continue;
        const gain = before - placed.cost;
        if (gain > 0 && (pick === null || gain > pick.gain))
          pick = { attached, routes: placed.routes, gain };
      }
    }
    if (pick === null) break;
    settle([], pick.attached, pick.routes);
  }

  // ---- nudge parts into line -----------------------------------------------------------------

  const steps: [number, number][] = [];
  // up to two grid steps each way, nearest first, so the smallest move wins a tie
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++) if (i || j) steps.push([i * g, j * g]);
  steps.sort((p, q) => Math.abs(p[0]) + Math.abs(p[1]) - Math.abs(q[0]) - Math.abs(q[1]));

  // each round makes the one move that helps most, so a part in the middle moves rather than
  // everything around it
  for (let round = 0; round < 100; round++) {
    let pick: {
      e: CircuitElm;
      attached: Chain[];
      dx: number;
      dy: number;
      routes: Pt[][];
      gain: number;
    } | null = null;
    for (const e of fixed) {
      const box = boxOf.get(e);
      if (e instanceof WireElm || !mayChange(e) || box === undefined) continue;
      const ps = posts(e);
      // a post shared with another part or a wire that stays put: moving would break it
      if (ps.some((p) => (fixedPosts.get(key(p.x, p.y)) ?? []).some((x) => x !== e))) continue;
      const attached = attachedTo(new Set(ps.map((p) => key(p.x, p.y))));
      if (attached.length === 0 || !attached.every(movable)) continue;
      const before = chainsCost(attached, world(new Set(attached), none));
      const base = world(new Set(attached), new Set([e]));
      let best: { dx: number; dy: number; routes: Pt[][]; gain: number } | null = null;
      for (const [dx, dy] of steps) {
        const newPs = ps.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        const to = new Map(ps.map((p, i) => [key(p.x, p.y), newPs[i]] as const));
        const placed = place([{ e, newPs, box: shift(box, dx, dy) }], to, attached, base);
        if (placed === null) continue;
        const gain = before - placed.cost;
        if (gain > 0 && (best === null || gain > best.gain))
          best = { dx, dy, routes: placed.routes, gain };
      }
      if (best !== null && (pick === null || best.gain > pick.gain))
        pick = { e, attached, ...best };
    }
    if (pick === null) break;
    pick.e.move(pick.dx, pick.dy);
    settle([pick.e], pick.attached, pick.routes);
    moved.add(pick.e);
  }
  const partsMoved = moved.size;

  // ---- write the wires back ------------------------------------------------------------------

  const chainOf = new Map<WireElm, Chain>();
  for (const c of chains) if (c.changed || c.removed) for (const w of c.wires) chainOf.set(w, c);
  const doomed = new Set<CircuitElm>([...zeroLength, ...dead]);
  const out: CircuitElm[] = [];
  const written = new Set<Chain>();
  for (const e of elements) {
    if (doomed.has(e)) continue;
    const c = e instanceof WireElm ? chainOf.get(e) : undefined;
    if (c === undefined) {
      out.push(e);
      continue;
    }
    if (written.has(c) || c.removed) continue;
    written.add(c);
    const proto = c.wires[0];
    for (const s of segments(c.route)) {
      const w = constructElement('WireElm', s.ax, s.ay, proto.sim);
      if (!(w instanceof WireElm)) continue;
      w.x2 = s.bx;
      w.y2 = s.by;
      w.flags = c.flags;
      w.selected = proto.selected;
      w.setPoints();
      out.push(w);
    }
  }
  elements.length = 0;
  elements.push(...out);
  const wiresAfter = elements.filter(isFree).length;
  return { wiresBefore, wiresAfter, partsMoved, changed };
}

/**
 * What connects to what: for each post of each element that isn't a wire, which net it is on,
 * plus the posts sitting on a wire's middle (a bad connection). Equal strings, same circuit.
 */
export function connectivity(elements: readonly CircuitElm[]): string {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    for (let up = parent.get(r); up !== undefined && up !== r; up = parent.get(r)) r = up;
    parent.set(k, r);
    return r;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const wires = elements.filter((e): e is WireElm => e instanceof WireElm);
  for (const w of wires) {
    const p0 = w.getPost(0);
    const p1 = w.getPost(1);
    union(key(p0.x, p0.y), key(p1.x, p1.y));
  }
  const ids = new Map<string, number>();
  const nets: number[] = [];
  let bad = 0;
  const straight = wires
    .filter((w) => !(w instanceof RoutedWireElm))
    .map((w) => ({ ax: w.x, ay: w.y, bx: w.x2, by: w.y2 }));
  for (const e of elements) {
    if (e instanceof WireElm) continue;
    for (const p of posts(e)) {
      const r = find(key(p.x, p.y));
      let id = ids.get(r);
      if (id === undefined) {
        id = ids.size;
        ids.set(r, id);
      }
      nets.push(id);
      for (const s of straight) if (onInterior(s, p)) bad++;
    }
  }
  return `${nets.join(',')}|${bad}`;
}
