// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/WireRouter.java and
// UIManager.getCircuitBounds (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Point } from '@circuitjs-next/engine';
import type { CircuitElm } from './CircuitElm.ts';

const OBSTACLE = 1;
const HORIZONTAL = 2;
const VERTICAL = 4;

const NONE = 0;
const UP = 1;
const DOWN = 2;
const LEFT = 3;
const RIGHT = 4;

/** Negative: a reward for leaving the start the way its blocked sides push it. */
const ESCAPE_BONUS = -0.4;

/** A box in circuit coordinates. */
export interface RouteBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * An element's drawn extent, which views know (upstream `getBoundingBox`). The view module
 * installs it; without it the router uses the element's points.
 */
let boundingBox: (e: CircuitElm) => RouteBox | null = () => null;

export function setRoutingBoundingBox(fn: (e: CircuitElm) => RouteBox | null): void {
  boundingBox = fn;
}

/** Upstream `UIManager.getCircuitBounds` as x, y, width, height, or null when empty. */
function circuitBounds(
  elms: readonly CircuitElm[],
): { x: number; y: number; width: number; height: number } | null {
  let minx = 30000;
  let maxx = -30000;
  let miny = 30000;
  let maxy = -30000;
  for (const ce of elms) {
    minx = Math.min(ce.x, Math.min(ce.x2, minx));
    maxx = Math.max(ce.x, Math.max(ce.x2, maxx));
    miny = Math.min(ce.y, Math.min(ce.y2, miny));
    maxy = Math.max(ce.y, Math.max(ce.y2, maxy));
    const bb = boundingBox(ce);
    if (bb !== null) {
      minx = Math.min(bb.x1, minx);
      maxx = Math.max(bb.x2, maxx);
      miny = Math.min(bb.y1, miny);
      maxy = Math.max(bb.y2, maxy);
    }
  }
  if (minx > maxx) return null;
  return { x: minx, y: miny, width: maxx - minx, height: maxy - miny };
}

interface Node {
  r: number;
  c: number;
  dir: number;
  gScore: number;
  fScore: number;
}

/**
 * java.util.PriorityQueue ordered by fScore. Its sift order decides between equal scores, so
 * routes come out as upstream's do.
 */
class NodeQueue {
  private queue: Node[] = [];

  get size(): number {
    return this.queue.length;
  }

  private static cmp(a: Node, b: Node): number {
    return a.fScore < b.fScore ? -1 : a.fScore > b.fScore ? 1 : 0;
  }

  offer(x: Node): void {
    const q = this.queue;
    let k = q.length;
    q.push(x);
    while (k > 0) {
      const parent = (k - 1) >>> 1;
      const e = q[parent];
      if (NodeQueue.cmp(x, e) >= 0) break;
      q[k] = e;
      k = parent;
    }
    q[k] = x;
  }

  poll(): Node {
    const q = this.queue;
    const result = q[0];
    const x = q.pop() as Node;
    const n = q.length;
    if (n > 0) {
      let k = 0;
      const half = n >>> 1;
      while (k < half) {
        let child = 2 * k + 1;
        let c = q[child];
        const right = child + 1;
        if (right < n && NodeQueue.cmp(c, q[right]) > 0) c = q[(child = right)];
        if (NodeQueue.cmp(x, c) <= 0) break;
        q[k] = c;
        k = child;
      }
      q[k] = x;
    }
    return result;
  }
}

const key = (r: number, c: number, d: number): string => `${r},${c},${d}`;

/**
 * Routes a wire along grid lines around other elements (upstream `WireRouter`): first the
 * cheapest L or Z shape, else A* with a penalty for each turn. Elements mark the cells their
 * bodies cover as obstacles and their leads as wires (`CircuitElm.addRoutingObstacle`); a route
 * may cross a wire but not run along one.
 */
export class WireRouter {
  private rows = 0;
  private cols = 0;
  private grid = new Int32Array(0);
  private turnPenalty = 4.0;
  private gridSize = 8;
  private originX = 0;
  private originY = 0;

  setTurnPenalty(penalty: number): void {
    this.turnPenalty = penalty;
  }

  private cell(r: number, c: number): number {
    return this.grid[r * this.cols + c];
  }

  private mark(r: number, c: number, flag: number): void {
    this.grid[r * this.cols + c] |= flag;
  }

  /** Mark the cells of a box as obstacles (pixel coordinates, rounded to the nearest cell). */
  addObstacle(px1: number, py1: number, px2: number, py2: number): void {
    const half = Math.trunc(this.gridSize / 2);
    px1 += half;
    px2 += half;
    py1 += half;
    py2 += half;
    const r1 = Math.trunc((py1 - this.originY) / this.gridSize);
    const c1 = Math.trunc((px1 - this.originX) / this.gridSize);
    const r2 = Math.trunc((py2 - this.originY) / this.gridSize);
    const c2 = Math.trunc((px2 - this.originX) / this.gridSize);
    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);
    for (let c = minC; c <= maxC; c++)
      for (let r = minR; r <= maxR; r++) if (this.isValid(r, c)) this.mark(r, c, OBSTACLE);
  }

  /** Mark the box around some points as obstacles. */
  addObstaclePoints(pts: readonly Point[]): void {
    let minX = pts[0].x;
    let minY = pts[0].y;
    let maxX = pts[0].x;
    let maxY = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].x < minX) minX = pts[i].x;
      if (pts[i].y < minY) minY = pts[i].y;
      if (pts[i].x > maxX) maxX = pts[i].x;
      if (pts[i].y > maxY) maxY = pts[i].y;
    }
    this.addObstacle(minX, minY, maxX, maxY);
  }

  addObstaclePoint(px: number, py: number): void {
    const r = Math.trunc((py - this.originY) / this.gridSize);
    const c = Math.trunc((px - this.originX) / this.gridSize);
    if (this.isValid(r, c)) this.mark(r, c, OBSTACLE);
  }

  /** Mark a horizontal or vertical run of cells as taken by a wire in that direction. */
  addWire(px1: number, py1: number, px2: number, py2: number): void {
    const r1 = Math.trunc((py1 - this.originY) / this.gridSize);
    const c1 = Math.trunc((px1 - this.originX) / this.gridSize);
    const r2 = Math.trunc((py2 - this.originY) / this.gridSize);
    const c2 = Math.trunc((px2 - this.originX) / this.gridSize);
    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);
    if (r1 === r2) {
      for (let c = minC; c <= maxC; c++) if (this.isValid(r1, c)) this.mark(r1, c, HORIZONTAL);
    } else {
      for (let r = minR; r <= maxR; r++) if (this.isValid(r, c1)) this.mark(r, c1, VERTICAL);
    }
  }

  /** Size the grid to the circuit and the wire, then mark every other element on it. */
  initGrid(wire: CircuitElm): void {
    this.gridSize = wire.sim.gridSize;
    const gs = this.gridSize;
    const elms = wire.sim.currentElements() as readonly CircuitElm[];
    const bounds = circuitBounds(elms);

    // enlarge bounds to include wire endpoints
    let minX = Math.min(wire.x, wire.x2);
    let minY = Math.min(wire.y, wire.y2);
    let maxX = Math.max(wire.x, wire.x2);
    let maxY = Math.max(wire.y, wire.y2);
    if (bounds !== null) {
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    const margin = 2;
    this.originX = Math.trunc(minX / gs) * gs - margin * gs;
    this.originY = Math.trunc(minY / gs) * gs - margin * gs;
    this.rows = Math.trunc((maxY - this.originY) / gs) + 1 + margin * 2;
    this.cols = Math.trunc((maxX - this.originX) / gs) + 1 + margin * 2;
    this.grid = new Int32Array(this.rows * this.cols);

    for (const ce of elms) {
      if (ce === wire) continue;
      ce.addRoutingObstacle(this);
      for (let i = 0; i < ce.getPostCount(); i++) {
        const p = ce.getPost(i);
        this.addObstaclePoint(p.x, p.y);
      }
    }
    // clear start and end cells so routing can reach them
    const cols = this.cols;
    this.grid[
      Math.trunc((wire.y - this.originY) / gs) * cols + Math.trunc((wire.x - this.originX) / gs)
    ] = 0;
    this.grid[
      Math.trunc((wire.y2 - this.originY) / gs) * cols + Math.trunc((wire.x2 - this.originX) / gs)
    ] = 0;
  }

  private static dr(dir: number): number {
    return dir === UP ? -1 : dir === DOWN ? 1 : 0;
  }

  private static dc(dir: number): number {
    return dir === LEFT ? -1 : dir === RIGHT ? 1 : 0;
  }

  /** Directions that lead away from blocked neighbours of (r, c). */
  private getPreferredEscapeDirections(r: number, c: number): number[] {
    const prefs: number[] = [];
    if (!this.canMoveTo(r - 1, c, UP)) prefs.push(DOWN);
    if (!this.canMoveTo(r + 1, c, DOWN)) prefs.push(UP);
    if (!this.canMoveTo(r, c - 1, LEFT)) prefs.push(RIGHT);
    if (!this.canMoveTo(r, c + 1, RIGHT)) prefs.push(LEFT);
    return prefs;
  }

  /** The cheapest straight, L or Z route, as pixel corners, or empty. */
  private tryPatternRouting(startR: number, startC: number, goalR: number, goalC: number): Point[] {
    if (startR === goalR && startC === goalC)
      return [
        new Point(startC * this.gridSize + this.originX, startR * this.gridSize + this.originY),
      ];

    const startPrefs = this.getPreferredEscapeDirections(startR, startC);
    const best: { cost: number; corners: number[][] | null } = {
      cost: Number.POSITIVE_INFINITY,
      corners: null,
    };
    const consider = (path: number[][], dir: number): void => {
      const cost = this.evaluatePath(path, dir, startPrefs);
      if (cost >= 0 && cost < best.cost) {
        best.cost = cost;
        best.corners = path;
      }
    };

    // L shapes (one bend), or a straight line
    if (startR !== goalR && startC !== goalC) {
      consider(
        [
          [startR, startC],
          [startR, goalC],
          [goalR, goalC],
        ],
        goalC > startC ? RIGHT : LEFT,
      );
      consider(
        [
          [startR, startC],
          [goalR, startC],
          [goalR, goalC],
        ],
        goalR > startR ? DOWN : UP,
      );
    } else if (startR === goalR) {
      consider(
        [
          [startR, startC],
          [goalR, goalC],
        ],
        goalC > startC ? RIGHT : LEFT,
      );
    } else {
      consider(
        [
          [startR, startC],
          [goalR, goalC],
        ],
        goalR > startR ? DOWN : UP,
      );
    }

    // Z shapes (two bends), detouring on either side
    const maxDetour = 5;
    const zByColumn = (detourCol: number): void => {
      if (!this.isValid(0, detourCol)) return;
      const z: number[][] = [[startR, startC]];
      if (startC !== detourCol) z.push([startR, detourCol]);
      if (startR !== goalR) z.push([goalR, detourCol]);
      if (detourCol !== goalC) z.push([goalR, goalC]);
      if (z.length >= 2) consider(z, detourCol > startC ? RIGHT : LEFT);
    };
    const zByRow = (detourRow: number): void => {
      if (!this.isValid(detourRow, 0)) return;
      const z: number[][] = [[startR, startC]];
      if (startR !== detourRow) z.push([detourRow, startC]);
      if (startC !== goalC) z.push([detourRow, goalC]);
      if (detourRow !== goalR) z.push([goalR, goalC]);
      if (z.length >= 2) consider(z, detourRow > startR ? DOWN : UP);
    };
    if (startR !== goalR) {
      for (let margin = 1; margin <= maxDetour; margin++)
        for (const side of [-1, 1]) {
          zByColumn(startC + side * margin);
          zByColumn(goalC + side * margin);
        }
    }
    if (startC !== goalC) {
      for (let margin = 1; margin <= maxDetour; margin++)
        for (const side of [-1, 1]) {
          zByRow(startR + side * margin);
          zByRow(goalR + side * margin);
        }
    }

    if (best.corners === null) return [];
    return this.pixelsFromGridPoints(best.corners);
  }

  /** A candidate path's cost, or -1 if it is blocked or not axis-aligned. */
  private evaluatePath(corners: number[][], initialDir: number, startPrefs: number[]): number {
    if (corners.length < 2) return -1;
    let cost = 0.0;
    let prevDir = NONE;
    let prev = corners[0];
    for (let i = 1; i < corners.length; i++) {
      const curr = corners[i];
      const dr = curr[0] - prev[0];
      const dc = curr[1] - prev[1];
      const steps = Math.max(Math.abs(dr), Math.abs(dc));
      if (steps === 0) continue;
      let moveDir: number;
      if (dr === 0 && dc > 0) moveDir = RIGHT;
      else if (dr === 0 && dc < 0) moveDir = LEFT;
      else if (dc === 0 && dr > 0) moveDir = DOWN;
      else if (dc === 0 && dr < 0) moveDir = UP;
      else return -1;

      let r = prev[0];
      let c = prev[1];
      for (let s = 0; s < steps; s++) {
        r += Math.sign(dr);
        c += Math.sign(dc);
        if (!this.isValid(r, c) || !this.canMoveTo(r, c, moveDir)) return -1;
      }

      cost += steps;
      if (prevDir !== NONE && moveDir !== prevDir && moveDir !== WireRouter.opposite(prevDir))
        cost += this.turnPenalty;
      prevDir = moveDir;
      prev = curr;
    }
    if (startPrefs.includes(initialDir)) cost += ESCAPE_BONUS;
    return cost;
  }

  private pixelsFromGridPoints(gridPoints: number[][]): Point[] {
    return gridPoints.map(
      (g) => new Point(g[1] * this.gridSize + this.originX, g[0] * this.gridSize + this.originY),
    );
  }

  /**
   * A route from (px1, py1) to (px2, py2) as its corners in pixel coordinates, or an empty list
   * when there is none.
   */
  routeWire(px1: number, py1: number, px2: number, py2: number): Point[] {
    const gs = this.gridSize;
    const startR = Math.trunc((py1 - this.originY) / gs);
    const startC = Math.trunc((px1 - this.originX) / gs);
    const goalR = Math.trunc((py2 - this.originY) / gs);
    const goalC = Math.trunc((px2 - this.originX) / gs);

    if (!this.isValid(startR, startC) || !this.isValid(goalR, goalC)) return [];

    // an end that is blocked from every side is unreachable
    if (
      !this.canMoveTo(goalR, goalC, UP) &&
      !this.canMoveTo(goalR, goalC, DOWN) &&
      !this.canMoveTo(goalR, goalC, LEFT) &&
      !this.canMoveTo(goalR, goalC, RIGHT)
    )
      return [];

    const patternPath = this.tryPatternRouting(startR, startC, goalR, goalC);
    if (patternPath.length > 0) return patternPath;

    // A* over (row, column, direction) states
    const openSet = new NodeQueue();
    const gScore = new Map<string, number>();
    const cameFrom = new Map<string, string>();
    const startPrefs = this.getPreferredEscapeDirections(startR, startC);

    for (const d of [UP, DOWN, LEFT, RIGHT]) {
      if (!this.canMoveTo(startR + WireRouter.dr(d), startC + WireRouter.dc(d), d)) continue;
      let initG = 0.0;
      if (startPrefs.includes(d)) initG += ESCAPE_BONUS;
      const h = Math.abs(startR - goalR) + Math.abs(startC - goalC);
      openSet.offer({ r: startR, c: startC, dir: d, gScore: initG, fScore: initG + h });
      gScore.set(key(startR, startC, d), initG);
    }

    let bestGoalNode: Node | null = null;
    while (openSet.size > 0) {
      const current = openSet.poll();
      const currKey = key(current.r, current.c, current.dir);
      // a better way to this state was found after this entry was queued
      if (current.gScore > (gScore.get(currKey) ?? Number.POSITIVE_INFINITY)) continue;

      if (current.r === goalR && current.c === goalC) {
        // keep going: the cheapest arrival wins
        if (bestGoalNode === null || current.gScore < bestGoalNode.gScore) bestGoalNode = current;
      }

      for (const [nr, nc, moveDir] of this.neighbors(current.r, current.c)) {
        if (!this.canMoveTo(nr, nc, moveDir)) continue;
        let moveCost = 1.0;
        if (
          current.dir !== NONE &&
          moveDir !== current.dir &&
          moveDir !== WireRouter.opposite(current.dir)
        )
          moveCost += this.turnPenalty;
        const nKey = key(nr, nc, moveDir);
        const tentG = current.gScore + moveCost;
        if (tentG < (gScore.get(nKey) ?? Number.POSITIVE_INFINITY)) {
          cameFrom.set(nKey, currKey);
          gScore.set(nKey, tentG);
          const h = Math.abs(nr - goalR) + Math.abs(nc - goalC);
          openSet.offer({ r: nr, c: nc, dir: moveDir, gScore: tentG, fScore: tentG + h });
        }
      }
    }

    if (bestGoalNode === null) return [];

    const fullPath: number[][] = [];
    let currentKey: string | undefined = key(bestGoalNode.r, bestGoalNode.c, bestGoalNode.dir);
    while (currentKey !== undefined) {
      const parts = currentKey.split(',');
      fullPath.unshift([Number(parts[0]), Number(parts[1])]);
      currentKey = cameFrom.get(currentKey);
    }
    return this.pixelsFromGridPoints(WireRouter.compressPath(fullPath));
  }

  /** The start, the bends and the end of a path. */
  private static compressPath(fullPath: number[][]): number[][] {
    if (fullPath.length <= 2) return [...fullPath];
    const minimal: number[][] = [fullPath[0]];
    for (let i = 1; i < fullPath.length - 1; i++) {
      const a = fullPath[i - 1];
      const b = fullPath[i];
      const c = fullPath[i + 1];
      const dx1 = b[1] - a[1];
      const dy1 = b[0] - a[0];
      const dx2 = c[1] - b[1];
      const dy2 = c[0] - b[0];
      const collinear = dx1 * dy2 - dy1 * dx2 === 0 && dx1 * dx2 + dy1 * dy2 > 0;
      if (!collinear) minimal.push(b);
    }
    const last = fullPath[fullPath.length - 1];
    const prev = minimal[minimal.length - 1];
    if (prev[0] !== last[0] || prev[1] !== last[1]) minimal.push(last);
    return minimal;
  }

  private isValid(r: number, c: number): boolean {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  private canMoveTo(r: number, c: number, moveDir: number): boolean {
    if (!this.isValid(r, c)) return false;
    const cell = this.cell(r, c);
    if ((cell & OBSTACLE) !== 0) return false;
    const flag = moveDir === LEFT || moveDir === RIGHT ? HORIZONTAL : VERTICAL;
    // a route may cross a wire but not run along it
    return (cell & flag) === 0;
  }

  private static opposite(d: number): number {
    return d === UP ? DOWN : d === DOWN ? UP : d === LEFT ? RIGHT : d === RIGHT ? LEFT : NONE;
  }

  private neighbors(r: number, c: number): [number, number, number][] {
    const list: [number, number, number][] = [];
    if (r > 0) list.push([r - 1, c, UP]);
    if (r < this.rows - 1) list.push([r + 1, c, DOWN]);
    if (c > 0) list.push([r, c - 1, LEFT]);
    if (c < this.cols - 1) list.push([r, c + 1, RIGHT]);
    return list;
  }
}
