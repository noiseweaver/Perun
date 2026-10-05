// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CC2Elm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType, type ElementType } from '../CircuitElm.ts';
import { parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { ChipElm, SIDE_E, SIDE_W } from './ChipElm.ts';

/** A second-generation current conveyor: X follows Y, and Z sources gain times X's current. */
export class CC2Elm extends ChipElm {
  gain = 1;

  override getClassName(): string {
    return 'CC2Elm';
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.gain = parseJavaDouble(st.nextToken());
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('ga', this.gain);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.gain = r.parseDoubleAttr('ga', this.gain);
  }

  override getChipName(): string {
    return 'CC2';
  }

  setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 3;
    this.pins = new Array(3);
    this.pins[0] = this.newPin(0, SIDE_W, 'X');
    this.pins[0].output = true;
    this.pins[1] = this.newPin(2, SIDE_W, 'Y');
    this.pins[2] = this.newPin(1, SIDE_E, 'Z');
  }

  override getElmType(): string {
    return 'CCII';
  }

  override getInfo(arr: string[]): void {
    arr[0] = this.gain === 1 ? 'CCII+' : 'CCII-';
    arr[1] = 'X,Y = ' + getVoltageText(this.volts[0]);
    arr[2] = 'Z = ' + getVoltageText(this.volts[2]);
    arr[3] = 'I = ' + getCurrentText(this.pins[0].current);
  }

  override isDigitalChip(): boolean {
    return false;
  }

  override stamp(): void {
    const sim = this.sim;
    const vs = this.pinVoltSource(0);
    // X voltage = Y voltage
    sim.stampVoltageSource(sim.ground, this.nodes[0], vs);
    sim.stampVCVS(sim.ground, this.nodes[1], 1, vs);
    // Z current = gain * X current
    sim.stampCCCS(sim.ground, this.nodes[2], vs, this.gain);
  }

  override calculateCurrent(): void {
    super.calculateCurrent();
    this.pins[2].current = this.pins[0].current * this.gain;
  }

  override getPostCount(): number {
    return 3;
  }
  override getVoltageSourceCount(): number {
    return 1;
  }
  override getDumpType(): number {
    return 179;
  }
  override getMatrixConnection(_n1: number, _n2: number): boolean {
    return true;
  }
}

/** The inverting conveyor (CCII-); saved as a CC2Elm with gain -1. */
export class CC2NegElm extends CC2Elm {
  override getClassName(): string {
    return 'CC2NegElm';
  }
  override initNew(): void {
    super.initNew();
    this.gain = -1;
  }
}

export const CC2ElmType = elementType('CC2Elm', CC2Elm);
export const CC2NegElmType: ElementType = {
  ...elementType('CC2NegElm', CC2NegElm),
  dumpClass: 'CC2Elm',
};
