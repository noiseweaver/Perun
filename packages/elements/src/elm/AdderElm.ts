// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/FullAdderElm.java,
// HalfAdderElm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, checked against the ts/
// translations (dev-ts) at 7ec858d662d8be1d76d54241ba3a5c1d1c524f51.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt } from '../java.ts';
import { type StringTokenizer } from '../StringTokenizer.ts';
import { ChipElm, SIDE_W, SIDE_E } from './ChipElm.ts';

export class FullAdderElm extends ChipElm {
  override getClassName(): string {
    return 'FullAdderElm';
  }
  override initNew(): void {
    super.initNew();
    this.flags |= FullAdderElm.FLAG_BITS;
    this.bits = 4;
    this.setupPins();
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    if (!this.needsBits()) this.bits = 1;
    this.setupPins();
  }
  static readonly FLAG_BITS = 2;

  override getChipName(): string {
    return 'Adder';
  }
  carryIn: number = 0;
  carryOut: number = 0;

  setupPins(): void {
    this.sizeX = 2;
    const bitsY = this.useBus() ? 1 : this.bits;
    this.sizeY = bitsY * 2 + 1;
    this.pins = new Array(this.getPostCount());

    this.makeBitPins(this.bits, 0, SIDE_W, 0, 'A', false, false, false);
    this.makeBitPins(this.bits, bitsY, SIDE_W, this.bits, 'B', false, false, false);
    this.makeBitPins(this.bits, 2, SIDE_E, this.bits * 2, 'S', true, false, false);
    this.carryIn = this.bits * 3;
    this.carryOut = this.bits * 3 + 1;
    this.pins[this.carryOut] = this.newPin(0, SIDE_E, 'C');
    this.pins[this.carryOut].output = true;
    this.pins[this.carryIn] = this.newPin(bitsY * 2, SIDE_W, 'Cin');
    this.allocNodes();
  }
  override getPostCount(): number {
    return this.bits * 3 + 2;
  }
  getVoltageSourceCount(): number {
    return this.bits + 1;
  }

  override execute(): void {
    let c = this.pins[this.carryIn].value ? 1 : 0;
    for (let i = 0; i !== this.bits; i++) {
      const v = (this.pins[i].value ? 1 : 0) + (this.pins[i + this.bits].value ? 1 : 0) + c;
      c = v > 1 ? 1 : 0;
      this.writeOutput(i + this.bits * 2, (v & 1) === 1);
    }
    this.writeOutput(this.carryOut, c === 1);
  }
  override getDumpType(): number {
    return 196;
  }
  override needsBits(): boolean {
    return (this.flags & FullAdderElm.FLAG_BITS) !== 0;
  }
  override allowBus(): boolean {
    return this.needsBits();
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('# of Bits', this.bits, 1, 1).setDimensionless().setPositive();
    return super.getChipEditInfo(n);
  }
  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      this.bits = javaDoubleToInt(ei.value);
      this.flags |= FullAdderElm.FLAG_BITS;
      this.setupPins();
      this.setPoints();
      this.allocNodes();
      return;
    }
    super.setChipEditValue(n, ei);
  }
}

export class HalfAdderElm extends ChipElm {
  override getClassName(): string {
    return 'HalfAdderElm';
  }
  hasReset(): boolean {
    return false;
  }
  override getChipName(): string {
    return 'Half Adder';
  }

  setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 2;
    this.pins = new Array(this.getPostCount());

    this.pins[0] = this.newPin(0, SIDE_E, 'S');
    this.pins[0].output = true;
    this.pins[1] = this.newPin(1, SIDE_E, 'C');
    this.pins[1].output = true;
    this.pins[2] = this.newPin(0, SIDE_W, 'A');
    this.pins[3] = this.newPin(1, SIDE_W, 'B');
  }
  override getPostCount(): number {
    return 4;
  }
  getVoltageSourceCount(): number {
    return 2;
  }

  override execute(): void {
    this.pins[0].value = this.pins[2].value !== this.pins[3].value;
    this.pins[1].value = this.pins[2].value && this.pins[3].value;
  }
  override getDumpType(): number {
    return 195;
  }
}

export const FullAdderElmType = elementType('FullAdderElm', FullAdderElm);
export const HalfAdderElmType = elementType('HalfAdderElm', HalfAdderElm);
