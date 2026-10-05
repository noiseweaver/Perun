// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 ts/CircuitElm.ts (dev-ts) at 7ec858d662d8be1d76d54241ba3a5c1d1c524f51:
// the simulation half (nodes, stamping hooks, connectivity, currents) plus the post geometry the
// engine needs. Drawing, editing and serialization live in @circuitjs-next/elements.
// Checked against src/com/lushprojects/circuitjs1/client/CircuitElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { UNASSIGNED_NODE, type CircuitNode, type VoltageSource } from './CircuitNode.ts';
import { Point } from './Point.ts';
import type { BusWidthMaps, Simulation, WireSegment } from './Simulation.ts';

/**
 * Base class of every simulated element. Method names and defaults follow upstream `CircuitElm`
 * so element code ports line by line. Instead of upstream's static `CircuitElm.sim`, each element
 * gets `sim` when it is added to a `Simulation`.
 */
export abstract class SimElement {
  /** The simulation this element belongs to; set by `Simulation.setElements`. */
  sim!: Simulation;

  // Position: (x, y) is the first post, (x2, y2) the point it was dragged to.
  x: number;
  y: number;
  x2: number;
  y2: number;
  flags: number;

  nodes: CircuitNode[] = [];
  /**
   * This element's copy of its node voltages (upstream `volts[]`). Each element keeps its own, as
   * master does: they are written after every solve (`setNodeVoltage`), so they agree with the
   * nodes then, but before the first solve each element still sees the voltages it was loaded or
   * reset with, even where it shares a node with another element.
   */
  volts: number[] = [];
  voltSource: VoltageSource | null = null;
  current = 0;
  /** The composite element this one belongs to (subcircuits, Phase 8). */
  parent: SimElement | null = null;

  // Derived geometry, from setPoints().
  dx = 0;
  dy = 0;
  dn = 0;
  dsign = 0;
  dpx1 = 0;
  dpy1 = 0;
  point1: Point = new Point();
  point2: Point = new Point();

  constructor(x: number, y: number, x2: number, y2: number, flags: number) {
    this.x = x;
    this.y = y;
    this.x2 = x2;
    this.y2 = y2;
    this.flags = flags;
  }

  /** Upstream class name (e.g. `ResistorElm`), reported in golden topologies. */
  abstract getClassName(): string;

  /** Upstream `getDumpType()`: the char code of the text dump letter, or a number like 207. */
  getDumpType(): number {
    return 0;
  }

  hasFlag(f: number): boolean {
    return (this.flags & f) !== 0;
  }

  /** (Re)allocate `nodes` for the current node count. Call after anything that changes it. */
  allocNodes(): void {
    const n = this.getNodeCount();
    if (this.nodes.length !== n) this.nodes = new Array<CircuitNode>(n).fill(UNASSIGNED_NODE);
    if (this.volts.length !== n) {
      const volts = new Array<number>(n).fill(0);
      for (let i = 0; i < n && i < this.volts.length; i++) volts[i] = this.volts[i];
      this.volts = volts;
    }
  }

  // ---- geometry ----------------------------------------------------------------------------

  /** Compute post positions and helper values. Called after loading or moving. */
  setPoints(): void {
    this.dx = this.x2 - this.x;
    this.dy = this.y2 - this.y;
    this.dn = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
    this.dpx1 = this.dy / this.dn;
    this.dpy1 = -this.dx / this.dn;
    this.dsign = this.dy === 0 ? Math.sign(this.dx) : Math.sign(this.dy);
    this.point1 = new Point(this.x, this.y);
    this.point2 = new Point(this.x2, this.y2);
  }

  /** Point a fraction `f` from `a` to `b`, rounded as upstream does. */
  interpPoint(a: Point, b: Point, f: number): Point {
    return new Point(
      Math.floor(a.x * (1 - f) + b.x * f + 0.48),
      Math.floor(a.y * (1 - f) + b.y * f + 0.48),
    );
  }

  /** Point a fraction `f` from `a` to `b`, offset `g` perpendicular to the line. */
  interpPointPerp(a: Point, b: Point, f: number, g: number): Point {
    const gx = b.y - a.y;
    const gy = a.x - b.x;
    g /= Math.sqrt(gx * gx + gy * gy);
    return new Point(
      Math.floor(a.x * (1 - f) + b.x * f + g * gx + 0.48),
      Math.floor(a.y * (1 - f) + b.y * f + g * gy + 0.48),
    );
  }

  // ---- topology ----------------------------------------------------------------------------

  getPostCount(): number {
    return 2;
  }

  getInternalNodeCount(): number {
    return 0;
  }

  getNodeCount(): number {
    return this.getPostCount() + this.getInternalNodeCount();
  }

  getVoltageSourceCount(): number {
    return 0;
  }

  getPost(n: number): Point {
    return n === 0 ? this.point1 : this.point2;
  }

  getBusWidth(): number {
    return 1;
  }

  /** Bits carried by post n (upstream `getPostWidth`); more than 1 for a bus post. */
  getPostWidth(_n: number): number {
    return 1;
  }

  /**
   * One pass of bus-width detection for wires, labels and bus splitters (upstream does this with
   * instanceof in `detectBusWidths`): take a width from the posts around, record it, and return
   * whether anything changed.
   */
  propagateBusWidth(_maps: BusWidthMaps): boolean {
    return false;
  }

  /** For wire-like elements: the post that post `n` connects through to (null: none yet). */
  getConnectedPost(_n: number): Point | null {
    return this.point2;
  }

  getNode(n: number): CircuitNode {
    return this.nodes[n];
  }

  /** Notified that node `p` is `n`. */
  setNode(p: number, n: CircuitNode): void {
    this.nodes[p] = n;
  }

  /** Default only suits elements with one voltage source. */
  setVoltageSource(_n: number, v: VoltageSource): void {
    this.voltSource = v;
  }

  getNodeAtPoint(pt: Point): number {
    for (let i = 0; i !== this.getPostCount(); i++) if (this.getPost(i).equals(pt)) return i;
    return 0;
  }

  /** Are posts n1 and n2 connected through this element? Used for unconnected-node and loops. */
  getConnection(_n1: number, _n2: number): boolean {
    return true;
  }

  /** Must n1 and n2 share a matrix? n1, n2 may be internal nodes. */
  getMatrixConnection(n1: number, n2: number): boolean {
    return this.getConnection(n1, n2);
  }

  hasGroundConnection(_n1: number): boolean {
    return false;
  }

  /** Called before node allocation; composites build internal node lists here. */
  preStamp(): void {}

  /** Children of a composite element, flattened into the matrix (Phase 8). */
  getChildElmList(): SimElement[] | null {
    return null;
  }

  setParentList(_list: SimElement[]): void {}

  validate(): boolean {
    return true;
  }

  /** Wire segments for wire-current calculation (wire-like elements only). */
  getWireSegments(list: WireSegment[]): void {
    const bw = this.getBusWidth();
    for (let b = 0; b < bw; b++) {
      const p0 = this.getPost(b);
      const p1 = this.getConnectedPost(b);
      const ep1 = p1 !== null && !p1.equals(p0) ? p1.key() : null;
      list.push(this.sim.newWireSegment(this, b, p0.key(), ep1));
    }
  }

  // ---- kind queries (upstream uses these instead of instanceof) ----------------------------

  nonLinear(): boolean {
    return false;
  }
  isWireEquivalent(): boolean {
    return false;
  }
  isRemovableWire(): boolean {
    return false;
  }
  isIdealCapacitor(): boolean {
    return false;
  }
  isVoltageElm(): boolean {
    return false;
  }
  isBatteryElm(): boolean {
    return false;
  }
  isRailElm(): boolean {
    return false;
  }
  isCurrentElm(): boolean {
    return false;
  }
  isGroundElm(): boolean {
    return false;
  }
  isInductorElm(): boolean {
    return false;
  }
  isLogicInputElm(): boolean {
    return false;
  }
  isLabeledNodeElm(): boolean {
    return false;
  }

  // ---- simulation ----------------------------------------------------------------------------

  /** Stamp the parts of the matrix that do not change between subiterations. */
  stamp(): void {}

  startIteration(): void {}

  /** Stamp the parts that change every subiteration (nonlinear and time-varying elements). */
  doStep(): void {}

  stepFinished(): void {}

  /** Recompute `current` from node voltages; called after every solve. */
  calculateCurrent(): void {}

  /** Upstream `setNodeVoltage`: node n of this element is now at c volts. */
  setNodeVoltage(n: number, c: number): void {
    this.volts[n] = c;
    this.nodeVoltageChanged(n);
  }

  /**
   * Node voltage of post `post` changed. Master's `setNodeVoltage` recomputes the current here;
   * capacitors override it to do nothing, as master's `CapacitorElm` does.
   */
  nodeVoltageChanged(_post: number): void {
    this.calculateCurrent();
  }

  reset(): void {}

  /** Current of voltage source `vs`, from the solution vector. */
  setCurrent(_vs: VoltageSource, c: number): void {
    this.current = c;
  }

  /** Current of a wire-like element, from calcWireCurrents (one call per bus bit). */
  setWireCurrent(_bit: number, c: number): void {
    this.current = c;
  }

  getCurrent(): number {
    return this.current;
  }

  /** Current flowing into node `n` out of this element. */
  getCurrentIntoNode(n: number): number {
    // without the getPostCount() == 2 test rails get the wrong sign
    if (n === 0 && this.getPostCount() === 2) return -this.current;
    return this.current;
  }

  getPostVoltage(n: number): number {
    return this.volts[n];
  }

  getVoltageDiff(): number {
    return this.volts[0] - this.volts[1];
  }

  /** Are we finding the DC operating point (capacitors open, sources at their bias)? */
  doDcAnalysis(): boolean {
    return this.sim.dcAnalysisFlag;
  }
}
