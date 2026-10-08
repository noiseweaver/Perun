// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/AnalogSwitchElm.java and
// AnalogSwitch2Elm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Point } from '@perun/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentDText, getVoltageDText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

/** SPST switch closed by a control voltage (post 2) above the threshold. */
export class AnalogSwitchElm extends CircuitElm {
  static readonly FLAG_INVERT = 1;
  static readonly FLAG_PULLDOWN = 2;
  // All three flags are needed to keep track of flipping. FLAG_FLIPPED_X/Y affect the rounding
  // direction if the element is an odd grid length; FLAG_FLIPPED does not.
  static readonly FLAG_FLIPPED_X = 4;
  static readonly FLAG_FLIPPED_Y = 8;
  static readonly FLAG_FLIPPED = 16;

  resistance = 0;
  r_on = 20;
  r_off = 1e10;
  threshold = 2.5;
  open = false;
  openhs = 16;
  point3: Point = this.point1;
  lead3: Point = this.point1;

  override getClassName(): string {
    return 'AnalogSwitchElm';
  }
  override getDumpType(): number {
    return 159;
  }
  override getXmlDumpType(): string {
    return 'as';
  }

  override initNew(): void {
    this.noDiagonal = true;
    this.flags |= AnalogSwitchElm.FLAG_PULLDOWN;
  }

  override undump(st: StringTokenizer): void {
    this.noDiagonal = true;
    try {
      this.r_on = parseJavaDouble(st.nextToken());
      this.r_off = parseJavaDouble(st.nextToken());
      this.threshold = parseJavaDouble(st.nextToken());
    } catch {
      // older files lack some of these
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('ron', this.r_on);
    w.dumpAttr('roff', this.r_off);
    w.dumpAttr('th', this.threshold);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.r_on = r.parseDoubleAttr('ron', this.r_on);
    this.r_off = r.parseDoubleAttr('roff', this.r_off);
    this.threshold = r.parseDoubleAttr('th', this.threshold);
    this.noDiagonal = true;
  }

  override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    this.adjustLeadsToGrid(this.isFlippedX(), this.isFlippedY());
    this.openhs = (this.isFlippedX() !== this.isFlippedY()) !== this.isFlipped() ? -16 : 16;
    this.point3 = this.interpPointPerp(this.lead1, this.lead2, 0.5, -this.openhs);
    this.lead3 = this.interpPointPerp(this.lead1, this.lead2, 0.5, -this.openhs / 2);
  }

  isFlippedX(): boolean {
    return this.hasFlag(AnalogSwitchElm.FLAG_FLIPPED_X);
  }
  isFlippedY(): boolean {
    return this.hasFlag(AnalogSwitchElm.FLAG_FLIPPED_Y);
  }
  isFlipped(): boolean {
    return this.hasFlag(AnalogSwitchElm.FLAG_FLIPPED);
  }

  override flipX(c2: number, count: number): void {
    this.flags ^= AnalogSwitchElm.FLAG_FLIPPED_X;
    super.flipX(c2, count);
  }
  override flipY(c2: number, count: number): void {
    this.flags ^= AnalogSwitchElm.FLAG_FLIPPED_Y;
    super.flipY(c2, count);
  }
  override flipXY(c2: number, count: number): void {
    this.flags ^= AnalogSwitchElm.FLAG_FLIPPED;
    super.flipXY(c2, count);
  }

  override calculateCurrent(): void {
    if (this.resistance === 0) return;
    if (this.needsPulldown() && this.open) this.current = 0;
    else this.current = (this.volts[0] - this.volts[1]) / this.resistance;
  }

  // we need this to be able to change the matrix for each step
  override nonLinear(): boolean {
    return true;
  }
  needsPulldown(): boolean {
    return this.hasFlag(AnalogSwitchElm.FLAG_PULLDOWN);
  }

  override stamp(): void {
    const sim = this.sim;
    sim.stampNonLinear(this.nodes[0]);
    sim.stampNonLinear(this.nodes[1]);
    if (this.needsPulldown()) {
      // pulldown resistor on each side
      sim.stampResistor(this.nodes[0], sim.ground, this.r_off);
      sim.stampResistor(this.nodes[1], sim.ground, this.r_off);
    }
  }

  override doStep(): void {
    this.open = this.volts[2] < this.threshold;
    if (this.hasFlag(AnalogSwitchElm.FLAG_INVERT)) this.open = !this.open;
    // with the pulldown flag an open switch is no connection; without it, r_off
    if (!(this.needsPulldown() && this.open)) {
      this.resistance = this.open ? this.r_off : this.r_on;
      this.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
    }
  }

  override getPostCount(): number {
    return 3;
  }
  override getPost(n: number): Point {
    return n === 0 ? this.point1 : n === 1 ? this.point2 : this.point3;
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'analog switch';
    arr[1] = this.open ? 'open' : 'closed';
    arr[2] = 'Vd = ' + getVoltageDText(this.getVoltageDiff());
    arr[3] = 'I = ' + getCurrentDText(this.getCurrent());
    arr[4] = 'Vc = ' + getVoltageText(this.volts[2]);
  }

  override getElmType(): string {
    return 'analog switch';
  }

  // we have to just assume current will flow either way, even though that might cause singular
  // matrix errors
  override getConnection(n1: number, n2: number): boolean {
    return !(n1 === 2 || n2 === 2);
  }
  override hasGroundConnection(n1: number): boolean {
    return this.needsPulldown() && n1 < 2;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0)
      return EditInfo.createCheckbox('Normally closed', this.hasFlag(AnalogSwitchElm.FLAG_INVERT));
    if (n === 1) return new EditInfo('On Resistance (ohms)', this.r_on, 0, 0).setPositive();
    if (n === 2) return new EditInfo('Off Resistance (ohms)', this.r_off, 0, 0).setPositive();
    if (n === 3) return EditInfo.createCheckbox('Pulldown Resistor', this.needsPulldown());
    if (n === 4) return new EditInfo('Threshold', this.threshold, 10, -10);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.flags = ei.changeFlag(this.flags, AnalogSwitchElm.FLAG_INVERT);
    if (n === 1 && ei.value > 0) this.r_on = ei.value;
    if (n === 2 && ei.value > 0) this.r_off = ei.value;
    if (n === 3) this.flags = ei.changeFlag(this.flags, AnalogSwitchElm.FLAG_PULLDOWN);
    if (n === 4) this.threshold = ei.value;
  }

  override getCurrentIntoNode(n: number): number {
    if (n === 2) return 0;
    if (n === 0) return -this.current;
    return this.current;
  }
}

/** SPDT analog switch: post 0 is the common, 1 and 2 the throws, 3 the control. */
export class AnalogSwitch2Elm extends AnalogSwitchElm {
  swposts: Point[] = [];
  swpoles: Point[] = [];
  ctlPoint: Point = this.point1;
  labelPts: Point[] = [];

  override getClassName(): string {
    return 'AnalogSwitch2Elm';
  }
  override getDumpType(): number {
    return 160;
  }
  override getXmlDumpType(): string {
    return 'as2';
  }

  override setPoints(): void {
    super.setPoints();
    // upstream calls calcLeads again, which drops the grid adjustment, then adjusts again
    this.calcLeads(32);
    this.adjustLeadsToGrid(this.isFlippedX(), this.isFlippedY());
    this.swpoles = this.interpPoint2(this.lead1, this.lead2, 1, this.openhs);
    this.swposts = this.interpPoint2(this.point1, this.point2, 1, this.openhs);
    this.labelPts = this.interpPoint2(
      this.point1,
      this.point2,
      1 - 10 / this.dn,
      this.openhs + (this.openhs > 0 ? 10 : -10),
    );
    this.ctlPoint = this.interpPointPerp(this.lead1, this.lead2, 0.5, this.openhs);
  }

  override getPostCount(): number {
    return 4;
  }
  override getPost(n: number): Point {
    return n === 0 ? this.point1 : n === 3 ? this.ctlPoint : this.swposts[n - 1];
  }

  override calculateCurrent(): void {
    if (this.open) this.current = (this.volts[0] - this.volts[2]) / this.r_on;
    else this.current = (this.volts[0] - this.volts[1]) / this.r_on;
  }

  override stamp(): void {
    const sim = this.sim;
    sim.stampNonLinear(this.nodes[0]);
    sim.stampNonLinear(this.nodes[1]);
    sim.stampNonLinear(this.nodes[2]);
    if (this.needsPulldown()) {
      sim.stampResistor(this.nodes[1], sim.ground, this.r_off);
      sim.stampResistor(this.nodes[2], sim.ground, this.r_off);
    }
  }

  override doStep(): void {
    this.open = this.volts[3] < this.threshold;
    if (this.hasFlag(AnalogSwitchElm.FLAG_INVERT)) this.open = !this.open;
    const sim = this.sim;
    if (this.open) {
      sim.stampResistor(this.nodes[0], this.nodes[2], this.r_on);
      if (!this.needsPulldown()) sim.stampResistor(this.nodes[0], this.nodes[1], this.r_off);
    } else {
      sim.stampResistor(this.nodes[0], this.nodes[1], this.r_on);
      if (!this.needsPulldown()) sim.stampResistor(this.nodes[0], this.nodes[2], this.r_off);
    }
  }

  // current is assumed to flow either way whatever the position, since getConnection() decides
  // the matrix closures and can't depend on "open", which changes every step
  override getConnection(n1: number, n2: number): boolean {
    return n1 !== 3 && n2 !== 3;
  }
  override hasGroundConnection(n: number): boolean {
    return this.needsPulldown() && (n === 1 || n === 2);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'analog switch (SPDT)';
    arr[1] = 'I = ' + getCurrentDText(this.getCurrent());
  }

  // the SPDT switch is never fully open, so the flag instead swaps which throw is NO and NC
  override getEditInfo(n: number): EditInfo | null {
    if (n === 0)
      return EditInfo.createCheckbox('Swap NO/NC', this.hasFlag(AnalogSwitchElm.FLAG_INVERT));
    return super.getEditInfo(n);
  }

  override getCurrentIntoNode(n: number): number {
    if (n === 0) return -this.current;
    const position = this.open ? 1 : 0;
    if (n === position + 1) return this.current;
    return 0;
  }
}

export const AnalogSwitchElmType = elementType('AnalogSwitchElm', AnalogSwitchElm);
export const AnalogSwitch2ElmType = elementType('AnalogSwitch2Elm', AnalogSwitch2Elm);
