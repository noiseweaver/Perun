// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/AmmeterElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { VoltageSource } from '@circuitjs-next/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { SCALE_AUTO } from '../constants.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

/** An ammeter: a zero-volt source that shows the current through it, or its RMS value. */
export class AmmeterElm extends CircuitElm {
  static readonly AM_VOL = 0;
  static readonly AM_RMS = 1;
  static readonly FLAG_SHOWCURRENT = 1;
  static readonly FLAG_CIRCLE = 2;

  meter = 0;
  scale = SCALE_AUTO;
  zerocount = 0;
  rmsI = 0;
  total = 0;
  count = 0;
  maxI = 0;
  lastMaxI = 0;
  minI = 0;
  lastMinI = 0;
  selectedValue = 0;
  increasingI = true;
  decreasingI = true;

  override getClassName(): string {
    return 'AmmeterElm';
  }
  override getDumpType(): number {
    return 370;
  }

  override initNew(): void {
    this.flags = AmmeterElm.FLAG_SHOWCURRENT | AmmeterElm.FLAG_CIRCLE;
    this.scale = SCALE_AUTO;
  }

  override undump(st: StringTokenizer): void {
    this.scale = SCALE_AUTO;
    this.meter = parseJavaInt(st.nextToken());
    try {
      this.scale = parseJavaInt(st.nextToken());
    } catch {
      // older files stop early
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('me', this.meter);
    w.dumpAttr('sc', this.scale);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.meter = r.parseIntAttr('me', this.meter);
    this.scale = r.parseIntAttr('sc', this.scale);
  }

  getMeter(): string {
    if (this.meter === AmmeterElm.AM_VOL) return 'I';
    if (this.meter === AmmeterElm.AM_RMS) return 'Irms';
    return '';
  }

  override stepFinished(): void {
    const current = this.current;
    this.count++; // samples in this cycle
    this.total += current * current; // sum of squares
    if (current > this.maxI && this.increasingI) {
      this.maxI = current;
      this.increasingI = true;
      this.decreasingI = false;
    }
    if (current < this.maxI && this.increasingI) {
      // turned downward: the start of a cycle
      this.lastMaxI = this.maxI;
      this.minI = current;
      this.increasingI = false;
      this.decreasingI = true;
      this.updateRms();
    }
    if (current < this.minI && this.decreasingI) {
      this.minI = current;
      this.increasingI = false;
      this.decreasingI = true;
    }
    if (current > this.minI && this.decreasingI) {
      // turned upward
      this.lastMinI = this.minI;
      this.maxI = current;
      this.increasingI = true;
      this.decreasingI = false;
      this.updateRms();
    }
    // zero the RMS value if the current stays at 0 for a while
    if (current === 0) {
      this.zerocount++;
      if (this.zerocount > 5) {
        this.total = 0;
        this.rmsI = 0;
        this.maxI = 0;
        this.minI = 0;
      }
    } else this.zerocount = 0;
    if (this.meter === AmmeterElm.AM_VOL) this.selectedValue = current;
    else if (this.meter === AmmeterElm.AM_RMS) this.selectedValue = this.rmsI;
  }

  private updateRms(): void {
    this.total = this.total / this.count;
    this.rmsI = Math.sqrt(this.total);
    if (Number.isNaN(this.rmsI)) this.rmsI = 0;
    this.count = 0;
    this.total = 0;
  }

  override setVoltageSource(n: number, v: VoltageSource): void {
    super.setVoltageSource(n, v);
    v.setNodes(this.nodes[0], this.nodes[1]);
  }

  override stamp(): void {
    this.sim.stampVoltageSource(this.nodes[0], this.nodes[1], this.voltSource, 0);
  }

  mustShowCurrent(): boolean {
    return (this.flags & AmmeterElm.FLAG_SHOWCURRENT) !== 0;
  }

  override getVoltageSourceCount(): number {
    return 1;
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'Ammeter';
    if (this.meter === AmmeterElm.AM_VOL) arr[1] = 'I = ' + getUnitText(this.current, 'A');
    else if (this.meter === AmmeterElm.AM_RMS) arr[1] = 'Irms = ' + getUnitText(this.rmsI, 'A');
  }

  override getPower(): number {
    return 0;
  }
  override getVoltageDiff(): number {
    return this.volts[0];
  }
  /** Kept in the circuit (not optimized away) so its current is computed every step. */
  override isWireEquivalent(): boolean {
    return true;
  }

  drawAsCircle(): boolean {
    return (this.flags & AmmeterElm.FLAG_CIRCLE) !== 0;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return EditInfo.createChoice('Value', ['Current', 'RMS Current'], this.meter);
    if (n === 1) return EditInfo.createChoice('Scale', ['Auto', 'A', 'mA', 'μA'], this.scale);
    if (n === 2) return EditInfo.createCheckbox('Circular Symbol', this.drawAsCircle());
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.meter = ei.choice?.selected ?? this.meter;
    if (n === 1) this.scale = ei.choice?.selected ?? this.scale;
    if (n === 2) this.flags = ei.changeFlag(this.flags, AmmeterElm.FLAG_CIRCLE);
  }
}

export const AmmeterElmType = elementType('AmmeterElm', AmmeterElm);
