// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/DFlipFlopElm.java,
// JKFlipFlopElm.java, TFlipFlopElm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032,
// checked against the ts/ translations (dev-ts) at 7ec858d662d8be1d76d54241ba3a5c1d1c524f51.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { type StringTokenizer } from '../StringTokenizer.ts';
import { ChipElm, SIDE_W, SIDE_E } from './ChipElm.ts';

export class DFlipFlopElm extends ChipElm {
  override getClassName(): string {
    return 'DFlipFlopElm';
  }
  static readonly FLAG_RESET = 2;
  static readonly FLAG_SET = 4;
  static readonly FLAG_INVERT_SET_RESET = 8;

  hasReset(): boolean {
    return (this.flags & DFlipFlopElm.FLAG_RESET) !== 0 || this.hasSet();
  }
  hasSet(): boolean {
    return (this.flags & DFlipFlopElm.FLAG_SET) !== 0;
  }
  invertSetReset(): boolean {
    return (this.flags & DFlipFlopElm.FLAG_INVERT_SET_RESET) !== 0;
  }
  override initNew(): void {
    super.initNew();
    this.pins[2].value = !this.pins[1].value;
  }

  /** Set by the text-format load: skip the first execute() so zero volts cannot clock or reset. */
  justLoaded = false;

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.pins[2].value = !this.pins[1].value;
    this.justLoaded = true;
  }

  override getChipName(): string {
    return 'D flip-flop';
  }

  setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 3;
    this.pins = new Array(this.getPostCount());
    this.pins[0] = this.newPin(0, SIDE_W, 'D');
    this.pins[1] = this.newPin(0, SIDE_E, 'Q');
    this.pins[1].output = this.pins[1].state = true;
    this.pins[2] = this.newPin(this.hasSet() ? 1 : 2, SIDE_E, 'Q');
    this.pins[2].output = true;
    this.pins[2].lineOver = true;
    this.pins[3] = this.newPin(1, SIDE_W, '');
    this.pins[3].clock = true;
    if (!this.hasSet()) {
      if (this.hasReset()) {
        this.pins[4] = this.newPin(2, SIDE_W, 'R');
        this.pins[4].bubble = this.invertSetReset();
      }
    } else {
      this.pins[5] = this.newPin(2, SIDE_W, 'S');
      this.pins[4] = this.newPin(2, SIDE_E, 'R');
      this.pins[4].bubble = this.pins[5].bubble = this.invertSetReset();
    }
  }

  override getPostCount(): number {
    return 4 + (this.hasReset() ? 1 : 0) + (this.hasSet() ? 1 : 0);
  }

  getVoltageSourceCount(): number {
    return 2;
  }

  override reset(): void {
    super.reset();
    this.volts[2] = this.highVoltage;
    this.pins[2].value = true;
  }

  override execute(): void {
    if (this.justLoaded) {
      this.justLoaded = false;
      return;
    }
    let isSet = false;
    let isReset = false;

    if (this.hasSet() && this.pins[5].value !== this.invertSetReset()) isSet = true;
    if (this.hasReset() && this.pins[4].value !== this.invertSetReset()) isReset = true;

    if (isSet || isReset) {
      this.writeOutput(1, false);
      this.writeOutput(2, false);
      if (isSet) this.writeOutput(1, true);
      if (isReset) this.writeOutput(2, true);
    } else {
      if (this.pins[3].value && !this.lastClock) this.writeOutput(1, this.pins[0].value);
      this.writeOutput(2, !this.pins[1].value);
    }

    this.lastClock = this.pins[3].value;
  }

  override getDumpType(): number {
    return 155;
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      return EditInfo.createCheckbox('Reset Pin', this.hasReset());
    }
    if (n === 1) {
      return EditInfo.createCheckbox('Set Pin', this.hasSet());
    }
    if (n === 2) {
      return EditInfo.createCheckbox('Invert Set/Reset', this.invertSetReset());
    }
    return super.getChipEditInfo(n);
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      if (ei.checkbox?.state === true) this.flags |= DFlipFlopElm.FLAG_RESET;
      else this.flags &= ~DFlipFlopElm.FLAG_RESET | DFlipFlopElm.FLAG_SET;
      this.setupPins();
      this.allocNodes();
      this.setPoints();
    }
    if (n === 1) {
      if (ei.checkbox?.state === true) this.flags |= DFlipFlopElm.FLAG_SET;
      else this.flags &= ~DFlipFlopElm.FLAG_SET;
      this.setupPins();
      this.allocNodes();
      this.setPoints();
    }
    if (n === 2) {
      this.flags = ei.changeFlag(this.flags, DFlipFlopElm.FLAG_INVERT_SET_RESET);
      this.setupPins();
      this.setPoints();
    }
    super.setChipEditValue(n, ei);
  }
}

export class JKFlipFlopElm extends ChipElm {
  override getClassName(): string {
    return 'JKFlipFlopElm';
  }
  static readonly FLAG_RESET = 2;
  static readonly FLAG_POSITIVE_EDGE = 4;
  static readonly FLAG_INVERT_RESET = 8;

  hasReset(): boolean {
    return (this.flags & JKFlipFlopElm.FLAG_RESET) !== 0;
  }
  positiveEdgeTriggered(): boolean {
    return (this.flags & JKFlipFlopElm.FLAG_POSITIVE_EDGE) !== 0;
  }
  invertReset(): boolean {
    return (this.flags & JKFlipFlopElm.FLAG_INVERT_RESET) !== 0;
  }
  justLoaded = false;

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.pins[4].value = !this.pins[3].value;
    this.justLoaded = true;
  }

  override getChipName(): string {
    return 'JK flip-flop';
  }

  setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 3;
    this.pins = new Array(this.getPostCount());
    this.pins[0] = this.newPin(0, SIDE_W, 'J');
    this.pins[1] = this.newPin(1, SIDE_W, '');
    this.pins[1].clock = true;
    this.pins[1].bubble = !this.positiveEdgeTriggered();
    this.pins[2] = this.newPin(2, SIDE_W, 'K');
    this.pins[3] = this.newPin(0, SIDE_E, 'Q');
    this.pins[3].output = this.pins[3].state = true;
    this.pins[4] = this.newPin(2, SIDE_E, 'Q');
    this.pins[4].output = true;
    this.pins[4].lineOver = true;
    if (this.hasReset()) {
      this.pins[5] = this.newPin(1, SIDE_E, 'R');
      this.pins[5].bubble = this.invertReset();
    }
  }

  override getPostCount(): number {
    return 5 + (this.hasReset() ? 1 : 0);
  }
  getVoltageSourceCount(): number {
    return 2;
  }

  override execute(): void {
    if (this.justLoaded) {
      this.justLoaded = false;
      return;
    }
    const transition = this.positiveEdgeTriggered()
      ? this.pins[1].value && !this.lastClock
      : !this.pins[1].value && this.lastClock;

    if (transition) {
      let q = this.pins[3].value;
      if (this.pins[0].value) {
        if (this.pins[2].value) q = !q;
        else q = true;
      } else if (this.pins[2].value) q = false;
      this.writeOutput(3, q);
    }
    this.lastClock = this.pins[1].value;

    if (this.hasReset() && this.pins[5].value !== this.invertReset()) this.writeOutput(3, false);

    this.writeOutput(4, !this.pins[3].value);
  }

  override getDumpType(): number {
    return 156;
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) return EditInfo.createCheckbox('Reset Pin', this.hasReset());
    if (n === 1)
      return EditInfo.createCheckbox('Positive Edge Triggered', this.positiveEdgeTriggered());
    if (n === 2) return EditInfo.createCheckbox('Invert Reset', this.invertReset());
    return super.getChipEditInfo(n);
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      this.flags = ei.changeFlag(this.flags, JKFlipFlopElm.FLAG_RESET);
      this.setupPins();
      this.allocNodes();
      this.setPoints();
    }
    if (n === 1) {
      this.flags = ei.changeFlag(this.flags, JKFlipFlopElm.FLAG_POSITIVE_EDGE);
      this.pins[1].bubble = !this.positiveEdgeTriggered();
    }
    if (n === 2) {
      this.flags = ei.changeFlag(this.flags, JKFlipFlopElm.FLAG_INVERT_RESET);
      this.setupPins();
      this.setPoints();
    }
    super.setChipEditValue(n, ei);
  }
}

export class TFlipFlopElm extends ChipElm {
  override getClassName(): string {
    return 'TFlipFlopElm';
  }
  static readonly FLAG_RESET = 2;
  static readonly FLAG_SET = 4;
  hasReset(): boolean {
    return (this.flags & TFlipFlopElm.FLAG_RESET) !== 0 || this.hasSet();
  }
  hasSet(): boolean {
    return (this.flags & TFlipFlopElm.FLAG_SET) !== 0;
  }
  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.pins[2].value = !this.pins[1].value;
  }
  override getChipName(): string {
    return 'T flip-flop';
  }
  setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 3;
    this.pins = new Array(this.getPostCount());
    this.pins[0] = this.newPin(0, SIDE_W, 'T');
    this.pins[1] = this.newPin(0, SIDE_E, 'Q');
    this.pins[1].output = this.pins[1].state = true;
    this.pins[2] = this.newPin(this.hasSet() ? 1 : 2, SIDE_E, 'Q');
    this.pins[2].output = true;
    this.pins[2].lineOver = true;
    this.pins[3] = this.newPin(1, SIDE_W, '');
    this.pins[3].clock = true;
    if (!this.hasSet()) {
      if (this.hasReset()) this.pins[4] = this.newPin(2, SIDE_W, 'R');
    } else {
      this.pins[5] = this.newPin(2, SIDE_W, 'S');
      this.pins[4] = this.newPin(2, SIDE_E, 'R');
    }
  }
  override getPostCount(): number {
    return 4 + (this.hasReset() ? 1 : 0) + (this.hasSet() ? 1 : 0);
  }
  getVoltageSourceCount(): number {
    return 2;
  }
  override reset(): void {
    super.reset();
    this.volts[2] = this.highVoltage;
    this.pins[2].value = true;
  }
  override execute(): void {
    if (this.pins[3].value && !this.lastClock) {
      if (this.pins[0].value) // if T = 1
      {
        this.pins[1].value = !this.pins[1].value;
      }
      // else no change
    }
    if (this.hasSet() && this.pins[5].value) {
      this.pins[1].value = true;
    }
    if (this.hasReset() && this.pins[4].value) {
      this.pins[1].value = false;
    }
    this.pins[2].value = !this.pins[1].value;
    this.lastClock = this.pins[3].value;
  }
  override getDumpType(): number {
    return 193;
  }
  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      return EditInfo.createCheckbox('Reset Pin', this.hasReset());
    }
    if (n === 1) {
      return EditInfo.createCheckbox('Set Pin', this.hasSet());
    }
    return super.getChipEditInfo(n);
  }
  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      if (ei.checkbox?.state === true) this.flags |= TFlipFlopElm.FLAG_RESET;
      else this.flags &= ~TFlipFlopElm.FLAG_RESET | TFlipFlopElm.FLAG_SET;
      this.setupPins();
      this.allocNodes();
      this.setPoints();
    }
    if (n === 1) {
      if (ei.checkbox?.state === true) this.flags |= TFlipFlopElm.FLAG_SET;
      else this.flags &= ~TFlipFlopElm.FLAG_SET;
      this.setupPins();
      this.allocNodes();
      this.setPoints();
    }
    super.setChipEditValue(n, ei);
  }
}

export const DFlipFlopElmType = elementType('DFlipFlopElm', DFlipFlopElm);
export const JKFlipFlopElmType = elementType('JKFlipFlopElm', JKFlipFlopElm);
export const TFlipFlopElmType = elementType('TFlipFlopElm', TFlipFlopElm);
