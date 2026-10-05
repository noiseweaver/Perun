// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/AnalogMuxElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { ChipElm, SIDE_E, SIDE_S, SIDE_W } from './ChipElm.ts';

/**
 * An analog multiplexer: the select inputs pick which of the 2^n inputs connects to Z through
 * the on resistance; the others see the off resistance (to ground with the pulldown option).
 */
export class AnalogMuxElm extends ChipElm {
  static readonly FLAG_PULLDOWN = 2;

  selectBitCount = 2;
  inputCount = 4;
  outputPin = 6;
  r_on = 20;
  r_off = 1e10;
  threshold = 2.5;

  override getClassName(): string {
    return 'AnalogMuxElm';
  }
  override getDumpType(): number {
    return 432;
  }
  override getChipName(): string {
    return 'Analog Mux';
  }
  override nonLinear(): boolean {
    return true;
  }

  override initNew(): void {
    // upstream's ChipElm constructor sets the pins up before the select bit count is known
    this.selectBitCount = 0;
    super.initNew();
    this.selectBitCount = 2;
    this.r_on = 20;
    this.r_off = 1e10;
    this.threshold = 2.5;
    this.flags |= AnalogMuxElm.FLAG_PULLDOWN;
    this.setupPins();
  }

  override undump(st: StringTokenizer): void {
    this.selectBitCount = 0;
    super.undump(st);
    this.selectBitCount = 2;
    this.r_on = 20;
    this.r_off = 1e10;
    this.threshold = 2.5;
    try {
      this.selectBitCount = parseJavaInt(st.nextToken());
      this.r_on = parseJavaDouble(st.nextToken());
      this.r_off = parseJavaDouble(st.nextToken());
      this.threshold = parseJavaDouble(st.nextToken());
    } catch {
      // older files stop early
    }
    this.setupPins();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('sb', this.selectBitCount);
    w.dumpAttr('ron', this.r_on);
    w.dumpAttr('rof', this.r_off);
    w.dumpAttr('thr', this.threshold);
  }

  override undumpXml(r: XmlAttrReader): void {
    // read selectBitCount before super.undumpXml() since ChipElm calls setupPins() there
    this.selectBitCount = r.parseIntAttr('sb', this.selectBitCount);
    super.undumpXml(r);
    this.r_on = r.parseDoubleAttr('ron', this.r_on);
    this.r_off = r.parseDoubleAttr('rof', this.r_off);
    this.threshold = r.parseDoubleAttr('thr', this.threshold);
  }

  setupPins(): void {
    this.inputCount = 1 << this.selectBitCount;
    this.sizeX = this.selectBitCount + 1;
    this.sizeY = this.inputCount + 1;
    this.pins = new Array(this.getPostCount());
    for (let i = 0; i !== this.inputCount; i++) this.pins[i] = this.newPin(i, SIDE_W, 'I' + i);
    for (let i = 0; i !== this.selectBitCount; i++)
      this.pins[this.inputCount + i] = this.newPin(i + 1, SIDE_S, 'S' + i);
    this.outputPin = this.inputCount + this.selectBitCount;
    this.pins[this.outputPin] = this.newPin(0, SIDE_E, 'Z');
    this.allocNodes();
  }

  override getPostCount(): number {
    return this.inputCount + this.selectBitCount + 1;
  }

  // no voltage sources: purely resistive connections
  override getVoltageSourceCount(): number {
    return 0;
  }

  needsPulldown(): boolean {
    return this.hasFlag(AnalogMuxElm.FLAG_PULLDOWN);
  }

  selectedInput(): number {
    let sel = 0;
    for (let i = 0; i !== this.selectBitCount; i++)
      if (this.volts[this.inputCount + i] > this.threshold) sel |= 1 << i;
    return sel;
  }

  override stamp(): void {
    // all data nodes are nonlinear (the selected input changes)
    for (let i = 0; i !== this.inputCount; i++) this.sim.stampNonLinear(this.nodes[i]);
    this.sim.stampNonLinear(this.nodes[this.outputPin]);
  }

  override doStep(): void {
    const selectedInput = this.selectedInput();
    const n = this.nodes;
    // r_on between the output and the selected input; the others get r_off to the output, or to
    // ground with the pulldown flag (better conditioned, and no floating inputs)
    for (let i = 0; i !== this.inputCount; i++) {
      if (i === selectedInput) this.sim.stampResistor(n[i], n[this.outputPin], this.r_on);
      else if (this.needsPulldown()) this.sim.stampResistor(n[i], this.sim.ground, this.r_off);
      else this.sim.stampResistor(n[i], n[this.outputPin], this.r_off);
    }
  }

  override calculateCurrent(): void {
    const selectedInput = this.selectedInput();
    const v = this.volts;
    let outputCurrent = 0;
    for (let i = 0; i !== this.inputCount; i++) {
      if (i === selectedInput) {
        const c = (v[i] - v[this.outputPin]) / this.r_on;
        this.pins[i].current = -c;
        outputCurrent += c;
      } else if (this.needsPulldown()) {
        this.pins[i].current = -v[i] / this.r_off;
      } else {
        const c = (v[i] - v[this.outputPin]) / this.r_off;
        this.pins[i].current = -c;
        outputCurrent += c;
      }
    }
    this.pins[this.outputPin].current = outputCurrent;
    // select pins carry no current
    for (let i = 0; i !== this.selectBitCount; i++) this.pins[this.inputCount + i].current = 0;
  }

  override getConnection(n1: number, n2: number): boolean {
    // select pins are not connected to anything
    if (n1 >= this.inputCount && n1 < this.outputPin) return false;
    if (n2 >= this.inputCount && n2 < this.outputPin) return false;
    return true;
  }

  override hasGroundConnection(n1: number): boolean {
    return this.needsPulldown() && n1 < this.inputCount;
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'analog multiplexer';
    arr[1] = 'selected: I' + this.selectedInput();
    arr[2] = 'Vout = ' + getVoltageText(this.volts[this.outputPin]);
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0)
      return new EditInfo('# of Select Bits', this.selectBitCount, 1, 8).setDimensionless();
    if (n === 1) return new EditInfo('On Resistance (ohms)', this.r_on, 0, 0).setPositive();
    if (n === 2) return new EditInfo('Off Resistance (ohms)', this.r_off, 0, 0).setPositive();
    if (n === 3) return new EditInfo('Threshold Voltage', this.threshold, 0, 0);
    if (n === 4) return EditInfo.createCheckbox('Pulldown Resistor', this.needsPulldown());
    return super.getChipEditInfo(n);
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      if (ei.value >= 1 && ei.value <= 6) {
        this.selectBitCount = Math.trunc(ei.value);
        this.setupPins();
        this.setPoints();
      } else ei.setError('must be between 1 and 6');
      return;
    }
    if (n === 1 && ei.value > 0) this.r_on = ei.value;
    if (n === 2 && ei.value > 0) this.r_off = ei.value;
    if (n === 3) this.threshold = ei.value;
    if (n === 4) this.flags = ei.changeFlag(this.flags, AnalogMuxElm.FLAG_PULLDOWN);
    super.setChipEditValue(n, ei);
  }
}

export const AnalogMuxElmType = elementType('AnalogMuxElm', AnalogMuxElm);
