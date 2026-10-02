// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ProbeElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, with ts/ProbeElm.ts (dev-ts) at
// 7ec858d662d8be1d76d54241ba3a5c1d1c524f51 for the node-voltage model.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { SCALE_AUTO } from '../constants.ts';
import { parseJavaDouble, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

/**
 * Voltmeter between two posts, optionally with a finite input resistance. The measurement
 * statistics (RMS, min/max, frequency) are display only and come with scopes (Phase 6).
 */
export class ProbeElm extends CircuitElm {
  static readonly FLAG_SHOWVOLTAGE = 1;
  static readonly FLAG_CIRCLE = 2;
  static readonly TP_VOL = 0;

  meter = 0;
  scale = 0;
  resistance = 0;

  override getClassName(): string {
    return 'ProbeElm';
  }
  override getDumpType(): number {
    return 'p'.charCodeAt(0);
  }

  override initNew(): void {
    this.meter = ProbeElm.TP_VOL;
    // default for new elements
    this.flags = ProbeElm.FLAG_SHOWVOLTAGE | ProbeElm.FLAG_CIRCLE;
    this.scale = SCALE_AUTO;
    this.resistance = 1e7;
  }

  override undump(st: StringTokenizer): void {
    this.meter = ProbeElm.TP_VOL;
    this.scale = SCALE_AUTO;
    this.resistance = 0;
    try {
      this.meter = parseJavaInt(st.nextToken());
      this.scale = parseJavaInt(st.nextToken());
      this.resistance = parseJavaDouble(st.nextToken());
    } catch {
      // older files stop early
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('me', this.meter);
    w.dumpAttr('sc', this.scale);
    w.dumpAttr('re', this.resistance);
  }

  override undumpXml(r: XmlAttrReader): void {
    this.flags = 0;
    super.undumpXml(r);
    this.meter = r.parseIntAttr('me', this.meter);
    this.scale = r.parseIntAttr('sc', this.scale);
    this.resistance = r.parseDoubleAttr('re', 0);
  }

  override calculateCurrent(): void {
    this.current =
      this.resistance === 0 ? 0 : (this.nodes[0].v - this.nodes[1].v) / this.resistance;
  }

  override stamp(): void {
    if (this.resistance !== 0)
      this.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
  }

  override getConnection(_n1: number, _n2: number): boolean {
    return this.resistance !== 0;
  }
}

export const ProbeElmType = elementType('ProbeElm', ProbeElm);
