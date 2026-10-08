// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/BusTransceiverElm.java,
// BusSplitterElm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, checked against the ts/
// translations (dev-ts) at 7ec858d662d8be1d76d54241ba3a5c1d1c524f51.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Point, type BusWidthMaps, type VoltageSource } from '@perun/engine';
import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt } from '../java.ts';
import { type XmlAttrReader, type XmlAttrWriter } from '../xml.ts';
import { ChipElm, SIDE_W, SIDE_E } from './ChipElm.ts';

export class BusTransceiverElm extends ChipElm {
  override getClassName(): string {
    return 'BusTransceiverElm';
  }
  dataBits = 0;
  aNodes = 0;
  bNodes = 0;
  intNodes = 0;
  vSources: VoltageSource[] = [];

  override initNew(): void {
    super.initNew();
    this.dataBits = 4;
    this.setupPins();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('db', this.dataBits);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.dataBits = r.parseIntAttr('db', this.dataBits);
    this.setupPins();
  }

  override nonLinear(): boolean {
    return true;
  }
  override allowBus(): boolean {
    return true;
  }
  override getChipName(): string {
    return 'Bus Transceiver';
  }
  override defaultBitCount(): number {
    return 4;
  }

  setupPins(): void {
    if (this.dataBits === 0) this.dataBits = 4;
    this.sizeX = 2;
    const dataY = this.useBus() ? 1 : this.dataBits;
    this.sizeY = dataY + 2;
    this.bits = this.dataBits;
    this.pins = new Array(this.getPostCount());

    this.pins[0] = this.newPin(0, SIDE_W, 'OE');
    this.pins[0].lineOver = true;
    this.pins[1] = this.newPin(0, SIDE_E, 'DIR');

    this.aNodes = 2;
    this.bNodes = 2 + this.dataBits;
    this.intNodes = 2 + 2 * this.dataBits;

    this.makeBitPins(
      this.dataBits,
      this.sizeY - dataY,
      SIDE_W,
      this.aNodes,
      'A',
      false,
      false,
      true,
    );
    this.makeBitPins(
      this.dataBits,
      this.sizeY - dataY,
      SIDE_E,
      this.bNodes,
      'B',
      false,
      false,
      true,
    );

    this.allocNodes();
  }

  override getPostCount(): number {
    return 2 + 2 * this.dataBits;
  }
  getVoltageSourceCount(): number {
    return this.dataBits;
  }
  override getInternalNodeCount(): number {
    return this.dataBits;
  }

  override setVoltageSource(j: number, vs: VoltageSource): void {
    if (this.vSources.length !== this.dataBits) this.vSources = new Array(this.dataBits);
    this.vSources[j] = vs;
    vs.setNodes(this.sim.ground, this.nodes[this.intNodes + j]);
  }

  override getMatrixConnection(n1: number, n2: number): boolean {
    for (let i = 0; i < this.dataBits; i++) {
      if (this.comparePair(n1, n2, this.intNodes + i, this.aNodes + i)) return true;
      if (this.comparePair(n1, n2, this.intNodes + i, this.bNodes + i)) return true;
    }
    return false;
  }

  override stamp(): void {
    for (let i = 0; i < this.dataBits; i++) {
      this.sim.stampVoltageSource(this.sim.ground, this.nodes[this.intNodes + i], this.vSources[i]);
      this.sim.stampNonLinear(this.nodes[this.intNodes + i]);
      this.sim.stampNonLinear(this.nodes[this.aNodes + i]);
      this.sim.stampNonLinear(this.nodes[this.bNodes + i]);
    }
  }

  override doStep(): void {
    const outputEnabled = this.volts[0] < this.getThreshold();
    const dirAtoB = this.volts[1] > this.getThreshold();

    for (let i = 0; i < this.dataBits; i++) {
      const srcVal = dirAtoB
        ? this.volts[this.aNodes + i] > this.getThreshold()
        : this.volts[this.bNodes + i] > this.getThreshold();

      this.sim.updateVoltageSource(
        this.sim.ground,
        this.nodes[this.intNodes + i],
        this.vSources[i],
        srcVal ? this.highVoltage : 0,
      );

      const rDst = outputEnabled ? 1 : 1e10;
      if (dirAtoB) {
        this.sim.stampResistor(this.nodes[this.intNodes + i], this.nodes[this.aNodes + i], 1e8);
        this.sim.stampResistor(this.nodes[this.intNodes + i], this.nodes[this.bNodes + i], rDst);
      } else {
        this.sim.stampResistor(this.nodes[this.intNodes + i], this.nodes[this.aNodes + i], rDst);
        this.sim.stampResistor(this.nodes[this.intNodes + i], this.nodes[this.bNodes + i], 1e8);
      }
    }
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'bus transceiver';
    const outputEnabled = this.volts[0] < this.getThreshold();
    const dirAtoB = this.volts[1] > this.getThreshold();
    arr[1] = outputEnabled ? (dirAtoB ? 'A→B' : 'B→A') : 'hi-Z';
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('# of Bits', this.dataBits, 1, 1).setDimensionless();
    return super.getChipEditInfo(n);
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      if (ei.value >= 1 && ei.value <= 16) {
        this.dataBits = javaDoubleToInt(ei.value);
        this.setupPins();
        this.setPoints();
      } else ei.setError('must be between 1 and 16');
    }
  }
}

export class BusSplitterElm extends ChipElm {
  override getClassName(): string {
    return 'BusSplitterElm';
  }
  override getChipName(): string {
    return 'Bus Splitter';
  }
  override needsBits(): boolean {
    return true;
  }

  setupPins(): void {
    this.sizeX = 2;
    this.sizeY = this.bits;
    this.currents = new Array(this.bits).fill(0);
    this.pins = new Array(this.getPostCount());

    // bus side: all pins at same position
    for (let i = 0; i !== this.bits; i++) {
      this.pins[i] = this.newPin(0, SIDE_W, 'Bus');
      this.pins[i].busWidth = this.bits;
      this.pins[i].busZ = i;
    }

    // individual side: one pin per bit
    for (let i = 0; i !== this.bits; i++) {
      this.pins[i + this.bits] = this.newPin(this.bits - 1 - i, SIDE_E, '' + i);
    }
  }

  currents: number[] = [];

  override propagateBusWidth(maps: BusWidthMaps): boolean {
    // the bus side is at pin 0
    const post = this.pins[0].post;
    const p = new Point(post.x, post.y);
    const bw = this.bits;
    const w = maps.width.get(p.key());
    if (w !== undefined && w !== bw) maps.mismatches.push(p);
    if (w === undefined || w < bw) {
      maps.width.set(p.key(), bw);
      return true;
    }
    return false;
  }

  override getPostCount(): number {
    return this.bits * 2;
  }
  override getBusWidth(): number {
    return this.bits;
  }
  getVoltageSourceCount(): number {
    return 0;
  }

  override getConnection(n1: number, n2: number): boolean {
    // bus pin i connects to individual pin i+bits
    return Math.abs(n1 - n2) === this.bits;
  }

  override isWireEquivalent(): boolean {
    return true;
  }
  override isRemovableWire(): boolean {
    return true;
  }

  override getConnectedPost(n: number): Point | null {
    // bus bit n connects to individual pin n+bits
    return this.getPost(n + this.bits);
  }

  override getCurrentIntoNode(n: number): number {
    if (n < this.bits) return -this.currents[n];
    return this.currents[n - this.bits];
  }

  override setWireCurrent(bit: number, c: number): void {
    this.currents[bit] = c;
    this.pins[bit + this.bits].current = c;
    // update total bus current on pin 0 (the only bus-side pin that gets drawn)
    let total = 0;
    for (let i = 0; i < this.bits; i++) total += this.currents[i];
    this.pins[0].current = -total;
  }

  override getDumpType(): number {
    return 433;
  }
  override getXmlDumpType(): string {
    return 'bs';
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('# of Bits', this.bits, 1, 1).setDimensionless();
    return null;
  }
  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      if (ei.value >= 2) {
        this.bits = javaDoubleToInt(ei.value);
        this.setupPins();
        this.setPoints();
      } else ei.setError('must be >= 2');
    }
  }
}

export const BusTransceiverElmType = elementType('BusTransceiverElm', BusTransceiverElm);
export const BusSplitterElmType = elementType('BusSplitterElm', BusSplitterElm);
