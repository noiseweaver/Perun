// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/SipoShiftElm.java,
// PisoShiftElm.java, LatchElm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, checked
// against the ts/ translations (dev-ts) at 7ec858d662d8be1d76d54241ba3a5c1d1c524f51.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { type VoltageSource } from '@circuitjs-next/engine';
import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { type StringTokenizer } from '../StringTokenizer.ts';
import { type XmlAttrReader, type XmlAttrWriter } from '../xml.ts';
import {
  ChipElm,
  readBits,
  readBitsFromString,
  SIDE_E,
  SIDE_N,
  SIDE_W,
  writeBitsToString,
} from './ChipElm.ts';
import { javaDoubleToInt } from '../java.ts';

// contributed by Edward Calver

export class SipoShiftElm extends ChipElm {
  override getClassName(): string {
    return 'SipoShiftElm';
  }
  static readonly DATA_PIN_INDEX = 2;
  clockstate: boolean = false;

  override undump(st: StringTokenizer): void {
    super.undump(st);
    const data = new Array<boolean>(this.bits).fill(false);
    readBits(st, data);
    for (let i = 0; i < this.bits; i++) this.pins[SipoShiftElm.DATA_PIN_INDEX + i].value = data[i];
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    super.dumpXmlState(w);
    const data = new Array<boolean>(this.bits).fill(false);
    for (let i = 0; i < this.bits; i++) data[i] = this.pins[SipoShiftElm.DATA_PIN_INDEX + i].value;
    w.dumpAttr('dt', writeBitsToString(data));
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    const dt = r.parseStringAttr('dt', null);
    if (dt !== null) {
      const data = new Array<boolean>(this.bits).fill(false);
      readBitsFromString(dt, data);
      for (let i = 0; i < this.bits; i++)
        this.pins[SipoShiftElm.DATA_PIN_INDEX + i].value = data[i];
    }
  }

  override getDumpType(): number {
    return 189;
  }
  override getChipName(): string {
    return 'SIPO shift register';
  }
  override needsBits(): boolean {
    return true;
  }
  override defaultBitCount(): number {
    return 8;
  }

  setupPins(): void {
    this.sizeX = this.bits + 1;
    this.sizeY = 3;
    this.pins = new Array(this.getPostCount());

    this.pins[0] = this.newPin(1, SIDE_W, 'D');
    this.pins[1] = this.newPin(2, SIDE_W, '');
    this.pins[1].clock = true;

    for (let i = 0; i < this.bits; i++) {
      const prevVal = this.pins[SipoShiftElm.DATA_PIN_INDEX + i]
        ? this.pins[SipoShiftElm.DATA_PIN_INDEX + i].value
        : false;
      const pin = (this.pins[SipoShiftElm.DATA_PIN_INDEX + i] = this.newPin(
        i + 1,
        SIDE_N,
        'Q' + i,
      ));
      pin.value = prevVal;
      pin.output = true;
    }
    this.allocNodes();
  }

  override getPostCount(): number {
    return 2 + this.bits;
  }
  getVoltageSourceCount(): number {
    return this.bits;
  }

  override execute(): void {
    if (this.pins[1].value !== this.clockstate) {
      this.clockstate = this.pins[1].value;
      if (this.clockstate && this.bits > 0) {
        for (let i = this.bits - 2; i >= 0; i--)
          this.pins[SipoShiftElm.DATA_PIN_INDEX + i + 1].value =
            this.pins[SipoShiftElm.DATA_PIN_INDEX + i].value;
        this.pins[2].value = this.pins[0].value;
      }
    }
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('# of Bits', this.bits, 1, 1).setDimensionless();
    return null;
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.value !== this.bits && ei.value >= 1) {
      this.bits = javaDoubleToInt(ei.value);
      this.setupPins();
      this.setPoints();
    }
  }
}

// contributed by Edward Calver

export class PisoShiftElm extends ChipElm {
  override getClassName(): string {
    return 'PisoShiftElm';
  }
  readonly FLAG_NEW_BEHAVIOR = 2;

  data: boolean[] = [];
  dataIndex: number = 0;
  clockState: boolean = false;
  loadState: boolean = false;
  dataPinIndex: number = 0;

  override initNew(): void {
    super.initNew();
    this.data = new Array<boolean>(this.bits).fill(false);
    this.flags |= this.FLAG_NEW_BEHAVIOR;
    this.setupPins();
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.data = new Array<boolean>(this.bits).fill(false);
    readBits(st, this.data);
    this.setupPins();
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    super.dumpXmlState(w);
    const newData = new Array<boolean>(this.data.length).fill(false);
    for (let i = 0; i < this.data.length; i++)
      newData[i] = this.data[(i + this.dataIndex) % this.data.length];
    w.dumpAttr('dt', writeBitsToString(newData));
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.data = new Array<boolean>(this.bits).fill(false);
    this.dataIndex = 0;
    const dt = r.parseStringAttr('dt', null);
    if (dt !== null) readBitsFromString(dt, this.data);
  }

  override getDumpType(): number {
    return 186;
  }
  override getChipName(): string {
    return 'PISO shift register';
  }
  override needsBits(): boolean {
    return true;
  }
  override defaultBitCount(): number {
    return 8;
  }
  hasNewBhvr(): boolean {
    return (this.flags & this.FLAG_NEW_BEHAVIOR) !== 0;
  }

  override reset(): void {
    super.reset();
    this.data = new Array<boolean>(this.bits).fill(false);
  }

  setupPins(): void {
    this.sizeX = this.bits + 2;
    this.sizeY = 3;
    this.pins = new Array(this.getPostCount());

    this.pins[0] = this.newPin(1, SIDE_W, 'LD');
    this.pins[1] = this.newPin(2, SIDE_W, '');
    this.pins[1].clock = true;

    this.pins[2] = this.newPin(1, SIDE_E, 'Q' + (this.hasNewBhvr() ? this.bits - 1 : this.bits));
    this.pins[2].output = true;

    if (this.hasNewBhvr()) {
      this.pins[3] = this.newPin(0, SIDE_W, 'SER');
      if (this.data && this.data.length > 0) this.pins[2].value = this.data[0];
      this.dataPinIndex = 4;
    } else {
      this.dataPinIndex = 3;
    }

    for (let i = 0; i < this.bits; i++)
      this.pins[this.dataPinIndex + i] = this.newPin(
        this.bits - i,
        SIDE_N,
        'D' + (this.bits - (i + 1)),
      );

    this.allocNodes();
  }

  override getPostCount(): number {
    return (this.hasNewBhvr() ? 4 : 3) + this.bits;
  }
  getVoltageSourceCount(): number {
    return 1;
  }

  override execute(): void {
    // LOAD raised
    if (this.pins[0].value !== this.loadState) {
      this.loadState = this.pins[0].value;
      if (this.loadState && this.data.length > 0) {
        if (this.hasNewBhvr()) {
          this.pins[2].value = this.pins[this.dataPinIndex].value;
          this.dataIndex = 0;
        } else {
          this.dataIndex = -1;
        }
        for (let i = 0; i < this.data.length; i++)
          this.data[i] = this.pins[this.dataPinIndex + i].value;
      }
    }
    // CLK raised
    if (this.pins[1].value !== this.clockState) {
      this.clockState = this.pins[1].value;
      if (this.clockState) {
        if (this.dataIndex >= 0)
          this.data[this.dataIndex] = this.hasNewBhvr() && this.pins[3].value;
        this.dataIndex++;
        if (this.dataIndex >= this.data.length) this.dataIndex = 0;
        this.pins[2].value = this.data[this.dataIndex];
      }
    }
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('# of Bits', this.bits, 1, 1).setDimensionless();
    return null;
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.value !== this.bits && ei.value >= 1) {
      this.bits = javaDoubleToInt(ei.value);
      this.data = new Array<boolean>(this.bits).fill(false);
      this.setupPins();
      this.setPoints();
    }
  }
}

export class LatchElm extends ChipElm {
  override getClassName(): string {
    return 'LatchElm';
  }
  readonly FLAG_STATE = 2;
  readonly FLAG_NO_EDGE = 4;
  readonly FLAG_RESET = 8;
  readonly FLAG_SET = 16;
  // enable mode stored in bits 5-6: 0=none, 1=one each, 2=two each
  readonly FLAG_ENABLE_MASK = 32 | 64;
  readonly FLAG_ENABLE_SHIFT = 5;
  readonly FLAG_RESET_INVERT = 128;

  hasReset(): boolean {
    return (this.flags & this.FLAG_RESET) !== 0;
  }
  hasSet(): boolean {
    return (this.flags & this.FLAG_SET) !== 0;
  }
  resetActiveLow(): boolean {
    return (this.flags & this.FLAG_RESET_INVERT) !== 0;
  }
  enableMode(): number {
    return (this.flags & this.FLAG_ENABLE_MASK) >> this.FLAG_ENABLE_SHIFT;
  }
  inputEnableCount(): number {
    return this.enableMode();
  }
  outputEnableCount(): number {
    return this.enableMode();
  }
  hasOutputEnable(): boolean {
    return this.enableMode() > 0;
  }

  loadPin: number = 0;
  resetPin: number = 0;
  setPin: number = 0;
  ie1Pin: number = 0;
  ie2Pin: number = 0;
  oe1Pin: number = 0;
  oe2Pin: number = 0;
  intNodes: number = 0;
  vSources: VoltageSource[] = [];
  override initNew(): void {
    super.initNew();
    this.flags |= this.FLAG_STATE;
    this.setupPins();
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);

    // add FLAG_STATE flag to old latches so their state gets saved
    if ((this.flags & this.FLAG_STATE) === 0) {
      this.flags |= this.FLAG_STATE;
      this.setupPins();
    }
    this.restoreOutputValues();
  }
  override getChipName(): string {
    return this.isEdgeTriggered() ? 'Register' : 'Latch';
  }
  override needsBits(): boolean {
    return true;
  }
  override allowBus(): boolean {
    return true;
  }
  isEdgeTriggered(): boolean {
    return (this.flags & this.FLAG_NO_EDGE) === 0;
  }
  override nonLinear(): boolean {
    return this.hasOutputEnable();
  }

  setupPins(): void {
    this.sizeX = 2;
    const ieCount = this.inputEnableCount();
    const oeCount = this.outputEnableCount();
    const extraLeftPins = (this.hasReset() ? 1 : 0) + (this.hasSet() ? 1 : 0) + ieCount;
    const extraRightPins = oeCount;
    const bitsY = this.useBus() ? 1 : this.bits;
    this.sizeY = Math.max(bitsY + 1 + extraLeftPins, bitsY + extraRightPins);
    this.pins = new Array(this.getPostCount());
    this.makeBitPins(this.bits, 0, SIDE_W, 0, 'I', false, false, false);
    this.makeBitPins(
      this.bits,
      0,
      SIDE_E,
      this.bits,
      'O',
      !this.hasOutputEnable(),
      (this.flags & this.FLAG_STATE) !== 0,
      false,
    );
    let pinIndex = this.bits * 2;
    let leftPos = bitsY;

    this.pins[(this.loadPin = pinIndex++)] = this.newPin(
      leftPos++,
      SIDE_W,
      this.isEdgeTriggered() ? '' : 'Ld',
    );
    this.pins[this.loadPin].clock = this.isEdgeTriggered();
    if (this.hasReset()) {
      this.pins[(this.resetPin = pinIndex++)] = this.newPin(leftPos++, SIDE_W, 'R');
      this.pins[this.resetPin].lineOver = this.resetActiveLow();
    }
    if (this.hasSet()) this.pins[(this.setPin = pinIndex++)] = this.newPin(leftPos++, SIDE_W, 'S');
    let rightPos = leftPos;
    if (ieCount >= 1) {
      this.pins[(this.ie1Pin = pinIndex++)] = this.newPin(leftPos++, SIDE_W, 'IE');
      this.pins[this.ie1Pin].lineOver = true;
    }
    if (ieCount >= 2) {
      this.pins[(this.ie2Pin = pinIndex++)] = this.newPin(leftPos, SIDE_W, 'IE');
      this.pins[this.ie2Pin].lineOver = true;
    }
    if (oeCount >= 1) {
      this.pins[(this.oe1Pin = pinIndex++)] = this.newPin(rightPos++, SIDE_E, 'OE');
      this.pins[this.oe1Pin].lineOver = true;
    }
    if (oeCount >= 2) {
      this.pins[(this.oe2Pin = pinIndex++)] = this.newPin(rightPos, SIDE_E, 'OE');
      this.pins[this.oe2Pin].lineOver = true;
    }
    this.intNodes = pinIndex;
    this.allocNodes();
  }

  lastLoad: boolean = false;
  outputValues: boolean[] | null = null;

  lastOutputValues(): boolean[] {
    if (this.outputValues === null) this.outputValues = new Array(this.bits).fill(false);
    return this.outputValues;
  }

  restoreOutputValues(): void {
    const ov = this.lastOutputValues();
    for (let i = 0; i !== this.bits; i++) ov[i] = this.pins[i + this.bits].value;
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.restoreOutputValues();
  }

  override reset(): void {
    super.reset();
    this.outputValues = null;
  }

  // execute() is used by ChipElm.doStep() when there's no output enable.
  // when output enable is present, we override doStep() entirely.
  override execute(): void {
    this.doLoad();
    for (let i = 0; i !== this.bits; i++)
      this.pins[i + this.bits].value = this.lastOutputValues()[i];
  }

  // shared load logic (upstream indexes outputValues directly, which throws if reset() just
  // cleared it; lastOutputValues() reallocates instead)
  doLoad(): void {
    if (this.hasSet() && this.pins[this.setPin].value) {
      for (let i = 0; i !== this.bits; i++) this.lastOutputValues()[i] = true;
      this.lastLoad = this.pins[this.loadPin].value;
      return;
    }
    if (this.hasReset() && this.pins[this.resetPin].value !== this.resetActiveLow()) {
      for (let i = 0; i !== this.bits; i++) this.lastOutputValues()[i] = false;
      this.lastLoad = this.pins[this.loadPin].value;
      return;
    }
    let inputEnabled = true;
    if (this.inputEnableCount() >= 1 && this.pins[this.ie1Pin].value) inputEnabled = false;
    if (this.inputEnableCount() >= 2 && this.pins[this.ie2Pin].value) inputEnabled = false;
    if (
      inputEnabled &&
      this.pins[this.loadPin].value &&
      (!this.isEdgeTriggered() || !this.lastLoad)
    )
      for (let i = 0; i !== this.bits; i++) this.lastOutputValues()[i] = this.pins[i].value;
    this.lastLoad = this.pins[this.loadPin].value;
  }

  override startIteration(): void {
    if (!this.hasOutputEnable()) {
      super.startIteration();
      return;
    }
    for (let i = 0; i < this.getPostCount(); i++) {
      const p = this.pins[i];
      if (!p.output) p.value = this.volts[i] > this.getThreshold();
    }
    this.doLoad();
  }

  override doStep(): void {
    if (!this.hasOutputEnable()) {
      super.doStep();
      return;
    }

    let outputEnabled = true;
    if (this.outputEnableCount() >= 1 && this.pins[this.oe1Pin].value) outputEnabled = false;
    if (this.outputEnableCount() >= 2 && this.pins[this.oe2Pin].value) outputEnabled = false;

    for (let i = 0; i < this.bits; i++) {
      const v = this.lastOutputValues()[i] ? this.highVoltage : 0;
      this.sim.updateVoltageSource(
        this.sim.ground,
        this.nodes[this.intNodes + i],
        this.vSources[i],
        v,
      );
      if (outputEnabled)
        this.sim.stampResistor(this.nodes[this.intNodes + i], this.nodes[this.bits + i], 1);
      else this.sim.stampResistor(this.nodes[this.bits + i], this.sim.ground, 1e8);
    }
  }

  override stamp(): void {
    if (!this.hasOutputEnable()) {
      super.stamp();
      return;
    }
    for (let i = 0; i < this.bits; i++) {
      this.sim.stampVoltageSource(this.sim.ground, this.nodes[this.intNodes + i], this.vSources[i]);
      this.sim.stampNonLinear(this.nodes[this.intNodes + i]);
      this.sim.stampNonLinear(this.nodes[this.bits + i]);
    }
  }

  getVoltageSourceCount(): number {
    return this.bits;
  }

  override getInternalNodeCount(): number {
    return this.hasOutputEnable() ? this.bits : 0;
  }

  override setVoltageSource(j: number, vs: VoltageSource): void {
    if (this.hasOutputEnable()) {
      if (this.vSources.length !== this.bits) this.vSources = new Array(this.bits);
      this.vSources[j] = vs;
      vs.setNodes(this.sim.ground, this.nodes[this.intNodes + j]);
    } else {
      super.setVoltageSource(j, vs);
    }
  }

  override getMatrixConnection(n1: number, n2: number): boolean {
    if (this.hasOutputEnable()) {
      for (let i = 0; i < this.bits; i++)
        if (this.comparePair(n1, n2, this.intNodes + i, this.bits + i)) return true;
    }
    return false;
  }

  override getConnection(_n1: number, _n2: number): boolean {
    return false;
  }
  override hasGroundConnection(n1: number): boolean {
    if (this.hasOutputEnable()) return n1 >= this.bits && n1 < this.bits * 2;
    return this.pins[n1].output;
  }

  override getPostCount(): number {
    return (
      this.bits * 2 +
      1 +
      (this.hasReset() ? 1 : 0) +
      (this.hasSet() ? 1 : 0) +
      this.inputEnableCount() +
      this.outputEnableCount()
    );
  }
  override getDumpType(): number {
    return 168;
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('# of Bits', this.bits, 1, 1).setDimensionless();
    if (n === 1) return EditInfo.createCheckbox('Edge Triggered', this.isEdgeTriggered());
    if (n === 2) return EditInfo.createCheckbox('Reset Pin', this.hasReset());
    if (n === 3) return EditInfo.createCheckbox('Set Pin', this.hasSet());
    if (n === 4) {
      return EditInfo.createChoice(
        'Enable Pins',
        ['None', '1 Input/Output Enable', '2 Input/Output Enables'],
        this.enableMode(),
      );
    }
    if (n === 5 && this.hasReset())
      return EditInfo.createCheckbox('Invert Reset', this.resetActiveLow());
    return null;
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      if (ei.value >= 2 && this.bits !== javaDoubleToInt(ei.value)) {
        this.bits = javaDoubleToInt(ei.value);
        this.setupPins();
        this.setPoints();
      } else if (ei.value < 2) ei.setError('must be >= 2');
    }
    if (n === 1) {
      this.flags = ei.changeFlagInverted(this.flags, this.FLAG_NO_EDGE);
      this.setupPins();
      this.setPoints();
    }
    if (n === 2) {
      this.flags = ei.changeFlag(this.flags, this.FLAG_RESET);
      this.setupPins();
      this.allocNodes();
      this.setPoints();
      ei.newDialog = true;
    }
    if (n === 3) {
      this.flags = ei.changeFlag(this.flags, this.FLAG_SET);
      this.setupPins();
      this.allocNodes();
      this.setPoints();
    }
    if (n === 4) {
      const mode = ei.choice?.selected ?? 0;
      this.flags = (this.flags & ~this.FLAG_ENABLE_MASK) | (mode << this.FLAG_ENABLE_SHIFT);
      this.setupPins();
      this.allocNodes();
      this.setPoints();
    }
    if (n === 5) {
      this.flags = ei.changeFlag(this.flags, this.FLAG_RESET_INVERT);
      this.setupPins();
      this.setPoints();
    }
  }
}

export const SipoShiftElmType = elementType('SipoShiftElm', SipoShiftElm);
export const PisoShiftElmType = elementType('PisoShiftElm', PisoShiftElm);
export const LatchElmType = elementType('LatchElm', LatchElm);
