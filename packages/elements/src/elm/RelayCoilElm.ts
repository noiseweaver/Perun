// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/RelayCoilElm.java and
// RelayContactElm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Point, SimElement } from '@perun/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { unescapeToken } from '../escape.ts';
import { parseJavaDouble, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentDText, getVoltageDText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { Inductor } from './InductorElm.ts';

/** A relay coil that throws every RelayContactElm with the same label. */
export class RelayCoilElm extends CircuitElm {
  static readonly TYPE_NORMAL = 0;
  static readonly TYPE_ON_DELAY = 1;
  static readonly TYPE_OFF_DELAY = 2;
  static readonly TYPE_LATCHING = 3;
  static readonly TYPE_LATCHING_ON = 4;
  static readonly TYPE_LATCHING_OFF = 5;

  static isLatchingType(t: number): boolean {
    return (
      t === RelayCoilElm.TYPE_LATCHING ||
      t === RelayCoilElm.TYPE_LATCHING_ON ||
      t === RelayCoilElm.TYPE_LATCHING_OFF
    );
  }

  inductance = 0;
  ind = new Inductor(this);
  label = '';
  onCurrent = 0;
  offCurrent = 0;
  coilPosts: Point[] = [];
  coilLeads: Point[] = [];
  outline: Point[] = [];
  extraPoints: Point[] = [];
  coilCurrent = 0;
  avgCurrent = 0;
  d_position = 0;
  i_position = 0;
  coilR = 0;
  /** Time to switch, in seconds. */
  switchingTime = 0;
  switchingTimeOn = 0;
  switchingTimeOff = 0;
  lastTransition = 0;
  openhs = 0;
  /** 0 waits for onCurrent, 1 to turn on, 2 for offCurrent, 3 to turn off. */
  state = 0;
  switchPosition = 0;
  type = 0;
  nCoil1 = 0;
  nCoil2 = 1;
  nCoil3 = 2;
  currentOffset1 = 0;
  currentOffset2 = 0;
  elmList: SimElement[] = [];

  override getClassName(): string {
    return 'RelayCoilElm';
  }
  override getDumpType(): number {
    return 425;
  }

  override initNew(): void {
    this.inductance = 0.2;
    this.ind.setup(this.inductance, 0, Inductor.FLAG_BACK_EULER);
    this.noDiagonal = true;
    this.onCurrent = 0.02;
    this.offCurrent = 0.015;
    this.state = 0;
    this.label = 'label';
    this.coilR = 20;
    this.switchingTime = 5e-3;
    this.coilCurrent = 0;
  }

  override undump(st: StringTokenizer): void {
    this.label = unescapeToken(st.nextToken());
    this.inductance = parseJavaDouble(st.nextToken());
    this.coilCurrent = parseJavaDouble(st.nextToken());
    this.onCurrent = parseJavaDouble(st.nextToken());
    this.coilR = parseJavaDouble(st.nextToken());
    this.offCurrent = parseJavaDouble(st.nextToken());
    this.switchingTime = parseJavaDouble(st.nextToken());
    this.type = parseJavaInt(st.nextToken());
    this.state = parseJavaInt(st.nextToken());
    this.switchPosition = parseJavaInt(st.nextToken());
    this.noDiagonal = true;
    this.ind = new Inductor(this);
    this.ind.setup(this.inductance, this.coilCurrent, Inductor.FLAG_BACK_EULER);
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('lb', this.label);
    w.dumpAttr('in', this.inductance);
    w.dumpAttr('oc', this.onCurrent);
    w.dumpAttr('cr', this.coilR);
    w.dumpAttr('ofc', this.offCurrent);
    w.dumpAttr('swt', this.switchingTime);
    w.dumpAttr('tp', this.type);
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    w.dumpAttr('ci', this.coilCurrent);
    w.dumpAttr('st', this.state);
    w.dumpAttr('sp', this.switchPosition);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.label = r.parseStringAttr('lb', this.label);
    this.inductance = r.parseDoubleAttr('in', this.inductance);
    this.onCurrent = r.parseDoubleAttr('oc', this.onCurrent);
    this.coilR = r.parseDoubleAttr('cr', this.coilR);
    this.offCurrent = r.parseDoubleAttr('ofc', this.offCurrent);
    this.switchingTime = r.parseDoubleAttr('swt', this.switchingTime);
    this.type = r.parseIntAttr('tp', this.type);
    this.coilCurrent = r.parseDoubleAttr('ci', this.coilCurrent);
    this.state = r.parseIntAttr('st', this.state);
    this.switchPosition = r.parseIntAttr('sp', this.switchPosition);
    this.noDiagonal = true;
    this.ind = new Inductor(this);
    this.ind.setup(this.inductance, this.coilCurrent, Inductor.FLAG_BACK_EULER);
  }

  override setPoints(): void {
    super.setPoints();
    const p1 = this.point1;
    const p2 = this.point2;
    const ds = this.dsign;
    this.openhs = -ds * 16;
    this.coilPosts = [p1, p2];
    const boxSize = 32;
    const boxWScale = Math.min(0.4, 12.0 / this.dn);
    const leads = (this.coilLeads = [
      this.interpPoint(p1, p2, 0.5 - boxWScale),
      this.interpPoint(p1, p2, 0.5 + boxWScale),
    ]);
    this.outline = [
      this.interpPointPerp(p1, p2, 0.5 - boxWScale, -boxSize * ds),
      this.interpPointPerp(p1, p2, 0.5 + boxWScale, -boxSize * ds),
      this.interpPointPerp(p1, p2, 0.5 + boxWScale, boxSize * ds),
      this.interpPointPerp(p1, p2, 0.5 - boxWScale, boxSize * ds),
    ];
    const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
    this.currentOffset1 = dist(p1, leads[0]);
    this.currentOffset2 = this.currentOffset1 + dist(leads[0], leads[1]);
    if (RelayCoilElm.isLatchingType(this.type))
      this.extraPoints = [
        this.interpPointPerp(leads[0], leads[1], 0.3, 8),
        this.interpPointPerp(leads[0], leads[1], 0.3, 0),
        this.interpPointPerp(leads[0], leads[1], 0.7, 0),
        this.interpPointPerp(leads[0], leads[1], 0.7, -8),
      ];
    else
      this.extraPoints = [
        this.outline[0],
        this.interpPointPerp(leads[0], leads[1], 0, -boxSize + 12),
        this.interpPointPerp(leads[0], leads[1], 1, -boxSize + 12),
        this.outline[1],
      ];
  }

  override getPost(n: number): Point {
    return this.coilPosts[n];
  }
  override getPostCount(): number {
    return 2;
  }
  override getInternalNodeCount(): number {
    return 1;
  }

  override reset(): void {
    super.reset();
    this.ind.reset();
    this.coilCurrent = 0;
    this.d_position = this.i_position = 0;
    this.avgCurrent = 0;
  }

  override stamp(): void {
    const n = this.nodes;
    // inductor from coil post 1 to the internal node, resistor from there to coil post 2
    this.ind.stamp(n[this.nCoil1], n[this.nCoil3]);
    this.sim.stampResistor(n[this.nCoil3], n[this.nCoil2], this.coilR);
    if (this.type === RelayCoilElm.TYPE_ON_DELAY) {
      this.switchingTimeOn = this.switchingTime;
      this.switchingTimeOff = 0;
    } else if (this.type === RelayCoilElm.TYPE_OFF_DELAY) {
      this.switchingTimeOff = this.switchingTime;
      this.switchingTimeOn = 0;
    } else {
      this.switchingTimeOff = this.switchingTimeOn = this.switchingTime;
    }
    // set and reset coils drive their contacts only when they fire (see startIteration)
    if (!this.isSetOrReset()) this.toggleSwitchPositions();
  }

  private isSetOrReset(): boolean {
    return (
      this.type === RelayCoilElm.TYPE_LATCHING_ON || this.type === RelayCoilElm.TYPE_LATCHING_OFF
    );
  }

  override startIteration(): void {
    const sim = this.sim;
    this.ind.startIteration(this.volts[this.nCoil1] - this.volts[this.nCoil3]);
    const absCurrent = Math.abs(this.coilCurrent);
    const a = Math.exp(-sim.timeStep * 1e3);
    this.avgCurrent = a * this.avgCurrent + (1 - a) * absCurrent;
    const oldSwitchPosition = this.switchPosition;
    if (this.state === 0) {
      if (this.avgCurrent > this.onCurrent) {
        this.lastTransition = sim.t;
        this.state = 1;
      }
    } else if (this.state === 1) {
      if (this.avgCurrent < this.offCurrent) this.state = 0;
      else if (sim.t - this.lastTransition > this.switchingTimeOn) {
        this.state = 2;
        if (this.type === RelayCoilElm.TYPE_LATCHING) {
          this.switchPosition = 1 - this.switchPosition;
        } else if (this.type === RelayCoilElm.TYPE_LATCHING_ON) {
          this.switchPosition = 1;
          this.setSwitchPositions(0);
        } else if (this.type === RelayCoilElm.TYPE_LATCHING_OFF) {
          this.switchPosition = 0;
          this.setSwitchPositions(1);
        } else {
          this.switchPosition = 1;
        }
      }
    } else if (this.state === 2) {
      if (this.avgCurrent < this.offCurrent) {
        this.lastTransition = sim.t;
        this.state = 3;
      }
    } else if (this.state === 3) {
      if (this.avgCurrent > this.onCurrent) this.state = 2;
      else if (sim.t - this.lastTransition > this.switchingTimeOff) {
        this.state = 0;
        if (!RelayCoilElm.isLatchingType(this.type)) this.switchPosition = 0;
      }
    }
    if (!this.isSetOrReset() && oldSwitchPosition !== this.switchPosition)
      this.toggleSwitchPositions();
  }

  override setParentList(list: SimElement[]): void {
    this.elmList = list;
  }

  toggleSwitchPositions(): void {
    this.setSwitchPositions(1 - this.switchPosition);
  }

  /** Drive every contact with this coil's label to `position`. */
  setSwitchPositions(position: number): void {
    for (const o of this.elmList)
      if (o instanceof RelayContactElm && o.label === this.label)
        o.setContactPosition(position, this.type);
  }

  override doStep(): void {
    this.ind.doStep(this.volts[this.nCoil1] - this.volts[this.nCoil3]);
  }

  override calculateCurrent(): void {
    this.coilCurrent = this.ind.calculateCurrent(this.volts[this.nCoil1] - this.volts[this.nCoil3]);
  }

  override getCurrentIntoNode(n: number): number {
    return n === 0 ? -this.coilCurrent : this.coilCurrent;
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'relay';
    if (this.i_position === 0) arr[0] += ' (off)';
    else if (this.i_position === 1) arr[0] += ' (on)';
    arr[1] = 'coil I = ' + getCurrentDText(this.coilCurrent);
    arr[2] = 'coil Vd = ' + getVoltageDText(this.volts[this.nCoil1] - this.volts[this.nCoil2]);
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0)
      return EditInfo.createChoice(
        'Type',
        [
          'Normal',
          'On Delay',
          'Off Delay',
          'Latching',
          'Latching (Set Coil)',
          'Latching (Reset Coil)',
        ],
        this.type,
      );
    if (n === 1) return new EditInfo('Inductance (H)', this.inductance, 0, 0).setPositive();
    if (n === 2) return new EditInfo('On Current (A)', this.onCurrent, 0, 0).setPositive();
    if (n === 3) return new EditInfo('Off Current (A)', this.offCurrent, 0, 0).setPositive();
    if (n === 4) return new EditInfo('Coil Resistance (ohms)', this.coilR, 0, 0).setPositive();
    if (n === 5) return new EditInfo('Switching Time (s)', this.switchingTime, 0, 0).setPositive();
    if (n === 6) return EditInfo.text('Label (for linking)', this.label);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      this.type = ei.choice?.selected ?? this.type;
      this.setPoints();
    }
    if (n === 1 && ei.value > 0) {
      this.inductance = ei.value;
      this.ind.setup(this.inductance, this.coilCurrent, Inductor.FLAG_BACK_EULER);
    }
    if (n === 2 && ei.value > 0) this.onCurrent = ei.value;
    if (n === 3 && ei.value > 0) this.offCurrent = ei.value;
    if (n === 4 && ei.value > 0) this.coilR = ei.value;
    if (n === 5 && ei.value > 0) this.switchingTime = ei.value;
    if (n === 6) this.label = ei.text ?? '';
  }

  override getConnection(_n1: number, _n2: number): boolean {
    return true;
  }
}

/** A relay contact, thrown by the RelayCoilElm (or motor protection switch) with its label. */
export class RelayContactElm extends CircuitElm {
  static readonly FLAG_NORMALLY_CLOSED = 2;
  static readonly FLAG_IEC = 4;

  r_on = 0;
  r_off = 0;
  swposts: Point[] = [];
  swpoles: Point[] = [];
  switchCurrent = 0;
  label = '';
  /** The coil type that last drove this contact (delay contacts get a mark). */
  type = 0;
  /** 0 (off) or 1 (on). */
  i_position = 0;
  openhs = 0;
  extraPoints: Point[] = [];

  override getClassName(): string {
    return 'RelayContactElm';
  }
  override getDumpType(): number {
    return 426;
  }

  override initNew(): void {
    this.noDiagonal = true;
    this.r_on = 0.05;
    this.r_off = 1e6;
    this.label = 'label';
    this.flags |= RelayContactElm.FLAG_IEC;
  }

  override undump(st: StringTokenizer): void {
    this.label = unescapeToken(st.nextToken());
    this.r_on = parseJavaDouble(st.nextToken());
    this.r_off = parseJavaDouble(st.nextToken());
    try {
      this.i_position = parseJavaInt(st.nextToken());
    } catch {
      // older files stop early
    }
    this.noDiagonal = true;
  }

  useIECSymbol(): boolean {
    return (this.flags & RelayContactElm.FLAG_IEC) !== 0;
  }
  isNormallyClosed(): boolean {
    return (this.flags & RelayContactElm.FLAG_NORMALLY_CLOSED) !== 0;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('lb', this.label);
    w.dumpAttr('ron', this.r_on);
    w.dumpAttr('roff', this.r_off);
    w.dumpAttr('ip', this.i_position);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.label = r.parseStringAttr('lb', this.label);
    this.r_on = r.parseDoubleAttr('ron', this.r_on);
    this.r_off = r.parseDoubleAttr('roff', this.r_off);
    this.i_position = r.parseIntAttr('ip', this.i_position);
    this.noDiagonal = true;
  }

  override setPoints(): void {
    super.setPoints();
    const openhs = (this.openhs = this.dsign * 16);
    this.calcLeads(32);
    const l1 = this.lead1;
    const l2 = this.lead2;
    const p1 = this.point1;
    const p2 = this.point2;
    this.swpoles = [
      this.interpPoint(l1, l2, 0),
      this.interpPoint(l1, l2, 1),
      this.interpPointPerp(l1, l2, 1, openhs),
    ];
    this.swposts = [
      this.interpPoint(p1, p2, 0),
      this.interpPoint(p1, p2, 1),
      this.interpPointPerp(p1, p2, 1, openhs),
    ];
    if (this.useIECSymbol()) {
      const ds = 22 * this.dsign;
      this.extraPoints = [
        this.interpPointPerp(l1, l2, 0.5 - 2 / 32, ds),
        this.interpPointPerp(l1, l2, 0.5 + 2 / 32, ds),
      ];
    } else this.extraPoints = [];
  }

  /** Upstream `setPosition(int, int)`, renamed: CircuitElm.setPosition places the element. */
  setContactPosition(position: number, type: number): void {
    this.i_position = this.isNormallyClosed() ? 1 - position : position;
    this.type = type;
  }

  override getPost(n: number): Point {
    return this.swposts[n];
  }
  override getPostCount(): number {
    return 2;
  }

  override reset(): void {
    super.reset();
    this.switchCurrent = 0;
    this.i_position = 0;
  }

  override stamp(): void {
    this.sim.stampNonLinear(this.nodes[0]);
    this.sim.stampNonLinear(this.nodes[1]);
  }

  override nonLinear(): boolean {
    return true;
  }

  override doStep(): void {
    this.sim.stampResistor(
      this.nodes[0],
      this.nodes[1],
      this.i_position === 0 ? this.r_on : this.r_off,
    );
  }

  override calculateCurrent(): void {
    // not quite right: a little current flows through an open switch
    if (this.i_position === 1) this.switchCurrent = 0;
    else this.switchCurrent = (this.volts[0] - this.volts[1 + this.i_position]) / this.r_on;
  }

  override getCurrentIntoNode(n: number): number {
    if (n === 0) return -this.switchCurrent;
    if (n === 1 + this.i_position) return this.switchCurrent;
    return 0;
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'relay';
    if (this.i_position === 0) arr[0] += ' (off)';
    else if (this.i_position === 1) arr[0] += ' (on)';
    arr[1] = 'I = ' + getCurrentDText(this.switchCurrent);
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('On Resistance (ohms)', this.r_on, 0, 0).setPositive();
    if (n === 1) return new EditInfo('Off Resistance (ohms)', this.r_off, 0, 0).setPositive();
    if (n === 2) return EditInfo.text('Label (for linking)', this.label);
    if (n === 3) return EditInfo.createCheckbox('Normally Closed', this.isNormallyClosed());
    if (n === 4) return EditInfo.createCheckbox('IEC Symbol', this.useIECSymbol());
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.value > 0) this.r_on = ei.value;
    if (n === 1 && ei.value > 0) this.r_off = ei.value;
    if (n === 2) this.label = ei.text ?? '';
    if (n === 3) this.flags = ei.changeFlag(this.flags, RelayContactElm.FLAG_NORMALLY_CLOSED);
    if (n === 4) {
      this.flags = ei.changeFlag(this.flags, RelayContactElm.FLAG_IEC);
      this.setPoints();
    }
  }

  override getConnection(_n1: number, _n2: number): boolean {
    return true;
  }
}

export const RelayCoilElmType = elementType('RelayCoilElm', RelayCoilElm);
export const RelayContactElmType = elementType('RelayContactElm', RelayContactElm);
