// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/PolarCapacitorElm.java (master)
// at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { CapacitorElm } from './CapacitorElm.ts';

/** An electrolytic capacitor: stops the simulation past its maximum reverse voltage. */
export class PolarCapacitorElm extends CapacitorElm {
  maxNegativeVoltage = 0;

  override getClassName(): string {
    return 'PolarCapacitorElm';
  }
  override getDumpType(): number {
    return 209;
  }
  override getXmlDumpType(): string {
    return 'pc';
  }

  override initNew(): void {
    super.initNew();
    this.maxNegativeVoltage = 1;
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.maxNegativeVoltage = parseJavaDouble(st.nextToken());
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('mv', this.maxNegativeVoltage);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.maxNegativeVoltage = r.parseDoubleAttr('mv', this.maxNegativeVoltage);
  }

  override getInfo(arr: string[]): void {
    super.getInfo(arr);
    arr[0] = 'capacitor (polarized)';
  }

  /** Not in upstream: electrolytics drift too unevenly for one coefficient, so none here. */
  protected override tempcoField(): number {
    return -1;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 4) return new EditInfo('Max Reverse Voltage', this.maxNegativeVoltage, 0, 0);
    return super.getEditInfo(n);
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 4) {
      if (ei.value >= 0) this.maxNegativeVoltage = ei.value;
      else ei.setError('must be >= 0');
    }
    super.setEditValue(n, ei);
  }

  override stepFinished(): void {
    if (this.getVoltageDiff() < 0 && this.getVoltageDiff() < -this.maxNegativeVoltage)
      this.sim.stop('capacitor exceeded max reverse voltage', this);
    super.stepFinished();
  }

  override getShortcut(): number {
    return 'C'.charCodeAt(0);
  }
}

export const PolarCapacitorElmType = elementType('PolarCapacitorElm', PolarCapacitorElm);
