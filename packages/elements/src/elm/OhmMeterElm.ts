// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/OhmMeterElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType } from '../CircuitElm.ts';
import { UNITS_OHMS, VAL_R } from '../scope/constants.ts';
import { getUnitText, OHM } from '../view/units.ts';
import { CurrentElm } from './CurrentElm.ts';

/** An ohmmeter: a current source that shows the resistance it sees. */
export class OhmMeterElm extends CurrentElm {
  override getClassName(): string {
    return 'OhmMeterElm';
  }
  override getDumpType(): number {
    return 216;
  }

  override setPoints(): void {
    super.setPoints();
    this.calcLeads(26);
  }

  /** The resistance seen, V / I (infinite with no current). */
  resistance(): number {
    return this.getVoltageDiff() / this.current;
  }

  override getScopeValue(x: number): number {
    return x === VAL_R ? this.resistance() : super.getScopeValue(x);
  }
  override getScopeUnits(x: number): number {
    return x === VAL_R ? UNITS_OHMS : super.getScopeUnits(x);
  }
  override canShowValueInScope(x: number): boolean {
    return x === VAL_R;
  }

  override getElmType(): string {
    return 'ohmmeter';
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'ohmmeter';
    if (this.current === 0) arr[1] = 'R = ∞';
    else arr[1] = 'R = ' + getUnitText(this.resistance(), OHM);
  }
}

export const OhmMeterElmType = elementType('OhmMeterElm', OhmMeterElm);
