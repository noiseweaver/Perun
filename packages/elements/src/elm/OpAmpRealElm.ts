// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/OpAmpRealElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Point } from '@circuitjs-next/engine';
import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble, parseJavaInt } from '../java.ts';
import { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { CapacitorElm } from './CapacitorElm.ts';
import { CompositeElm } from './CompositeElm.ts';
import { ResistorElm } from './ResistorElm.ts';
import { TransistorElm } from './TransistorElm.ts';

// from https://commons.wikimedia.org/wiki/File:OpAmpTransistorLevel_Colored_Labeled.svg
const MODEL_741_STRING =
  'NTransistorElm 3 8 9\rNTransistorElm 2 8 10\rPTransistorElm 11 12 9\rPTransistorElm 11 13 10\rNTransistorElm 14 12 1\r' +
  'NTransistorElm 14 13 5\rNTransistorElm 12 7 14\rPTransistorElm 8 8 7\rPTransistorElm 8 11 7\rNTransistorElm 17 11 16\r' +
  'NTransistorElm 17 17 4\rPTransistorElm 18 18 7\rPTransistorElm 18 20 7\rNTransistorElm 20 7 25\rNTransistorElm 13 22 24\r' +
  'NTransistorElm 21 20 22\rNTransistorElm 25 20 6\rNTransistorElm 24 22 23\rPTransistorElm 22 4 15\rNTransistorElm 23 13 4\r' +
  'CapacitorElm 13 20\r' +
  'ResistorElm 15 6\rResistorElm 6 25\r' +
  'ResistorElm 4 1\rResistorElm 4 14\rResistorElm 4 5\rResistorElm 4 16\rResistorElm 4 24\rResistorElm 4 23\rResistorElm 17 18\r' +
  'ResistorElm 22 21\rResistorElm 21 20\r';
// 0 = input -, 1 = input +, 2 = output, 3 = V+, 4 = V- (5, 6 = offset null, not brought out)
const MODEL_741_EXTERNAL_NODES = [2, 3, 6, 7, 4];
const MODEL_741_RESISTANCES = [50, 25, 1e3, 50e3, 1e3, 5e3, 50e3, 50, 39e3, 7500, 4500];

const LM324_MODEL_STRING =
  'TransistorElm 1 2 3\rCurrentElm 4 3\rTransistorElm 2 2 5\rTransistorElm 2 6 5\rCapacitorElm 6 7\rCurrentElm 4 8\rCurrentElm 4 7\rTransistorElm 8 4 9\r' +
  'TransistorElm 7 4 10\rTransistorElm 10 4 11\rTransistorElm 11 7 12\rResistorElm 11 12\rTransistorElm 7 5 12\rCurrentElm 12 5\rTransistorElm 6 5 8\r' +
  'ResistorElm 9 5\rTransistorElm 9 7 5\rTransistorElm 13 6 3';
const LM324_MODEL_DUMP =
  '0 -1 -0 0 10000/0 0.000006/0 1 0 0 100/0 1 0 0 100/0 1e-11 0/0 0.000004/0 0.0001/0 1 0 0 100/0 1 0 0 100/0 1 0 0 100/0 1 0 0 100/0 25/0 -1 0 0 100/0 0.00005/' +
  '0 -1 0 0 100/0 10000/0 1 0 0 100/0 -1 0 0 10000';
const LM324_EXTERNAL_NODES = [1, 13, 12, 4, 5];

// from the LM324 spice model, ON SEMICONDUCTOR NEXT GEN MODEL 9/27/2018
const LM324V2_MODEL_STRING =
  'ResistorElm 4 6\rCurrentElm 4 7\rResistorElm 4 29\rResistorElm 8 30\rResistorElm 9 31\rTransistorElm 30 29 31 \rResistorElm 4 32\rResistorElm 2 33\rResistorElm 10 34\r' +
  'TransistorElm 33 32 34 \rResistorElm 9 35\rResistorElm 9 36\rResistorElm 11 37\rTransistorElm 36 35 37 \rResistorElm 10 38\rResistorElm 10 39\rResistorElm 11 40\r' +
  'TransistorElm 39 38 40 \rResistorElm 12 41\rTransistorElm 13 41 4 \rResistorElm 13 42\rTransistorElm 13 42 4 \rResistorElm 4 43\rTransistorElm 12 43 14 \rResistorElm 3 44\r' +
  'TransistorElm 14 44 6 \rResistorElm 15 45\rTransistorElm 6 45 4 \rResistorElm 3 46\rTransistorElm 15 46 16 \rResistorElm 3 47\rTransistorElm 16 47 17 \rResistorElm 17 16\r' +
  'ResistorElm 5 17\rResistorElm 4 48\rTransistorElm 15 48 5 \rResistorElm 15 49\rTransistorElm 17 49 5 \rCurrentElm 18 3\rCurrentElm 19 3\rCurrentElm 20 3\rResistorElm 11 50\r' +
  'TransistorElm 18 50 3 \rResistorElm 14 51\rTransistorElm 19 51 3 \rResistorElm 5 52\rTransistorElm 7 52 4 \rResistorElm 15 53\rTransistorElm 20 53 3 \rCapacitorElm 21 22\r' +
  'ResistorElm 12 21\rResistorElm 12 15\rVCVSElm 3 0 23 8\rVoltageElm 23 1\rCurrentElm 3 4\rResistorElm 4 3\rResistorElm 12 54\rTransistorElm 9 54 11 \rResistorElm 13 55\r' +
  'TransistorElm 10 55 11 \rCapacitorElm 12 13\rCapacitorElm 6 15\rCapacitorElm 3 24\rResistorElm 11 24\rCapacitorElm 1 2\rCapacitorElm 2 0\rCapacitorElm 1 0\r' +
  'VCVSElm 15 0 22 0\rCapacitorElm 5 0\rResistorElm 25 56\rTransistorElm 25 56 0 \rVCCSElm 27 0 4 3\rCurrentElm 0 25\rVoltageElm 25 26\rResistorElm 0 26\r' +
  'VCVSElm 28 26 27 0\rResistorElm 0 27\rVoltageElm 28 0\rResistorElm 0 28';
const LM324V2_MODEL_DUMP =
  '0 40000/0 5e-7/0 380/0 1700/0 5/0 -1 0 0 306 xlm324v2-qpi/0 380/0 1700/0 5/0 -1 0 0 300 xlm324v2-qpa/0 380/0 1700/0 5/0 -1 0 0 306 xlm324v2-qpi/0 380/0 1700/0 5/' +
  '0 -1 0 0 306 xlm324v2-qpi/0 25/0 1 0 0 100 xlm324v2-qnq/0 25/0 1 0 0 100 xlm324v2-qnq/0 300/0 -1 0 0 100 xlm324v2-qpq/0 25/0 1 0 0 100 xlm324v2-qnq/0 25/0 1 0 0 100 xlm324v2-qnq/' +
  '0 25/0 1 0 0 100 xlm324v2-qnq/0 25/0 1 0 0 100 xlm324v2-qnq/0 40000/0 18/0 300/0 -1 0 0 100 xlm324v2-qpq/0 25/0 1 0 0 100 xlm324v2-qnq/0 1.2e-7/0 6e-8/0 0.000001/0 300/' +
  '0 -1 0 0 100 xlm324v2-qpq/0 300/0 -1 0 0 100 xlm324v2-qpq/0 25/0 1 0 0 100 xlm324v2-qnq/0 300/0 -1 0 0 100 xlm324v2-qpq/2 4.8e-12 0 0/0 3/0 3000000000/0 2 -0.00001*(a-b)/' +
  '0 0 0 -0.00156/0 0.000005/0 450000/0 300/0 -1 0 0 100 xlm324v2-qpq/0 300/0 -1 0 0 100 xlm324v2-qpq/2 8e-12 0 0/2 1e-12 0 0/2 1e-13 0 0/0 300000/2 2.3e-13 0 0/2 7.9e-13 0 0/' +
  '2 7.9e-13 0 0/0 2 2*(a-b)/2 5e-14 0 0/0 25/0 1 0 0 100 xlm324v2-qnq/0 2 0.0003*(a-b)/0 0.001/0 0 0 -0.25/0 1000000/0 2 1*(a-b)/0 1000000/0 0 0 -0.55/0 1000000';
const LM324V2_EXTERNAL_NODES = [2, 1, 5, 3, 4];

const DEFAULT_CURRENT_LIMIT = 0.0231;

/** A transistor-level op-amp: LM741, or LM324 (an old and a fixed model). */
export class OpAmpRealElm extends CompositeElm {
  static readonly MODEL_741 = 0;
  static readonly MODEL_324 = 1;
  static readonly MODEL_324v2 = 2;
  static readonly FLAG_SWAP = 2;

  readonly opheight = 16;
  readonly opwidth = 32;
  modelType = OpAmpRealElm.MODEL_741;
  slewRate = 0.6;
  currentLimit = DEFAULT_CURRENT_LIMIT;
  capValue = 0;
  // geometry, from setPoints
  in1p: Point[] = [];
  in2p: Point[] = [];
  textp: Point[] = [];
  rail1p: Point[] = [];
  rail2p: Point[] = [];
  triangle: Point[] = [];

  override getClassName(): string {
    return 'OpAmpRealElm';
  }
  override getDumpType(): number {
    return 409;
  }

  override initNew(): void {
    this.noDiagonal = true;
    this.slewRate = 0.6;
    this.currentLimit = DEFAULT_CURRENT_LIMIT;
    this.modelType = OpAmpRealElm.MODEL_741;
    this.initModel();
  }

  override undump(st: StringTokenizer): void {
    this.noDiagonal = true;
    this.slewRate = parseJavaDouble(st.nextToken());
    this.capValue = parseJavaDouble(st.nextToken());
    this.currentLimit = DEFAULT_CURRENT_LIMIT;
    this.modelType = OpAmpRealElm.MODEL_741;
    try {
      this.currentLimit = parseJavaDouble(st.nextToken());
      this.modelType = parseJavaInt(st.nextToken());
    } catch {
      // older files stop early
    }
    this.initModel();
  }

  private initModel(): void {
    this.flags |= CompositeElm.FLAG_ESCAPE;
    switch (this.modelType) {
      case OpAmpRealElm.MODEL_741:
        this.init741();
        break;
      case OpAmpRealElm.MODEL_324:
        this.init324();
        break;
      case OpAmpRealElm.MODEL_324v2:
        this.init324v2();
        break;
    }
    // upstream leaves the node list to preStamp; volts are allocated here so the element can be
    // drawn before the first analysis
    this.allocNodes();
    this.setPoints();
  }

  private init741(): void {
    this.loadComposite(null, MODEL_741_STRING, MODEL_741_EXTERNAL_NODES);
    const list = this.compElmList;
    // adjust capacitor value to get desired slew rate
    const cap = this.getCapacitor() as CapacitorElm;
    cap.capacitance = 30e-12 / (this.slewRate / 0.6);
    cap.voltdiff = this.capValue;
    // set resistor values
    for (let i = 0; i !== 11; i++)
      (list[21 + i] as ResistorElm).resistance = MODEL_741_RESISTANCES[i];
    // adjust output stage resistor values and transistor betas to increase current if desired
    const currentMult = this.currentLimit / DEFAULT_CURRENT_LIMIT;
    (list[21] as ResistorElm).resistance /= currentMult;
    (list[22] as ResistorElm).resistance /= currentMult;
    (list[13] as TransistorElm).setBeta(currentMult * 100); // Q14
    (list[18] as TransistorElm).setBeta(currentMult * 100); // Q20
  }

  private init324(): void {
    const st = new StringTokenizer(LM324_MODEL_DUMP, '/');
    this.loadComposite(st, LM324_MODEL_STRING, LM324_EXTERNAL_NODES);
    const list = this.compElmList;
    // adjust capacitor value to get desired slew rate
    const cap = this.getCapacitor() as CapacitorElm;
    cap.capacitance = 10e-12 / (this.slewRate / 0.55);
    cap.voltdiff = this.capValue;
    // adjust output stage resistor values and transistor betas to increase current if desired
    const currentMult = this.currentLimit / DEFAULT_CURRENT_LIMIT;
    (list[11] as ResistorElm).resistance /= currentMult;
    for (const i of [9, 10, 12, 16]) (list[i] as TransistorElm).setBeta(currentMult * 100);
  }

  private init324v2(): void {
    const st = new StringTokenizer(LM324V2_MODEL_DUMP, '/');
    this.loadComposite(st, LM324V2_MODEL_STRING, LM324V2_EXTERNAL_NODES);
  }

  getCapacitor(): CapacitorElm | null {
    if (this.modelType === OpAmpRealElm.MODEL_324v2) return null;
    return this.compElmList[this.modelType === OpAmpRealElm.MODEL_741 ? 20 : 4] as CapacitorElm;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('slr', this.slewRate);
    w.dumpAttr('cl', this.currentLimit);
    w.dumpAttr('mt', this.modelType);
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    const elm = this.getCapacitor();
    w.dumpAttr('vd', elm === null ? 0 : elm.voltdiff);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.slewRate = r.parseDoubleAttr('slr', this.slewRate);
    this.currentLimit = r.parseDoubleAttr('cl', this.currentLimit);
    this.modelType = r.parseIntAttr('mt', this.modelType);
    const voltdiff = r.parseDoubleAttr('vd', 0);
    this.initModel();
    const cap = this.getCapacitor();
    if (cap !== null) cap.voltdiff = voltdiff;
  }

  override getConnection(_n1: number, _n2: number): boolean {
    return true;
  }

  override setPoints(): void {
    super.setPoints();
    let ww = this.opwidth;
    if (ww > this.dn / 2) ww = Math.trunc(this.dn / 2);
    this.calcLeads(ww * 2);
    const hs = this.opheight * this.dsign;
    let hsswap = hs;
    if ((this.flags & OpAmpRealElm.FLAG_SWAP) !== 0) hsswap = -hsswap;
    const [i10, i20] = this.interpPoint2(this.point1, this.point2, 0, hsswap);
    const [i11, i21] = this.interpPoint2(this.lead1, this.lead2, 0, hsswap);
    this.in1p = [i10, i11];
    this.in2p = [i20, i21];
    this.textp = this.interpPoint2(this.lead1, this.lead2, 0.2, hsswap);
    // position rails; ideally in middle, but may need to be off-center to fit grid
    const railPos = 0.5 - ((this.dn / 2) % this.sim.gridSize) / (ww * 2);
    const [r11, r21] = this.interpPoint2(this.lead1, this.lead2, railPos, hs * 2 * (1 - railPos));
    const [r10, r20] = this.interpPoint2(this.lead1, this.lead2, railPos, hs * 2);
    this.rail1p = [r10, r11];
    this.rail2p = [r20, r21];
    const [t0, t1] = this.interpPoint2(this.lead1, this.lead2, 0, hs * 2);
    this.triangle = [t0, t1, this.lead2];
    if (this.posts.length >= 5) {
      this.setPost(0, i10);
      this.setPost(1, i20);
      this.setPost(2, this.point2);
      this.setPost(3, r10);
      this.setPost(4, r20);
    }
  }

  override getElmType(): string | null {
    return 'op-amp';
  }

  override getInfo(arr: string[]): void {
    const type = this.modelType === OpAmpRealElm.MODEL_741 ? 'LM741' : 'LM324';
    arr[0] = 'op-amp (' + type + ')';
    arr[1] = 'V+ = ' + getVoltageText(this.volts[1]);
    arr[2] = 'V- = ' + getVoltageText(this.volts[0]);
    arr[3] = 'Vout = ' + getVoltageText(this.volts[2]);
    arr[4] = 'Iout = ' + getCurrentText(this.getCurrentIntoNode(2));
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      const name = EditInfo.makeLink('opampreal.html', 'Model');
      // the old 324 model is offered only to circuits that already use it
      const ei =
        this.modelType === OpAmpRealElm.MODEL_324
          ? EditInfo.createChoice(name, ['LM741', 'LM324, old', 'LM324, fixed'], this.modelType)
          : EditInfo.createChoice(
              name,
              ['LM741', 'LM324'],
              this.modelType === OpAmpRealElm.MODEL_741 ? 0 : 1,
            );
      ei.value = this.modelType;
      return ei;
    }
    if (n === 1) {
      const ei = new EditInfo('', 0, -1, -1);
      ei.checkbox = {
        label: 'Swap Inputs',
        state: (this.flags & OpAmpRealElm.FLAG_SWAP) !== 0,
      };
      return ei;
    }
    if (this.modelType === OpAmpRealElm.MODEL_324v2) return null;
    if (n === 2) return new EditInfo('Slew Rate (V/usec)', this.slewRate);
    if (n === 3) return new EditInfo('Output Current Limit (A)', this.currentLimit);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.choice !== null) {
      this.modelType = ei.choice.selected;
      if (ei.choice.items.length === 2 && this.modelType === 1)
        this.modelType = OpAmpRealElm.MODEL_324v2;
      this.capValue = 0;
      this.initModel();
      ei.newDialog = true;
    }
    if (n === 1) {
      this.flags = ei.changeFlag(this.flags, OpAmpRealElm.FLAG_SWAP);
      this.setPoints();
    }
    if (n === 2) {
      this.slewRate = ei.value;
      this.initModel();
    }
    if (n === 3) {
      this.currentLimit = ei.value;
      this.initModel();
    }
  }

  override canFlipX(): boolean {
    return this.dy === 0;
  }
  override canFlipY(): boolean {
    return this.dx === 0;
  }
}

export const OpAmpRealElmType = elementType('OpAmpRealElm', OpAmpRealElm);
