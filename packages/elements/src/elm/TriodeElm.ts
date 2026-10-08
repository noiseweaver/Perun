// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/TriodeElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Point } from '@perun/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

const PLATE_N = 0;
const GRID_N = 1;
const CATH_N = 2;
const GRID_CURRENT_R = 6000;

/** A vacuum tube triode (Koren-style 3/2 power law). Posts: plate, grid, cathode. */
export class TriodeElm extends CircuitElm {
  static readonly FLAG_FLIP = 1;
  static readonly FLAG_DSIGN_FIX = 2;

  mu = 0;
  kg1 = 0;
  currentp = 0;
  currentg = 0;
  currentc = 0;
  lastv0 = 0;
  lastv1 = 0;
  lastv2 = 0;
  plate: Point[] = [];
  grid: Point[] = [];
  cath: Point[] = [];
  midgrid: Point | null = null;
  midcath: Point | null = null;
  circler = 24;

  override getClassName(): string {
    return 'TriodeElm';
  }
  override getDumpType(): number {
    return 173;
  }
  override nonLinear(): boolean {
    return true;
  }

  override initNew(): void {
    this.mu = 93;
    this.kg1 = 680;
    this.flags |= TriodeElm.FLAG_DSIGN_FIX;
    this.noDiagonal = true;
  }

  override undump(st: StringTokenizer): void {
    this.mu = parseJavaDouble(st.nextToken());
    this.kg1 = parseJavaDouble(st.nextToken());
    this.noDiagonal = true;
  }

  /** Master also zeroes its own copy of the node voltages, which live on the nodes here. */
  override reset(): void {}

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('mu', this.mu);
    w.dumpAttr('kg', this.kg1);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.mu = r.parseDoubleAttr('mu', this.mu);
    this.kg1 = r.parseDoubleAttr('kg', this.kg1);
  }

  override setPoints(): void {
    super.setPoints();
    let s = (this.flags & TriodeElm.FLAG_DSIGN_FIX) !== 0 ? this.dsign : 1;
    if ((this.flags & TriodeElm.FLAG_FLIP) !== 0) s = -s;
    const p1 = this.point1;
    const p2 = this.point2;
    const plate = (this.plate = this.newPointArray(4));
    const grid = (this.grid = this.newPointArray(8));
    const cath = (this.cath = this.newPointArray(4));
    grid[0] = p1;
    const nearw = 8 * s;
    plate[1] = this.interpPointPerp(p1, p2, 1, nearw);
    const farw = 32 * s;
    plate[0] = this.interpPointPerp(p1, p2, 1, farw);
    const platew = 18;
    [plate[2], plate[3]] = this.interpPoint2(p2, plate[1], 1, platew);
    this.circler = 24;
    grid[1] = this.interpPointPerp(p1, p2, (this.dn - this.circler) / this.dn, 0);
    for (let i = 0; i !== 3; i++) {
      grid[2 + i * 2] = this.interpPointPerp(grid[1], p2, (i * 3 + 1) / 4.5, 0);
      grid[3 + i * 2] = this.interpPointPerp(grid[1], p2, (i * 3 + 2) / 4.5, 0);
    }
    this.midgrid = p2;
    const cathw = 16 * s;
    this.midcath = this.interpPointPerp(p1, p2, 1, -nearw);
    [cath[1], cath[2]] = this.interpPoint2(p2, plate[1], -1, cathw);
    cath[3] = this.interpPointPerp(p2, plate[1], -1.2, -cathw);
    cath[0] = this.interpPointPerp(p2, plate[1], -farw / nearw, cathw);
  }

  override getCurrentIntoNode(n: number): number {
    if (n === 2) return this.currentc;
    if (n === 0) return -this.currentp;
    return -this.currentg;
  }

  override getPost(n: number): Point {
    return n === 0 ? this.plate[0] : n === 1 ? this.grid[0] : this.cath[0];
  }
  override getPostCount(): number {
    return 3;
  }

  override getPower(): number {
    const v = this.volts;
    return (v[0] - v[2]) * this.currentc + (v[GRID_N] - v[CATH_N]) * this.currentg;
  }
  /** For the scope. */
  override getCurrent(): number {
    return this.currentc;
  }

  override doStep(): void {
    const sim = this.sim;
    const nodes = this.nodes;
    const vs = [this.volts[0], this.volts[1], this.volts[2]];
    if (vs[1] > this.lastv1 + 0.5) vs[1] = this.lastv1 + 0.5;
    if (vs[1] < this.lastv1 - 0.5) vs[1] = this.lastv1 - 0.5;
    if (vs[2] > this.lastv2 + 0.5) vs[2] = this.lastv2 + 0.5;
    if (vs[2] < this.lastv2 - 0.5) vs[2] = this.lastv2 - 0.5;
    const vgk = vs[GRID_N] - vs[CATH_N];
    const vpk = vs[PLATE_N] - vs[CATH_N];
    if (
      Math.abs(this.lastv0 - vs[0]) > 0.01 ||
      Math.abs(this.lastv1 - vs[1]) > 0.01 ||
      Math.abs(this.lastv2 - vs[2]) > 0.01
    )
      sim.converged = false;
    this.lastv0 = vs[0];
    this.lastv1 = vs[1];
    this.lastv2 = vs[2];
    let ids: number;
    let gm = 0;
    let Gds: number;
    const ival = vgk + vpk / this.mu;
    this.currentg = 0;
    if (vgk > 0.01) {
      sim.stampResistor(nodes[GRID_N], nodes[CATH_N], GRID_CURRENT_R);
      this.currentg = vgk / GRID_CURRENT_R;
    } else sim.stampResistor(nodes[GRID_N], nodes[CATH_N], 1e8); // avoid singular matrix
    if (ival < 0) {
      // should be all zero, but that makes a singular matrix, so use a large resistor
      Gds = 1e-8;
      ids = vpk * Gds;
    } else {
      ids = Math.pow(ival, 1.5) / this.kg1;
      const q = (1.5 * Math.sqrt(ival)) / this.kg1;
      // gm = dids/dgk, Gds = dids/dpk
      Gds = q;
      gm = q / this.mu;
    }
    this.currentp = ids;
    this.currentc = ids + this.currentg;
    const rs = -ids + Gds * vpk + gm * vgk;
    sim.stampMatrix(nodes[PLATE_N], nodes[PLATE_N], Gds);
    sim.stampMatrix(nodes[PLATE_N], nodes[CATH_N], -Gds - gm);
    sim.stampMatrix(nodes[PLATE_N], nodes[GRID_N], gm);
    sim.stampMatrix(nodes[CATH_N], nodes[PLATE_N], -Gds);
    sim.stampMatrix(nodes[CATH_N], nodes[CATH_N], Gds + gm);
    sim.stampMatrix(nodes[CATH_N], nodes[GRID_N], -gm);
    sim.stampRightSide(nodes[PLATE_N], rs);
    sim.stampRightSide(nodes[CATH_N], -rs);
  }

  override stamp(): void {
    this.sim.stampNonLinear(this.nodes[0]);
    this.sim.stampNonLinear(this.nodes[1]);
    this.sim.stampNonLinear(this.nodes[2]);
  }

  override getInfo(arr: string[]): void {
    const v = this.volts;
    arr[0] = 'triode';
    arr[1] = 'Vac = ' + getVoltageText(v[PLATE_N] - v[CATH_N]);
    arr[2] = 'Vgc = ' + getVoltageText(v[GRID_N] - v[CATH_N]);
    arr[3] = 'Vag = ' + getVoltageText(v[PLATE_N] - v[GRID_N]);
    arr[4] = 'Ic = ' + getUnitText(this.currentc, 'A');
    arr[5] = 'Ig = ' + getUnitText(this.currentg, 'A');
  }

  /** The grid is not connected to the other terminals. */
  override getConnection(n1: number, n2: number): boolean {
    return !(n1 === 1 || n2 === 1);
  }
  override getMatrixConnection(_n1: number, _n2: number): boolean {
    return true;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('mu', this.mu, 0, 0).setDimensionless().setPositive();
    if (n === 1) return new EditInfo('kg1', this.kg1, 0, 0).setDimensionless().setPositive();
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.mu = ei.value;
    if (n === 1) this.kg1 = ei.value;
  }

  override canViewInScope(): boolean {
    return true;
  }
  override getVoltageDiff(): number {
    return this.volts[PLATE_N] - this.volts[CATH_N];
  }

  override flipX(c2: number, count: number): void {
    if (this.x === this.x2) this.flags ^= TriodeElm.FLAG_FLIP;
    if ((this.flags & TriodeElm.FLAG_DSIGN_FIX) === 0 && this.x !== this.x2)
      this.flags ^= TriodeElm.FLAG_FLIP;
    super.flipX(c2, count);
  }
  override flipY(c2: number, count: number): void {
    if (this.y === this.y2) this.flags ^= TriodeElm.FLAG_FLIP;
    if ((this.flags & TriodeElm.FLAG_DSIGN_FIX) === 0 && this.y !== this.y2)
      this.flags ^= TriodeElm.FLAG_FLIP;
    super.flipY(c2, count);
  }
  override flipXY(xmy: number, count: number): void {
    this.flags ^= TriodeElm.FLAG_FLIP;
    super.flipXY(xmy, count);
  }
}

export const TriodeElmType = elementType('TriodeElm', TriodeElm);
