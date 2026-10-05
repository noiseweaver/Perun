// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/FuseElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaBoolean, parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText, OHM } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

const BLOWN_RESISTANCE = 1e9;

/** A fuse: heats with I²t and blows (opens) once the heat passes its rating. */
export class FuseElm extends CircuitElm {
  static readonly FLAG_IEC_SYMBOL = 1;

  // from https://m.littelfuse.com/~/media/electronics/datasheets/fuses/littelfuse_fuse_218_datasheet.pdf.pdf
  resistance = 0.0613;
  i2t = 6.73;
  heat = 0;
  blown = false;

  override getClassName(): string {
    return 'FuseElm';
  }
  override getDumpType(): number {
    return 404;
  }

  override undump(st: StringTokenizer): void {
    this.resistance = parseJavaDouble(st.nextToken());
    this.i2t = parseJavaDouble(st.nextToken());
    this.heat = parseJavaDouble(st.nextToken());
    this.blown = parseJavaBoolean(st.nextToken());
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('re', this.resistance);
    w.dumpAttr('i2', this.i2t);
    w.dumpAttr('he', this.heat);
    w.dumpAttr('bl', this.blown);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.resistance = r.parseDoubleAttr('re', this.resistance);
    this.i2t = r.parseDoubleAttr('i2', this.i2t);
    this.heat = r.parseDoubleAttr('he', this.heat);
    this.blown = r.parseBooleanAttr('bl', this.blown);
  }

  isIECSymbol(): boolean {
    return this.hasFlag(FuseElm.FLAG_IEC_SYMBOL);
  }

  override reset(): void {
    super.reset();
    this.heat = 0;
    this.blown = false;
  }

  override setPoints(): void {
    super.setPoints();
    this.calcLeads(this.isIECSymbol() ? 32 : 16);
  }

  /** Heat over the rating: 0 cold, 1 or more blown. */
  heatLevel(): number {
    return this.heat / this.i2t;
  }

  override calculateCurrent(): void {
    this.current =
      (this.volts[0] - this.volts[1]) / (this.blown ? BLOWN_RESISTANCE : this.resistance);
  }

  override stamp(): void {
    this.sim.stampNonLinear(this.nodes[0]);
    this.sim.stampNonLinear(this.nodes[1]);
  }

  override nonLinear(): boolean {
    return true;
  }

  override startIteration(): void {
    const i = this.getCurrent();
    const ts = this.sim.timeStep;
    // accumulate heat
    this.heat += i * i * ts;
    // dissipate heat.  we assume the fuse can dissipate its entire i2t in 3 seconds
    this.heat -= (ts * this.i2t) / 3;
    if (this.heat < 0) this.heat = 0;
    if (this.heat > this.i2t) this.blown = true;
  }

  override doStep(): void {
    this.sim.stampResistor(
      this.nodes[0],
      this.nodes[1],
      this.blown ? BLOWN_RESISTANCE : this.resistance,
    );
  }

  override getElmType(): string | null {
    return 'fuse';
  }

  override getInfo(arr: string[]): void {
    arr[0] = this.blown ? 'fuse (blown)' : 'fuse';
    this.getBasicInfo(arr);
    arr[3] = 'R = ' + getUnitText(this.resistance, OHM);
    arr[4] = 'I2t = ' + String(this.i2t);
    if (!this.blown) arr[5] = Math.trunc((this.heat * 100) / this.i2t) + '% melted';
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('I2t', this.i2t, 0, 0).setPositive();
    if (n === 1) return new EditInfo('Resistance', this.resistance, 0, 0).setPositive();
    if (n === 2) return EditInfo.createCheckbox('IEC Symbol', this.isIECSymbol());
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.i2t = ei.value;
    if (n === 1) this.resistance = ei.value;
    if (n === 2) {
      this.flags = ei.changeFlag(this.flags, FuseElm.FLAG_IEC_SYMBOL);
      this.setPoints();
    }
  }
}

export const FuseElmType = elementType('FuseElm', FuseElm);
