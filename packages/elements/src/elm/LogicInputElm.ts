// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/LogicInputElm.java,
// LogicOutputElm.java and BusLogicInputElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Point, type VoltageSource } from '@perun/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt, parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { SwitchElm } from './SwitchElm.ts';
import type { WireRouter } from '../WireRouter.ts';

/** A logic level source toggled by clicking: L/H, or 0/1/2 when ternary. */
export class LogicInputElm extends SwitchElm {
  override addRoutingObstacle(router: WireRouter): void {
    router.addWire(this.point1.x, this.point1.y, this.lead1.x, this.lead1.y);
    router.addObstacle(this.x2 - 10, this.y2 - 10, this.x2 + 10, this.y2 + 10);
  }

  static readonly FLAG_TERNARY = 1;
  static readonly FLAG_NUMERIC = 2;

  hiV = 5;
  loV = 0;

  override getClassName(): string {
    return 'LogicInputElm';
  }
  override getDumpType(): number {
    return 'L'.charCodeAt(0);
  }

  override initNew(): void {
    super.initNew();
    this.hiV = 5;
    this.loV = 0;
  }

  protected override isLogicInput(): boolean {
    return true;
  }
  override isLogicInputElm(): boolean {
    return true;
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    try {
      this.hiV = parseJavaDouble(st.nextToken());
      this.loV = parseJavaDouble(st.nextToken());
    } catch {
      this.hiV = 5;
      this.loV = 0;
    }
    if (this.isTernary()) this.posCount = 3;
  }

  isTernary(): boolean {
    return (this.flags & LogicInputElm.FLAG_TERNARY) !== 0;
  }
  isNumeric(): boolean {
    return (this.flags & (LogicInputElm.FLAG_TERNARY | LogicInputElm.FLAG_NUMERIC)) !== 0;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    if (this.hiV !== 5) w.dumpAttr('hi', this.hiV);
    if (this.loV !== 0) w.dumpAttr('lo', this.loV);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.hiV = r.parseDoubleAttr('hi', this.hiV);
    this.loV = r.parseDoubleAttr('lo', this.loV);
  }

  override getPostCount(): number {
    return 1;
  }

  override setPoints(): void {
    super.setPoints();
    this.lead1 = this.interpPoint(this.point1, this.point2, 1 - 12 / this.dn);
  }

  /** The text shown: L/H, or the position number. */
  displayText(): string {
    if (this.isNumeric()) return '' + this.position;
    return this.position === 0 ? 'L' : 'H';
  }

  override setCurrent(_vs: VoltageSource, c: number): void {
    this.current = c;
  }
  override calculateCurrent(): void {}

  override stamp(): void {
    this.sim.stampVoltageSource(this.sim.ground, this.nodes[0], this.voltSource);
  }

  override isWireEquivalent(): boolean {
    return false;
  }
  override isRemovableWire(): boolean {
    return false;
  }

  override doStep(): void {
    let v = this.position === 0 ? this.loV : this.hiV;
    if (this.isTernary()) v = this.loV + this.position * (this.hiV - this.loV) * 0.5;
    this.sim.updateVoltageSource(this.sim.ground, this.nodes[0], this.voltSource, v);
  }

  override getVoltageSourceCount(): number {
    return 1;
  }
  override getVoltageDiff(): number {
    return this.volts[0];
  }

  override getElmType(): string {
    return 'logic input';
  }
  override getInfo(arr: string[]): void {
    arr[0] = 'logic input';
    arr[1] = this.position === 0 ? 'low' : 'high';
    if (this.isNumeric()) arr[1] = '' + this.position;
    arr[1] += ' (' + getVoltageText(this.volts[0]) + ')';
    arr[2] = 'I = ' + getCurrentText(this.getCurrent());
  }

  override hasGroundConnection(_n1: number): boolean {
    return true;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return EditInfo.createCheckbox('Momentary Switch', this.momentary);
    if (n === 1) return new EditInfo('High Logic Voltage', this.hiV, 10, -10).setUnitStep();
    if (n === 2) return new EditInfo('Low Voltage', this.loV, 10, -10).setUnitStep();
    if (n === 3) return EditInfo.createCheckbox('Numeric', this.isNumeric());
    if (n === 4) return EditInfo.createCheckbox('Ternary', this.isTernary());
    if (n === 5) return this.getKeyShortcutEditInfo();
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.momentary = ei.checkbox?.state === true;
    if (n === 1) this.hiV = ei.value;
    if (n === 2) this.loV = ei.value;
    if (n === 3) this.flags = ei.changeFlag(this.flags, LogicInputElm.FLAG_NUMERIC);
    if (n === 4) {
      this.flags = ei.changeFlag(this.flags, LogicInputElm.FLAG_TERNARY);
      this.posCount = this.isTernary() ? 3 : 2;
    }
    if (n === 5) this.setKeyShortcutEditValue(ei);
  }

  override getShortcut(): number {
    return 'i'.charCodeAt(0);
  }

  override getCurrentIntoNode(_n: number): number {
    return this.current;
  }

  override validate(): boolean {
    return this.validateRailNode(0);
  }
}

/** Shows the logic level at its post: L/H, 0/1, or 0/1/2 when ternary. */
export class LogicOutputElm extends CircuitElm {
  override addRoutingObstacle(router: WireRouter): void {
    router.addWire(this.point1.x, this.point1.y, this.lead1.x, this.lead1.y);
    router.addObstacle(this.x2 - 10, this.y2 - 10, this.x2 + 10, this.y2 + 10);
  }

  static readonly FLAG_TERNARY = 1;
  static readonly FLAG_NUMERIC = 2;
  static readonly FLAG_PULLDOWN = 4;

  threshold = 2.5;
  /** The text last shown (upstream sets it while drawing; here `displayText` computes it). */
  value = '';

  override getClassName(): string {
    return 'LogicOutputElm';
  }
  override getDumpType(): number {
    return 'M'.charCodeAt(0);
  }

  override initNew(): void {
    this.threshold = 2.5;
  }

  override undump(st: StringTokenizer): void {
    try {
      this.threshold = parseJavaDouble(st.nextToken());
    } catch {
      this.threshold = 2.5;
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    if (this.threshold !== 2.5) w.dumpAttr('th', this.threshold);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.threshold = r.parseDoubleAttr('th', this.threshold);
  }

  override getPostCount(): number {
    return 1;
  }
  isTernary(): boolean {
    return (this.flags & LogicOutputElm.FLAG_TERNARY) !== 0;
  }
  isNumeric(): boolean {
    return (this.flags & (LogicOutputElm.FLAG_TERNARY | LogicOutputElm.FLAG_NUMERIC)) !== 0;
  }
  needsPullDown(): boolean {
    return (this.flags & LogicOutputElm.FLAG_PULLDOWN) !== 0;
  }

  override setPoints(): void {
    super.setPoints();
    this.lead1 = this.interpPoint(this.point1, this.point2, 1 - 12 / this.dn);
  }

  displayText(): string {
    const v = this.volts[0];
    let s = v < this.threshold ? 'L' : 'H';
    if (this.isTernary()) {
      // we don't have 2 separate thresholds for ternary inputs so we do this instead
      if (v > this.threshold * 1.5) s = '2';
      else if (v > this.threshold * 0.5) s = '1';
      else s = '0';
    } else if (this.isNumeric()) s = v < this.threshold ? '0' : '1';
    this.value = s;
    return s;
  }

  override stamp(): void {
    if (this.needsPullDown()) this.sim.stampResistor(this.nodes[0], this.sim.ground, 1e6);
  }

  override getVoltageDiff(): number {
    return this.volts[0];
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'logic output';
    arr[1] = this.volts[0] < this.threshold ? 'low' : 'high';
    if (this.isNumeric()) arr[1] = this.displayText();
    arr[2] = 'V = ' + getVoltageText(this.volts[0]);
  }

  override getElmType(): string {
    return 'logic output';
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Threshold', this.threshold, 10, -10);
    if (n === 1) return EditInfo.createCheckbox('Current Required', this.needsPullDown());
    if (n === 2) return EditInfo.createCheckbox('Numeric', this.isNumeric());
    if (n === 3) return EditInfo.createCheckbox('Ternary', this.isTernary());
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.threshold = ei.value;
    if (n === 1) this.flags = ei.changeFlag(this.flags, LogicOutputElm.FLAG_PULLDOWN);
    if (n === 2) this.flags = ei.changeFlag(this.flags, LogicOutputElm.FLAG_NUMERIC);
    if (n === 3) this.flags = ei.changeFlag(this.flags, LogicOutputElm.FLAG_TERNARY);
  }

  override getShortcut(): number {
    return 'o'.charCodeAt(0);
  }
}

/** Drives a bus with a binary value; each click counts up. XML only. */
export class BusLogicInputElm extends SwitchElm {
  busWidth = 4;
  value = 0;
  hiV = 5;
  loV = 0;
  voltageSources: (VoltageSource | null)[] = [];
  currents: number[] = [];

  override getClassName(): string {
    return 'BusLogicInputElm';
  }
  override getDumpType(): number {
    return 0;
  }
  override getXmlDumpType(): string {
    return 'bli';
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('bw', this.busWidth);
    if (this.value !== 0) w.dumpAttr('va', this.value);
    if (this.hiV !== 5) w.dumpAttr('hi', this.hiV);
    if (this.loV !== 0) w.dumpAttr('lo', this.loV);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.busWidth = r.parseIntAttr('bw', this.busWidth);
    this.value = r.parseIntAttr('va', 0);
    this.hiV = r.parseDoubleAttr('hi', this.hiV);
    this.loV = r.parseDoubleAttr('lo', this.loV);
  }

  override getPostCount(): number {
    return this.busWidth;
  }
  override getPostWidth(_n: number): number {
    return this.busWidth;
  }
  override getNumHandles(): number {
    return 1;
  }
  override getVoltageSourceCount(): number {
    return this.busWidth;
  }
  override getPost(n: number): Point {
    return new Point(this.x, this.y, n);
  }

  override setVoltageSource(n: number, v: VoltageSource): void {
    if (this.voltageSources.length !== this.busWidth) {
      this.voltageSources = new Array<VoltageSource | null>(this.busWidth).fill(null);
      this.currents = new Array<number>(this.busWidth).fill(0);
    }
    this.voltageSources[n] = v;
  }

  override setCurrent(vs: VoltageSource, c: number): void {
    for (let i = 0; i < this.busWidth; i++)
      if (this.voltageSources[i] === vs) {
        this.currents[i] = this.current = c;
        break;
      }
  }

  override getCurrentIntoNode(n: number): number {
    return this.currents[n] ?? 0;
  }

  /** Total current of all bits, which upstream computes while drawing. */
  totalCurrent(): number {
    let c = 0;
    for (const i of this.currents) c += i;
    return c;
  }

  override toggle(): void {
    this.value++;
    if (this.value >= 1 << this.busWidth) this.value = 0;
  }

  override stamp(): void {
    for (let i = 0; i < this.busWidth; i++) {
      const v = (this.value & (1 << i)) !== 0 ? this.hiV : this.loV;
      this.sim.stampVoltageSource(this.sim.ground, this.nodes[i], this.voltageSources[i], v);
    }
  }

  override calculateCurrent(): void {}
  override hasGroundConnection(_n: number): boolean {
    return true;
  }
  override isWireEquivalent(): boolean {
    return false;
  }
  override isRemovableWire(): boolean {
    return false;
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'bus input (' + this.busWidth + ')';
    arr[1] = 'value = ' + this.value;
    arr[2] = 'hex = 0x' + (this.value >>> 0).toString(16).toUpperCase();
  }

  override getShortcut(): number {
    return 0;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Bus Width', this.busWidth, 2, 32).setDimensionless();
    if (n === 1) return new EditInfo('Value', this.value).setDimensionless();
    if (n === 2) return new EditInfo('High Voltage', this.hiV).setUnitStep();
    if (n === 3) return new EditInfo('Low Voltage', this.loV).setUnitStep();
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      if (ei.value >= 2) {
        this.busWidth = javaDoubleToInt(ei.value);
        this.allocNodes();
      } else ei.setError('must be >= 2');
    }
    if (n === 1) this.value = javaDoubleToInt(ei.value);
    if (n === 2) this.hiV = ei.value;
    if (n === 3) this.loV = ei.value;
  }
}

export const LogicInputElmType = elementType('LogicInputElm', LogicInputElm);
export const LogicOutputElmType = elementType('LogicOutputElm', LogicOutputElm);
export const BusLogicInputElmType = elementType('BusLogicInputElm', BusLogicInputElm);
