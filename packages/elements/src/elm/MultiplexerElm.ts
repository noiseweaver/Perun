// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/MultiplexerElm.java,
// DeMultiplexerElm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, checked against the
// ts/ translations (dev-ts) at 7ec858d662d8be1d76d54241ba3a5c1d1c524f51.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt, parseJavaInt } from '../java.ts';
import { type StringTokenizer } from '../StringTokenizer.ts';
import { type XmlAttrReader, type XmlAttrWriter } from '../xml.ts';
import { ChipElm, SIDE_S, SIDE_W, SIDE_E } from './ChipElm.ts';

// contributed by Edward Calver

export class MultiplexerElm extends ChipElm {
  override getClassName(): string {
    return 'MultiplexerElm';
  }
  static readonly FLAG_INVERTED_OUTPUT = 1 << 1;
  static readonly FLAG_STROBE = 1 << 2;
  static readonly FLAG_BUS_SELECT = 1 << 3;

  // inputMode: 0 = individual inputs/single output (original)
  //            1 = bus input/single output (bit selector)
  //            2 = bus input/bus output
  static readonly INPUT_MODE_INDIVIDUAL = 0;
  static readonly INPUT_MODE_BUS_BIT = 1;
  static readonly INPUT_MODE_BUS_BUS = 2;

  selectBitCount = 0;
  outputCount: number = 0;
  inputMode: number = 0;
  dataBusWidth: number = 4;
  strobe: number = -1;
  outputPin: number = 0;
  selectPin: number = 0;

  hasReset(): boolean {
    return false;
  }
  busSelect(): boolean {
    return this.hasFlag(MultiplexerElm.FLAG_BUS_SELECT);
  }
  override initNew(): void {
    super.initNew();
    this.selectBitCount = 2;
    this.setupPins();
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.selectBitCount = 2;
    try {
      this.selectBitCount = parseJavaInt(st.nextToken());
    } catch {
      // keep the default select bits
    }
    this.setupPins();
  }

  override getChipName(): string {
    return 'Multiplexer';
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('se', this.selectBitCount);
    if (this.inputMode !== 0) w.dumpAttr('im', this.inputMode);
    if (this.dataBusWidth !== 4) w.dumpAttr('dw', this.dataBusWidth);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.selectBitCount = r.parseIntAttr('se', this.selectBitCount);
    this.inputMode = r.parseIntAttr('im', 0);
    this.dataBusWidth = r.parseIntAttr('dw', 4);
    this.setupPins();
  }

  setupPins(): void {
    const M = MultiplexerElm;
    this.outputCount = 1 << this.selectBitCount;
    let i: number, n: number;

    if (this.inputMode === M.INPUT_MODE_BUS_BUS) {
      const inputPinCount = this.outputCount * this.dataBusWidth;
      const outputPinCount = this.dataBusWidth;
      const invertedCount = this.hasFlag(M.FLAG_INVERTED_OUTPUT) ? this.dataBusWidth : 0;
      const strobeCount = this.hasFlag(M.FLAG_STROBE) ? 1 : 0;

      this.sizeX = this.selectBitCount + 1;
      this.sizeY = this.outputCount + 1;
      this.pins = new Array(
        inputPinCount + this.selectBitCount + outputPinCount + invertedCount + strobeCount,
      );

      // input bus groups on west side
      for (let g = 0; g < this.outputCount; g++) {
        for (i = 0; i < this.dataBusWidth; i++) {
          n = g * this.dataBusWidth + i;
          this.pins[n] = this.newPin(g, SIDE_W, 'I' + g);
          this.pins[n].busWidth = this.dataBusWidth;
          this.pins[n].busZ = i;
        }
      }

      // select pins on south side
      this.selectPin = inputPinCount;
      for (i = 0; i < this.selectBitCount; i++) {
        n = this.selectPin + i;
        if (this.busSelect()) {
          this.pins[n] = this.newPin(0, SIDE_S, 'S');
          this.pins[n].busWidth = this.selectBitCount;
          this.pins[n].busZ = i;
        } else {
          this.pins[n] = this.newPin(i + 1, SIDE_S, 'S' + i);
        }
      }

      // output bus on east side
      this.outputPin = this.selectPin + this.selectBitCount;
      for (i = 0; i < this.dataBusWidth; i++) {
        n = this.outputPin + i;
        this.pins[n] = this.newPin(0, SIDE_E, 'Q');
        this.pins[n].output = true;
        this.pins[n].busWidth = this.dataBusWidth;
        this.pins[n].busZ = i;
      }

      // inverted output bus
      if (this.hasFlag(M.FLAG_INVERTED_OUTPUT)) {
        for (i = 0; i < this.dataBusWidth; i++) {
          n = this.outputPin + this.dataBusWidth + i;
          this.pins[n] = this.newPin(1, SIDE_E, 'Q');
          this.pins[n].lineOver = true;
          this.pins[n].output = true;
          this.pins[n].bubble = i === 0;
          this.pins[n].busWidth = this.dataBusWidth;
          this.pins[n].busZ = i;
        }
      }

      // strobe
      if (this.hasFlag(M.FLAG_STROBE)) {
        n = this.outputPin + this.dataBusWidth + invertedCount;
        this.pins[n] = this.newPin(0, SIDE_S, 'STR');
        this.strobe = n;
      } else this.strobe = -1;
    } else if (this.inputMode === M.INPUT_MODE_BUS_BIT) {
      this.sizeX = this.selectBitCount + 1;
      this.sizeY = 3;
      const strobeCount = this.hasFlag(M.FLAG_STROBE) ? 1 : 0;
      const invertedCount = this.hasFlag(M.FLAG_INVERTED_OUTPUT) ? 1 : 0;
      this.pins = new Array(
        this.outputCount + this.selectBitCount + 1 + invertedCount + strobeCount,
      );

      // bus input pins: all at same position
      for (i = 0; i < this.outputCount; i++) {
        this.pins[i] = this.newPin(0, SIDE_W, 'I');
        this.pins[i].busWidth = this.outputCount;
        this.pins[i].busZ = i;
      }

      // select pins
      this.selectPin = this.outputCount;
      for (i = 0; i < this.selectBitCount; i++) {
        n = this.selectPin + i;
        if (this.busSelect()) {
          this.pins[n] = this.newPin(0, SIDE_S, 'S');
          this.pins[n].busWidth = this.selectBitCount;
          this.pins[n].busZ = i;
        } else {
          this.pins[n] = this.newPin(i + 1, SIDE_S, 'S' + i);
        }
      }

      // output
      n = this.selectPin + this.selectBitCount;
      this.pins[n] = this.newPin(0, SIDE_E, 'Q');
      this.pins[n].output = true;
      this.outputPin = n;

      if (this.hasFlag(M.FLAG_INVERTED_OUTPUT)) {
        n++;
        this.pins[n] = this.newPin(1, SIDE_E, 'Q');
        this.pins[n].lineOver = true;
        this.pins[n].output = true;
        this.pins[n].bubble = true;
      }
      if (this.hasFlag(M.FLAG_STROBE)) {
        n++;
        this.pins[n] = this.newPin(0, SIDE_S, 'STR');
        this.strobe = n;
      } else this.strobe = -1;
    } else {
      // mode 0: individual inputs / single output
      this.sizeX = this.selectBitCount + 1;
      this.sizeY = this.outputCount + 1;
      const strobeCount = this.hasFlag(M.FLAG_STROBE) ? 1 : 0;
      const invertedCount = this.hasFlag(M.FLAG_INVERTED_OUTPUT) ? 1 : 0;
      this.pins = new Array(
        this.outputCount + this.selectBitCount + 1 + invertedCount + strobeCount,
      );

      for (i = 0; i < this.outputCount; i++) this.pins[i] = this.newPin(i, SIDE_W, 'I' + i);

      this.selectPin = this.outputCount;
      for (i = 0; i < this.selectBitCount; i++) {
        n = this.selectPin + i;
        if (this.busSelect()) {
          this.pins[n] = this.newPin(0, SIDE_S, 'S');
          this.pins[n].busWidth = this.selectBitCount;
          this.pins[n].busZ = i;
        } else {
          this.pins[n] = this.newPin(i + 1, SIDE_S, 'S' + i);
        }
      }

      n = this.selectPin + this.selectBitCount;
      this.pins[n] = this.newPin(0, SIDE_E, 'Q');
      this.pins[n].output = true;
      this.outputPin = n;
      if (this.hasFlag(M.FLAG_INVERTED_OUTPUT)) {
        n++;
        this.pins[n] = this.newPin(1, SIDE_E, 'Q');
        this.pins[n].lineOver = true;
        this.pins[n].output = true;
        this.pins[n].bubble = true;
      }
      if (this.hasFlag(M.FLAG_STROBE)) {
        n++;
        this.pins[n] = this.newPin(0, SIDE_S, 'STR');
        this.strobe = n;
      } else this.strobe = -1;
    }

    this.allocNodes();
  }

  override getPostCount(): number {
    const M = MultiplexerElm;
    if (this.inputMode === M.INPUT_MODE_BUS_BUS) {
      const invertedCount = this.hasFlag(M.FLAG_INVERTED_OUTPUT) ? this.dataBusWidth : 0;
      const strobeCount = this.hasFlag(M.FLAG_STROBE) ? 1 : 0;
      return (
        this.outputCount * this.dataBusWidth +
        this.selectBitCount +
        this.dataBusWidth +
        invertedCount +
        strobeCount
      );
    }
    const invertedCount = this.hasFlag(M.FLAG_INVERTED_OUTPUT) ? 1 : 0;
    const strobeCount = this.hasFlag(M.FLAG_STROBE) ? 1 : 0;
    return this.outputCount + this.selectBitCount + 1 + invertedCount + strobeCount;
  }

  getVoltageSourceCount(): number {
    const M = MultiplexerElm;
    if (this.inputMode === M.INPUT_MODE_BUS_BUS) {
      let count = this.dataBusWidth;
      if (this.hasFlag(M.FLAG_INVERTED_OUTPUT)) count += this.dataBusWidth;
      return count;
    }
    return this.hasFlag(M.FLAG_INVERTED_OUTPUT) ? 2 : 1;
  }

  readSelectValue(): number {
    let sel = 0;
    for (let i = 0; i < this.selectBitCount; i++)
      if (this.pins[this.selectPin + i].value) sel |= 1 << i;
    return sel;
  }

  override execute(): void {
    const M = MultiplexerElm;
    const selectedValue = this.readSelectValue();

    if (this.inputMode === M.INPUT_MODE_BUS_BUS) {
      const strobed = this.strobe !== -1 && this.pins[this.strobe].value;
      for (let i = 0; i < this.dataBusWidth; i++) {
        const val = strobed ? false : this.pins[selectedValue * this.dataBusWidth + i].value;
        this.pins[this.outputPin + i].value = val;
      }
      if (this.hasFlag(M.FLAG_INVERTED_OUTPUT)) {
        for (let i = 0; i < this.dataBusWidth; i++)
          this.pins[this.outputPin + this.dataBusWidth + i].value =
            !this.pins[this.outputPin + i].value;
      }
    } else {
      let val = this.pins[selectedValue].value;
      if (this.strobe !== -1 && this.pins[this.strobe].value) val = false;
      this.pins[this.outputPin].value = val;
      if (this.hasFlag(M.FLAG_INVERTED_OUTPUT)) this.pins[this.outputPin + 1].value = !val;
    }
  }

  override getDumpType(): number {
    return 184;
  }
  override getXmlDumpType(): string {
    return 'mux';
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0)
      return new EditInfo('# of Select Bits', this.selectBitCount, 1, 8).setDimensionless();
    if (n === 1)
      return EditInfo.createCheckbox(
        'Inverted Output',
        this.hasFlag(MultiplexerElm.FLAG_INVERTED_OUTPUT),
      );
    if (n === 2)
      return EditInfo.createCheckbox('Strobe Pin', this.hasFlag(MultiplexerElm.FLAG_STROBE));
    if (n === 3) {
      return EditInfo.createChoice(
        'Input Mode',
        ['Individual Inputs', 'Bus Input (Bit Select)', 'Bus Input/Output'],
        this.inputMode,
      );
    }
    if (n === 4) return EditInfo.createCheckbox('Bus Select', this.busSelect());
    if (n === 5 && this.inputMode === MultiplexerElm.INPUT_MODE_BUS_BUS)
      return new EditInfo('Data Bus Width', this.dataBusWidth, 2, 32).setDimensionless();
    return null;
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    const M = MultiplexerElm;
    if (n === 0) {
      if (ei.value >= 1 && ei.value <= 6) {
        this.selectBitCount = javaDoubleToInt(ei.value);
        this.setupPins();
        this.setPoints();
      } else ei.setError('must be between 1 and 6');
      return;
    }
    if (n === 1) {
      this.flags = ei.changeFlag(this.flags, M.FLAG_INVERTED_OUTPUT);
      this.setupPins();
      this.setPoints();
      return;
    }
    if (n === 2) {
      this.flags = ei.changeFlag(this.flags, M.FLAG_STROBE);
      this.setupPins();
      this.setPoints();
      return;
    }
    if (n === 3) {
      this.inputMode = ei.choice?.selected ?? 0;
      this.setupPins();
      this.setPoints();
      return;
    }
    if (n === 4) {
      this.flags = ei.changeFlag(this.flags, M.FLAG_BUS_SELECT);
      this.setupPins();
      this.setPoints();
      return;
    }
    if (n === 5) {
      if (ei.value >= 2) {
        this.dataBusWidth = javaDoubleToInt(ei.value);
        this.setupPins();
        this.setPoints();
      } else ei.setError('must be >= 2');
      return;
    }
  }
}

// contributed by Edward Calver

export class DeMultiplexerElm extends ChipElm {
  override getClassName(): string {
    return 'DeMultiplexerElm';
  }
  static readonly FLAG_BUS_SELECT = 1 << 3;
  static readonly FLAG_INVERT_OUTPUTS = 1 << 4;

  // outputMode: 0 = single input, individual outputs (original)
  //             1 = single input, bus output (bit distributor)
  //             2 = bus input, bus outputs
  static readonly OUTPUT_MODE_INDIVIDUAL = 0;
  static readonly OUTPUT_MODE_BUS_BIT = 1;
  static readonly OUTPUT_MODE_BUS_BUS = 2;

  selectBitCount = 0;
  outputCount: number = 0;
  outputMode: number = 0;
  dataBusWidth: number = 4;
  inputPin: number = 0;
  selectPin: number = 0;
  outputPin: number = 0;

  hasReset(): boolean {
    return false;
  }
  busSelect(): boolean {
    return this.hasFlag(DeMultiplexerElm.FLAG_BUS_SELECT);
  }
  invertOutputs(): boolean {
    return this.hasFlag(DeMultiplexerElm.FLAG_INVERT_OUTPUTS);
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    try {
      this.selectBitCount = parseJavaInt(st.nextToken());
      this.setupPins();
      this.allocNodes();
    } catch {
      // keep the default select bits
    }
  }

  override getChipName(): string {
    return 'Demultiplexer';
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('se', this.selectBitCount);
    if (this.outputMode !== 0) w.dumpAttr('om', this.outputMode);
    if (this.dataBusWidth !== 4) w.dumpAttr('dw', this.dataBusWidth);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.selectBitCount = r.parseIntAttr('se', this.selectBitCount);
    this.outputMode = r.parseIntAttr('om', 0);
    this.dataBusWidth = r.parseIntAttr('dw', 4);
    this.setupPins();
    this.allocNodes();
  }

  setupPins(): void {
    if (!this.selectBitCount) this.selectBitCount = 2;
    this.outputCount = 1 << this.selectBitCount;
    const D = DeMultiplexerElm;
    let i: number, n: number;

    if (this.outputMode === D.OUTPUT_MODE_BUS_BUS) {
      const inputPinCount = this.dataBusWidth;
      const outputPinCount = this.outputCount * this.dataBusWidth;

      this.sizeX = this.selectBitCount + 1;
      this.sizeY = this.outputCount + 1;
      this.pins = new Array(inputPinCount + this.selectBitCount + outputPinCount);

      // input bus on west side
      this.inputPin = 0;
      for (i = 0; i < this.dataBusWidth; i++) {
        this.pins[i] = this.newPin(0, SIDE_W, 'Q');
        this.pins[i].busWidth = this.dataBusWidth;
        this.pins[i].busZ = i;
      }

      // select pins on south side
      this.selectPin = inputPinCount;
      for (i = 0; i < this.selectBitCount; i++) {
        n = this.selectPin + i;
        if (this.busSelect()) {
          this.pins[n] = this.newPin(0, SIDE_S, 'S');
          this.pins[n].busWidth = this.selectBitCount;
          this.pins[n].busZ = i;
        } else {
          this.pins[n] = this.newPin(i + 1, SIDE_S, 'S' + i);
        }
      }

      // output bus groups on east side
      this.outputPin = this.selectPin + this.selectBitCount;
      for (let g = 0; g < this.outputCount; g++) {
        for (i = 0; i < this.dataBusWidth; i++) {
          n = this.outputPin + g * this.dataBusWidth + i;
          this.pins[n] = this.newPin(g, SIDE_E, 'Q' + g);
          this.pins[n].output = true;
          this.pins[n].busWidth = this.dataBusWidth;
          this.pins[n].busZ = i;
        }
      }
    } else if (this.outputMode === D.OUTPUT_MODE_BUS_BIT) {
      this.sizeX = this.selectBitCount + 1;
      this.sizeY = 3;
      this.pins = new Array(1 + this.selectBitCount + this.outputCount);

      // single input on west side
      this.inputPin = 0;
      this.pins[0] = this.newPin(0, SIDE_W, 'Q');

      // select pins on south side
      this.selectPin = 1;
      for (i = 0; i < this.selectBitCount; i++) {
        n = this.selectPin + i;
        if (this.busSelect()) {
          this.pins[n] = this.newPin(0, SIDE_S, 'S');
          this.pins[n].busWidth = this.selectBitCount;
          this.pins[n].busZ = i;
        } else {
          this.pins[n] = this.newPin(i + 1, SIDE_S, 'S' + i);
        }
      }

      // bus output on east side
      this.outputPin = this.selectPin + this.selectBitCount;
      for (i = 0; i < this.outputCount; i++) {
        n = this.outputPin + i;
        this.pins[n] = this.newPin(1, SIDE_E, 'Q');
        this.pins[n].output = true;
        this.pins[n].busWidth = this.outputCount;
        this.pins[n].busZ = i;
      }
    } else {
      // mode 0: single input, individual outputs
      this.sizeX = 1 + this.selectBitCount;
      this.sizeY = 1 + this.outputCount;
      this.pins = new Array(1 + this.selectBitCount + this.outputCount);

      // individual output pins on east side
      this.outputPin = 0;
      for (i = 0; i < this.outputCount; i++) {
        this.pins[i] = this.newPin(i, SIDE_E, 'Q' + i);
        this.pins[i].output = true;
      }

      // select pins on south side
      this.selectPin = this.outputCount;
      for (i = 0; i < this.selectBitCount; i++) {
        n = this.selectPin + i;
        if (this.busSelect()) {
          this.pins[n] = this.newPin(0, SIDE_S, 'S');
          this.pins[n].busWidth = this.selectBitCount;
          this.pins[n].busZ = i;
        } else {
          this.pins[n] = this.newPin(i, SIDE_S, 'S' + i);
        }
      }

      // single input on west side
      this.inputPin = this.outputCount + this.selectBitCount;
      this.pins[this.inputPin] = this.newPin(0, SIDE_W, 'Q');
    }

    this.allocNodes();
  }

  override getPostCount(): number {
    const D = DeMultiplexerElm;
    if (this.outputMode === D.OUTPUT_MODE_BUS_BUS)
      return this.dataBusWidth + this.selectBitCount + this.outputCount * this.dataBusWidth;
    return 1 + this.selectBitCount + this.outputCount;
  }

  getVoltageSourceCount(): number {
    if (this.outputMode === DeMultiplexerElm.OUTPUT_MODE_BUS_BUS)
      return this.outputCount * this.dataBusWidth;
    return this.outputCount;
  }

  readSelectValue(): number {
    let sel = 0;
    for (let i = 0; i < this.selectBitCount; i++)
      if (this.pins[this.selectPin + i].value) sel |= 1 << i;
    return sel;
  }

  override execute(): void {
    const D = DeMultiplexerElm;
    const selectedValue = this.readSelectValue();

    // set inactive outputs to idle level, then copy input (bus) to selected output (group)
    const width = this.outputMode === D.OUTPUT_MODE_BUS_BUS ? this.dataBusWidth : 1;
    const idle = this.invertOutputs();
    for (let i = 0; i < this.outputCount * width; i++) this.pins[this.outputPin + i].value = idle;
    for (let i = 0; i < width; i++)
      this.pins[this.outputPin + selectedValue * width + i].value =
        this.pins[this.inputPin + i].value;
  }

  override getDumpType(): number {
    return 185;
  }
  override getXmlDumpType(): string {
    return 'dmux';
  }

  override getChipEditInfo(n: number): EditInfo | null {
    const D = DeMultiplexerElm;
    if (n === 0) return new EditInfo('# of Select Bits', this.selectBitCount).setDimensionless();
    if (n === 1) {
      return EditInfo.createChoice(
        'Output Mode',
        ['Individual Outputs', 'Bus Output (Bit Distribute)', 'Bus Input/Output'],
        this.outputMode,
      );
    }
    if (n === 2) return EditInfo.createCheckbox('Bus Select', this.busSelect());
    if (n === 3)
      return EditInfo.createCheckbox('Keep Inactive Outputs High (74139)', this.invertOutputs());
    if (n === 4 && this.outputMode === D.OUTPUT_MODE_BUS_BUS)
      return new EditInfo('Data Bus Width', this.dataBusWidth, 2, 32).setDimensionless();
    return null;
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    const D = DeMultiplexerElm;
    if (n === 0) {
      if (ei.value >= 1 && ei.value <= 6) {
        this.selectBitCount = javaDoubleToInt(ei.value);
        this.setupPins();
        this.setPoints();
      } else ei.setError('must be between 1 and 6');
    }
    if (n === 1) {
      this.outputMode = ei.choice?.selected ?? 0;
      this.setupPins();
      this.setPoints();
    }
    if (n === 2) {
      this.flags = ei.changeFlag(this.flags, D.FLAG_BUS_SELECT);
      this.setupPins();
      this.setPoints();
    }
    if (n === 3) {
      this.flags = ei.changeFlag(this.flags, D.FLAG_INVERT_OUTPUTS);
    }
    if (n === 4) {
      if (ei.value >= 2) {
        this.dataBusWidth = javaDoubleToInt(ei.value);
        this.setupPins();
        this.setPoints();
      } else ei.setError('must be >= 2');
    }
  }
}

export const MultiplexerElmType = elementType('MultiplexerElm', MultiplexerElm);
export const DeMultiplexerElmType = elementType('DeMultiplexerElm', DeMultiplexerElm);
