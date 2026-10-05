// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/TriacElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Point } from '@circuitjs-next/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaBoolean, parseJavaDouble } from '../java.ts';
import { modelsFor } from '../models/ModelLibrary.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentText, getUnitText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { Diode } from './Diode.ts';

const sign = (x: number): number => (x < 0 ? -1 : x === 0 ? 0 : 1);

const MT1 = 1;
const MT2 = 0;
const GNODE = 2;
const MTI = 3;

/**
 * A TRIAC. Nodes: 1 MT1, 0 MT2 (so MT1 is at the bottom when drawn bottom to top), 2 gate,
 * 3 internal. A variable resistor joins 1 and 3, back-to-back diodes 3 and 0, a resistor 2 and 1.
 */
export class TriacElm extends CircuitElm {
  diode03 = new Diode(this);
  diode30 = new Diode(this);
  state = false;
  i1 = 0;
  i2 = 0;
  ig = 0;
  cresistance = 0;
  triggerI = 0;
  holdingI = 0;
  aresistance = 0;
  dir = 0;
  gate: Point[] = [];

  override getClassName(): string {
    return 'TriacElm';
  }
  override getDumpType(): number {
    return 206;
  }
  override nonLinear(): boolean {
    return true;
  }

  override initNew(): void {
    this.setDefaults();
    this.setup();
  }

  override undump(st: StringTokenizer): void {
    this.setDefaults();
    this.triggerI = parseJavaDouble(st.nextToken());
    this.holdingI = parseJavaDouble(st.nextToken());
    this.cresistance = parseJavaDouble(st.nextToken());
    this.state = parseJavaBoolean(st.nextToken());
    this.setup();
  }

  setDefaults(): void {
    this.holdingI = 0.0082;
    this.triggerI = 0.01;
    this.cresistance = 100;
  }

  setup(): void {
    const dm = modelsFor(this.sim).diode.getDefaultModel();
    this.diode03 = new Diode(this);
    this.diode03.setup(dm);
    this.diode30 = new Diode(this);
    this.diode30.setup(dm);
  }

  /** Master also zeroes its own copy of the node voltages, which live on the nodes here. */
  override reset(): void {
    this.diode03.reset();
    this.diode30.reset();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('ti', this.triggerI);
    w.dumpAttr('hi', this.holdingI);
    w.dumpAttr('cr', this.cresistance);
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    w.dumpAttr('st', this.state);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.triggerI = r.parseDoubleAttr('ti', this.triggerI);
    this.holdingI = r.parseDoubleAttr('hi', this.holdingI);
    this.cresistance = r.parseDoubleAttr('cr', this.cresistance);
    this.state = r.parseBooleanAttr('st', this.state);
    this.setup();
  }

  override setPoints(): void {
    super.setPoints();
    let dir: number;
    if (Math.abs(this.dx) > Math.abs(this.dy)) {
      dir = -sign(this.dx) * sign(this.dy);
      this.dn = Math.abs(this.dx);
      this.point2.y = this.point1.y;
    } else {
      dir = sign(this.dy) * sign(this.dx);
      this.dn = Math.abs(this.dy);
      this.point2.x = this.point1.x;
    }
    if (dir === 0) dir = 1;
    this.dir = dir;
    this.calcLeads(16);
    this.gate = this.newPointArray(2);
    const grid = this.sim.gridSize;
    let gatelen = grid;
    const leadlen = (this.dn - 16) / 2;
    gatelen += leadlen % grid;
    if (leadlen < gatelen) {
      this.x2 = this.x;
      this.y2 = this.y;
      return;
    }
    this.gate[0] = this.interpPointPerp(this.lead2, this.point2, gatelen / leadlen, gatelen * dir);
    this.gate[1] = this.interpPointPerp(this.lead2, this.point2, gatelen / leadlen, grid * 2 * dir);
  }

  override getPost(n: number): Point {
    return n === 0 ? this.point1 : n === 1 ? this.point2 : this.gate[1];
  }

  override getCurrentIntoNode(n: number): number {
    if (n === 0) return -this.i2;
    if (n === 1) return -this.i1;
    return -this.ig;
  }

  override getPostCount(): number {
    return 3;
  }
  override getInternalNodeCount(): number {
    return 1;
  }

  override stamp(): void {
    const sim = this.sim;
    const n = this.nodes;
    sim.stampNonLinear(n[MT1]);
    sim.stampNonLinear(n[MT2]);
    sim.stampNonLinear(n[GNODE]);
    sim.stampNonLinear(n[MTI]);
    sim.stampResistor(n[GNODE], n[MT1], this.cresistance);
    this.diode03.stamp(n[MT2], n[MTI]);
    this.diode30.stamp(n[MTI], n[MT2]);
  }

  override startIteration(): void {
    if (Math.abs(this.i2) < this.holdingI) this.state = false;
    if (Math.abs(this.ig) > this.triggerI) this.state = true;
    this.aresistance = this.state ? 0.01 : 10e5;
  }

  override doStep(): void {
    const v = this.volts;
    this.diode03.doStep(v[MT2] - v[MTI]);
    this.diode30.doStep(v[MTI] - v[MT2]);
    this.sim.stampResistor(this.nodes[MTI], this.nodes[MT1], this.aresistance);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'TRIAC';
    arr[1] = this.state ? 'on' : 'off';
    arr[2] = 'Vmt2mt1 = ' + getVoltageText(this.volts[MT2] - this.volts[MT1]);
    arr[3] = 'Imt1 = ' + getCurrentText(this.i1);
    arr[4] = 'Imt2 = ' + getCurrentText(this.i2);
    arr[5] = 'Ig = ' + getCurrentText(this.ig);
    arr[6] = 'P = ' + getUnitText(this.getPower(), 'W');
  }

  override calculateCurrent(): void {
    const v = this.volts;
    // aresistance can be 0 on startup
    if (this.aresistance === 0) this.i2 = 0;
    else this.i2 = (v[MTI] - v[MT1]) / this.aresistance;
    this.ig = -(v[MT1] - v[GNODE]) / this.cresistance;
    this.i1 = -this.i2 - this.ig;
  }

  override getPower(): number {
    const v = this.volts;
    return (v[MT2] - v[MT1]) * this.i2 + (v[GNODE] - v[MT1]) * this.ig;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Trigger Current (A)', this.triggerI, 0, 0).setPositive();
    if (n === 1) return new EditInfo('Holding Current (A)', this.holdingI, 0, 0).setPositive();
    if (n === 2)
      return new EditInfo('Gate-MT1 Resistance (ohms)', this.cresistance, 0, 0).setPositive();
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.triggerI = ei.value;
    if (n === 1) this.holdingI = ei.value;
    if (n === 2) this.cresistance = ei.value;
  }

  override canViewInScope(): boolean {
    return true;
  }
  override getVoltageDiff(): number {
    return this.volts[MT2] - this.volts[MT1];
  }
  /** For the scope. */
  override getCurrent(): number {
    return this.i2;
  }
}

export const TriacElmType = elementType('TriacElm', TriacElm);
