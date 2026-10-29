// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Which posts are drawn follows CircuitJS1 SimulationManager (post and bad-connection lists)
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.

import {
  GraphicElm,
  RoutedWireElm,
  WireElm,
  lineDistanceSq,
  rectContains,
  viewFor,
  type CircuitElm,
  type Rect,
} from '@perun/elements';

export interface PostInfo {
  /** Posts drawn as dots: those not joining exactly two element ends. */
  draw: { x: number; y: number }[];
  /** Unconnected posts lying inside another element's box. */
  bad: { x: number; y: number }[];
  /** Points where three or more element ends meet. */
  junctions: { x: number; y: number }[];
  /** Points where exactly two ends meet (only drawn with junction dots on). */
  joins: { x: number; y: number }[];
}

/** A bad connection: a post joined to nothing that lies on another element. */
export interface BadPost {
  x: number;
  y: number;
  /** The element the post belongs to, and which of its posts it is. */
  owner: CircuitElm;
  post: number;
  /** The element it lies on (inside its box, or on a routed wire's path). */
  on: CircuitElm;
}

/** How far from a wire's line, or a part's, a post lies on it: a wire's box's half width. */
const SLANTED_WIRE_BAND = 3;
/** How far from a slanted part's line a post lies on it: a grid step, about its body's width. */
const SLANTED_PART_BAND = 16;

/**
 * Whether p, inside a two-post element's box, is on the element itself (not upstream, which
 * counts the whole box): on its line, or beside its body. Beside a lead is empty space, and so
 * is most of a slanted element's box.
 */
function onTwoPost(e: CircuitElm, p: { x: number; y: number }): boolean {
  const slanted = e.x !== e.x2 && e.y !== e.y2;
  const d = lineDistanceSq(e.x, e.y, e.x2, e.y2, p.x, p.y);
  if (e instanceof WireElm) return !slanted || d <= SLANTED_WIRE_BAND * SLANTED_WIRE_BAND;
  if (d <= SLANTED_WIRE_BAND * SLANTED_WIRE_BAND) return true;
  if (slanted && d > SLANTED_PART_BAND * SLANTED_PART_BAND) return false;
  const leads = e.routingLeads();
  if (leads === null) return true;
  const dx = e.x2 - e.x;
  const dy = e.y2 - e.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return true;
  const along = (q: { x: number; y: number }): number =>
    ((q.x - e.x) * dx + (q.y - e.y) * dy) / len2;
  const t = along(p);
  const t1 = along(leads[0]);
  const t2 = along(leads[1]);
  return t >= Math.min(t1, t2) && t <= Math.max(t1, t2);
}

/** Posts at each place, counted per bus bit (upstream keys by the whole Point, z included). */
function countPosts(
  elements: readonly CircuitElm[],
): Map<string, { x: number; y: number; n: number; owner: CircuitElm; post: number }> {
  const count = new Map<
    string,
    { x: number; y: number; n: number; owner: CircuitElm; post: number }
  >();
  for (const e of elements) {
    for (let j = 0; j !== e.getPostCount(); j++) {
      const p = e.getPost(j);
      const k = `${p.x},${p.y},${p.z}`;
      const entry = count.get(k);
      if (entry) entry.n++;
      else count.set(k, { x: p.x, y: p.y, n: 1, owner: e, post: j });
    }
  }
  return count;
}

/** The element a lone post at p lies on without being one of its posts, or null. */
function lyingOn(
  boxes: readonly { e: CircuitElm; box: Rect | null }[],
  p: { x: number; y: number },
): CircuitElm | null {
  for (const { e, box } of boxes) {
    // nothing joins a drawing, a text box or a scope, so nothing looks joined to one either
    if (e instanceof GraphicElm || e.getPostCount() === 0) continue;
    // a routed wire's box is too big: test its path
    if (e instanceof RoutedWireElm) {
      if (e.pointOnPath(p)) return e;
      continue;
    }
    if (box === null || !rectContains(box, p.x, p.y)) continue;
    if (e.getPostCount() === 2 && !onTwoPost(e, p)) continue;
    let own = false;
    for (let k = 0; k !== e.getPostCount() && !own; k++) {
      const q = e.getPost(k);
      own = q.x === p.x && q.y === p.y;
    }
    if (!own) return e;
  }
  return null;
}

/** Upstream's badConnectionList without the bus mismatches: lone posts lying on other elements. */
export function badPosts(elements: readonly CircuitElm[]): BadPost[] {
  const boxes = elements.map((e) => ({ e, box: viewFor(e)?.bbox(e) ?? null }));
  const out: BadPost[] = [];
  for (const p of countPosts(elements).values()) {
    if (p.n !== 1) continue;
    const on = lyingOn(boxes, p);
    if (on !== null) out.push({ x: p.x, y: p.y, owner: p.owner, post: p.post, on });
  }
  return out;
}

/** Upstream's postDrawList and badConnectionList. */
export function findPosts(elements: readonly CircuitElm[]): PostInfo {
  const count = countPosts(elements);
  const info: PostInfo = { draw: [], bad: [], junctions: [], joins: [] };
  // a bus has a post per bit in the same place; list each place once
  const seen = new Set<string>();
  const add = (list: { x: number; y: number }[], tag: string, x: number, y: number): void => {
    const k = `${tag}:${x},${y}`;
    if (seen.has(k)) return;
    seen.add(k);
    list.push({ x, y });
  };
  const boxes = elements.map((e) => ({ e, box: viewFor(e)?.bbox(e) ?? null }));
  for (const p of count.values()) {
    if (p.n !== 2) add(info.draw, 'd', p.x, p.y);
    if (p.n >= 3) add(info.junctions, 'j', p.x, p.y);
    if (p.n === 2) add(info.joins, 'o', p.x, p.y);
    if (p.n === 1 && lyingOn(boxes, p) !== null) add(info.bad, 'b', p.x, p.y);
  }
  // buses of different widths meeting
  const sim = elements[0]?.sim;
  for (const p of sim?.busMismatchList ?? []) add(info.bad, 'b', p.x, p.y);
  return info;
}
