// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { RoutedWireElm, WireElm, constructElement, type CircuitElm } from '@perun/elements';

/** Not in upstream: wire ends on a moved part's posts move with it ("rubber-banding"). */
interface Attached {
  wire: WireElm;
  /** Which ends sit on a moved post. */
  moves: readonly [boolean, boolean];
  /** Where the wire was when the move started. */
  orig: readonly [number, number, number, number];
  /**
   * A plain straight wire with one end moving bends into an L: the wire keeps its fixed end and
   * this second wire runs from the corner to the moved end.
   */
  corner: WireElm | null;
}

function setEnds(w: CircuitElm, x: number, y: number, x2: number, y2: number): void {
  w.x = x;
  w.y = y;
  w.x2 = x2;
  w.y2 = y2;
  w.setPoints();
}

/**
 * The wires attached to a selection being moved. `apply` places them for the total offset so
 * far, so the follow can be switched off and on mid-drag (the wires spring back).
 */
export class WireFollow {
  private readonly elements: CircuitElm[];
  private readonly attached: Attached[];

  private constructor(elements: CircuitElm[], attached: Attached[]) {
    this.elements = elements;
    this.attached = attached;
  }

  /** The unselected wires with an end on a post of a selected element, or null if none. */
  static start(elements: CircuitElm[]): WireFollow | null {
    const posts = new Set<string>();
    for (const e of elements) {
      if (!e.selected) continue;
      for (let i = 0; i !== e.getPostCount(); i++) {
        const p = e.getPost(i);
        posts.add(`${p.x},${p.y}`);
      }
    }
    if (posts.size === 0) return null;
    const attached: Attached[] = [];
    for (const e of elements) {
      if (e.selected || !(e instanceof WireElm)) continue;
      const moves = [posts.has(`${e.x},${e.y}`), posts.has(`${e.x2},${e.y2}`)] as const;
      if (moves[0] || moves[1])
        attached.push({ wire: e, moves, orig: [e.x, e.y, e.x2, e.y2], corner: null });
    }
    return attached.length === 0 ? null : new WireFollow(elements, attached);
  }

  /** Place the attached wires for a move of (dx, dy) from the start; detached: put them back. */
  apply(dx: number, dy: number, attach: boolean): void {
    if (!attach) dx = dy = 0;
    for (const a of this.attached) {
      const [x, y, x2, y2] = a.orig;
      const w = a.wire;
      if (a.moves[0] && a.moves[1]) {
        setEnds(w, x + dx, y + dy, x2 + dx, y2 + dy);
        continue;
      }
      const m = a.moves[0] ? 0 : 1;
      // fixed end F, moved end P
      const fx = m === 0 ? x2 : x;
      const fy = m === 0 ? y2 : y;
      const px = (m === 0 ? x : x2) + dx;
      const py = (m === 0 ? y : y2) + dy;
      let cx = px;
      let cy = py;
      const horizontal = y === y2;
      const vertical = x === x2;
      // a routed wire reroutes itself; a slanted wire just stretches
      if (!(w instanceof RoutedWireElm) && (horizontal || vertical)) {
        // the leg into the part keeps the wire's direction, so it meets the part's lead in line
        if (horizontal && py !== fy) cx = fx;
        else if (vertical && !horizontal && px !== fx) cy = fy;
      }
      if (m === 0) setEnds(w, cx, cy, fx, fy);
      else setEnds(w, fx, fy, cx, cy);
      if (cx === px && cy === py) {
        this.removeCorner(a);
        continue;
      }
      if (a.corner === null) {
        const c = constructElement('WireElm', cx, cy, w.sim);
        if (!(c instanceof WireElm)) continue;
        c.flags = w.flags;
        a.corner = c;
        this.elements.push(c);
      }
      setEnds(a.corner, cx, cy, px, py);
    }
  }

  /** The move is over: wires that shrank to nothing go. */
  finish(): void {
    for (const a of this.attached) {
      for (const w of [a.wire, a.corner]) {
        if (w === null || w.x !== w.x2 || w.y !== w.y2) continue;
        const i = this.elements.indexOf(w);
        if (i >= 0) this.elements.splice(i, 1);
      }
    }
  }

  private removeCorner(a: Attached): void {
    if (a.corner === null) return;
    const i = this.elements.indexOf(a.corner);
    if (i >= 0) this.elements.splice(i, 1);
    a.corner = null;
  }
}
