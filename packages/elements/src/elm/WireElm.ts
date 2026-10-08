// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/WireElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, with ts/WireElm.ts (dev-ts) at
// 7ec858d662d8be1d76d54241ba3a5c1d1c524f51 for the node-voltage model.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Point, type BusWidthMaps } from '@perun/engine';
import { CircuitElm, elementType, lineDistanceSq } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { getCurrentDText, getVoltageText } from '../view/units.ts';
import { labelForNode } from './LabeledNodeElm.ts';

export class WireElm extends CircuitElm {
  static readonly FLAG_SHOWCURRENT = 1;
  static readonly FLAG_SHOWVOLTAGE = 2;
  static readonly FLAG_SHOW_BUS_VALUE = 4;
  static readonly FLAG_SHOW_BUS_VALUE_HEX = 8;

  /** Bits carried; set by bus-width detection (digital buses, not yet ported). */
  busWidth = 1;
  currents: number[] | null = null;

  override getClassName(): string {
    return 'WireElm';
  }
  override getDumpType(): number {
    return 'w'.charCodeAt(0);
  }

  override getPostCount(): number {
    return this.busWidth * 2;
  }
  override getBusWidth(): number {
    return this.busWidth;
  }

  override getPostWidth(_n: number): number {
    return this.busWidth;
  }

  override propagateBusWidth(maps: BusWidthMaps): boolean {
    let changed = false;
    const k1 = this.point1.key();
    const k2 = this.point2.key();
    const w1 = maps.width.get(k1);
    const w2 = maps.width.get(k2);
    let w = 1;
    if (w1 !== undefined) w = w1;
    if (w2 !== undefined && w2 > w) w = w2;
    if (w !== this.busWidth) {
      this.busWidth = w;
      this.currents = w > 1 ? new Array<number>(w).fill(0) : null;
      this.allocNodes();
      changed = true;
    }
    if (w > 1) {
      if (w1 === undefined || w1 < w) {
        maps.width.set(k1, w);
        changed = true;
      }
      if (w2 === undefined || w2 < w) {
        maps.width.set(k2, w);
        changed = true;
      }
    }
    return changed;
  }

  override getPost(n: number): Point {
    if (this.busWidth === 1) return n === 0 ? this.point1 : this.point2;
    if (n < this.busWidth) return new Point(this.point1.x, this.point1.y, n);
    return new Point(this.point2.x, this.point2.y, n - this.busWidth);
  }

  override getConnection(n1: number, n2: number): boolean {
    if (this.busWidth === 1) return true;
    // only connect matching bits: post n1 connects to n1 +/- busWidth
    return Math.abs(n1 - n2) === this.busWidth;
  }

  override getConnectedPost(n: number): Point {
    if (this.busWidth === 1) return n === 0 ? this.point2 : this.point1;
    if (n < this.busWidth) return new Point(this.point2.x, this.point2.y, n);
    return new Point(this.point1.x, this.point1.y, n - this.busWidth);
  }

  override getVoltageDiff(): number {
    return this.volts[0];
  }
  override isWireEquivalent(): boolean {
    return true;
  }
  override isRemovableWire(): boolean {
    return true;
  }

  override setWireCurrent(bit: number, c: number): void {
    if (this.currents !== null) this.currents[bit] = c;
    else this.current = c;
  }

  override getCurrentIntoNode(n: number): number {
    if (this.currents !== null) {
      if (n < this.busWidth) return -this.currents[n];
      return this.currents[n - this.busWidth];
    }
    if (n === 0) return -this.current;
    return this.current;
  }

  /** The bus's bits as a number, bit i from post i (2.5 V threshold, as upstream). */
  getBusValue(): number {
    let value = 0;
    for (let i = 0; i < this.busWidth; i++) if (this.volts[i] > 2.5) value |= 1 << i;
    return value;
  }

  /** Total current over all bits of a bus (upstream sums `currents` while drawing). */
  totalCurrent(): number {
    return this.currents === null ? this.current : this.currents.reduce((a, c) => a + c, 0);
  }

  /**
   * The value text shown on the wire, or ''. Live values keep a fixed width (owner's rule): the
   * bus value is padded to the widest value the bus can carry.
   */
  valueText(fixed: (v: number, u: string) => string): string {
    let s = '';
    if (this.busWidth > 1 && (this.mustShowBusValue() || this.mustShowBusValueHex())) {
      const value = this.getBusValue();
      const max = this.busWidth >= 32 ? 0xffffffff : (1 << this.busWidth) - 1;
      if (this.mustShowBusValue()) s = String(value).padStart(String(max >>> 0).length);
      if (this.mustShowBusValueHex()) {
        const digits = Math.ceil(this.busWidth / 4);
        s =
          (s.length > 0 ? s + ' ' : '') +
          '0x' +
          (value >>> 0).toString(16).toUpperCase().padStart(digits, '0');
      }
    } else if (this.busWidth === 1) {
      if (this.mustShowCurrent()) s = fixed(Math.abs(this.totalCurrent()), 'A');
      if (this.mustShowVoltage()) s = (s.length > 0 ? s + ' ' : '') + fixed(this.volts[0], 'V');
    }
    return s;
  }

  mustShowCurrent(): boolean {
    return (this.flags & WireElm.FLAG_SHOWCURRENT) !== 0;
  }
  mustShowVoltage(): boolean {
    return (this.flags & WireElm.FLAG_SHOWVOLTAGE) !== 0;
  }
  mustShowBusValue(): boolean {
    return (this.flags & WireElm.FLAG_SHOW_BUS_VALUE) !== 0;
  }
  mustShowBusValueHex(): boolean {
    return (this.flags & WireElm.FLAG_SHOW_BUS_VALUE_HEX) !== 0;
  }

  override getInfo(arr: string[]): void {
    // bus wires (busWidth > 1) come with digital elements
    arr[0] = 'wire';
    arr[1] = 'I = ' + getCurrentDText(this.getCurrent());
    arr[2] = 'V = ' + getVoltageText(this.getPostVoltage(0));
    const label = labelForNode(this.sim.labelList, this.nodes[0]);
    if (label !== null) arr[3] = label;
  }

  override getPower(): number {
    return 0;
  }

  override getElmType(): string {
    return this.busWidth > 1 ? 'bus wire (' + this.busWidth + ')' : 'wire';
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return EditInfo.createCheckbox('Show Current', this.mustShowCurrent());
    if (n === 1) return EditInfo.createCheckbox('Show Voltage', this.mustShowVoltage());
    if (n === 2) return EditInfo.createCheckbox('Show Bus Value', this.mustShowBusValue());
    if (n === 3) return EditInfo.createCheckbox('Show Bus Value (Hex)', this.mustShowBusValueHex());
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      if (ei.checkbox?.state === true) this.flags |= WireElm.FLAG_SHOWCURRENT;
      else this.flags &= ~WireElm.FLAG_SHOWCURRENT;
    }
    if (n === 1) {
      if (ei.checkbox?.state === true) this.flags |= WireElm.FLAG_SHOWVOLTAGE;
      else this.flags &= ~WireElm.FLAG_SHOWVOLTAGE;
    }
    if (n === 2) this.flags = ei.changeFlag(this.flags, WireElm.FLAG_SHOW_BUS_VALUE);
    if (n === 3) this.flags = ei.changeFlag(this.flags, WireElm.FLAG_SHOW_BUS_VALUE_HEX);
  }

  override getShortcut(): number {
    return 'w'.charCodeAt(0);
  }

  // draggingDone() (splitting a new wire at posts it crosses) needs the element list; the
  // editor does it.

  /** Wires are only hit near the line itself. */
  override getMouseDistance(gx: number, gy: number): number {
    const thresh = 10;
    const d2 = lineDistanceSq(this.x, this.y, this.x2, this.y2, gx, gy);
    if (d2 <= thresh * thresh) return d2;
    return -1;
  }
}

export const WireElmType = elementType('WireElm', WireElm);
