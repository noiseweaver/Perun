// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/RoutedWireElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Point } from '@circuitjs-next/engine';
import { elementType, lineDistanceSq } from '../CircuitElm.ts';
import { parseJavaInt } from '../java.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { WireElm } from './WireElm.ts';

/**
 * A wire drawn as a path of horizontal and vertical segments between its two posts. It
 * simulates exactly like a plain wire.
 *
 * Upstream routes a new or moved wire around other elements (WireRouter); that router is not
 * ported yet, so a wire whose ends change takes upstream's fallback L-shaped route.
 */
export class RoutedWireElm extends WireElm {
  routePoints: Point[] | null = null;

  override getClassName(): string {
    return 'RoutedWireElm';
  }
  override getDumpType(): number {
    return 0;
  }
  override getXmlDumpType(): string {
    return 'rw';
  }

  /** Upstream's `(points)` constructor body: a wire along the given path. */
  initFromPoints(points: Point[]): void {
    this.setRoute(points);
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    const rp = this.routePoints;
    if (rp !== null && rp.length > 0) w.appendText(rp.map((p) => p.x + ',' + p.y).join(';'));
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    try {
      const contents = r.parseContents();
      if (contents !== null && contents.length > 0) {
        const points = contents.split(';').map((pair) => {
          const xy = pair.split(',');
          return new Point(parseJavaInt(xy[0]), parseJavaInt(xy[1]));
        });
        if (points.length >= 2) this.routePoints = points;
      }
    } catch {
      // upstream ignores a malformed route and routes the wire again
    }
  }

  override move(dx: number, dy: number): void {
    if (this.routePoints !== null) {
      this.routePoints = this.routePoints.map((p) => new Point(p.x + dx, p.y + dy));
    }
    super.move(dx, dy);
  }

  override getShortcut(): number {
    return 'W'.charCodeAt(0);
  }

  override setPoints(): void {
    this.setPointsRouting(true);
  }

  setPointsRouting(routing: boolean): void {
    super.setPoints();
    // keep the route while the ends stay put
    const rp = this.routePoints;
    if (rp !== null && rp.length >= 2) {
      const first = rp[0];
      const last = rp[rp.length - 1];
      if (first.x === this.x && first.y === this.y && last.x === this.x2 && last.y === this.y2)
        return;
    }
    if (!routing) {
      this.routePoints = [this.point1, this.point2];
      return;
    }
    // upstream's fallback when routing fails (the router is not ported yet)
    this.routePoints = [this.point1, new Point(this.x2, this.y), this.point2];
  }

  /** Upstream `setPoints(ArrayList<Point>)`: follow the given path. */
  setRoute(points: Point[]): void {
    const first = points[0];
    const last = points[points.length - 1];
    this.x = first.x;
    this.y = first.y;
    this.x2 = last.x;
    this.y2 = last.y;
    this.setPointsRouting(false);
    this.routePoints = points;
  }

  /** The path, never empty once the wire has been placed. */
  route(): Point[] {
    return this.routePoints ?? [this.point1, this.point2];
  }

  private nearestSegment(mx: number, my: number): number {
    const rp = this.route();
    let bestSeg = -1;
    let bestDist = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < rp.length - 1; i++) {
      const d = lineDistanceSq(rp[i].x, rp[i].y, rp[i + 1].x, rp[i + 1].y, mx, my);
      if (d < bestDist) {
        bestDist = d;
        bestSeg = i;
      }
    }
    return bestSeg;
  }

  /**
   * Split this wire at the point nearest (mx, my): this wire becomes the first half and the
   * second half is returned, or null if the split is not possible.
   */
  split(mx: number, my: number): RoutedWireElm | null {
    const rp = this.routePoints;
    if (rp === null || rp.length < 2) return null;
    const bestSeg = this.nearestSegment(mx, my);
    const a = rp[bestSeg];
    const b = rp[bestSeg + 1];

    // snap the point onto the segment
    let sx: number;
    let sy: number;
    if (a.x === b.x) {
      sx = a.x;
      sy = this.snapGrid(my);
      sy = Math.max(Math.min(a.y, b.y), Math.min(sy, Math.max(a.y, b.y)));
    } else {
      sy = a.y;
      sx = this.snapGrid(mx);
      sx = Math.max(Math.min(a.x, b.x), Math.min(sx, Math.max(a.x, b.x)));
    }

    // not at an existing end
    if ((sx === this.x && sy === this.y) || (sx === this.x2 && sy === this.y2)) return null;

    // a split on a bend must not duplicate the bend point
    const atA = sx === a.x && sy === a.y;
    const atB = sx === b.x && sy === b.y;

    const rp1 = rp.slice(0, bestSeg + 1);
    if (!atA) rp1.push(new Point(sx, sy));
    const rp2 = [new Point(sx, sy)];
    for (let i = bestSeg + 1; i < rp.length; i++) {
      if (i === bestSeg + 1 && atB) continue;
      rp2.push(rp[i]);
    }

    this.setRoute(rp1);
    const nw = new RoutedWireElm(sx, sy, sx, sy, 0);
    nw.sim = this.sim;
    nw.initFromPoints(rp2);
    nw.allocNodes();
    return nw;
  }

  /** Whether p lies on the path, not at either end. */
  pointOnPath(p: { x: number; y: number }): boolean {
    const rp = this.routePoints;
    if (rp === null || rp.length < 2) return false;
    if ((p.x === this.x && p.y === this.y) || (p.x === this.x2 && p.y === this.y2)) return false;
    for (let i = 0; i < rp.length - 1; i++) {
      const a = rp[i];
      const b = rp[i + 1];
      if (a.x === b.x && p.x === a.x) {
        if (p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)) return true;
      } else if (a.y === b.y && p.y === a.y) {
        if (p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)) return true;
      }
    }
    return false;
  }

  /** The grid point on the wire nearest (mx, my), or null. */
  getSnapPointOnWire(mx: number, my: number): Point | null {
    const rp = this.routePoints;
    if (rp === null || rp.length < 2) return null;
    const bestSeg = this.nearestSegment(mx, my);
    const a = rp[bestSeg];
    const b = rp[bestSeg + 1];
    if (a.x === b.x) return new Point(a.x, this.snapGrid(my));
    return new Point(this.snapGrid(mx), a.y);
  }

  /** Whether an axis-aligned segment touches a rectangle. */
  static segmentIntersectsRect(
    a: Point,
    b: Point,
    r: { x: number; y: number; width: number; height: number },
  ): boolean {
    const rx1 = r.x;
    const ry1 = r.y;
    const rx2 = r.x + r.width;
    const ry2 = r.y + r.height;
    if (a.y === b.y) {
      if (a.y < ry1 || a.y > ry2) return false;
      return Math.max(a.x, b.x) >= rx1 && Math.min(a.x, b.x) <= rx2;
    }
    if (a.x < rx1 || a.x > rx2) return false;
    return Math.max(a.y, b.y) >= ry1 && Math.min(a.y, b.y) <= ry2;
  }

  /** Whether any segment touches the rectangle (upstream `selectRect`'s test). */
  intersectsRect(r: { x: number; y: number; width: number; height: number }): boolean {
    const rp = this.route();
    for (let i = 0; i < rp.length - 1; i++)
      if (RoutedWireElm.segmentIntersectsRect(rp[i], rp[i + 1], r)) return true;
    return false;
  }

  override getMouseDistance(gx: number, gy: number): number {
    const thresh = 10;
    const rp = this.route();
    let best = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < rp.length - 1; i++) {
      const d = segmentDistanceSq(rp[i].x, rp[i].y, rp[i + 1].x, rp[i + 1].y, gx, gy);
      if (d < best) best = d;
    }
    return best <= thresh * thresh ? best : -1;
  }

  override getInfo(arr: string[]): void {
    super.getInfo(arr);
    arr[0] = this.busWidth > 1 ? 'routed bus wire (' + this.busWidth + ')' : 'routed wire';
  }

  override getElmType(): string {
    return this.busWidth > 1 ? 'routed bus wire (' + this.busWidth + ')' : 'routed wire';
  }
}

/** Squared distance from (gx, gy) to the segment, truncated like upstream's int cast. */
function segmentDistanceSq(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  gx: number,
  gy: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (gx - ax) * (gx - ax) + (gy - ay) * (gy - ay);
  let t = ((gx - ax) * dx + (gy - ay) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const ex = gx - (ax + t * dx);
  const ey = gy - (ay + t * dy);
  return Math.trunc(ex * ex + ey * ey);
}

export const RoutedWireElmType = elementType('RoutedWireElm', RoutedWireElm);
