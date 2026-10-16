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
 * changing what connects to what. It only ever replaces plain wires (with plain wires) and moves
 * parts by whole grid steps; the circuit file format is unchanged.
 *
 * A chain is a run of wires through bare joints (exactly two wire ends, no part's post). Its ends
 * (anchors) are part posts, junctions of three or more wires, or loose ends. Each chain is
 * redrawn as the simplest route between its anchors that is clear of everything else: a straight
 * wire, or an L with one bend. Parts whose posts only meet chains may then move a few grid steps
 * if that lets their wires be simpler.
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
function addLeads(leads: Map<string, Pt[]>, e: CircuitElm, box: Rect, dx = 0, dy = 0): void {
  for (const p of posts(e)) {
    const ds: Pt[] = [];
    if (p.x === box.x1 && box.x1 < box.x2) ds.push({ x: -1, y: 0 });
    if (p.x === box.x2 && box.x1 < box.x2) ds.push({ x: 1, y: 0 });
    if (p.y === box.y1 && box.y1 < box.y2) ds.push({ x: 0, y: -1 });
    if (p.y === box.y2 && box.y1 < box.y2) ds.push({ x: 0, y: 1 });
    if (ds.length === 0) continue;
    const k = key(p.x + dx, p.y + dy);
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
  const isAnchor = (k: string): boolean => fixedPosts.has(k) || ends.get(k)?.length !== 2;

  const chains: Chain[] = [];
  const seen = new Set<WireElm>();
  for (const start of free) {
    if (seen.has(start) || zeroLength.includes(start)) continue;
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

  let changed = zeroLength.length > 0;

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

  /** Everything except the given chains and part. */
  const world = (skip: ReadonlySet<Chain>, without: CircuitElm | null): World => {
    const points = new Set<string>();
    const pts: Pt[] = [];
    const add = (p: Pt): void => {
      const k = key(p.x, p.y);
      if (points.has(k)) return;
      points.add(k);
      pts.push(p);
    };
    for (const e of fixed) if (e !== without) for (const p of posts(e)) add(p);
    const segs = [...fixedSegs];
    for (const c of live()) {
      if (skip.has(c)) continue;
      for (const p of c.route) add(p);
      segs.push(...segments(c.route));
    }
    const boxes: Rect[] = [];
    for (const [e, b] of boxOf) if (e !== without) boxes.push(b);
    const leads = new Map<string, Pt[]>();
    for (const [e, b] of boxOf) if (e !== without) addLeads(leads, e, b);
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

  // ---- reroute each chain --------------------------------------------------------------------

  for (const c of live()) {
    if (!movable(c)) continue;
    const a = c.route[0];
    const b = c.route[c.route.length - 1];
    const w = world(new Set([c]), null);
    const r = bestRoute(a, b, c.route, w);
    if (r !== null && routeCost(r, w) < routeCost(c.route, w)) {
      c.route = r;
      c.changed = true;
      changed = true;
    }
  }

  // ---- nudge parts into line -----------------------------------------------------------------

  const moved = new Set<CircuitElm>();
  const g = o.gridSize;
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
      box: Rect;
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
      const psKeys = new Set(ps.map((p) => key(p.x, p.y)));
      // a post shared with another part or a wire that stays put: moving would break it
      if (ps.some((p) => (fixedPosts.get(key(p.x, p.y)) ?? []).some((x) => x !== e))) continue;
      const attached = live().filter((c) => {
        const a = c.route[0];
        const b = c.route[c.route.length - 1];
        return psKeys.has(key(a.x, a.y)) || psKeys.has(key(b.x, b.y));
      });
      if (attached.length === 0 || !attached.every(movable)) continue;
      const now = world(new Set(attached), null);
      const before = attached.reduce((s, c) => s + routeCost(c.route, now), 0);
      const base = world(new Set(attached), e);
      let best: { dx: number; dy: number; routes: Pt[][]; gain: number } | null = null;
      for (const [dx, dy] of steps) {
        const newPs = ps.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        // the moved posts must land on nothing, and the body on no other body or wire
        if (newPs.some((p) => base.points.has(key(p.x, p.y)))) continue;
        if (newPs.some((p) => base.segs.some((s) => onInterior(s, p)))) continue;
        const myBox = shift(box, dx, dy);
        if (base.boxes.some((b) => boxesOverlap(myBox, b))) continue;
        if (base.segs.some((s) => crossesBox(s, myBox))) continue;
        if (
          base.pts.some((p) => p.x > myBox.x1 && p.x < myBox.x2 && p.y > myBox.y1 && p.y < myBox.y2)
        )
          continue;
        const w: World = {
          points: new Set(base.points),
          pts: [...base.pts],
          segs: [...base.segs],
          boxes: [...base.boxes, myBox],
          leads: new Map([...base.leads].map(([k, v]) => [k, [...v]])),
          junctions: new Set(base.junctions),
        };
        addLeads(w.leads, e, box, dx, dy);
        for (const p of ps)
          if (base.junctions.has(key(p.x, p.y))) w.junctions.add(key(p.x + dx, p.y + dy));
        for (const p of newPs) {
          w.points.add(key(p.x, p.y));
          w.pts.push(p);
        }
        // reroute the attached chains one by one
        const routes: Pt[][] = [];
        let ok = true;
        const mv = (p: Pt): Pt => (psKeys.has(key(p.x, p.y)) ? { x: p.x + dx, y: p.y + dy } : p);
        for (const c of attached) {
          const r = bestRoute(mv(c.route[0]), mv(c.route[c.route.length - 1]), c.route, w);
          if (r === null) {
            ok = false;
            break;
          }
          routes.push(r);
          w.segs.push(...segments(r));
          for (const p of r) {
            const k = key(p.x, p.y);
            if (w.points.has(k)) continue;
            w.points.add(k);
            w.pts.push(p);
          }
        }
        if (!ok) continue;
        const gain = before - routes.reduce((s, r) => s + routeCost(r, w), 0);
        if (gain > 0 && (best === null || gain > best.gain)) best = { dx, dy, routes, gain };
      }
      if (best !== null && (pick === null || best.gain > pick.gain))
        pick = { e, box, attached, ...best };
    }
    if (pick === null) break;
    {
      const { e, attached } = pick;
      const best = pick;
      e.move(best.dx, best.dy);
      fixedPosts.clear();
      for (const f of fixed)
        for (const p of posts(f)) {
          const k = key(p.x, p.y);
          const list = fixedPosts.get(k);
          if (list) list.push(f);
          else fixedPosts.set(k, [f]);
        }
      boxOf.set(e, shift(pick.box, best.dx, best.dy));
      attached.forEach((c, i) => {
        c.route = best.routes[i];
        c.changed = true;
      });
      moved.add(e);
      changed = true;
    }
  }
  const partsMoved = moved.size;

  // ---- write the wires back ------------------------------------------------------------------

  const chainOf = new Map<WireElm, Chain>();
  for (const c of chains) if (c.changed || c.removed) for (const w of c.wires) chainOf.set(w, c);
  const doomed = new Set<CircuitElm>(zeroLength);
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
