// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CounterElm.java, Counter2Elm.java,
// RingCounterElm.java, SeqGenElm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, checked
// against the ts/ translations (dev-ts) at 7ec858d662d8be1d76d54241ba3a5c1d1c524f51.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt, parseJavaBoolean, parseJavaInt } from '../java.ts';
import { StringTokenizer } from '../StringTokenizer.ts';
import { type XmlAttrReader, type XmlAttrWriter } from '../xml.ts';
import { ChipElm, SIDE_N, SIDE_S, SIDE_W, SIDE_E } from './ChipElm.ts';

export class CounterElm extends ChipElm {
  override getClassName(): string {
    return 'CounterElm';
  }
  invertreset: boolean = false;
  modulus: number = 0;
  static readonly FLAG_UP_DOWN = 4;
  static readonly FLAG_NEGATIVE_EDGE = 8;
  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.invertreset = true;
    try {
      this.invertreset = parseJavaBoolean(st.nextToken());
      this.modulus = parseJavaInt(st.nextToken());
    } catch {
      // older files lack these fields
    }
    this.pins[1].bubble = this.invertreset;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('in', this.invertreset);
    w.dumpAttr('mo', this.modulus);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.invertreset = r.parseBooleanAttr('in', this.invertreset);
    this.modulus = r.parseIntAttr('mo', this.modulus);
    this.pins[1].bubble = this.invertreset;
  }

  override needsBits(): boolean {
    return true;
  }
  override allowBus(): boolean {
    return true;
  }

  override getChipName(): string {
    if (this.modulus === 0) return 'Counter';
    return 'Counter' + ' (mod ' + this.modulus + ')';
  }

  setupPins(): void {
    this.sizeX = 2;
    this.sizeY = this.useBus() ? 3 : this.bits;
    this.pins = new Array(this.getPostCount());
    this.pins[0] = this.newPin(0, SIDE_W, '');
    this.pins[0].clock = true;
    this.pins[0].bubble = this.negativeEdgeTriggered();
    this.pins[1] = this.newPin(this.sizeY - 1, SIDE_W, 'R');
    this.pins[1].bubble = this.invertreset;
    this.makeBitPins(this.bits, 0, SIDE_E, 2, 'Q', true, true, true);
    if (this.hasUpDown()) this.pins[this.bits + 2] = this.newPin(this.sizeY - 2, SIDE_W, 'U/D');
    this.allocNodes();
  }

  override getPostCount(): number {
    return this.hasUpDown() ? this.bits + 3 : this.bits + 2;
  }

  getVoltageSourceCount(): number {
    return this.bits;
  }

  hasUpDown(): boolean {
    return this.hasFlag(CounterElm.FLAG_UP_DOWN);
  }
  negativeEdgeTriggered(): boolean {
    return this.hasFlag(CounterElm.FLAG_NEGATIVE_EDGE);
  }

  override execute(): void {
    const neg = this.negativeEdgeTriggered();
    if (this.pins[0].value !== neg && this.lastClock === neg) {
      let value = 0;

      // get direction
      let dir = 1;
      if (this.hasUpDown() && this.pins[this.bits + 2].value) dir = -1;

      // get current value
      const lastBit = 2 + this.bits - 1;
      for (let i = 0; i !== this.bits; i++) if (this.pins[lastBit - i].value) value |= 1 << i;

      // update value
      value += dir;
      if (this.modulus !== 0) value = (value + this.modulus) % this.modulus;

      // convert value to binary
      for (let i = 0; i !== this.bits; i++) this.pins[lastBit - i].value = (value & (1 << i)) !== 0;
    }
    if (!this.pins[1].value === this.invertreset) {
      for (let i = 0; i !== this.bits; i++) this.pins[i + 2].value = false;
    }
    this.lastClock = this.pins[0].value;
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      return EditInfo.createCheckbox('Invert reset pin', this.invertreset);
    }
    if (n === 1) return new EditInfo('# of Bits', this.bits, 1, 1).setDimensionless();
    if (n === 2) return new EditInfo('Modulus', this.modulus, 1, 1).setDimensionless();
    if (n === 3) {
      return EditInfo.createCheckbox('Up/Down Pin', this.hasUpDown());
    }
    if (n === 4) {
      return EditInfo.createCheckbox('Negative Edge Triggered', this.negativeEdgeTriggered());
    }
    return null;
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      this.invertreset = ei.checkbox?.state === true;
      this.setupPins();
      this.setPoints();
    }
    if (n === 1) {
      if (ei.value >= 3) {
        this.bits = javaDoubleToInt(ei.value);
        this.setupPins();
        this.setPoints();
      } else ei.setError('must be >= 3');
    }
    if (n === 2) this.modulus = javaDoubleToInt(ei.value);
    if (n === 3) {
      this.flags = ei.changeFlag(this.flags, CounterElm.FLAG_UP_DOWN);
      this.setupPins();
      this.setPoints();
    }
    if (n === 4) {
      this.flags = ei.changeFlag(this.flags, CounterElm.FLAG_NEGATIVE_EDGE);
      this.setupPins();
      this.setPoints();
    }
  }

  override getDumpType(): number {
    return 164;
  }
  override getXmlDumpType(): string {
    return 'ctr';
  }
}

export class Counter2Elm extends ChipElm {
  override getClassName(): string {
    return 'Counter2Elm';
  }
  modulus: number = 0;
  override undump(st: StringTokenizer): void {
    super.undump(st);
    try {
      this.modulus = parseJavaInt(st.nextToken());
    } catch {
      // older files lack these fields
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('mo', this.modulus);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.modulus = r.parseIntAttr('mo', this.modulus);

    // avoid clearing on first iteration
    this.pins[this.clr].value = true;
    this.volts[this.clr] = this.highVoltage;
  }

  override needsBits(): boolean {
    return true;
  }
  override allowBus(): boolean {
    return true;
  }
  override getChipName(): string {
    if (this.modulus === 0) return 'Counter';
    return 'Counter' + ' (mod ' + this.modulus + ')';
  }

  clk: number = 0;
  clr: number = 0;
  enp: number = 0;
  ent: number = 0;
  rco: number = 0;
  load: number = 0;

  setupPins(): void {
    this.sizeX = 2;
    const bitsY = this.useBus() ? 1 : this.bits;
    this.sizeY = bitsY + 3;
    this.pins = new Array(this.getPostCount());
    this.makeBitPins(this.bits, 1, SIDE_E, 0, 'Q', true, true, true);
    this.makeBitPins(this.bits, 1, SIDE_W, this.bits, 'I', false, false, true);
    const p = this.bits * 2;
    this.clk = p;
    this.clr = p + 1;
    this.enp = p + 2;
    this.rco = p + 3;
    this.load = p + 4;
    this.ent = p + 5;
    this.pins[this.clk] = this.newPin(0, SIDE_W, '');
    this.pins[this.clk].clock = true;
    this.pins[this.clr] = this.newPin(bitsY + 1, SIDE_W, 'CLR');
    this.pins[this.clr].bubble = true;
    this.pins[this.enp] = this.newPin(bitsY + 2, SIDE_W, 'EnP');
    this.pins[this.rco] = this.newPin(0, SIDE_E, 'RCO');
    this.pins[this.rco].output = true;
    this.pins[this.load] = this.newPin(bitsY + 1, SIDE_E, 'LOAD');
    this.pins[this.load].bubble = true;
    this.pins[this.ent] = this.newPin(bitsY + 2, SIDE_E, 'EnT');
  }
  override getPostCount(): number {
    return this.bits * 2 + 6;
  }
  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('# of Bits', this.bits, 1, 1).setDimensionless();
    if (n === 1) return new EditInfo('Modulus', this.modulus, 1, 1).setDimensionless();
    return null;
  }
  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      if (ei.value >= 2) {
        this.bits = javaDoubleToInt(ei.value);
        this.setupPins();
        this.setPoints();
        this.allocNodes();
      } else ei.setError('must be >= 2');
    }
    if (n === 1) this.modulus = javaDoubleToInt(ei.value);
  }
  getVoltageSourceCount(): number {
    return this.bits + 1;
  }

  carry: boolean = false;

  override execute(): void {
    if (this.pins[this.clk].value && !this.lastClock) {
      if (this.pins[this.enp].value && this.pins[this.ent].value) {
        let value = 0;

        // get current value
        const lastBit = this.bits - 1;
        for (let i = 0; i !== this.bits; i++) if (this.pins[lastBit - i].value) value |= 1 << i;

        // update value
        value++;
        const realmod = this.modulus === 0 ? 1 << this.bits : this.modulus;
        value %= realmod;

        // convert value to binary
        for (let i = 0; i !== this.bits; i++)
          this.writeOutput(lastBit - i, (value & (1 << i)) !== 0);

        this.carry = value === realmod - 1;
      }

      if (!this.pins[this.load].value) {
        for (let i = 0; i !== this.bits; i++) this.writeOutput(i, this.pins[i + this.bits].value);

        let value = 0;

        // get current value
        const lastBit = this.bits - 1;
        for (let i = 0; i !== this.bits; i++) if (this.pins[lastBit - i].value) value |= 1 << i;

        const realmod = this.modulus === 0 ? 1 << this.bits : this.modulus;

        this.carry = value === realmod - 1;
      }
    }
    if (!this.pins[this.clr].value) {
      for (let i = 0; i !== this.bits; i++) this.writeOutput(i, false);
      this.carry = false;
    }

    this.lastClock = this.pins[this.clk].value;
    this.writeOutput(this.rco, this.carry && this.pins[this.ent].value);
  }
  override getDumpType(): number {
    return 421;
  }
  override getXmlDumpType(): string {
    return 'ctr2';
  }
}

export class RingCounterElm extends ChipElm {
  override getClassName(): string {
    return 'RingCounterElm';
  }
  static readonly FLAG_CLOCK_INHIBIT = 2;
  static readonly FLAG_RESET_HIGH = 4;
  override initNew(): void {
    super.initNew();
    this.flags |= RingCounterElm.FLAG_CLOCK_INHIBIT;
    this.setupPins();
  }

  /** Set on load: volts[] is likely all zeros, which could force a reset, so skip one step. */
  justLoaded = false;

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.justLoaded = true;
  }

  override getChipName(): string {
    return 'ring counter';
  }
  override needsBits(): boolean {
    return true;
  }
  override defaultBitCount(): number {
    return 10;
  }
  hasClockInhibit(): boolean {
    return (this.flags & RingCounterElm.FLAG_CLOCK_INHIBIT) !== 0 && this.bits >= 3;
  }
  hasInvertReset(): boolean {
    return (this.flags & RingCounterElm.FLAG_RESET_HIGH) === 0;
  }

  clockInhibit = -1;

  setupPins(): void {
    this.sizeX = this.bits > 2 ? this.bits : 2;
    this.sizeY = 2;
    this.pins = new Array(this.getPostCount());
    this.pins[0] = this.newPin(1, SIDE_W, '');
    this.pins[0].clock = true;
    this.pins[1] = this.newPin(this.sizeX - 1, SIDE_S, 'R');
    this.pins[1].lineOver = this.hasInvertReset();
    for (let i = 0; i !== this.bits; i++) {
      const ii = i + 2;
      this.pins[ii] = this.newPin(i, SIDE_N, 'Q' + i);
      this.pins[ii].output = this.pins[ii].state = true;
    }
    if (this.hasClockInhibit()) {
      this.clockInhibit = this.pins.length - 1;
      this.pins[this.clockInhibit] = this.newPin(1, SIDE_S, 'CE');
      this.pins[this.clockInhibit].lineOver = true;
    } else this.clockInhibit = -1;
    this.allocNodes();
  }

  override getPostCount(): number {
    return this.hasClockInhibit() ? this.bits + 3 : this.bits + 2;
  }
  getVoltageSourceCount(): number {
    return this.bits;
  }

  override execute(): void {
    let i: number;
    if (this.justLoaded) {
      this.justLoaded = false;
      return;
    }

    let running = true;
    if (this.hasClockInhibit() && this.pins[this.clockInhibit].value) running = false;

    // find which output is high
    for (i = 0; i !== this.bits; i++) if (this.pins[i + 2].value) break;

    if (this.pins[0].value && !this.lastClock && running) {
      if (i < this.bits) this.pins[i++ + 2].value = false;
      i %= this.bits;
      this.pins[i + 2].value = true;
    }

    // reset if requested, or if all outputs are low
    if (this.pins[1].value !== this.hasInvertReset() || i === this.bits) {
      for (i = 1; i !== this.bits; i++) this.pins[i + 2].value = false;
      this.pins[2].value = true;
    }
    this.lastClock = this.pins[0].value;
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      return EditInfo.createCheckbox('Invert reset pin', this.hasInvertReset());
    }
    if (n === 1) return new EditInfo('# of Bits', this.bits, 1, 1).setDimensionless();
    return null;
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      if (ei.checkbox?.state === true) this.flags &= ~RingCounterElm.FLAG_RESET_HIGH;
      else this.flags |= RingCounterElm.FLAG_RESET_HIGH;
      this.setupPins();
      this.setPoints();
      return;
    }
    if (n === 1) {
      if (ei.value >= 2) {
        this.bits = javaDoubleToInt(ei.value);
        this.setupPins();
        this.setPoints();
      } else ei.setError('must be >= 2');
    }
  }

  override getDumpType(): number {
    return 163;
  }
}

// contributed by Edward Calver

export class SeqGenElm extends ChipElm {
  override getClassName(): string {
    return 'SeqGenElm';
  }
  readonly FLAG_NEW_VERSION = 2;
  readonly FLAG_PLAY_ONCE = 4;
  readonly FLAG_HAS_RESET = 8;

  bitPosition: number = 0;
  bitCount: number = 0;
  /** A growable int array, as in the GWT build (setChipEditValue writes past its length). */
  data: number[] = [0];
  clockstate: boolean = false;

  override initNew(): void {
    super.initNew();
    this.bitCount = 8;
    this.data = [0];
    this.flags |= this.FLAG_NEW_VERSION;
    this.flags |= this.FLAG_HAS_RESET;
    this.setupPins();
    this.allocNodes();
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    try {
      if ((this.flags & this.FLAG_NEW_VERSION) === 0) {
        // an old sequence generator: upgrade it to the new, flexible version (upstream's bit
        // reversal loop copies every bit, so the data is the sign-extended byte)
        this.flags |= this.FLAG_NEW_VERSION;
        this.bitCount = 8;
        this.data = [(parseJavaInt(st.nextToken()) << 24) >> 24];
      } else {
        this.bitCount = parseJavaInt(st.nextToken());
        const words = Math.trunc(this.bitCount / 32) + (this.bitCount % 32 !== 0 ? 1 : 0);
        this.data = new Array<number>(words).fill(0);
        for (let i = 0; i < words; i++) this.data[i] = parseJavaInt(st.nextToken());
      }
    } catch (e) {
      // corrupted element: data is incomplete
      if (!(e instanceof Error) || e.message !== 'NoSuchElementException') throw e;
    }
    // ensure bitCount does not exceed the data we have
    if (this.bitCount > this.data.length * 32) this.bitCount = this.data.length * 32;
  }

  override getChipName(): string {
    return 'sequence generator';
  }

  setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 2;
    this.pins = new Array(this.getPostCount());

    this.pins[0] = this.newPin(0, SIDE_W, '');
    this.pins[0].clock = true;
    this.pins[1] = this.newPin(1, SIDE_E, 'Q');
    this.pins[1].output = true;
    if (this.hasReset()) this.pins[2] = this.newPin(1, SIDE_W, 'R');
  }

  override getVoltageDiff(): number {
    return this.volts[1];
  }
  override getPostCount(): number {
    return this.hasReset() ? 3 : 2;
  }
  getVoltageSourceCount(): number {
    return 1;
  }
  hasPlayOnce(): boolean {
    return (this.flags & this.FLAG_PLAY_ONCE) !== 0;
  }
  hasReset(): boolean {
    return (this.flags & this.FLAG_HAS_RESET) !== 0;
  }

  override reset(): void {
    super.reset();
    this.bitPosition = 0;
  }

  nextBit(): void {
    if (this.data.length > 0 && this.bitCount > 0) {
      if (this.bitPosition >= this.bitCount) {
        if (this.hasPlayOnce()) {
          this.pins[1].value = false;
          return;
        }
        this.bitPosition = 0;
      }
      this.pins[1].value =
        ((this.data[Math.trunc(this.bitPosition / 32)] ?? 0) & (1 << (this.bitPosition % 32))) !==
        0;
      this.bitPosition++;
    } else {
      this.pins[1].value = false;
    }
  }

  override execute(): void {
    if (this.hasReset() && this.pins[2].value) {
      this.bitPosition = 0;
      this.clockstate = this.pins[0].value;
      this.nextBit();
    } else {
      if (this.pins[0].value !== this.clockstate) {
        this.clockstate = this.pins[0].value;
        if (this.clockstate) this.nextBit();
      }
    }
  }

  override getDumpType(): number {
    return 188;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('bc', this.bitCount);
    let s = '';
    for (let i = 0; i < this.data.length; i++) {
      if (i > 0) s += ' ';
      s += this.data[i];
    }
    w.dumpAttr('dt', s);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.bitCount = r.parseIntAttr('bc', this.bitCount);
    const dt = r.parseStringAttr('dt', null);
    if (dt !== null) {
      const st = new StringTokenizer(dt, ' ');
      this.data = [];
      while (st.hasMoreTokens()) this.data.push(parseJavaInt(st.nextToken()));
    }
    if (this.bitCount > this.data.length * 32) this.bitCount = this.data.length * 32;
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      return EditInfo.createCheckbox('Play Once', this.hasPlayOnce());
    }
    if (n === 1) {
      let sb = '';
      for (let i = 0; i < this.bitCount; i++)
        sb += ((this.data[Math.trunc(i / 32)] ?? 0) & (1 << (i % 32))) !== 0 ? '1' : '0';
      const ei = EditInfo.text('Sequence', sb);
      ei.multiline = true;
      return ei;
    }
    return null;
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      this.flags = ei.changeFlag(this.flags, this.FLAG_PLAY_ONCE);
      return;
    }
    if (n === 1) {
      const s = ei.text ?? '';
      // count bits
      this.bitCount = 0;
      for (let i = 0; i < s.length; i++) if (s[i] === '0' || s[i] === '1') this.bitCount++;
      // upstream allocates bitCount / 32 words; the GWT array grows as bits are written
      this.data = new Array<number>(Math.trunc(this.bitCount / 32)).fill(0);
      // fill bits
      this.bitCount = 0;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '0' || c === '1') {
          if (c === '1') {
            const w = Math.trunc(this.bitCount / 32);
            this.data[w] = (this.data[w] ?? 0) | (1 << (this.bitCount % 32));
          }
          this.bitCount++;
        }
      }
    }
  }
}

export const CounterElmType = elementType('CounterElm', CounterElm);
export const Counter2ElmType = elementType('Counter2Elm', Counter2Elm);
export const RingCounterElmType = elementType('RingCounterElm', RingCounterElm);
export const SeqGenElmType = elementType('SeqGenElm', SeqGenElm);
