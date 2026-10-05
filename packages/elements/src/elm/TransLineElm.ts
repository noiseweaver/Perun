// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/TransLineElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Point, VoltageSource } from '@circuitjs-next/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt, parseJavaDouble, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText, OHM } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

/**
 * A lossless transmission line: each end is a resistor (the line impedance) to a voltage source
 * driven by the wave that left the other end `delay` seconds ago.
 */
export class TransLineElm extends CircuitElm {
  delay = 0;
  imped = 0;
  /** Waves leaving the left and right ends, a ring buffer of `lenSteps` time steps. */
  voltageL: number[] | null = null;
  voltageR: number[] | null = null;
  lenSteps = 0;
  ptr = 0;
  width = 0;
  lastStepCount = 0;
  posts: Point[] = [];
  inner: Point[] = [];
  voltSource1: VoltageSource | null = null;
  voltSource2: VoltageSource | null = null;
  current1 = 0;
  current2 = 0;

  override getClassName(): string {
    return 'TransLineElm';
  }
  override getDumpType(): number {
    return 171;
  }
  override getXmlDumpType(): string {
    return 'tl';
  }
  override getPostCount(): number {
    return 4;
  }
  override getInternalNodeCount(): number {
    return 2;
  }

  override initNew(): void {
    this.delay = 1000 * this.sim.maxTimeStep;
    this.imped = 75;
    this.noDiagonal = true;
    this.reset();
  }

  override undump(st: StringTokenizer): void {
    this.delay = parseJavaDouble(st.nextToken());
    this.imped = parseJavaDouble(st.nextToken());
    this.width = parseJavaInt(st.nextToken());
    st.nextToken();
    this.noDiagonal = true;
    this.reset();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('de', this.delay);
    w.dumpAttr('im', this.imped);
    w.dumpAttr('wi', this.width);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.delay = r.parseDoubleAttr('de', this.delay);
    this.imped = r.parseDoubleAttr('im', this.imped);
    this.width = r.parseIntAttr('wi', this.width);
    this.reset();
  }

  override drag(xx: number, yy: number): void {
    xx = this.snapGrid(xx);
    yy = this.snapGrid(yy);
    const w1 = Math.max(this.sim.gridSize, Math.abs(yy - this.y));
    const w2 = Math.max(this.sim.gridSize, Math.abs(xx - this.x));
    if (w1 > w2) {
      xx = this.x;
      this.width = w2;
    } else {
      yy = this.y;
      this.width = w1;
    }
    this.x2 = xx;
    this.y2 = yy;
    this.setPoints();
  }

  override reset(): void {
    if (this.sim.maxTimeStep === 0) return;
    this.lenSteps = javaDoubleToInt(this.delay / this.sim.maxTimeStep);
    if (this.lenSteps > 100000) this.voltageL = this.voltageR = null;
    else {
      this.voltageL = new Array<number>(this.lenSteps).fill(0);
      this.voltageR = new Array<number>(this.lenSteps).fill(0);
    }
    this.ptr = 0;
    super.reset();
    this.lastStepCount = 0;
  }

  override setPoints(): void {
    super.setPoints();
    const ds = this.dy === 0 ? Math.sign(this.dx) : -Math.sign(this.dy);
    const p1 = this.point1;
    const p2 = this.point2;
    const w = this.width;
    const sep = this.sim.gridSize / 2;
    const half = Math.trunc(w / 2);
    this.posts = [
      this.interpPointPerp(p1, p2, 0, -w * ds),
      this.interpPointPerp(p1, p2, 1, -w * ds),
      p1,
      p2,
    ];
    this.inner = [
      this.interpPointPerp(p1, p2, 0, -(half + sep) * ds),
      this.interpPointPerp(p1, p2, 1, -(half + sep) * ds),
      this.interpPointPerp(p1, p2, 0, -(half - sep) * ds),
      this.interpPointPerp(p1, p2, 1, -(half - sep) * ds),
    ];
  }

  override setVoltageSource(n: number, v: VoltageSource): void {
    if (n === 0) {
      this.voltSource1 = v;
      v.setNodes(this.nodes[4], this.nodes[0]);
    } else {
      this.voltSource2 = v;
      v.setNodes(this.nodes[5], this.nodes[1]);
    }
  }

  override setCurrent(vs: VoltageSource, c: number): void {
    if (vs === this.voltSource1) this.current1 = c;
    else this.current2 = c;
  }

  override stamp(): void {
    const sim = this.sim;
    const n = this.nodes;
    sim.stampVoltageSource(n[4], n[0], this.voltSource1);
    sim.stampVoltageSource(n[5], n[1], this.voltSource2);
    sim.stampResistor(n[2], n[4], this.imped);
    sim.stampResistor(n[3], n[5], this.imped);
  }

  override startIteration(): void {
    const vl = this.voltageL;
    const vr = this.voltageR;
    if (vl === null || vr === null) {
      this.sim.stop('Transmission line delay too large!', this);
      return;
    }
    const v = this.volts;
    vl[this.ptr] = v[2] - v[0] + v[2] - v[4];
    vr[this.ptr] = v[3] - v[1] + v[3] - v[5];
  }

  override doStep(): void {
    const vl = this.voltageL;
    const vr = this.voltageR;
    if (vl === null || vr === null) {
      this.sim.stop('Transmission line delay too large!', this);
      return;
    }
    const n = this.nodes;
    const nextPtr = (this.ptr + 1) % this.lenSteps;
    this.sim.updateVoltageSource(n[4], n[0], this.voltSource1, -vr[nextPtr]);
    this.sim.updateVoltageSource(n[5], n[1], this.voltSource2, -vl[nextPtr]);
    if (Math.abs(this.volts[0]) > 1e-5 || Math.abs(this.volts[1]) > 1e-5) {
      this.sim.stop('Need to ground transmission line!', this);
      return;
    }
  }

  override stepFinished(): void {
    if (this.sim.timeStepCount === this.lastStepCount) return;
    this.lastStepCount = this.sim.timeStepCount;
    this.ptr = (this.ptr + 1) % this.lenSteps;
  }

  override getPost(n: number): Point {
    return this.posts[n];
  }
  override getVoltageSourceCount(): number {
    return 2;
  }
  override hasGroundConnection(_n1: number): boolean {
    return false;
  }
  override getConnection(_n1: number, _n2: number): boolean {
    return false;
  }
  override getMatrixConnection(n1: number, n2: number): boolean {
    return n1 % 2 === n2 % 2;
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'transmission line';
    arr[1] = getUnitText(this.imped, OHM);
    arr[2] = 'length = ' + getUnitText(0.65 * 2.9979e8 * this.delay, 'm');
    arr[3] = 'delay = ' + getUnitText(this.delay, 's');
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Delay (s)', this.delay, 0, 0).setPositive();
    if (n === 1) return new EditInfo('Impedance (ohms)', this.imped, 0, 0).setPositive();
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.value > 0) {
      this.delay = ei.value;
      this.reset();
    }
    if (n === 1 && ei.value > 0) {
      this.imped = ei.value;
      this.reset();
    }
  }

  override getCurrentIntoNode(n: number): number {
    if (n === 0) return this.current1;
    if (n === 2) return -this.current1;
    if (n === 3) return -this.current2;
    return this.current2;
  }

  override canFlipX(): boolean {
    return this.dy === 0;
  }
  override canFlipY(): boolean {
    return this.dx === 0;
  }
}

export const TransLineElmType = elementType('TransLineElm', TransLineElm);
