// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/TunnelDiodeElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { getCurrentText, getUnitText, getVoltageText } from '../view/units.ts';

const PVP = 0.1;
const PIP = 4.7e-3;
const PVV = 0.37;
const PVT = 0.026;
const PVPP = 0.525;
const PIV = 370e-6;

/** A tunnel diode, with a fixed I-V curve that has a negative resistance region. */
export class TunnelDiodeElm extends CircuitElm {
  lastvoltdiff = 0;

  override getClassName(): string {
    return 'TunnelDiodeElm';
  }
  override getDumpType(): number {
    return 175;
  }
  override nonLinear(): boolean {
    return true;
  }

  /** Master also zeroes its own copy of the node voltages, which live on the nodes here. */
  override reset(): void {
    this.lastvoltdiff = 0;
  }

  /** Keep each iteration's voltage change within 1 V, which is enough for convergence. */
  limitStep(vnew: number, vold: number): number {
    if (vnew > vold + 1) return vold + 1;
    if (vnew < vold - 1) return vold - 1;
    return vnew;
  }

  override stamp(): void {
    this.sim.stampNonLinear(this.nodes[0]);
    this.sim.stampNonLinear(this.nodes[1]);
  }

  override doStep(): void {
    let voltdiff = this.volts[0] - this.volts[1];
    if (Math.abs(voltdiff - this.lastvoltdiff) > 0.01) this.sim.converged = false;
    voltdiff = this.limitStep(voltdiff, this.lastvoltdiff);
    this.lastvoltdiff = voltdiff;
    const i0 = PIV * Math.exp(-PVV);
    const i =
      PIP * Math.exp(-PVPP / PVT) * (Math.exp(voltdiff / PVT) - 1) +
      PIP * (voltdiff / PVP) * Math.exp(1 - voltdiff / PVP) +
      PIV * Math.exp(voltdiff - PVV) -
      i0;
    const geq =
      (PIP * Math.exp(-PVPP / PVT) * Math.exp(voltdiff / PVT)) / PVT +
      (PIP * Math.exp(1 - voltdiff / PVP)) / PVP -
      (Math.exp(1 - voltdiff / PVP) * PIP * voltdiff) / (PVP * PVP) +
      Math.exp(voltdiff - PVV) * PIV;
    const nc = i - geq * voltdiff;
    this.sim.stampConductance(this.nodes[0], this.nodes[1], geq);
    this.sim.stampCurrentSource(this.nodes[0], this.nodes[1], nc);
  }

  override calculateCurrent(): void {
    const voltdiff = this.volts[0] - this.volts[1];
    const i0 = PIV * Math.exp(-PVV);
    this.current =
      PIP * Math.exp(-PVPP / PVT) * (Math.exp(voltdiff / PVT) - 1) +
      PIP * (voltdiff / PVP) * Math.exp(1 - voltdiff / PVP) +
      PIV * Math.exp(voltdiff - PVV) -
      i0;
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'tunnel diode';
    arr[1] = 'I = ' + getCurrentText(this.getCurrent());
    arr[2] = 'Vd = ' + getVoltageText(this.getVoltageDiff());
    arr[3] = 'P = ' + getUnitText(this.getPower(), 'W');
  }
}

export const TunnelDiodeElmType = elementType('TunnelDiodeElm', TunnelDiodeElm);
