// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/SevenSegElm.java,
// SevenSegDecoderElm.java, DecimalDisplayElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, checked against the ts/ translations (dev-ts) at
// 7ec858d662d8be1d76d54241ba3a5c1d1c524f51.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt, parseJavaInt } from '../java.ts';
import { modelsFor } from '../models/ModelLibrary.ts';
import { type StringTokenizer } from '../StringTokenizer.ts';
import { type XmlAttrReader, type XmlAttrWriter } from '../xml.ts';
import { ChipElm, SIDE_E, SIDE_S, SIDE_W } from './ChipElm.ts';
import { Diode } from './Diode.ts';

export class SevenSegElm extends ChipElm {
  override getClassName(): string {
    return 'SevenSegElm';
  }
  // base segment count not including decimal point or colon
  baseSegmentCount: number = 0;

  // segment count including decimal point or colon
  segmentCount: number = 0;

  extraSegment: number = 0;
  static readonly ES_NONE = 0;
  static readonly ES_DP = 1;
  static readonly ES_COLON = 2;

  pinCount: number = 0;
  commonPin: number = 0;

  // 1 = common cathode, -1 = common anode, 0 = no diodes
  diodeDirection: number = 0;
  override initNew(): void {
    super.initNew();
    this.setDefaults();
    this.setPinCount();
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.setDefaults();
    try {
      this.baseSegmentCount = parseJavaInt(st.nextToken());
      this.extraSegment = parseJavaInt(st.nextToken());
      this.diodeDirection = parseJavaInt(st.nextToken());
    } catch {
      // older files lack these fields
    }
    this.setPinCount();
  }

  setDefaults(): void {
    this.baseSegmentCount = this.segmentCount = 7;
    this.diodeDirection = 0;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('ba', this.baseSegmentCount);
    w.dumpAttr('ex', this.extraSegment);
    w.dumpAttr('di', this.diodeDirection);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.baseSegmentCount = r.parseIntAttr('ba', this.baseSegmentCount);
    this.extraSegment = r.parseIntAttr('ex', this.extraSegment);
    this.diodeDirection = r.parseIntAttr('di', this.diodeDirection);
    this.setPinCount();
  }

  override allowBus(): boolean {
    return this.diodeDirection === 0;
  }
  override getChipName(): string {
    return this.segmentCount + '-segment display';
  }
  setupPins(): void {
    if (this.pinCount === 0) return;
    this.bits = this.segmentCount;

    if (this.useBus()) {
      this.sizeX = this.baseSegmentCount === 7 ? 4 : 5;
      this.sizeY = this.baseSegmentCount === 7 ? 4 : 6;
      this.pins = new Array(this.pinCount);
      this.makeBitPins(this.segmentCount, 0, SIDE_W, 0, 'I', false, false, false);
      if (this.commonPin > 0)
        this.pins[this.commonPin] = this.newPin(
          1,
          SIDE_W,
          this.diodeDirection === 1 ? 'gnd' : 'Vcc',
        );
    } else {
      const segmentPinsOnLeftSide = Math.trunc((this.baseSegmentCount + 1) / 2);
      this.sizeY = segmentPinsOnLeftSide;
      if (this.baseSegmentCount === 7) {
        this.sizeX = 4;
        if (this.pinCount > 7) this.sizeX = 5;
      } else this.sizeX = 5;

      // make room for common/dp/colon pins
      if (this.pinCount > this.sizeY * 2) this.sizeY++;

      this.pins = new Array(this.pinCount);
      let i: number;
      for (i = 0; i !== segmentPinsOnLeftSide; i++)
        this.pins[i] = this.newPin(i, SIDE_W, String.fromCharCode('a'.charCodeAt(0) + i));

      // retain backward compatibility pin layout for old 7-segment setup, otherwise put pins on left and right side
      const backwardCompatibility =
        this.segmentCount === 7 &&
        this.diodeDirection === 0 &&
        this.extraSegment === SevenSegElm.ES_NONE;
      let s = backwardCompatibility ? 1 : 0;
      for (; i !== this.segmentCount; i++)
        this.pins[i] = this.newPin(
          s++,
          backwardCompatibility ? SIDE_S : SIDE_E,
          String.fromCharCode('a'.charCodeAt(0) + i),
        );
      if (this.extraSegment === SevenSegElm.ES_DP) this.pins[this.segmentCount - 1].text = 'dp';
      if (this.commonPin > 0) {
        let side = SIDE_E;
        if (this.segmentCount !== 7) {
          side = SIDE_W;
          s = segmentPinsOnLeftSide;
        }
        this.pins[this.commonPin] = this.newPin(s, side, this.diodeDirection === 1 ? 'gnd' : 'Vcc');
      }
    }
  }

  diodes: Diode[] | null = null;

  override stamp(): void {
    super.stamp();

    if (this.diodeDirection === 0) return;
    const diodes = (this.diodes = new Array<Diode>(this.segmentCount));
    const model = modelsFor(this.sim).diode.getModelWithName('default-led');
    for (let i = 0; i !== this.segmentCount; i++) {
      diodes[i] = new Diode(this);
      diodes[i].setup(model);
      if (this.diodeDirection === 1) diodes[i].stamp(this.nodes[i], this.nodes[this.commonPin]);
      else diodes[i].stamp(this.nodes[this.commonPin], this.nodes[i]);
    }
  }

  override doStep(): void {
    super.doStep();

    const diodes = this.diodes;
    if (this.diodeDirection === 0 || diodes === null) return;

    for (let i = 0; i !== this.segmentCount; i++)
      diodes[i].doStep(this.diodeDirection * (this.volts[i] - this.volts[this.commonPin]));
  }

  override nonLinear(): boolean {
    return this.diodeDirection !== 0;
  }

  override calculateCurrent(): void {
    const diodes = this.diodes;
    if (this.diodeDirection === 0 || diodes === null) {
      // no current
      for (let i = 0; i !== this.pinCount; i++) this.pins[i].current = 0;
      return;
    }

    // calculate diode currents
    this.pins[this.commonPin].current = 0;
    for (let i = 0; i !== this.segmentCount; i++) {
      this.pins[i].current =
        -this.diodeDirection *
        diodes[i].calculateCurrent(
          this.diodeDirection * (this.volts[i] - this.volts[this.commonPin]),
        );
      this.pins[this.commonPin].current -= this.pins[i].current;
    }
  }

  override getConnection(_n1: number, _n2: number): boolean {
    return this.diodeDirection !== 0;
  }

  override stepFinished(): void {
    // stop for huge currents that make simulator act weird
    if (this.commonPin > 0 && Math.abs(this.pins[this.commonPin].current) > 1e12)
      this.sim.stop('max current exceeded', this);
  }

  override getPostCount(): number {
    return this.pinCount;
  }
  getVoltageSourceCount(): number {
    return 0;
  }
  override getDumpType(): number {
    return 157;
  }
  override getXmlDumpType(): string {
    return 'ssd';
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      return EditInfo.createChoice(
        'Segments',
        ['7 Segment', '14 Segment', '16 Segment'],
        this.baseSegmentCount === 7 ? 0 : this.baseSegmentCount === 14 ? 1 : 2,
      );
    }
    if (n === 1) {
      return EditInfo.createChoice(
        'Extra Segment',
        ['None', 'Decimal Point', 'Colon'],
        this.extraSegment,
      );
    }
    if (n === 2) {
      return EditInfo.createChoice(
        'Diodes',
        ['Common Cathode', 'Common Anode', 'None (logic inputs)'],
        this.diodeDirection === 1 ? 0 : this.diodeDirection === -1 ? 1 : 2,
      );
    }
    return super.getChipEditInfo(n);
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      const ix = ei.choice?.selected ?? 0;
      this.baseSegmentCount = ix === 0 ? 7 : ix === 1 ? 14 : 16;
      this.setPinCount();
      return;
    }
    if (n === 1) {
      this.extraSegment = ei.choice?.selected ?? 0;
      this.setPinCount();
      return;
    }
    if (n === 2) {
      const ix = ei.choice?.selected ?? 0;
      this.diodeDirection = ix === 0 ? 1 : ix === 1 ? -1 : 0;
      this.setPinCount();
      return;
    }
    super.setChipEditValue(n, ei);
  }

  setPinCount(): void {
    this.segmentCount = this.baseSegmentCount;
    if (this.extraSegment > 0) this.segmentCount++;
    if (this.diodeDirection === 0) {
      this.pinCount = this.segmentCount;
      this.commonPin = -1;
    } else {
      this.pinCount = this.segmentCount + 1;
      this.commonPin = this.pinCount - 1;
    }
    this.allocNodes();
    this.setupPins();
    this.setPoints();
  }

  override isDigitalChip(): boolean {
    return false;
  }
}

export class SevenSegDecoderElm extends ChipElm {
  override getClassName(): string {
    return 'SevenSegDecoderElm';
  }
  private static readonly symbols: boolean[][] = [
    [true, true, true, true, true, true, false], //0
    [false, true, true, false, false, false, false], //1
    [true, true, false, true, true, false, true], //2
    [true, true, true, true, false, false, true], //3
    [false, true, true, false, false, true, true], //4
    [true, false, true, true, false, true, true], //5
    [true, false, true, true, true, true, true], //6
    [true, true, true, false, false, false, false], //7
    [true, true, true, true, true, true, true], //8
    [true, true, true, false, false, true, true], //9
    [true, true, true, false, true, true, true], //A
    [false, false, true, true, true, true, true], //B
    [true, false, false, true, true, true, false], //C
    [false, true, true, true, true, false, true], //D
    [true, false, false, true, true, true, true], //E
    [true, false, false, false, true, true, true], //F
  ];

  // 14-segment encoding: a=top, b=upper-right, c=lower-right, d=bottom, e=lower-left, f=upper-left,
  // g=diag UL-center, h=vert upper, i=diag UR-center, j=horiz right-center,
  // k=diag center-LR, l=vert lower, m=diag center-LL, n=horiz left-center
  private static readonly symbols14: boolean[][] = [
    [true, true, true, true, true, true, false, false, true, false, false, false, true, false], //0
    [false, true, true, false, false, false, false, false, true, false, false, false, false, false], //1
    [true, true, false, true, true, false, false, false, false, true, false, false, false, true], //2
    [true, true, true, true, false, false, false, false, false, true, false, false, false, true], //3
    [false, true, true, false, false, true, false, false, false, true, false, false, false, true], //4
    [true, false, true, true, false, true, false, false, false, true, false, false, false, true], //5
    [true, false, true, true, true, true, false, false, false, true, false, false, false, true], //6
    [true, false, false, false, false, false, false, false, true, false, false, true, false, false], //7
    [true, true, true, true, true, true, false, false, false, true, false, false, false, true], //8
    [true, true, true, true, false, true, false, false, false, true, false, false, false, true], //9
    [true, true, true, false, true, true, false, false, false, true, false, false, false, true], //A
    [true, true, true, true, false, false, false, true, false, true, false, true, false, false], //B
    [true, false, false, true, true, true, false, false, false, false, false, false, false, false], //C
    [true, true, true, true, false, false, false, true, false, false, false, true, false, false], //D
    [true, false, false, true, true, true, false, false, false, true, false, false, false, true], //E
    [true, false, false, false, true, true, false, false, false, true, false, false, false, true], //F
  ];

  // 16-segment encoding: a=top-left, b=top-right, c=upper-right, d=lower-right,
  // e=bottom-right, f=bottom-left, g=lower-left, h=upper-left,
  // i=diag UL-center, j=vert upper, k=diag UR-center, l=horiz right,
  // m=diag center-LR, n=vert lower, o=diag center-LL, p=horiz left
  private static readonly symbols16: boolean[][] = [
    [
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
      false,
    ], //0
    [
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ], //1
    [
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
    ], //2
    [
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
    ], //3
    [
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
    ], //4
    [
      true,
      true,
      false,
      true,
      true,
      true,
      false,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
    ], //5
    [
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
    ], //6
    [
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      true,
      false,
      false,
    ], //7
    [
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
    ], //8
    [
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
    ], //9
    [
      true,
      true,
      true,
      true,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
    ], //A
    [
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      false,
    ], //B
    [
      true,
      true,
      false,
      false,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ], //C
    [
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
    ], //D
    [
      true,
      true,
      false,
      false,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
    ], //E
    [
      true,
      true,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
    ], //F
  ];

  static readonly FLAG_ENABLE = 1 << 1;
  static readonly FLAG_BLANK_F = 1 << 2;

  segmentType: number = 0; // 0=7-seg, 1=14-seg, 2=16-seg

  override undump(st: StringTokenizer): void {
    super.undump(st);
    try {
      this.segmentType = parseJavaInt(st.nextToken());
      this.setupPins();
      this.setPoints();
    } catch {
      // older files lack the segment type
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('sgt', this.segmentType);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.segmentType = r.parseIntAttr('sgt', this.segmentType);
    this.setupPins();
  }

  getSegmentCount(): number {
    if (this.segmentType === 1) return 14;
    if (this.segmentType === 2) return 16;
    return 7;
  }

  override needsBits(): boolean {
    return false;
  }
  override allowBus(): boolean {
    return true;
  }

  override getChipName(): string {
    if (this.getSegmentCount() === 7) return '7-Segment Decoder';
    if (this.getSegmentCount() === 14) return '14-Segment Decoder';
    return '16-Segment Decoder';
  }

  setupPins(): void {
    const segCount = this.getSegmentCount();
    this.bits = 4;
    this.sizeX = 3;
    const inputPinsY = this.useBus() ? 1 : 4;
    const outputPinsY = this.useBus() ? 1 : segCount;
    this.sizeY = Math.max(outputPinsY, inputPinsY + (this.hasBlank() ? 1 : 0));
    this.pins = new Array(this.getPostCount());

    this.makeBitPins(4, 0, SIDE_W, segCount, 'I', false, false, true);

    if (this.useBus()) {
      this.makeBitPins(segCount, 0, SIDE_E, 0, 'seg', true, false, false);
    } else {
      for (let i = 0; i < segCount; i++) {
        this.pins[i] = this.newPin(i, SIDE_E, String.fromCharCode('a'.charCodeAt(0) + i));
        this.pins[i].output = true;
      }
    }

    if (this.hasBlank()) {
      this.pins[segCount + 4] = this.newPin(inputPinsY, SIDE_W, 'BI');
      this.pins[segCount + 4].bubble = true;
    }
    this.allocNodes();
  }

  hasBlank(): boolean {
    return (this.flags & SevenSegDecoderElm.FLAG_ENABLE) !== 0;
  }
  blankOnF(): boolean {
    return (this.flags & SevenSegDecoderElm.FLAG_BLANK_F) !== 0;
  }

  override getPostCount(): number {
    const segCount = this.getSegmentCount();
    return segCount + 4 + (this.hasBlank() ? 1 : 0);
  }

  getVoltageSourceCount(): number {
    return this.getSegmentCount();
  }

  override execute(): void {
    const segCount = this.getSegmentCount();
    let input = 0;
    if (this.pins[segCount + 0].value) input += 8;
    if (this.pins[segCount + 1].value) input += 4;
    if (this.pins[segCount + 2].value) input += 2;
    if (this.pins[segCount + 3].value) input += 1;
    let en = true;
    if (this.hasBlank() && !this.pins[segCount + 4].value) en = false;
    if (!en || (input === 15 && this.blankOnF())) {
      for (let i = 0; i !== segCount; i++) this.writeOutput(i, false);
    } else {
      const sym =
        segCount === 14
          ? SevenSegDecoderElm.symbols14
          : segCount === 16
            ? SevenSegDecoderElm.symbols16
            : SevenSegDecoderElm.symbols;
      for (let i = 0; i < segCount; i++) this.writeOutput(i, sym[input][i]);
    }
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      return EditInfo.createChoice(
        'Segments',
        ['7 Segment', '14 Segment', '16 Segment'],
        this.segmentType,
      );
    }
    if (n === 1) {
      return EditInfo.createCheckbox('Blank Pin', this.hasBlank());
    }
    if (n === 2) {
      return EditInfo.createCheckbox('Blank on 1111', this.blankOnF());
    }
    return super.getChipEditInfo(n);
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      this.segmentType = ei.choice?.selected ?? 0;
      this.setupPins();
      this.setPoints();
      return;
    }
    if (n === 1) {
      this.flags = ei.changeFlag(this.flags, SevenSegDecoderElm.FLAG_ENABLE);
      this.setupPins();
      this.setPoints();
      return;
    }
    if (n === 2) this.flags = ei.changeFlag(this.flags, SevenSegDecoderElm.FLAG_BLANK_F);
    super.setChipEditValue(n, ei);
  }

  override getDumpType(): number {
    return 197;
  }
}

export class DecimalDisplayElm extends ChipElm {
  override getClassName(): string {
    return 'DecimalDisplayElm';
  }
  bitCount = 0;
  displayMode: number = 0; // 0=decimal, 1=hex, 2=octal
  override initNew(): void {
    super.initNew();
    this.bitCount = 4;
    this.setupPins();
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.bitCount = 4;
    try {
      this.bitCount = parseJavaInt(st.nextToken());
      this.displayMode = parseJavaInt(st.nextToken());
    } catch {
      // older files lack these fields
    }
    this.setupPins();
  }

  override getChipName(): string {
    switch (this.displayMode) {
      case 1:
        return 'hex display';
      case 2:
        return 'octal display';
      default:
        return 'decimal display';
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('bc', this.bitCount);
    w.dumpAttr('dm', this.displayMode);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.bitCount = r.parseIntAttr('bc', this.bitCount);
    this.displayMode = r.parseIntAttr('dm', this.displayMode);
    this.setupPins();
  }

  override getXmlDumpType(): string {
    return 'dd';
  }
  override allowBus(): boolean {
    return true;
  }

  setupPins(): void {
    this.sizeX = 3;
    this.sizeY = this.useBus() ? 2 : this.bitCount;
    this.pins = new Array(this.bitCount);
    this.makeBitPins(this.bitCount, 0, SIDE_W, 0, 'I', false, false, false);
    this.allocNodes();
  }

  override getPostCount(): number {
    return this.bitCount;
  }
  override getDumpType(): number {
    return 419;
  }
  getVoltageSourceCount(): number {
    return 0;
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('# of Bits', this.bitCount, 1, 8).setDimensionless();
    if (n === 1) {
      return EditInfo.createChoice(
        'Display Mode',
        ['Decimal', 'Hexadecimal', 'Octal'],
        this.displayMode,
      );
    }
    return null;
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      if (ei.value >= 1 && ei.value <= 16) {
        const newBitCount = javaDoubleToInt(ei.value);
        if (newBitCount !== this.bitCount) {
          this.bitCount = newBitCount;
          this.setupPins();
          this.setPoints();
        }
      } else ei.setError('must be between 1 and 16');
      return;
    }
    if (n === 1) this.displayMode = ei.choice?.selected ?? 0;
  }
}

export const SevenSegElmType = elementType('SevenSegElm', SevenSegElm);
export const SevenSegDecoderElmType = elementType('SevenSegDecoderElm', SevenSegDecoderElm);
export const DecimalDisplayElmType = elementType('DecimalDisplayElm', DecimalDisplayElm);
