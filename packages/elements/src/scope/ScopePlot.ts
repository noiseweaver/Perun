// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ScopePlot.java and
// ScopeDataIterator.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Simulation } from '@perun/engine';
import type { CircuitElm } from '../CircuitElm.ts';
import { OHM, getCurrentText, getUnitText, getVoltageText } from '../view/units.ts';
import { UNITS_A, UNITS_C, UNITS_OHMS, UNITS_V, UNITS_W } from './constants.ts';
import type { ScopeInk } from './ScopeGraphics.ts';

/** 0 is the centre of the screen; +V_POSITION_STEPS/2 is the top. */
export const V_POSITION_STEPS = 200;

/** Plot of a single value on a scope. */
export class ScopePlot {
  static readonly FLAG_AC = 1;

  minValues = new Float64Array(0);
  maxValues = new Float64Array(0);
  scopePointCount = 0;
  /** The current sample. */
  ptr = 0;
  /** The property being shown, e.g. VAL_CURRENT. */
  value = 0;
  /** Sim timestep units per pixel. */
  scopePlotSpeed = 0;
  units: number;
  lastUpdateTime = 0;
  lastValue = 0;
  color: ScopeInk = 'voltage';
  elm: CircuitElm | null;
  /**
   * Has the user put in a manual scale in "/div" (as opposed to one inferred from a "max value"
   * file or the auto scale)? Then it is respected rather than recomputed.
   */
  manScaleSet = false;
  /** Units per division. */
  manScale = 1.0;
  manVPosition = 0;
  gridMult = 0;
  plotOffset = 0;
  acCoupled = false;
  /** Filter coefficient for AC coupling. */
  acAlpha = 0.9999;
  /** The y[i-1] term of the AC coupling filter. */
  acLastOut = 0;

  constructor(e: CircuitElm | null, u: number, v = 0, manS?: number) {
    this.elm = e;
    this.units = u;
    if (manS === undefined) return;
    this.value = v;
    this.manScale = manS;
    // ohms can only be positive, so move the v position to the bottom. power can be negative for
    // caps and inductors, but still move to the bottom (for backward compatibility)
    if (u === UNITS_OHMS || u === UNITS_W || u === UNITS_C)
      this.manVPosition = -V_POSITION_STEPS / 2;
  }

  startIndex(w: number): number {
    return this.ptr + this.scopePointCount - w;
  }

  reset(spc: number, sp: number, full: boolean, sim: Simulation): void {
    let oldSpc = this.scopePointCount;
    this.scopePointCount = spc;
    // throw away old data
    if (this.scopePlotSpeed !== sp) oldSpc = 0;
    this.scopePlotSpeed = sp;
    // Adjust the time constant of the AC coupled filter in proportion to the number of samples
    // we are seeing on the scope. The constant is empirically determined
    this.acAlpha = 1.0 - 1.0 / (1.15 * this.scopePlotSpeed * this.scopePointCount);
    const oldMin = this.minValues;
    const oldMax = this.maxValues;
    const hadData = oldMin.length > 0;
    this.minValues = new Float64Array(spc);
    this.maxValues = new Float64Array(spc);
    if (hadData && !full) {
      // preserve old data if possible
      for (let i = 0; i !== spc && i !== oldSpc; i++) {
        const i1 = -i & (spc - 1);
        const i2 = (this.ptr - i) & (oldSpc - 1);
        this.minValues[i1] = oldMin[i2];
        this.maxValues[i1] = oldMax[i2];
      }
    } else this.lastUpdateTime = sim.t;
    this.ptr = 0;
  }

  timeStep(sim: Simulation): void {
    if (this.elm === null) return;
    let v = this.elm.getScopeValue(this.value);
    // AC coupling filter: 1st order IIR high pass, y[i] = alpha x (y[i-1]+x[i]-x[i-1]). Computed
    // even when DC coupled to prime the data in case they switch to AC later
    const newAcOut = this.acAlpha * (this.acLastOut + v - this.lastValue);
    this.lastValue = v;
    this.acLastOut = newAcOut;
    if (this.isAcCoupled()) v = newAcOut;
    if (v < this.minValues[this.ptr]) this.minValues[this.ptr] = v;
    if (v > this.maxValues[this.ptr]) this.maxValues[this.ptr] = v;
    const maxTimeStep = sim.maxTimeStep;
    if (sim.t - this.lastUpdateTime >= maxTimeStep * this.scopePlotSpeed) {
      this.ptr = (this.ptr + 1) & (this.scopePointCount - 1);
      this.minValues[this.ptr] = this.maxValues[this.ptr] = v;
      this.lastUpdateTime += maxTimeStep * this.scopePlotSpeed;
    }
  }

  /** The unit symbol of this plot's values. */
  unitSymbol(): string {
    switch (this.units) {
      case UNITS_V:
        return 'V';
      case UNITS_A:
        return 'A';
      case UNITS_OHMS:
        return OHM;
      case UNITS_W:
        return 'W';
      case UNITS_C:
        return 'C';
    }
    return '';
  }

  getUnitText(v: number): string {
    switch (this.units) {
      case UNITS_V:
        return getVoltageText(v);
      case UNITS_A:
        return getCurrentText(v);
      case UNITS_OHMS:
        return getUnitText(v, OHM);
      case UNITS_W:
        return getUnitText(v, 'W');
      case UNITS_C:
        return getUnitText(v, 'C');
    }
    return '';
  }

  /** The first plot of each kind gets its unit's color, later ones the trace colors. */
  assignColor(count: number): void {
    if (count > 0) {
      this.color = { trace: (count - 1) % 8 };
      return;
    }
    this.color = this.units === UNITS_V ? 'voltage' : this.units === UNITS_A ? 'current' : 'other';
  }

  setAcCoupled(b: boolean): void {
    this.acCoupled = this.canAcCouple() ? b : false;
  }

  /** AC coupling is permitted if the plot is displaying volts. */
  canAcCouple(): boolean {
    return this.units === UNITS_V;
  }

  isAcCoupled(): boolean {
    return this.acCoupled;
  }

  getPlotFlags(): number {
    return this.acCoupled ? ScopePlot.FLAG_AC : 0;
  }
}

/** Walks the samples a scope shows of one plot (upstream `ScopeDataIterator`). */
export class ScopeDataIterator {
  readonly plot: ScopePlot;
  readonly ipa: number;
  readonly validCount: number;
  readonly scopePointCount: number;
  currentIp = 0;
  startIndex = 0;

  constructor(
    scope: {
      scopePointCount: number;
      rect: { width: number };
      displayStartIndex(p: ScopePlot, w: number): number;
      validDataCount(p: ScopePlot, ipa: number, w: number): number;
    },
    plot: ScopePlot,
  ) {
    this.plot = plot;
    this.scopePointCount = scope.scopePointCount;
    this.ipa = scope.displayStartIndex(plot, scope.rect.width);
    this.validCount = scope.validDataCount(plot, this.ipa, scope.rect.width);
  }

  skipNonzeroValues(): number {
    for (; this.startIndex < this.validCount; this.startIndex++) {
      const ip = (this.startIndex + this.ipa) & (this.scopePointCount - 1);
      if (this.plot.maxValues[ip] !== 0) return this.plot.maxValues[ip];
    }
    return 0;
  }

  getMin(): number {
    return this.plot.minValues[this.currentIp];
  }

  getMax(): number {
    return this.plot.maxValues[this.currentIp];
  }

  *[Symbol.iterator](): Iterator<number> {
    for (let i = this.startIndex; i < this.validCount; i++) {
      this.currentIp = (i + this.ipa) & (this.scopePointCount - 1);
      yield i;
    }
  }
}
