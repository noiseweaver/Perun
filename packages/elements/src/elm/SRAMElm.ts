// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/SRAMElm.java, ROMElm.java and SRAMLoadFile.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { VoltageSource } from '@circuitjs-next/engine';
import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaInt, parseJavaIntRadix } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { ChipElm, SIDE_E, SIDE_W } from './ChipElm.ts';

/** Static RAM: address and data pins, write enable and output enable (both active low). */
export class SRAMElm extends ChipElm {
  static readonly FLAG_HEX_DISPLAY = 4;
  static readonly FLAG_RELOAD_ON_RESET = 2;

  addressNodes = 0;
  dataNodes = 0;
  internalNodes = 0;
  addressBits = 0;
  dataBits = 0;
  map = new Map<number, number>();
  /** Contents saved for restoring on reset. */
  initialMap: Map<number, number> | null = null;
  /** The last file loaded with "Load Contents From File". */
  loadedFileName: string | null = null;
  address = 0;

  override getClassName(): string {
    return 'SRAMElm';
  }
  override getDumpType(): number {
    return 413;
  }
  override getChipName(): string {
    return 'Static RAM';
  }

  override initNew(): void {
    this.addressBits = this.dataBits = 4;
    super.initNew();
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.map = new Map();
    this.addressBits = parseJavaInt(st.nextToken());
    this.dataBits = parseJavaInt(st.nextToken());
    this.setupPins();
    try {
      // contents: addr val(addr) val(addr+1) ... -1 addr val val ... -1 ... -2
      for (;;) {
        let a = parseJavaInt(st.nextToken());
        if (a < 0) break;
        let v = parseJavaInt(st.nextToken());
        this.map.set(a, v);
        for (;;) {
          v = parseJavaInt(st.nextToken());
          if (v < 0) break;
          this.map.set(++a, v);
        }
      }
    } catch {
      // upstream stops reading at the end of the line
    }
    if ((this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0) this.initialMap = new Map(this.map);
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('ab', this.addressBits);
    w.dumpAttr('db', this.dataBits);
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    super.dumpXmlState(w);
    if (this.map.size > 0) w.appendText(this.contentsToString());
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.addressBits = r.parseIntAttr('ab', this.addressBits);
    this.dataBits = r.parseIntAttr('db', this.dataBits);
    this.map = new Map();
    try {
      const contents = r.parseContents();
      if (contents === null) throw new Error('no contents');
      this.parseContentsString(contents);
    } catch {
      // no contents
    }
    this.setupPins();
  }

  override reset(): void {
    super.reset();
    if ((this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0 && this.initialMap !== null)
      this.map = new Map(this.initialMap);
  }

  override nonLinear(): boolean {
    return true;
  }
  override allowBus(): boolean {
    return true;
  }

  override setupPins(): void {
    this.sizeX = 2;
    const addrY = this.useBus() ? 1 : this.addressBits;
    const dataY = this.useBus() ? 1 : this.dataBits;
    this.sizeY = Math.max(addrY, dataY) + 1;
    this.bits = this.addressBits;
    this.pins = new Array(this.getPostCount());
    this.pins[0] = this.newPin(0, SIDE_W, 'WE');
    this.pins[0].lineOver = true;
    this.pins[1] = this.newPin(0, SIDE_E, 'OE');
    this.pins[1].lineOver = true;
    this.addressNodes = 2;
    this.dataNodes = 2 + this.addressBits;
    this.internalNodes = 2 + this.addressBits + this.dataBits;
    this.makeBitPins(
      this.addressBits,
      this.sizeY - addrY,
      SIDE_W,
      this.addressNodes,
      'A',
      false,
      false,
      true,
    );
    this.makeBitPins(
      this.dataBits,
      this.sizeY - dataY,
      SIDE_E,
      this.dataNodes,
      'D',
      true,
      false,
      true,
    );
    this.allocNodes();
  }

  override getPostCount(): number {
    return 2 + this.addressBits + this.dataBits;
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0)
      return new EditInfo('# of Address Bits', this.addressBits, 1, 1).setDimensionless();
    if (n === 1) return new EditInfo('# of Data Bits', this.dataBits, 1, 1).setDimensionless();
    if (n === 2) {
      const ei = EditInfo.text('Contents', this.contentsToString());
      ei.multiline = true;
      return ei;
    }
    if (n === 3)
      return EditInfo.createCheckbox('Hex Display', this.hasFlag(SRAMElm.FLAG_HEX_DISPLAY));
    if (n === 4) {
      // upstream: a "Load Contents From File" button whose file goes into the Contents box
      const ei = EditInfo.createFile({
        kind: 'binary',
        accept: '',
        maxSize: 128000,
        label: 'Load Contents From File',
        onLoad: (name, bytes) => this.loadContents(name, bytes),
      });
      ei.name = this.loadedFileName !== null ? 'Loaded: ' + this.loadedFileName : '';
      return ei;
    }
    if (n === 5)
      return EditInfo.createCheckbox(
        'Restore Contents on Reset',
        (this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0,
      );
    return super.getChipEditInfo(n);
  }

  /** Upstream SRAMLoadFile: bytes become values, two bytes each if the data is wider than 8. */
  loadContents(name: string, arr: Uint8Array): void {
    const bytesPerValue = this.dataBits > 8 ? 2 : 1;
    const hexDigits = bytesPerValue * 2;
    const n = arr.length - (arr.length % bytesPerValue);
    let str = '0x0:';
    for (let i = 0; i < n; i += bytesPerValue) {
      let val = 0;
      for (let j = 0; j < bytesPerValue; j++) val = (val << 8) | arr[i + j];
      str += ' 0x' + val.toString(16).toUpperCase().padStart(hexDigits, '0');
    }
    this.parseContentsString(str);
    this.loadedFileName = name;
    if ((this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0) this.initialMap = new Map(this.map);
  }

  contentsToString(): string {
    const hex = this.hasFlag(SRAMElm.FLAG_HEX_DISPLAY);
    let s = '';
    const maxI = 1 << this.addressBits;
    for (let i = 0; i < maxI; i++) {
      let val = this.map.get(i);
      if (val === undefined || val === 0) continue;
      s += (hex ? toHexString(i) : String(i)) + ': ' + (hex ? this.toHex(val) : String(val));
      let ct = 1;
      for (;;) {
        val = this.map.get(++i);
        if (val === undefined || val === 0) break;
        s += ' ' + (hex ? this.toHex(val) : String(val));
        if (++ct === 8) break;
      }
      s += '\n';
    }
    return s;
  }

  toHex(val: number): string {
    const mask = (1 << this.dataBits) - 1;
    const h = toHexString(val & mask);
    return h.length < 2 ? '0' + h : h;
  }

  parseContentsString(s: string): void {
    this.map.clear();
    // Java's split drops trailing empty strings
    const lines = s.split('\n');
    while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    for (const line of lines) {
      try {
        const args = line.split(/: */);
        let addr = this.parseNumber(args[0]);
        if (args.length < 2) throw new Error('no values');
        for (const v of javaSplit(args[1], / +/)) this.map.set(addr++, this.parseNumber(v));
      } catch {
        // upstream skips the rest of a bad line
      }
    }
  }

  parseNumber(str: string): number {
    if (str.startsWith('0x')) return parseJavaIntRadix(str.substring(2), 16);
    if (this.hasFlag(SRAMElm.FLAG_HEX_DISPLAY)) return parseJavaIntRadix(str, 16);
    if (str.startsWith('0b')) return parseJavaIntRadix(str.substring(2), 2);
    return parseJavaInt(str);
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0 || n === 1) {
      if (ei.value >= 2 && ei.value <= 16) {
        if (n === 0) this.addressBits = Math.trunc(ei.value);
        else this.dataBits = Math.trunc(ei.value);
        this.setupPins();
        this.setPoints();
      } else ei.setError('must be between 2 and 16');
    }
    if (n === 2) {
      this.parseContentsString(ei.text ?? '');
      if ((this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0) this.initialMap = new Map(this.map);
    }
    if (n === 3) {
      const oldFlags = this.flags;
      this.flags = ei.changeFlag(this.flags, SRAMElm.FLAG_HEX_DISPLAY);
      // the contents box shows the new radix
      if (this.flags !== oldFlags) ei.newDialog = true;
    }
    if (n === 5) {
      this.flags = ei.changeFlag(this.flags, SRAMElm.FLAG_RELOAD_ON_RESET);
      this.initialMap =
        (this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0 ? new Map(this.map) : null;
    }
  }

  override getVoltageSourceCount(): number {
    return this.dataBits;
  }
  override getInternalNodeCount(): number {
    return this.dataBits;
  }

  override setVoltageSource(j: number, vs: VoltageSource): void {
    super.setVoltageSource(j, vs);
    vs.setNodes(this.sim.ground, this.nodes[this.internalNodes + j]);
  }

  override getMatrixConnection(n1: number, n2: number): boolean {
    // each internal node connects to its data pin
    for (let i = 0; i !== this.dataBits; i++)
      if (this.comparePair(n1, n2, this.internalNodes + i, this.dataNodes + i)) return true;
    return false;
  }

  override stamp(): void {
    const sim = this.sim;
    for (let i = 0; i !== this.dataBits; i++) {
      const p = this.pins[i + this.dataNodes];
      sim.stampVoltageSource(sim.ground, this.nodes[this.internalNodes + i], p.voltSource);
    }
  }

  /** Read the address pins (most significant first). */
  protected readAddress(): void {
    this.address = 0;
    const th = this.getThreshold();
    for (let i = 0; i !== this.addressBits; i++)
      if (this.volts[this.addressNodes + i] > th) this.address |= 1 << (this.addressBits - 1 - i);
  }

  /** Drive the data pins from the word at `address`, or let them float. */
  protected driveData(outputEnabled: boolean): void {
    const sim = this.sim;
    const data = this.map.get(this.address) ?? 0;
    for (let i = 0; i !== this.dataBits; i++) {
      const p = this.pins[i + this.dataNodes];
      const internal = this.nodes[this.internalNodes + i];
      sim.updateVoltageSource(
        sim.ground,
        internal,
        p.voltSource,
        (data & (1 << (this.dataBits - 1 - i))) === 0 ? 0 : this.highVoltage,
      );
      // enabled: a small resistor from the internal source to the pin; else a large pulldown
      if (outputEnabled) sim.stampResistor(internal, this.nodes[this.dataNodes + i], 1);
      else sim.stampResistor(this.nodes[this.dataNodes + i], sim.ground, 1e8);
    }
  }

  override doStep(): void {
    const writeEnabled = this.volts[0] < this.getThreshold();
    const outputEnabled = this.volts[1] < this.getThreshold() && !writeEnabled;
    this.readAddress();
    this.driveData(outputEnabled);
  }

  override stepFinished(): void {
    const th = this.getThreshold();
    if (!(this.volts[0] < th)) return;
    // store the data pins in RAM
    let data = 0;
    for (let i = 0; i !== this.dataBits; i++)
      if (this.volts[this.dataNodes + i] > th) data |= 1 << (this.dataBits - 1 - i);
    this.map.set(this.address, data);
  }
}

/** Read-only memory: output enable (active low), address and data pins. */
export class ROMElm extends SRAMElm {
  override getClassName(): string {
    return 'ROMElm';
  }
  override getDumpType(): number {
    return 436;
  }
  override getChipName(): string {
    return 'ROM';
  }

  // no WE pin; just OE, address and data
  override setupPins(): void {
    if (this.addressBits === 0) this.addressBits = this.dataBits = 4;
    this.sizeX = 2;
    const addrY = this.useBus() ? 1 : this.addressBits;
    const dataY = this.useBus() ? 1 : this.dataBits;
    this.sizeY = Math.max(addrY, dataY) + 1;
    this.bits = this.addressBits;
    this.pins = new Array(this.getPostCount());
    this.pins[0] = this.newPin(0, SIDE_W, 'OE');
    this.pins[0].lineOver = true;
    this.addressNodes = 1;
    this.dataNodes = 1 + this.addressBits;
    this.internalNodes = 1 + this.addressBits + this.dataBits;
    this.makeBitPins(
      this.addressBits,
      this.sizeY - addrY,
      SIDE_W,
      this.addressNodes,
      'A',
      false,
      false,
      true,
    );
    this.makeBitPins(
      this.dataBits,
      this.sizeY - dataY,
      SIDE_E,
      this.dataNodes,
      'D',
      true,
      false,
      true,
    );
    this.allocNodes();
  }

  override getPostCount(): number {
    return 1 + this.addressBits + this.dataBits;
  }

  override doStep(): void {
    this.readAddress();
    this.driveData(this.volts[0] < this.getThreshold());
  }

  // no writing
  override stepFinished(): void {}
}

/** Java `Integer.toHexString`, upper-cased as upstream shows it. */
function toHexString(v: number): string {
  return (v >>> 0).toString(16).toUpperCase();
}

/** Java `String.split(regex)`: trailing empty strings are dropped. */
function javaSplit(s: string, re: RegExp): string[] {
  const parts = s.split(re);
  while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

export const SRAMElmType = elementType('SRAMElm', SRAMElm);
export const ROMElmType = elementType('ROMElm', ROMElm);
