// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/GyratorElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Point } from '@circuitjs-next/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { getCurrentText, getUnitText, getVoltageText, OHM } from '../view/units.ts';

/**
 * A gyrator: two ports where I1 = G V2 and I2 = -G V1 (G = 1/R). Upstream saves neither the
 * resistance nor the width, so a loaded gyrator has the defaults.
 */
export class GyratorElm extends CircuitElm {
  static readonly FLAG_VERTICAL = 8;
  static readonly FLAG_FLIP = 16;

  gyrResistance = 1000;
  width = 32;
  flip = 1;
  currents = [0, 0];
  // geometry, from setPoints
  ptEnds: Point[] = [];
  ptStub: Point[] = [];
  arrowTail = new Point();
  arrowHead = new Point();

  override getClassName(): string {
    return 'GyratorElm';
  }

  override initNew(): void {
    this.noDiagonal = true;
  }

  override drag(xx: number, yy: number): void {
    xx = this.snapGrid(xx);
    yy = this.snapGrid(yy);
    if (Math.abs(xx - this.x) > Math.abs(yy - this.y)) this.flags &= ~GyratorElm.FLAG_VERTICAL;
    else this.flags |= GyratorElm.FLAG_VERTICAL;
    if (this.hasFlag(GyratorElm.FLAG_VERTICAL)) this.width = -Math.max(32, Math.abs(xx - this.x));
    else this.width = Math.max(32, Math.abs(yy - this.y));
    if (xx === this.x) yy = this.y;
    this.x2 = xx;
    this.y2 = yy;
    this.setPoints();
  }

  override setPoints(): void {
    super.setPoints();
    if (this.hasFlag(GyratorElm.FLAG_VERTICAL))
      this.point2 = new Point(this.point1.x, this.point2.y);
    else this.point2 = new Point(this.point2.x, this.point1.y);
    const p1 = this.point1;
    const p2 = this.point2;
    this.flip = this.hasFlag(GyratorElm.FLAG_FLIP) ? -1 : 1;
    const off = -this.dsign * this.width * this.flip;
    this.ptEnds = [
      p1,
      p2,
      this.interpPointPerp(p1, p2, 0, off),
      this.interpPointPerp(p1, p2, 1, off),
    ];
    // stubs end 12 px in from each terminal toward the middle
    const cs = 0.5 - 12 / this.dn;
    const e = this.ptEnds;
    this.ptStub = [
      this.interpPoint(e[0], e[1], cs),
      this.interpPoint(e[1], e[0], cs),
      this.interpPoint(e[2], e[3], cs),
      this.interpPoint(e[3], e[2], cs),
    ];
    // the arrow sits inside the box, under the pi; it points from port 1 to port 2
    const [cx, cy] = this.boxCenter();
    if (this.hasFlag(GyratorElm.FLAG_VERTICAL)) {
      this.arrowTail = new Point(cx, cy + 6);
      this.arrowHead = new Point(cx, cy + 14);
    } else {
      this.arrowTail = new Point(cx - 8, cy + 8);
      this.arrowHead = new Point(cx + 8, cy + 8);
    }
  }

  /** The middle of the box (corners are the stub ends). */
  boxCenter(): [number, number] {
    const tl = this.ptStub[0];
    const br = this.ptStub[3];
    return [Math.trunc((tl.x + br.x) / 2), Math.trunc((tl.y + br.y) / 2)];
  }

  override getPost(n: number): Point {
    return this.ptEnds[n];
  }
  override getPostCount(): number {
    return 4;
  }

  override reset(): void {
    this.currents[0] = this.currents[1] = 0;
    this.volts[0] = this.volts[1] = this.volts[2] = this.volts[3] = 0;
  }

  // linear and memoryless: two voltage-controlled current sources, no doStep
  override stamp(): void {
    const g = 1.0 / this.gyrResistance;
    const n = this.nodes;
    this.sim.stampVCCurrentSource(n[0], n[2], n[1], n[3], g);
    this.sim.stampVCCurrentSource(n[1], n[3], n[0], n[2], -g);
  }

  override calculateCurrent(): void {
    const g = 1.0 / this.gyrResistance;
    const v1 = this.volts[0] - this.volts[2];
    const v2 = this.volts[1] - this.volts[3];
    this.currents[0] = g * v2;
    this.currents[1] = -g * v1;
  }

  override getCurrent(): number {
    return this.currents[0];
  }

  override getCurrentIntoNode(n: number): number {
    if (n < 2) return -this.currents[n];
    return this.currents[n - 2];
  }

  // the sources couple all nodes, so they must share a matrix
  override getMatrixConnection(_n1: number, _n2: number): boolean {
    return true;
  }

  override getConnection(n1: number, n2: number): boolean {
    // each port's terminals connect; the ports couple only through the sources
    return this.comparePair(n1, n2, 0, 2) || this.comparePair(n1, n2, 1, 3);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'gyrator';
    arr[1] = 'R = ' + getUnitText(this.gyrResistance, OHM);
    arr[2] = 'Vd1 = ' + getVoltageText(this.volts[0] - this.volts[2]);
    arr[3] = 'Vd2 = ' + getVoltageText(this.volts[1] - this.volts[3]);
    arr[4] = 'I1 = ' + getCurrentText(this.currents[0]);
    arr[5] = 'I2 = ' + getCurrentText(this.currents[1]);
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Gyration Resistance (' + OHM + ')', this.gyrResistance, 1, 0);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.value > 0) this.gyrResistance = ei.value;
  }

  override flipX(c2: number, count: number): void {
    if (this.hasFlag(GyratorElm.FLAG_VERTICAL)) this.flags ^= GyratorElm.FLAG_FLIP;
    super.flipX(c2, count);
  }
  override flipY(c2: number, count: number): void {
    if (!this.hasFlag(GyratorElm.FLAG_VERTICAL)) this.flags ^= GyratorElm.FLAG_FLIP;
    super.flipY(c2, count);
  }
  override flipXY(xmy: number, count: number): void {
    this.flags ^= GyratorElm.FLAG_VERTICAL;
    this.width *= -1;
    super.flipXY(xmy, count);
  }
}

export const GyratorElmType = elementType('GyratorElm', GyratorElm);
