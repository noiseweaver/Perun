// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/SCRElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Point } from '@circuitjs-next/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import { modelsFor } from '../models/ModelLibrary.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentText, getUnitText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { Diode } from './Diode.ts';

const sign = (x: number): number => (x < 0 ? -1 : x === 0 ? 0 : 1);

const ANODE = 0;
const CNODE = 1;
const GNODE = 2;
const INODE = 3;

/**
 * Silicon-controlled rectifier. Nodes: 0 anode, 1 cathode, 2 gate, 3 internal. A variable
 * resistor joins 0 and 3, a diode 3 and 1, and a 50 ohm resistor 2 and 1.
 */
export class SCRElm extends CircuitElm {
  static readonly FLAG_GATE_FIX = 1;

  diode = new Diode(this);
  dir = 0;
  ia = 0;
  ic = 0;
  ig = 0;
  lastvac = 0;
  lastvag = 0;
  gresistance = 0;
  triggerI = 0;
  holdingI = 0;
  aresistance = 0;
  gate: Point[] = [];

  override getClassName(): string {
    return 'SCRElm';
  }
  override getDumpType(): number {
    return 177;
  }
  override nonLinear(): boolean {
    return true;
  }

  override initNew(): void {
    this.setDefaults();
    this.flags |= SCRElm.FLAG_GATE_FIX;
    this.setup();
  }

  override undump(st: StringTokenizer): void {
    this.setDefaults();
    try {
      this.lastvac = parseJavaDouble(st.nextToken());
      this.lastvag = parseJavaDouble(st.nextToken());
      this.setLoadedVoltage(ANODE, 0);
      this.setLoadedVoltage(CNODE, -this.lastvac);
      this.setLoadedVoltage(GNODE, -this.lastvag);
      this.triggerI = parseJavaDouble(st.nextToken());
      this.holdingI = parseJavaDouble(st.nextToken());
      this.gresistance = parseJavaDouble(st.nextToken());
    } catch {
      // older files stop early
    }
    this.setup();
  }

  setDefaults(): void {
    this.gresistance = 50;
    this.holdingI = 0.0082;
    this.triggerI = 0.01;
  }

  setup(): void {
    this.diode = new Diode(this);
    this.diode.setup(modelsFor(this.sim).diode.getDefaultModel());
    this.aresistance = 1; // to avoid divide by zero
  }

  /** Master also zeroes its own copy of the node voltages, which live on the nodes here. */
  override reset(): void {
    this.diode.reset();
    this.lastvag = this.lastvac = 0;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('tr', this.triggerI);
    w.dumpAttr('ho', this.holdingI);
    w.dumpAttr('gr', this.gresistance);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.triggerI = r.parseDoubleAttr('tr', this.triggerI);
    this.holdingI = r.parseDoubleAttr('ho', this.holdingI);
    this.gresistance = r.parseDoubleAttr('gr', this.gresistance);
    this.setup();
  }

  applyGateFix(): boolean {
    return (this.flags & SCRElm.FLAG_GATE_FIX) !== 0;
  }

  override setPoints(): void {
    super.setPoints();
    this.dir = 0;
    if (Math.abs(this.dx) > Math.abs(this.dy)) {
      this.dir = -sign(this.dx) * sign(this.dy);
      // correct dn, or calcLeads() may get confused and the gate drawn oddly; old circuits
      // without the flag keep the old geometry
      if (this.applyGateFix()) this.dn = Math.abs(this.dx);
      this.point2.y = this.point1.y;
    } else {
      this.dir = sign(this.dy) * sign(this.dx);
      if (this.applyGateFix()) this.dn = Math.abs(this.dy);
      this.point2.x = this.point1.x;
    }
    if (this.dir === 0) this.dir = 1;
    this.calcLeads(16);
    this.gate = this.newPointArray(2);
    const grid = this.sim.gridSize;
    const leadlen = (this.dn - 16) / 2;
    let gatelen = grid;
    gatelen += leadlen % grid;
    if (leadlen < gatelen) {
      this.x2 = this.x;
      this.y2 = this.y;
      return;
    }
    this.gate[0] = this.interpPointPerp(
      this.lead2,
      this.point2,
      gatelen / leadlen,
      gatelen * this.dir,
    );
    const g1 = this.interpPointPerp(
      this.lead2,
      this.point2,
      gatelen / leadlen,
      grid * 2 * this.dir,
    );
    g1.x = this.snapGrid(g1.x);
    g1.y = this.snapGrid(g1.y);
    this.gate[1] = g1;
  }

  override getCurrentIntoNode(n: number): number {
    if (n === ANODE) return -this.ia;
    if (n === CNODE) return -this.ic;
    return -this.ig;
  }

  override getPost(n: number): Point {
    return n === 0 ? this.point1 : n === 1 ? this.point2 : this.gate[1];
  }
  override getPostCount(): number {
    return 3;
  }
  override getInternalNodeCount(): number {
    return 1;
  }

  override getPower(): number {
    const v = this.volts;
    return (v[ANODE] - v[GNODE]) * this.ia + (v[CNODE] - v[GNODE]) * this.ic;
  }

  override stamp(): void {
    const sim = this.sim;
    const n = this.nodes;
    sim.stampNonLinear(n[ANODE]);
    sim.stampNonLinear(n[CNODE]);
    sim.stampNonLinear(n[GNODE]);
    sim.stampNonLinear(n[INODE]);
    sim.stampResistor(n[GNODE], n[CNODE], this.gresistance);
    this.diode.stamp(n[INODE], n[CNODE]);
  }

  override doStep(): void {
    const v = this.volts;
    const vac = v[ANODE] - v[CNODE]; // typically negative
    const vag = v[ANODE] - v[GNODE]; // typically positive
    if (Math.abs(vac - this.lastvac) > 0.01 || Math.abs(vag - this.lastvag) > 0.01)
      this.sim.converged = false;
    this.lastvac = vac;
    this.lastvag = vag;
    this.diode.doStep(v[INODE] - v[CNODE]);
    const icmult = 1 / this.triggerI;
    const iamult = 1 / this.holdingI - icmult;
    this.aresistance = -icmult * this.ic + this.ia * iamult > 1 ? 0.0105 : 10e5;
    this.sim.stampResistor(this.nodes[ANODE], this.nodes[INODE], this.aresistance);
  }

  override getInfo(arr: string[]): void {
    const v = this.volts;
    arr[0] = 'SCR';
    arr[1] = 'Ia = ' + getCurrentText(this.ia);
    arr[2] = 'Ig = ' + getCurrentText(this.ig);
    arr[3] = 'Vac = ' + getVoltageText(v[ANODE] - v[CNODE]);
    arr[4] = 'Vag = ' + getVoltageText(v[ANODE] - v[GNODE]);
    arr[5] = 'Vgc = ' + getVoltageText(v[GNODE] - v[CNODE]);
    arr[6] = 'P = ' + getUnitText(this.getPower(), 'W');
  }

  override calculateCurrent(): void {
    const v = this.volts;
    this.ig = (v[GNODE] - v[CNODE]) / this.gresistance;
    this.ia = (v[ANODE] - v[INODE]) / this.aresistance;
    this.ic = -this.ig - this.ia;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Trigger Current (A)', this.triggerI, 0, 0).setPositive();
    if (n === 1) return new EditInfo('Holding Current (A)', this.holdingI, 0, 0).setPositive();
    if (n === 2)
      return new EditInfo('Gate Resistance (ohms)', this.gresistance, 0, 0).setPositive();
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.triggerI = ei.value;
    if (n === 1) this.holdingI = ei.value;
    if (n === 2) this.gresistance = ei.value;
  }

  /** With point1 and point2 in line the gate side is unknown and flips fail; fix the ends. */
  fixEnds(): void {
    const pt = this.interpPointPerp(this.point1, this.point2, 1, this.sim.gridSize * this.dir);
    this.x2 = pt.x;
    this.y2 = pt.y;
  }

  override flipX(c2: number, count: number): void {
    this.fixEnds();
    super.flipX(c2, count);
  }
  override flipY(c2: number, count: number): void {
    this.fixEnds();
    super.flipY(c2, count);
  }
  override flipXY(c2: number, count: number): void {
    this.fixEnds();
    super.flipXY(c2, count);
  }
}

export const SCRElmType = elementType('SCRElm', SCRElm);
