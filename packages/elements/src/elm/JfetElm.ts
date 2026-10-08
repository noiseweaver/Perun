// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/JfetElm.java, NJfetElm.java and
// PJfetElm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { ElementType } from '../CircuitElm.ts';
import { elementType } from '../CircuitElm.ts';
import type { EditInfo } from '../edit/EditInfo.ts';
import { modelsFor } from '../models/ModelLibrary.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { Diode } from './Diode.ts';
import { MosfetElm } from './MosfetElm.ts';

/** A JFET: the MOSFET model with a negative threshold plus a gate-channel diode. */
export class JfetElm extends MosfetElm {
  diode = new Diode(this);
  gateCurrent = 0;

  override getClassName(): string {
    return 'JfetElm';
  }
  override getDumpType(): number {
    return 'j'.charCodeAt(0);
  }

  private setupDiode(): void {
    this.noDiagonal = true;
    this.diode = new Diode(this);
    this.diode.setup(modelsFor(this.sim).diode.getDefaultModel());
  }

  override initNew(): void {
    this.initMosfet(false);
    this.setupDiode();
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.setupDiode();
  }

  override reset(): void {
    super.reset();
    this.diode.reset();
  }

  override getCurrentIntoNode(n: number): number {
    if (n === 0) return -this.gateCurrent;
    if (n === 1) return this.gateCurrent + this.ids;
    return -this.ids;
  }

  override stamp(): void {
    super.stamp();
    if (this.pnp < 0) this.diode.stamp(this.nodes[1], this.nodes[0]);
    else this.diode.stamp(this.nodes[0], this.nodes[1]);
  }

  override doStep(): void {
    super.doStep();
    this.diode.doStep(this.pnp * (this.volts[0] - this.volts[1]));
  }

  override calculateCurrent(): void {
    this.gateCurrent =
      this.pnp * this.diode.calculateCurrent(this.pnp * (this.volts[0] - this.volts[1]));
  }

  override showBulk(): boolean {
    return false;
  }
  override isJfet(): boolean {
    return true;
  }
  override hasSwapDS(): boolean {
    return true;
  }
  override getLastModelName(): string {
    return modelsFor(this.sim).jfetLastModelName;
  }
  override setLastModelName(n: string): void {
    modelsFor(this.sim).jfetLastModelName = n;
  }
  /** From Hayes and Horowitz p155. */
  override getDefaultThreshold(): number {
    return -4;
  }
  override getBackwardCompatibilityBeta(): number {
    return 0.00125;
  }
  override getElmType(): string {
    return 'JFET';
  }
  override getInfo(arr: string[]): void {
    this.getFetInfo(arr, 'JFET');
  }
  override getEditInfo(n: number): EditInfo | null {
    if (n < 3) return super.getEditInfo(n);
    return null;
  }
  override getConnection(_n1: number, _n2: number): boolean {
    return true;
  }
  override getScopeText(_v: number): string {
    return (this.pnp === -1 ? 'p-' : 'n-') + 'JFET';
  }
}

export class NJfetElm extends JfetElm {
  override getClassName(): string {
    return 'NJfetElm';
  }
}

export class PJfetElm extends JfetElm {
  override getClassName(): string {
    return 'PJfetElm';
  }
  override initNew(): void {
    this.initMosfet(true);
    this.diode = new Diode(this);
    this.noDiagonal = true;
    this.diode.setup(modelsFor(this.sim).diode.getDefaultModel());
  }
}

/** Like MosfetElm: both variants save as JfetElm, and "JfetElm" builds an NJfetElm. */
export const JfetElmType: ElementType = {
  className: 'JfetElm',
  create(x, y, sim) {
    const e = new NJfetElm(x, y, x, y, 0);
    e.sim = sim;
    e.initNew();
    return e;
  },
  load(x1, y1, x2, y2, f, st, sim) {
    const e = new JfetElm(x1, y1, x2, y2, f);
    e.sim = sim;
    e.undump(st);
    return e;
  },
};

export const NJfetElmType = elementType('NJfetElm', NJfetElm);
export const PJfetElmType = elementType('PJfetElm', PJfetElm);
