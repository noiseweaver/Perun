// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/MemristorElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import { UNITS_OHMS, VAL_R } from '../scope/constants.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText, OHM } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

/** A memristor: the HP linear dopant-drift model. */
export class MemristorElm extends CircuitElm {
  r_on = 0;
  r_off = 0;
  dopeWidth = 0;
  totalWidth = 0;
  mobility = 0;
  resistance = 0;

  override getClassName(): string {
    return 'MemristorElm';
  }
  override getDumpType(): number {
    return 'm'.charCodeAt(0);
  }

  override initNew(): void {
    this.r_on = 100;
    this.r_off = 160 * this.r_on;
    this.dopeWidth = 0;
    this.totalWidth = 10e-9; // meters
    this.mobility = 1e-10; // m^2/sV
    this.resistance = 100;
  }

  override undump(st: StringTokenizer): void {
    this.r_on = parseJavaDouble(st.nextToken());
    this.r_off = parseJavaDouble(st.nextToken());
    this.dopeWidth = parseJavaDouble(st.nextToken());
    this.totalWidth = parseJavaDouble(st.nextToken());
    this.mobility = parseJavaDouble(st.nextToken());
    try {
      this.current = parseJavaDouble(st.nextToken());
    } catch {
      // older files stop early
    }
    this.resistance = 100;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('ron', this.r_on);
    w.dumpAttr('rof', this.r_off);
    w.dumpAttr('do', this.dopeWidth);
    w.dumpAttr('to', this.totalWidth);
    w.dumpAttr('mo', this.mobility);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.r_on = r.parseDoubleAttr('ron', this.r_on);
    this.r_off = r.parseDoubleAttr('rof', this.r_off);
    this.dopeWidth = r.parseDoubleAttr('do', this.dopeWidth);
    this.totalWidth = r.parseDoubleAttr('to', this.totalWidth);
    this.mobility = r.parseDoubleAttr('mo', this.mobility);
  }

  override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
  }

  override nonLinear(): boolean {
    return true;
  }

  override calculateCurrent(): void {
    this.current = (this.volts[0] - this.volts[1]) / this.resistance;
  }

  override reset(): void {
    this.dopeWidth = 0;
  }

  override startIteration(): void {
    const wd = this.dopeWidth / this.totalWidth;
    this.dopeWidth +=
      (this.sim.timeStep * this.mobility * this.r_on * this.current) / this.totalWidth;
    if (this.dopeWidth < 0) this.dopeWidth = 0;
    if (this.dopeWidth > this.totalWidth) this.dopeWidth = this.totalWidth;
    this.resistance = this.r_on * wd + this.r_off * (1 - wd);
  }

  override stamp(): void {
    this.sim.stampNonLinear(this.nodes[0]);
    this.sim.stampNonLinear(this.nodes[1]);
  }

  override doStep(): void {
    this.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'memristor';
    this.getBasicInfo(arr);
    arr[3] = 'R = ' + getUnitText(this.resistance, OHM);
    arr[4] = 'P = ' + getUnitText(this.getPower(), 'W');
  }

  override getScopeValue(x: number): number {
    return x === VAL_R ? this.resistance : super.getScopeValue(x);
  }
  override getScopeUnits(x: number): number {
    return x === VAL_R ? UNITS_OHMS : super.getScopeUnits(x);
  }
  override canShowValueInScope(x: number): boolean {
    return x === VAL_R;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Min Resistance (ohms)', this.r_on, 0, 0);
    if (n === 1) return new EditInfo('Max Resistance (ohms)', this.r_off, 0, 0);
    if (n === 2) return new EditInfo('Width of Doped Region (nm)', this.dopeWidth * 1e9, 0, 0);
    if (n === 3) return new EditInfo('Total Width (nm)', this.totalWidth * 1e9, 0, 0);
    if (n === 4) return new EditInfo('Mobility (um^2/(s*V))', this.mobility * 1e12, 0, 0);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.r_on = ei.value;
    if (n === 1) this.r_off = ei.value;
    if (n === 2) this.dopeWidth = ei.value * 1e-9;
    if (n === 3) this.totalWidth = ei.value * 1e-9;
    if (n === 4) this.mobility = ei.value * 1e-12;
  }
}

export const MemristorElmType = elementType('MemristorElm', MemristorElm);
