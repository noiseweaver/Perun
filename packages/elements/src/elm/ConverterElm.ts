// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/DACElm.java, ADCElm.java (master)
// at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, checked against the ts/ translations (dev-ts) at
// 7ec858d662d8be1d76d54241ba3a5c1d1c524f51.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt } from '../java.ts';
import { ChipElm, SIDE_W, SIDE_E } from './ChipElm.ts';

export class DACElm extends ChipElm {
  override getClassName(): string {
    return 'DACElm';
  }
  override getChipName(): string {
    return 'DAC';
  }
  override needsBits(): boolean {
    return true;
  }
  override allowBus(): boolean {
    return true;
  }

  setupPins(): void {
    this.sizeX = 2;
    const bitsY = this.useBus() ? 1 : this.bits > 2 ? this.bits : 2;
    this.sizeY = bitsY > 2 ? bitsY : 2;
    this.pins = new Array(this.getPostCount());
    this.makeBitPins(this.bits, 0, SIDE_W, 0, 'D', false, false, false);
    this.pins[this.bits] = this.newPin(0, SIDE_E, 'O');
    this.pins[this.bits].output = true;
    this.pins[this.bits + 1] = this.newPin(this.sizeY - 1, SIDE_E, 'V+');
    this.allocNodes();
  }

  override doStep(): void {
    let ival = 0;
    for (let i = 0; i !== this.bits; i++) if (this.volts[i] > this.getThreshold()) ival |= 1 << i;
    const ivalmax = (1 << this.bits) - 1;
    const v = (ival * this.volts[this.bits + 1]) / ivalmax;
    this.sim.updateVoltageSource(
      this.sim.ground,
      this.nodes[this.bits],
      this.pins[this.bits].voltSource,
      v,
    );
  }

  getVoltageSourceCount(): number {
    return 1;
  }
  override getPostCount(): number {
    return this.bits + 2;
  }
  override getDumpType(): number {
    return 166;
  }

  // there's already a V+ pin, how does that relate to high logic voltage?  figure out later
  override isDigitalChip(): boolean {
    return false;
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

export class ADCElm extends ChipElm {
  override getClassName(): string {
    return 'ADCElm';
  }
  override getChipName(): string {
    return 'ADC';
  }
  override needsBits(): boolean {
    return true;
  }
  override allowBus(): boolean {
    return true;
  }

  setupPins(): void {
    this.sizeX = 2;
    const bitsY = this.useBus() ? 1 : this.bits > 2 ? this.bits : 2;
    this.sizeY = bitsY > 2 ? bitsY : 2;
    this.pins = new Array(this.getPostCount());
    this.makeBitPins(this.bits, 0, SIDE_E, 0, 'D', true, false, false);
    this.pins[this.bits] = this.newPin(0, SIDE_W, 'In');
    this.pins[this.bits + 1] = this.newPin(this.sizeY - 1, SIDE_W, 'V+');
    this.allocNodes();
  }

  override execute(): void {
    const imax = (1 << this.bits) - 1;
    // if we round, the half-flash doesn't work
    const val = (imax * this.volts[this.bits]) / this.volts[this.bits + 1]; // + .5;
    let ival = javaDoubleToInt(val);
    ival = Math.min(imax, Math.max(0, ival));
    for (let i = 0; i !== this.bits; i++) this.pins[i].value = (ival & (1 << i)) !== 0;
  }

  getVoltageSourceCount(): number {
    return this.bits;
  }
  override getPostCount(): number {
    return this.bits + 2;
  }
  override getDumpType(): number {
    return 167;
  }

  // there's already a V+ pin, how does that relate to high logic voltage?  figure out later
  override isDigitalChip(): boolean {
    return false;
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

export const DACElmType = elementType('DACElm', DACElm);
export const ADCElmType = elementType('ADCElm', ADCElm);
