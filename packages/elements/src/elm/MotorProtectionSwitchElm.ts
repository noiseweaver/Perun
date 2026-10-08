// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/MotorProtectionSwitchElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Point } from '@perun/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { unescapeToken } from '../escape.ts';
import { parseJavaBoolean, parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText, OHM } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { RelayCoilElm, RelayContactElm } from './RelayCoilElm.ts';

const BLOWN_RESISTANCE = 1e9;

/**
 * A three-pole motor protection switch: three fuse-like poles that trip together once any pole's
 * I²t heat passes its limit, and throw every relay contact with the same label.
 */
export class MotorProtectionSwitchElm extends CircuitElm {
  // from https://m.littelfuse.com/~/media/electronics/datasheets/fuses/littelfuse_fuse_218_datasheet.pdf.pdf
  resistance = 0.0613;
  i2t = 6.73;
  blown = false;
  label = '';
  heats = [0, 0, 0];
  currents = [0, 0, 0];
  posts: Point[] = [];
  leads: Point[] = [];

  override getClassName(): string {
    return 'MotorProtectionSwitchElm';
  }
  override getDumpType(): number {
    return 428;
  }

  override undump(st: StringTokenizer): void {
    this.resistance = parseJavaDouble(st.nextToken());
    this.i2t = parseJavaDouble(st.nextToken());
    this.blown = parseJavaBoolean(st.nextToken());
    this.label = '';
    try {
      this.label = unescapeToken(st.nextToken());
    } catch {
      // older files have no label
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('re', this.resistance);
    w.dumpAttr('i2', this.i2t);
    w.dumpAttr('bl', this.blown);
    w.dumpAttr('la', this.label);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.resistance = r.parseDoubleAttr('re', this.resistance);
    this.i2t = r.parseDoubleAttr('i2', this.i2t);
    this.blown = r.parseBooleanAttr('bl', this.blown);
    this.label = r.parseStringAttr('la', this.label);
  }

  override reset(): void {
    super.reset();
    this.volts.fill(0);
    this.heats = [0, 0, 0];
    this.currents = [0, 0, 0];
    this.blown = false;
    this.setSwitchPositions();
  }

  override setPoints(): void {
    super.setPoints();
    this.posts = [];
    this.leads = [];
    for (let i = 0; i !== 3; i++) {
      this.posts[i * 2] = new Point(this.x + i * 48, this.y);
      this.posts[i * 2 + 1] = new Point(this.x + i * 48, this.y + 192);
      this.leads[i * 2] = new Point(this.x + i * 48, this.y + 80);
      this.leads[i * 2 + 1] = new Point(this.x + i * 48, this.y + 176);
    }
  }

  override getPostCount(): number {
    return 6;
  }
  override getPost(n: number): Point {
    return this.posts[n];
  }

  /** Heat of pole `n` over its limit: 0 cold, 1 or more tripped. */
  heatLevel(n: number): number {
    return this.heats[n] / this.i2t;
  }

  override calculateCurrent(): void {
    const r = this.blown ? BLOWN_RESISTANCE : this.resistance;
    for (let i = 0; i !== 3; i++)
      this.currents[i] = (this.volts[i * 2] - this.volts[i * 2 + 1]) / r;
  }

  override stamp(): void {
    for (let i = 0; i !== 6; i++) this.sim.stampNonLinear(this.nodes[i]);
  }

  override nonLinear(): boolean {
    return true;
  }

  override getConnection(n1: number, n2: number): boolean {
    return Math.trunc(n1 / 2) === Math.trunc(n2 / 2);
  }

  override startIteration(): void {
    const wasBlown = this.blown;
    const ts = this.sim.timeStep;
    for (let j = 0; j !== 3; j++) {
      const i = this.currents[j];
      // accumulate heat
      let heat = this.heats[j];
      heat += i * i * ts;
      // dissipate heat.  we assume the fuse can dissipate its entire i2t in 3 seconds
      heat -= (ts * this.i2t) / 3;
      if (heat < 0) heat = 0;
      if (heat > this.i2t) this.blown = true;
      this.heats[j] = heat;
    }
    if (this.blown !== wasBlown) this.setSwitchPositions();
  }

  /** Throw every relay contact with this label: open when tripped. */
  setSwitchPositions(): void {
    const switchPosition = this.blown ? 0 : 1;
    for (const o of this.sim.elmList)
      if (o instanceof RelayContactElm && o.label === this.label)
        o.setContactPosition(switchPosition, RelayCoilElm.TYPE_NORMAL);
  }

  override doStep(): void {
    const r = this.blown ? BLOWN_RESISTANCE : this.resistance;
    for (let i = 0; i !== 3; i++)
      this.sim.stampResistor(this.nodes[i * 2], this.nodes[i * 2 + 1], r);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'motor protection switch';
    this.getBasicInfo(arr);
    arr[3] = 'R = ' + getUnitText(this.resistance, OHM);
    arr[4] = 'I2t = ' + String(this.i2t);
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('I2t', this.i2t, 0, 0).setPositive();
    if (n === 1) return new EditInfo('On Resistance', this.resistance, 0, 0).setPositive();
    if (n === 2) return EditInfo.text('Label (for linking)', this.label);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.i2t = ei.value;
    if (n === 1) this.resistance = ei.value;
    if (n === 2) this.label = ei.text ?? '';
  }

  override getCurrentIntoNode(n: number): number {
    const i = Math.trunc(n / 2);
    if (n % 2 === 1) return this.currents[i];
    return -this.currents[i];
  }

  override canFlipX(): boolean {
    return false;
  }
  override canFlipY(): boolean {
    return false;
  }
}

export const MotorProtectionSwitchElmType = elementType(
  'MotorProtectionSwitchElm',
  MotorProtectionSwitchElm,
);
