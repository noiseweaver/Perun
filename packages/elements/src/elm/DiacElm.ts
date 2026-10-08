// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/DiacElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import { modelsFor } from '../models/ModelLibrary.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText, OHM } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { Diode } from './Diode.ts';

/** A DIAC: resistors from node 0 to internal nodes 2 and 3, and diodes from those to node 1. */
export class DiacElm extends CircuitElm {
  onresistance = 0;
  offresistance = 0;
  breakdown = 0;
  holdcurrent = 0;
  state = false;
  diode1 = new Diode(this);
  diode2 = new Diode(this);

  override getClassName(): string {
    return 'DiacElm';
  }
  override getDumpType(): number {
    return 203;
  }
  override nonLinear(): boolean {
    return true;
  }

  override initNew(): void {
    this.offresistance = 1e8;
    this.onresistance = 500;
    this.breakdown = 30;
    this.holdcurrent = 0.01;
    this.state = false;
    this.createDiodes();
  }

  override undump(st: StringTokenizer): void {
    this.onresistance = parseJavaDouble(st.nextToken());
    this.offresistance = parseJavaDouble(st.nextToken());
    this.breakdown = parseJavaDouble(st.nextToken());
    this.holdcurrent = parseJavaDouble(st.nextToken());
    this.createDiodes();
  }

  createDiodes(): void {
    const dm = modelsFor(this.sim).diode.getDefaultModel();
    this.diode1 = new Diode(this);
    this.diode2 = new Diode(this);
    this.diode1.setup(dm);
    this.diode2.setup(dm);
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('ron', this.onresistance);
    w.dumpAttr('roff', this.offresistance);
    w.dumpAttr('bd', this.breakdown);
    w.dumpAttr('hc', this.holdcurrent);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.onresistance = r.parseDoubleAttr('ron', this.onresistance);
    this.offresistance = r.parseDoubleAttr('roff', this.offresistance);
    this.breakdown = r.parseDoubleAttr('bd', this.breakdown);
    this.holdcurrent = r.parseDoubleAttr('hc', this.holdcurrent);
  }

  override setPoints(): void {
    super.setPoints();
    this.calcLeads(16);
  }

  override calculateCurrent(): void {
    const r = this.state ? this.onresistance : this.offresistance;
    this.current = (this.volts[0] - this.volts[2]) / r + (this.volts[0] - this.volts[3]) / r;
  }

  override startIteration(): void {
    const vd = this.volts[0] - this.volts[1];
    if (Math.abs(this.current) < this.holdcurrent) this.state = false;
    if (Math.abs(vd) > this.breakdown) this.state = true;
  }

  override doStep(): void {
    const r = this.state ? this.onresistance : this.offresistance;
    const n = this.nodes;
    this.sim.stampResistor(n[0], n[2], r);
    this.sim.stampResistor(n[0], n[3], r);
    this.diode1.doStep(this.volts[2] - this.volts[1]);
    this.diode2.doStep(this.volts[1] - this.volts[3]);
  }

  override stamp(): void {
    const n = this.nodes;
    this.sim.stampNonLinear(n[0]);
    this.sim.stampNonLinear(n[1]);
    this.diode1.stamp(n[2], n[1]);
    this.diode2.stamp(n[1], n[3]);
  }

  override getInternalNodeCount(): number {
    return 2;
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'DIAC';
    this.getBasicInfo(arr);
    arr[3] = this.state ? 'on' : 'off';
    arr[4] = 'Ron = ' + getUnitText(this.onresistance, OHM);
    arr[5] = 'Roff = ' + getUnitText(this.offresistance, OHM);
    arr[6] = 'Vbrkdn = ' + getUnitText(this.breakdown, 'V');
    arr[7] = 'Ihold = ' + getUnitText(this.holdcurrent, 'A');
    arr[8] = 'P = ' + getUnitText(this.getPower(), 'W');
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('On resistance (ohms)', this.onresistance, 0, 0);
    if (n === 1) return new EditInfo('Off resistance (ohms)', this.offresistance, 0, 0);
    if (n === 2) return new EditInfo('Breakdown voltage (volts)', this.breakdown, 0, 0);
    if (n === 3) return new EditInfo('Hold current (amps)', this.holdcurrent, 0, 0);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (ei.value > 0 && n === 0) this.onresistance = ei.value;
    if (ei.value > 0 && n === 1) this.offresistance = ei.value;
    if (ei.value > 0 && n === 2) this.breakdown = ei.value;
    if (ei.value > 0 && n === 3) this.holdcurrent = ei.value;
  }
}

export const DiacElmType = elementType('DiacElm', DiacElm);
