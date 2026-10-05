// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/SparkGapElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText, OHM } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

/** A spark gap: conducts once the voltage passes breakdown, until the current falls below hold. */
export class SparkGapElm extends CircuitElm {
  resistance = 0;
  onresistance = 0;
  offresistance = 0;
  breakdown = 0;
  holdcurrent = 0;
  state = false;

  override getClassName(): string {
    return 'SparkGapElm';
  }
  override getDumpType(): number {
    return 187;
  }
  override nonLinear(): boolean {
    return true;
  }

  override initNew(): void {
    this.offresistance = 1e9;
    this.onresistance = 1e3;
    this.breakdown = 1e3;
    this.holdcurrent = 0.001;
    this.state = false;
  }

  override undump(st: StringTokenizer): void {
    this.onresistance = parseJavaDouble(st.nextToken());
    this.offresistance = parseJavaDouble(st.nextToken());
    this.breakdown = parseJavaDouble(st.nextToken());
    this.holdcurrent = parseJavaDouble(st.nextToken());
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('on', this.onresistance);
    w.dumpAttr('of', this.offresistance);
    w.dumpAttr('br', this.breakdown);
    w.dumpAttr('ho', this.holdcurrent);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.onresistance = r.parseDoubleAttr('on', this.onresistance);
    this.offresistance = r.parseDoubleAttr('of', this.offresistance);
    this.breakdown = r.parseDoubleAttr('br', this.breakdown);
    this.holdcurrent = r.parseDoubleAttr('ho', this.holdcurrent);
  }

  override setPoints(): void {
    super.setPoints();
    this.calcLeads(16 + 8);
  }

  override calculateCurrent(): void {
    this.current = (this.volts[0] - this.volts[1]) / this.resistance;
  }

  override reset(): void {
    super.reset();
    this.state = false;
  }

  override startIteration(): void {
    if (Math.abs(this.current) < this.holdcurrent) this.state = false;
    const vd = this.volts[0] - this.volts[1];
    if (Math.abs(vd) > this.breakdown) this.state = true;
  }

  override doStep(): void {
    this.resistance = this.state ? this.onresistance : this.offresistance;
    this.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
  }

  override stamp(): void {
    this.sim.stampNonLinear(this.nodes[0]);
    this.sim.stampNonLinear(this.nodes[1]);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'spark gap';
    this.getBasicInfo(arr);
    arr[3] = this.state ? 'on' : 'off';
    arr[4] = 'Ron = ' + getUnitText(this.onresistance, OHM);
    arr[5] = 'Roff = ' + getUnitText(this.offresistance, OHM);
    arr[6] = 'Vbreakdown = ' + getUnitText(this.breakdown, 'V');
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('On resistance (ohms)', this.onresistance, 0, 0);
    if (n === 1) return new EditInfo('Off resistance (ohms)', this.offresistance, 0, 0);
    if (n === 2) return new EditInfo('Breakdown voltage', this.breakdown, 0, 0);
    if (n === 3) return new EditInfo('Holding current (A)', this.holdcurrent, 0, 0);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (ei.value > 0 && n === 0) this.onresistance = ei.value;
    if (ei.value > 0 && n === 1) this.offresistance = ei.value;
    if (ei.value > 0 && n === 2) this.breakdown = ei.value;
    if (ei.value > 0 && n === 3) this.holdcurrent = ei.value;
  }
}

export const SparkGapElmType = elementType('SparkGapElm', SparkGapElm);
