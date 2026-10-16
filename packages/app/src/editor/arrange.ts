// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import {
  BoxElm,
  CurrentElm,
  GroundElm,
  LabeledNodeElm,
  RailElm,
  VoltageElm,
  WireElm,
  constructElement,
  type CircuitElm,
  type Rect,
} from '@perun/elements';
import { DOWN, LEFT, RIGHT, RouteGrid, UP, leadDir, reverse, type Pt } from './route.ts';

/**
 * Not in upstream: "Arrange circuit" lays the whole schematic out again. Parts go in columns in
 * the order the signal reaches them from the sources, two-terminal parts to ground stand up with
 * ground at the bottom, parts on a supply rail hang from it, and series parts lie across. Then
 * every wire is drawn again by the router (route.ts).
 *
 * What connects to what never changes: the nets are worked out first (wires join posts; ground
 * symbols are all one net, as are labels with the same name), and the layout is checked against
 * them at the end. Only plain wires are made, and parts move by whole grid steps or turn end for
 * end, so the file opens in CircuitJS1 as before.
 */

export interface ArrangeOptions {
  gridSize: number;
  /** An element's hit box (its view's bounding box), or null if it has none. */
  bbox(e: CircuitElm): Rect | null;
}

export type ArrangeFailure = 'empty' | 'too big' | 'no route';

export interface ArrangeResult {
  /** The new element list (the same part objects, new wires), or null when it failed. */
  elements: CircuitElm[] | null;
  failure: ArrangeFailure | null;
  parts: number;
  wiresBefore: number;
  wiresAfter: number;
  /** A new wire to stand in for each old one a scope may plot (null: none touches the same post). */
  wireFor: Map<CircuitElm, WireElm | null>;
}

/** Arrange gives up on circuits with more parts than this (the result would not read well). */
export const ARRANGE_MAX_PARTS = 120;

const key = (x: number, y: number): string => `${x},${y}`;

/** Union-find over strings. */
class Sets {
  private up = new Map<string, string>();
  find(k: string): string {
    let r = k;
    for (let u = this.up.get(r); u !== undefined && u !== r; u = this.up.get(r)) r = u;
    let c = k;
    while (c !== r) {
      const n = this.up.get(c) ?? r;
      this.up.set(c, r);
      c = n;
    }
    return r;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.up.set(ra, rb);
  }
}

/** Is this a label joining every label of its name (not a bus)? */
function isLabel(e: CircuitElm): e is LabeledNodeElm {
  return e instanceof LabeledNodeElm && e.busWidth === 1;
}

/**
 * The net of every post of every part, as the simulator joins them: by wires, ground symbols all
 * together, and labels by name. Keys are `index:post` into `elements`; values are net names.
 */
export function electricalNets(elements: readonly CircuitElm[]): Map<string, string> {
  const sets = new Sets();
  for (const e of elements) {
    if (!(e instanceof WireElm)) continue;
    const p0 = e.getPost(0);
    const p1 = e.getPost(1);
    sets.union(key(p0.x, p0.y), key(p1.x, p1.y));
  }
  elements.forEach((e) => {
    if (e instanceof WireElm || e.getPostCount() === 0) return;
    const p = e.getPost(0);
    if (e instanceof GroundElm) sets.union(key(p.x, p.y), '#ground');
    else if (isLabel(e)) sets.union(key(p.x, p.y), `#label:${e.text}`);
  });
  const out = new Map<string, string>();
  elements.forEach((e, i) => {
    if (e instanceof WireElm) return;
    for (let j = 0; j !== e.getPostCount(); j++) {
      const p = e.getPost(j);
      out.set(`${i}:${j}`, sets.find(key(p.x, p.y)));
    }
  });
  return out;
}

/**
 * A fingerprint of how the parts connect: which posts share a net, in element order, with how
 * many posts sit on the middle of a wire (no connection, a "bad connection" upstream).
 */
export function electricalSignature(elements: readonly CircuitElm[]): string {
  const nets = electricalNets(elements);
  const ids = new Map<string, number>();
  const parts: string[] = [];
  const posts: Pt[] = [];
  elements.forEach((e, i) => {
    if (e instanceof WireElm) return;
    const row: number[] = [];
    for (let j = 0; j !== e.getPostCount(); j++) {
      const n = nets.get(`${i}:${j}`) ?? '';
      let id = ids.get(n);
      if (id === undefined) ids.set(n, (id = ids.size));
      row.push(id);
      posts.push(e.getPost(j));
    }
    parts.push(row.join('.'));
  });
  let bad = 0;
  for (const w of elements) {
    if (!(w instanceof WireElm) || (w.x !== w.x2 && w.y !== w.y2)) continue;
    for (const p of posts) if (onSegmentInterior(w.x, w.y, w.x2, w.y2, p.x, p.y)) bad++;
  }
  return `${parts.join(',')}|${bad}`;
}

function onSegmentInterior(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): boolean {
  if ((px === ax && py === ay) || (px === bx && py === by)) return false;
  if (ax === bx && px === ax) return py > Math.min(ay, by) && py < Math.max(ay, by);
  if (ay === by && py === ay) return px > Math.min(ax, bx) && px < Math.max(ax, bx);
  return false;
}

type Kind = 'ground' | 'supply' | 'label' | 'input' | 'output';

/** What a one-post part is, which says where it goes. */
function terminalKind(e: CircuitElm): Kind {
  if (e instanceof GroundElm) return 'ground';
  if (e instanceof RailElm) {
    const dc = e.getClassName() === 'RailElm' || e.getClassName() === 'VarRailElm';
    if (!dc || e.waveform !== VoltageElm.WF_DC) return 'input';
    // a negative rail goes at the bottom, with ground
    return e.maxVoltage + e.bias < 0 ? 'ground' : 'supply';
  }
  if (isLabel(e)) return 'label';
  const name = e.getClassName();
  if (name === 'LogicInputElm' || name === 'SweepElm') return 'input';
  return 'output';
}

const PREFERRED: Record<Kind, number> = {
  ground: DOWN,
  supply: UP,
  label: RIGHT,
  input: LEFT,
  output: RIGHT,
};

/** One-post parts that go beside a post of their net; inputs and outputs get columns. */
const isTerminal = (e: CircuitElm): boolean => {
  if (e.getPostCount() !== 1) return false;
  const k = terminalKind(e);
  return k !== 'input' && k !== 'output';
};
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

interface PostRef {
  e: CircuitElm;
  i: number;
}

interface Block {
  e: CircuitElm;
  layer: number;
  /** Where it was, to keep the order of things that tie. */
  ox: number;
  oy: number;
  /** The one-post parts placed beside it. */
  terminals: { t: CircuitElm; host: number }[];
}

interface Saved {
  e: CircuitElm;
  x: number;
  y: number;
  x2: number;
  y2: number;
}

function place(e: CircuitElm, x: number, y: number, x2: number, y2: number): void {
  e.x = x;
  e.y = y;
  e.x2 = x2;
  e.y2 = y2;
  e.setPoints();
}

function union(a: Rect | null, b: Rect | null): Rect | null {
  if (a === null) return b;
  if (b === null) return a;
  return {
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
    x2: Math.max(a.x2, b.x2),
    y2: Math.max(a.y2, b.y2),
  };
}

function postsBox(e: CircuitElm): Rect | null {
  let r: Rect | null = null;
  for (let i = 0; i !== e.getPostCount(); i++) {
    const p = e.getPost(i);
    r = union(r, { x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  }
  return r;
}

/** Lay the circuit out again. On failure every element is put back where it was. */
export function arrange(elements: readonly CircuitElm[], o: ArrangeOptions): ArrangeResult {
  const gs = o.gridSize;
  const wires = elements.filter((e): e is WireElm => e instanceof WireElm);
  const parts = elements.filter((e) => !(e instanceof WireElm) && e.getPostCount() > 0);
  const decor = elements.filter((e) => !(e instanceof WireElm) && e.getPostCount() === 0);
  const result: ArrangeResult = {
    elements: null,
    failure: null,
    parts: parts.length,
    wiresBefore: wires.length,
    wiresAfter: wires.length,
    wireFor: new Map(),
  };
  if (parts.length < 2) return { ...result, failure: 'empty' };
  if (parts.length > ARRANGE_MAX_PARTS) return { ...result, failure: 'too big' };

  const saved: Saved[] = [...parts, ...decor].map((e) => ({
    e,
    x: e.x,
    y: e.y,
    x2: e.x2,
    y2: e.y2,
  }));
  const putBack = (): void => {
    for (const s of saved) place(s.e, s.x, s.y, s.x2, s.y2);
  };
  const signature = electricalSignature(elements);
  const nets = electricalNets(elements);
  const index = new Map(elements.map((e, i) => [e, i]));
  const netOf = (r: PostRef): string => nets.get(`${index.get(r.e) ?? -1}:${r.i}`) ?? '';
  const centre = (e: CircuitElm): Pt => {
    const b = o.bbox(e) ?? postsBox(e) ?? { x1: e.x, y1: e.y, x2: e.x, y2: e.y };
    return { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
  };

  // posts of each net, split into parts placed in columns and one-post terminals
  const netPosts = new Map<string, PostRef[]>();
  const netTerminals = new Map<string, CircuitElm[]>();
  for (const e of parts)
    for (let i = 0; i !== e.getPostCount(); i++) {
      const n = netOf({ e, i });
      if (isTerminal(e)) {
        let l = netTerminals.get(n);
        if (l === undefined) netTerminals.set(n, (l = []));
        l.push(e);
      } else {
        let l = netPosts.get(n);
        if (l === undefined) netPosts.set(n, (l = []));
        l.push({ e, i });
      }
    }
  // a net of one-post parts only: the first of them is placed like a part
  const blockElms = parts.filter((e) => !isTerminal(e));
  for (const [n, ts] of netTerminals)
    if (!netPosts.has(n)) {
      blockElms.push(ts[0]);
      netPosts.set(n, [{ e: ts[0], i: 0 }]);
      ts.shift();
    }
  const groundNets = new Set<string>();
  const supplyNets = new Set<string>();
  const inputNets = new Set<string>();
  for (const [n, ts] of netTerminals)
    for (const t of ts) {
      const k = terminalKind(t);
      if (k === 'ground') groundNets.add(n);
      else if (k === 'supply') supplyNets.add(n);
    }
  for (const e of blockElms) {
    if (e.getPostCount() !== 1) continue;
    const k = terminalKind(e);
    const n = netOf({ e, i: 0 });
    if (k === 'ground') groundNets.add(n);
    else if (k === 'supply') supplyNets.add(n);
    else if (k === 'input') inputNets.add(n);
  }
  // a source with no ground: its negative side is the return, drawn along the bottom like ground
  for (const e of blockElms) {
    if (!(e instanceof VoltageElm || e instanceof CurrentElm) || e.getPostCount() !== 2) continue;
    const n0 = netOf({ e, i: 0 });
    const n1 = netOf({ e, i: 1 });
    if (!groundNets.has(n0) && !groundNets.has(n1)) groundNets.add(n0);
  }
  const signalNet = (n: string): boolean => !groundNets.has(n) && !supplyNets.has(n);

  // ---- columns: how many steps the signal takes from a source to reach each part -------------
  const blocks: Block[] = blockElms.map((e) => {
    const c = centre(e);
    return { e, layer: -1, ox: c.x, oy: c.y, terminals: [] };
  });
  const blockOf = new Map(blocks.map((b) => [b.e, b]));
  const neighbours = (b: Block): Block[] => {
    const out = new Set<Block>();
    for (let i = 0; i !== b.e.getPostCount(); i++) {
      const n = netOf({ e: b.e, i });
      if (!signalNet(n)) continue;
      for (const r of netPosts.get(n) ?? []) {
        const nb = blockOf.get(r.e);
        if (nb !== undefined && nb !== b) out.add(nb);
      }
    }
    return [...out];
  };
  const isSource = (b: Block): boolean => {
    if (b.e.getPostCount() === 1) return terminalKind(b.e) === 'input';
    return (b.e instanceof VoltageElm || b.e instanceof CurrentElm) && b.e.getPostCount() === 2;
  };
  const bfs = (seeds: Block[]): void => {
    let front = seeds;
    for (const s of seeds) s.layer = 0;
    while (front.length > 0) {
      const next: Block[] = [];
      for (const b of front)
        for (const nb of neighbours(b))
          if (nb.layer < 0) {
            nb.layer = b.layer + 1;
            next.push(nb);
          }
      front = next;
    }
  };
  bfs(blocks.filter(isSource));
  for (;;) {
    const rest = blocks.filter((b) => b.layer < 0);
    if (rest.length === 0) break;
    rest.sort((a, b) => a.ox - b.ox || a.oy - b.oy);
    bfs([rest[0]]);
  }
  // an output goes in the column after the last part driving it
  const isOutput = (b: Block): boolean =>
    b.e.getPostCount() === 1 && terminalKind(b.e) === 'output';
  for (const b of blocks) {
    if (!isOutput(b)) continue;
    let l = -1;
    for (const r of netPosts.get(netOf({ e: b.e, i: 0 })) ?? []) {
      const nb = blockOf.get(r.e);
      if (nb !== undefined && nb !== b && !isOutput(nb)) l = Math.max(l, nb.layer);
    }
    b.layer = l + 1;
  }
  const netLayer = (n: string, not: Block): number => {
    if (inputNets.has(n)) return -1;
    let l = Infinity;
    for (const r of netPosts.get(n) ?? []) {
      const b = blockOf.get(r.e);
      if (b !== undefined && b !== not) l = Math.min(l, b.layer);
    }
    return l;
  };

  const oldBox = elements.reduce<Rect | null>(
    (r, e) => union(r, e instanceof WireElm ? postsBox(e) : (o.bbox(e) ?? postsBox(e))),
    null,
  );

  // ---- turn two-post parts: up to the supply, down to ground, else across --------------------
  for (const b of blocks) {
    const e = b.e;
    if (e.getPostCount() === 1) {
      // inputs point left, outputs right
      const d = PREFERRED[terminalKind(e)];
      const len = Math.max(gs, Math.round(Math.hypot(e.x2 - e.x, e.y2 - e.y) / gs) * gs);
      const s = saved.find((v) => v.e === e);
      place(e, e.x, e.y, e.x + DX[d] * len, e.y + DY[d] * len);
      const q = e.getPost(0);
      if ((q.x !== e.x || q.y !== e.y) && s !== undefined) place(e, s.x, s.y, s.x2, s.y2);
      continue;
    }
    if (e.getPostCount() !== 2) continue;
    const p0 = e.getPost(0);
    const p1 = e.getPost(1);
    if (p0.x !== e.x || p0.y !== e.y || p1.x !== e.x2 || p1.y !== e.y2) continue;
    const len = Math.max(gs, Math.round(Math.hypot(e.x2 - e.x, e.y2 - e.y) / gs) * gs);
    const n0 = netOf({ e, i: 0 });
    const n1 = netOf({ e, i: 1 });
    const wasVertical = e.x === e.x2;
    let vertical: boolean;
    let firstOnTop = true;
    let firstLeft = true;
    if (supplyNets.has(n0) !== supplyNets.has(n1)) {
      vertical = true;
      firstOnTop = supplyNets.has(n0);
    } else if (groundNets.has(n0) !== groundNets.has(n1)) {
      vertical = true;
      firstOnTop = groundNets.has(n1);
    } else if (e instanceof VoltageElm || e instanceof CurrentElm) {
      // the positive side up
      vertical = true;
      firstOnTop = false;
    } else {
      vertical = false;
      const l0 = netLayer(n0, b);
      const l1 = netLayer(n1, b);
      firstLeft = l0 !== l1 ? l0 < l1 : wasVertical ? e.y <= e.y2 : e.x <= e.x2;
    }
    const x = e.x;
    const y = e.y;
    if (vertical) place(e, x, y, x, firstOnTop ? y + len : y - len);
    else place(e, x, y, firstLeft ? x + len : x - len, y);
    const q = e.getPost(1);
    if (q.x !== e.x2 || q.y !== e.y2) {
      // its posts aren't its ends after all: leave it as it was
      const s = saved.find((v) => v.e === e);
      if (s !== undefined) place(e, s.x, s.y, s.x2, s.y2);
    }
  }

  // ---- one-post parts go beside a post of their net -----------------------------------------
  const hostPosts = new Map<string, PostRef[]>();
  const terminalMode = new Map<string, 'each' | 'tree'>();
  const leadOf = (r: PostRef): number | null => {
    const bx = o.bbox(r.e);
    return bx === null ? null : leadDir(r.e.getPost(r.i), bx);
  };
  for (const [n, ts] of netTerminals) {
    if (ts.length === 0) continue;
    const hosts = netPosts.get(n) ?? [];
    hostPosts.set(n, hosts);
    const global = ts.every((t) => t instanceof GroundElm || isLabel(t));
    const each = global && ts.length >= hosts.length;
    terminalMode.set(n, each ? 'each' : 'tree');
    const used = new Map<PostRef, number>();
    for (const t of ts) {
      const want = PREFERRED[terminalKind(t)];
      let best: PostRef | null = null;
      let bestScore = Infinity;
      for (const h of hosts) {
        const u = used.get(h) ?? 0;
        // a post of its own first, then one that faces the right way
        // inputs by the first column, outputs by the last
        const layer = blockOf.get(h.e)?.layer ?? 0;
        const kind = terminalKind(t);
        const side = kind === 'input' ? layer : kind === 'output' ? -layer : 0;
        const score =
          u * 10 + (leadOf(h) === want ? 0 : 1) + (each && u > 0 ? 100 : 0) + side * 0.001;
        if (score < bestScore) {
          bestScore = score;
          best = h;
        }
      }
      if (best === null) continue;
      used.set(best, (used.get(best) ?? 0) + 1);
      const b = blockOf.get(best.e);
      if (b !== undefined) b.terminals.push({ t, host: best.i });
    }
  }
  const placeTerminals = (b: Block): void => {
    const count = new Map<number, number>();
    for (const { t, host } of b.terminals) {
      const k = count.get(host) ?? 0;
      count.set(host, k + 1);
      const p = b.e.getPost(host);
      const want = PREFERRED[terminalKind(t)];
      const lead = leadOf({ e: b.e, i: host });
      const d = lead ?? want;
      const dist = (2 + 3 * k) * gs;
      const px = p.x + DX[d] * dist;
      const py = p.y + DY[d] * dist;
      const s = saved.find((v) => v.e === t);
      const len = Math.max(
        gs,
        Math.round(Math.hypot((s?.x2 ?? 0) - (s?.x ?? 0), (s?.y2 ?? 0) - (s?.y ?? 0)) / gs) * gs,
      );
      // pointing the way it likes, unless that is back at the part
      const dir = d === reverse(want) ? d : want;
      place(t, px, py, px + DX[dir] * len, py + DY[dir] * len);
      const q = t.getPost(0);
      if ((q.x !== px || q.y !== py) && s !== undefined) {
        place(t, s.x, s.y, s.x2, s.y2);
        t.move(px - q.x, py - q.y);
      }
    }
  };

  const turned: Saved[] = parts.map((e) => ({ e, x: e.x, y: e.y, x2: e.x2, y2: e.y2 }));

  // ---- stack the columns ------------------------------------------------------------------------
  const layers: Block[][] = [];
  for (const b of blocks) (layers[b.layer] ??= []).push(b);
  for (const l of layers) l?.sort((a, b) => a.oy - b.oy || a.ox - b.ox);
  for (let l = 1; l < layers.length; l++) {
    const prev = layers[l - 1] ?? [];
    const row = new Map(prev.map((b, i) => [b, i]));
    const key = (b: Block): number => {
      const rs = neighbours(b)
        .map((nb) => row.get(nb))
        .filter((r): r is number => r !== undefined);
      return rs.length === 0 ? Infinity : rs.reduce((a, c) => a + c, 0) / rs.length;
    };
    const keyed = (layers[l] ?? []).map((b, i) => ({ b, k: key(b), i }));
    keyed.sort((a, c) => (a.k === c.k ? a.i - c.i : a.k < c.k ? -1 : 1));
    layers[l] = keyed.map((v) => v.b);
  }

  const moveBlock = (b: Block, dx: number, dy: number): void => {
    b.e.move(dx, dy);
    for (const { t } of b.terminals) t.move(dx, dy);
  };
  const footprint = (b: Block): Rect => {
    let r = union(o.bbox(b.e), postsBox(b.e));
    for (const { t } of b.terminals) r = union(union(r, o.bbox(t)), postsBox(t));
    return r ?? { x1: b.e.x, y1: b.e.y, x2: b.e.x, y2: b.e.y };
  };
  const snapDown = (v: number): number => Math.floor(v / gs) * gs;
  const snapUp = (v: number): number => Math.ceil(v / gs) * gs;

  // decorations follow the part they sit by
  const follows = new Map<CircuitElm, Block>();
  const boxes = new Map<CircuitElm, Block[]>();
  for (const d of decor) {
    const db = o.bbox(d);
    if (d instanceof BoxElm && db !== null) {
      const inside = blocks.filter(
        (b) => b.ox > db.x1 && b.ox < db.x2 && b.oy > db.y1 && b.oy < db.y2,
      );
      if (inside.length > 0) {
        boxes.set(d, inside);
        continue;
      }
    }
    const c = centre(d);
    let best: Block | null = null;
    let bestD = 8 * gs;
    for (const b of blocks) {
      const dd = Math.hypot(b.ox - c.x, b.oy - c.y);
      if (dd < bestD) {
        bestD = dd;
        best = b;
      }
    }
    if (best !== null) follows.set(d, best);
  }
  // a box keeps its margin round what it holds
  const boxMargin = new Map<CircuitElm, Rect>();
  for (const [d, inside] of boxes) {
    const db = o.bbox(d);
    const held = inside.reduce<Rect | null>((r, b) => union(r, o.bbox(b.e) ?? postsBox(b.e)), null);
    if (db !== null && held !== null)
      boxMargin.set(d, {
        x1: Math.max(gs, held.x1 - db.x1),
        y1: Math.max(gs, held.y1 - db.y1),
        x2: Math.max(gs, db.x2 - held.x2),
        y2: Math.max(gs, db.y2 - held.y2),
      });
  }

  /**
   * Which band of its column a part goes in: hanging from a supply rail (top), standing on
   * ground (bottom), or the signal in between.
   */
  const band = (b: Block): 'top' | 'middle' | 'bottom' => {
    if (b.e.getPostCount() !== 2) return 'middle';
    const n0 = netOf({ e: b.e, i: 0 });
    const n1 = netOf({ e: b.e, i: 1 });
    if (supplyNets.has(n0) || supplyNets.has(n1)) return 'top';
    if (groundNets.has(n0) || groundNets.has(n1)) return 'bottom';
    return 'middle';
  };
  const topPost = (b: Block): number => postsBox(b.e)?.y1 ?? b.e.y;
  const bottomPost = (b: Block): number => postsBox(b.e)?.y2 ?? b.e.y;

  const attempt = (pad: number): CircuitElm[] | null => {
    const cols = Array.from(layers, (layer) => {
      const bs = layer ?? [];
      for (const b of bs) placeTerminals(b);
      return {
        top: bs.filter((b) => band(b) === 'top'),
        middle: bs.filter((b) => band(b) === 'middle'),
        bottom: bs.filter((b) => band(b) === 'bottom'),
        /** Where the middle of the column ends, or null if it has nothing in the middle. */
        end: null as number | null,
      };
    });
    const width = (bs: Block[]): number =>
      bs.reduce((w, b) => {
        const f = footprint(b);
        return w + snapUp(f.x2) - snapDown(f.x1) + pad;
      }, 0);
    // supply rail at y = 0: the top band's top posts on it
    let midTop = 0;
    for (const c of cols)
      for (const b of c.top) midTop = Math.max(midTop, snapUp(footprint(b).y2 - topPost(b)));
    // the signal line: the first middle part's top post in every column
    let lead = 0;
    for (const c of cols) {
      const b = c.middle[0];
      if (b !== undefined) lead = Math.max(lead, topPost(b) - snapDown(footprint(b).y1));
    }
    const signal = midTop + pad + lead;
    let x = 0;
    const rows: { b: Block; x: number; y: number; anchor: 'top' | 'bottom' }[] = [];
    for (const c of cols) {
      const w =
        Math.max(width(c.top), width(c.bottom), ...c.middle.map((b) => width([b])), 0) + pad;
      // side by side along the rails, centred in the column
      const row = (bs: Block[], anchor: 'top' | 'bottom'): void => {
        let at = x + (w - width(bs)) / 2 + pad / 2;
        for (const b of bs) {
          const f = footprint(b);
          rows.push({ b, x: snapDown(at - f.x1), y: 0, anchor });
          at += snapUp(f.x2) - snapDown(f.x1) + pad;
        }
      };
      row(c.top, 'top');
      row(c.bottom, 'bottom');
      let y = signal;
      c.middle.forEach((b, i) => {
        const f = footprint(b);
        const dy = i === 0 ? signal - topPost(b) : y - snapDown(f.y1);
        const dx = snapDown(x + w / 2 - (f.x1 + f.x2) / 2);
        moveBlock(b, dx, dy);
        y = snapUp(f.y2 + dy) + pad;
      });
      c.end = c.middle.length > 0 ? y : null;
      x += w;
    }
    // ground along the bottom, below everything in the middle; in a column with nothing in the
    // middle, a part to ground may reach up to the signal line
    let groundLine = signal;
    for (const c of cols)
      for (const b of c.bottom)
        groundLine = Math.max(
          groundLine,
          c.end === null
            ? signal + bottomPost(b) - topPost(b)
            : c.end + snapUp(bottomPost(b) - footprint(b).y1),
        );
    for (const r of rows) {
      const dy = r.anchor === 'top' ? -topPost(r.b) : groundLine - bottomPost(r.b);
      moveBlock(r.b, r.x, dy);
    }
    // where the circuit was
    const placed = blocks.reduce<Rect | null>((r, b) => union(r, footprint(b)), null);
    if (placed !== null && oldBox !== null) {
      const dx = snapDown(oldBox.x1 - placed.x1);
      const dy = snapDown(oldBox.y1 - placed.y1);
      for (const b of blocks) moveBlock(b, dx, dy);
    }
    return route();
  };

  /** Wire every net; null if one can't be wired. */
  const route = (): CircuitElm[] | null => {
    const placedParts = [...parts];
    const grid = new RouteGrid(placedParts, { gridSize: gs, bbox: o.bbox, margin: 6 });
    // the groups of posts to wire together
    const groups: { net: string; pts: Pt[] }[] = [];
    const postAt = new Map<string, PostRef>();
    for (const e of parts)
      for (let i = 0; i !== e.getPostCount(); i++) {
        const p = e.getPost(i);
        postAt.set(key(p.x, p.y), { e, i });
      }
    for (const [n, posts] of netPosts) {
      const terms = (netTerminals.get(n) ?? []).filter((t) => !blockOf.has(t));
      if (terminalMode.get(n) === 'each') {
        for (const r of posts) {
          const mine = blockOf.get(r.e)?.terminals.filter((t) => t.host === r.i) ?? [];
          const pts = [r.e.getPost(r.i), ...mine.map(({ t }) => t.getPost(0))];
          if (pts.length > 1) groups.push({ net: n, pts });
        }
      } else {
        const pts = [...posts.map((r) => r.e.getPost(r.i)), ...terms.map((t) => t.getPost(0))];
        if (pts.length > 1) groups.push({ net: n, pts });
      }
    }
    const span = (g: { pts: Pt[] }): number => {
      const xs = g.pts.map((p) => p.x);
      const ys = g.pts.map((p) => p.y);
      return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys);
    };
    groups.sort((a, b) => span(a) - span(b));
    const owner = new Map<string, string>();
    const segs = new Map<string, Pt[][]>();
    const arrive = (p: Pt): number | null => {
      const r = postAt.get(key(p.x, p.y));
      if (r === undefined) return null;
      const d = leadOf(r);
      return d === null ? null : reverse(d);
    };
    for (const g of groups) {
      // one post at a time joins the tree grown so far, nearest first
      const tree: Pt[] = [g.pts[0]];
      const treeKeys = new Set([key(g.pts[0].x, g.pts[0].y)]);
      const rest = g.pts.slice(1).filter((p) => !treeKeys.has(key(p.x, p.y)));
      const lines = segs.get(g.net) ?? [];
      segs.set(g.net, lines);
      while (rest.length > 0) {
        const dist = (p: Pt): number =>
          Math.min(...tree.map((t) => Math.abs(t.x - p.x) + Math.abs(t.y - p.y)));
        rest.sort((a, b) => dist(a) - dist(b));
        let done = false;
        for (let k = 0; k < rest.length && !done; k++) {
          const p = rest[k];
          const r = postAt.get(key(p.x, p.y));
          const path = grid.route(p, tree, {
            startDir: r === undefined ? null : leadOf(r),
            arriveDir: arrive,
          });
          if (path === null) continue;
          grid.addPath(path);
          lines.push(path);
          for (let i = 0; i + 1 < path.length; i++) {
            const a = path[i];
            const b = path[i + 1];
            const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / gs;
            for (let s = 0; s <= n; s++) {
              const q = { x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n };
              const qk = key(q.x, q.y);
              const own = owner.get(qk);
              if (own !== undefined && own !== g.net) {
                // where another net's wire crosses, this one can't be joined later
                continue;
              }
              owner.set(qk, g.net);
              if (!treeKeys.has(qk)) {
                treeKeys.add(qk);
                tree.push(q);
              }
            }
          }
          rest.splice(k, 1);
          done = true;
        }
        if (!done) return null;
      }
    }
    // a point another net's wire passes through must not be a joint: drop it from the trees
    // (checked again at the end); now cut each net's lines where its own lines meet them
    const made: WireElm[] = [];
    for (const [, lines] of segs) {
      const stops = new Set<string>();
      for (const l of lines) {
        stops.add(key(l[0].x, l[0].y));
        stops.add(key(l[l.length - 1].x, l[l.length - 1].y));
      }
      for (const l of lines)
        for (let i = 0; i + 1 < l.length; i++) {
          const a = l[i];
          const b = l[i + 1];
          const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / gs;
          let from = a;
          for (let s = 1; s <= n; s++) {
            const q = { x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n };
            if (s < n && !stops.has(key(q.x, q.y))) continue;
            const w = constructElement('WireElm', from.x, from.y, parts[0].sim);
            if (!(w instanceof WireElm)) return null;
            place(w, from.x, from.y, q.x, q.y);
            w.allocNodes();
            made.push(w);
            from = q;
          }
        }
    }
    return made;
  };

  let made: CircuitElm[] | null = null;
  let list: CircuitElm[] = [];
  for (const pad of [3 * gs, 4 * gs, 6 * gs]) {
    made = attempt(pad);
    if (made !== null) {
      const firstWire = elements.findIndex((e) => e instanceof WireElm);
      const kept = elements.filter((e) => !(e instanceof WireElm));
      const at =
        firstWire < 0
          ? kept.length
          : elements.slice(0, firstWire).filter((e) => !(e instanceof WireElm)).length;
      list = [...kept.slice(0, at), ...made, ...kept.slice(at)];
      if (electricalSignature(list) === signature.replace(/\|\d+$/, '|0')) break;
      // a wire went wrong somewhere: try with more room
      made = null;
    }
    // back to the turned parts for the next try
    for (const s of turned) place(s.e, s.x, s.y, s.x2, s.y2);
  }
  if (made === null) {
    putBack();
    return { ...result, failure: 'no route' };
  }

  // decorations
  for (const [d, b] of follows) {
    const now = centre(b.e);
    d.move(snapDown(now.x - b.ox + gs / 2), snapDown(now.y - b.oy + gs / 2));
  }
  for (const [d, inside] of boxes) {
    const held = inside.reduce<Rect | null>((r, b) => union(r, footprint(b)), null);
    const m = boxMargin.get(d);
    if (held === null || m === undefined) continue;
    place(
      d,
      snapDown(held.x1 - m.x1),
      snapDown(held.y1 - m.y1),
      snapUp(held.x2 + m.x2),
      snapUp(held.y2 + m.y2),
    );
  }

  // a stand-in for each old wire: a new one on a post the old one touched
  const newWires = made.filter((e): e is WireElm => e instanceof WireElm);
  const oldPost = new Map<string, PostRef>();
  for (const s of saved) {
    if (s.e.getPostCount() === 0) continue;
    // where the posts were before
    const now = { x: s.e.x, y: s.e.y, x2: s.e.x2, y2: s.e.y2 };
    place(s.e, s.x, s.y, s.x2, s.y2);
    for (let i = 0; i !== s.e.getPostCount(); i++) {
      const p = s.e.getPost(i);
      oldPost.set(key(p.x, p.y), { e: s.e, i });
    }
    place(s.e, now.x, now.y, now.x2, now.y2);
  }
  for (const w of wires) {
    let stand: WireElm | null = null;
    for (const p of [w.getPost(0), w.getPost(1)]) {
      const r = oldPost.get(key(p.x, p.y));
      if (r === undefined) continue;
      const q = r.e.getPost(r.i);
      stand =
        newWires.find((n) => (n.x === q.x && n.y === q.y) || (n.x2 === q.x && n.y2 === q.y)) ??
        null;
      if (stand !== null) break;
    }
    result.wireFor.set(w, stand);
  }
  return { ...result, elements: list, wiresAfter: newWires.length };
}
