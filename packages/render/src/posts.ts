// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Which posts are drawn follows CircuitJS1 SimulationManager (post and bad-connection lists)
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.

import { GraphicElm, RoutedWireElm, rectContains, viewFor, type CircuitElm } from '@perun/elements';

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

/** Upstream's postDrawList and badConnectionList. */
export function findPosts(elements: readonly CircuitElm[]): PostInfo {
  // posts are counted per bus bit (upstream keys by the whole Point, z included)
  const count = new Map<string, { x: number; y: number; n: number }>();
  for (const e of elements) {
    for (let j = 0; j !== e.getPostCount(); j++) {
      const p = e.getPost(j);
      const k = `${p.x},${p.y},${p.z}`;
      const entry = count.get(k);
      if (entry) entry.n++;
      else count.set(k, { x: p.x, y: p.y, n: 1 });
    }
  }
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
    if (p.n !== 1) continue;
    let bad = false;
    for (const { e, box } of boxes) {
      if (e instanceof GraphicElm) continue;
      // a routed wire's box is too big: test its path
      if (e instanceof RoutedWireElm) {
        if (e.pointOnPath(p)) {
          bad = true;
          break;
        }
        continue;
      }
      if (box === null || !rectContains(box, p.x, p.y)) continue;
      let own = false;
      for (let k = 0; k !== e.getPostCount() && !own; k++) {
        const q = e.getPost(k);
        own = q.x === p.x && q.y === p.y;
      }
      if (!own) {
        bad = true;
        break;
      }
    }
    if (bad) add(info.bad, 'b', p.x, p.y);
  }
  // buses of different widths meeting
  const sim = elements[0]?.sim;
  for (const p of sim?.busMismatchList ?? []) add(info.bad, 'b', p.x, p.y);
  return info;
}
