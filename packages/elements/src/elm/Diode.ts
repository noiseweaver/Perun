// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/Diode.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, checked against ts/Diode.ts (dev-ts) at
// 7ec858d662d8be1d76d54241ba3a5c1d1c524f51.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { CircuitNode, SimElement } from '@circuitjs-next/engine';
import type { DiodeModel } from '../models/DiodeModel.ts';
import { NOMINAL_TEMPERATURE, saturationCurrentLogFactor, thermalVoltage } from '../temperature.ts';

/** The circuit temperature, or the nominal one for an element not in a simulation yet. */
export function temperatureOf(e: SimElement): number {
  return (e.sim as SimElement['sim'] | undefined)?.temperature ?? NOMINAL_TEMPERATURE;
}

/** Electron thermal voltage at SPICE's default temperature of 27 C (300.15 K). */
const VT_NOMINAL = 0.025865;

/**
 * A P-N junction that can be embedded in other elements. Series resistance is handled in
 * DiodeElm, not here. Upstream captures the global simulation; this reads its owner's `sim`.
 */
export class Diode {
  nodes: CircuitNode[] = [];
  private readonly owner: SimElement;

  /** The diode's "scale voltage", the voltage increase which will raise current by a factor of e. */
  vscale = 0;
  /** 1 / vscale, for speed. */
  vdcoef = 0;
  zvoltage = 0;
  /** The diode current's scale factor. */
  leakage = 0;
  /** Voltage offset for the Zener breakdown exponential, from the Zener voltage. */
  zoffset = 0;
  /** Critical voltages for limiting the normal diode and Zener breakdown exponentials. */
  vcrit = 0;
  vzcrit = 0;
  lastvoltdiff = 0;
  /**
   * Thermal voltage. The Zener breakdown curve is a steeper exponential, like the ideal Shockley
   * curve but flipped and translated: vt and vzcoef replace vscale and vdcoef there. vzcoef is
   * 1/vt. Upstream's constants at 27 °C; other temperatures are not in upstream (DEVIATIONS.md).
   */
  vt = VT_NOMINAL;
  vzcoef = 1 / VT_NOMINAL;
  /** The model the parameters came from, and the temperature they are for. */
  private model: DiodeModel | null = null;
  private temperature = NOMINAL_TEMPERATURE;

  constructor(owner: SimElement) {
    this.owner = owner;
  }

  setup(model: DiodeModel): void {
    this.model = model;
    this.temperature = temperatureOf(this.owner);
    this.leakage = model.saturationCurrent;
    this.zvoltage = model.breakdownVoltage;
    this.vscale = model.vscale;
    this.vdcoef = model.vdcoef;
    this.vt = VT_NOMINAL;
    this.vzcoef = 1 / VT_NOMINAL;
    if (this.temperature !== NOMINAL_TEMPERATURE) {
      // SPICE: IS(T) = IS exp(((T/Tnom - 1) EG/Vt + XTI ln(T/Tnom)) / N), with Vt at T
      const n = model.emissionCoefficient;
      this.vt = thermalVoltage(this.temperature);
      this.vzcoef = 1 / this.vt;
      this.leakage *= Math.exp(saturationCurrentLogFactor(this.temperature) / n);
      this.vscale = n * this.vt;
      this.vdcoef = 1 / this.vscale;
    }
    const vt = this.vt;
    const vzcoef = this.vzcoef;

    // critical voltage for limiting; current is vscale/sqrt(2) at this voltage
    this.vcrit = this.vscale * Math.log(this.vscale / (Math.sqrt(2) * this.leakage));
    // translated, *positive* critical voltage for limiting in the Zener breakdown region;
    // limitStep() uses this with translated voltages in an analogous fashion to vcrit
    this.vzcrit = vt * Math.log(vt / (Math.sqrt(2) * this.leakage));
    if (this.zvoltage === 0) this.zoffset = 0;
    else {
      // calculate offset which will give us 5mA at zvoltage
      const i = -0.005;
      this.zoffset = this.zvoltage - Math.log(-(1 + i / this.leakage)) / vzcoef;
    }
  }

  reset(): void {
    this.lastvoltdiff = 0;
  }

  limitStep(vnew: number, vold: number): number {
    const sim = this.owner.sim;
    const vt = this.vt;
    let arg: number;

    // check new voltage; has current changed by factor of e^2?
    if (vnew > this.vcrit && Math.abs(vnew - vold) > this.vscale + this.vscale) {
      if (vold > 0) {
        arg = 1 + (vnew - vold) / this.vscale;
        if (arg > 0) {
          // adjust vnew so that the current is the same as in the linearized model from the
          // previous iteration: current at vnew = old current * arg
          vnew = vold + this.vscale * Math.log(arg);
        } else {
          vnew = this.vcrit;
        }
      } else {
        // adjust vnew so that the current is the same as in the linearized model from the
        // previous iteration (1/vscale = slope of load line)
        vnew = this.vscale * Math.log(vnew / this.vscale);
      }
      sim.converged = false;
    } else if (vnew < 0 && this.zoffset !== 0) {
      // for Zener breakdown, use the same logic but translate the values, and replace the
      // normal values with the Zener-specific ones to account for the steeper exponential
      vnew = -vnew - this.zoffset;
      vold = -vold - this.zoffset;

      if (vnew > this.vzcrit && Math.abs(vnew - vold) > vt + vt) {
        if (vold > 0) {
          arg = 1 + (vnew - vold) / vt;
          if (arg > 0) vnew = vold + vt * Math.log(arg);
          else vnew = this.vzcrit;
        } else {
          vnew = vt * Math.log(vnew / vt);
        }
        sim.converged = false;
      }
      vnew = -(vnew + this.zoffset);
    }
    return vnew;
  }

  stamp(n0: CircuitNode, n1: CircuitNode): void {
    // the circuit temperature changed since setup
    if (this.model !== null && this.owner.sim.temperature !== this.temperature)
      this.setup(this.model);
    this.nodes[0] = n0;
    this.nodes[1] = n1;
    this.owner.sim.stampNonLinear(this.nodes[0]);
    this.owner.sim.stampNonLinear(this.nodes[1]);
  }

  doStep(voltdiff: number): void {
    const sim = this.owner.sim;
    // used to have .1 here, but needed .01 for peak detector
    if (Math.abs(voltdiff - this.lastvoltdiff) > 0.01) sim.converged = false;
    voltdiff = this.limitStep(voltdiff, this.lastvoltdiff);
    this.lastvoltdiff = voltdiff;

    // To prevent a possible singular matrix or other numeric issues, put a tiny conductance in
    // parallel with each P-N junction.
    let gmin = this.leakage * 0.01;
    if (sim.subIterations > 100) {
      // if we have trouble converging, put a conductance in parallel with the diode.
      // Gradually increase the conductance value for each iteration.
      gmin = Math.exp(-9 * Math.log(10) * (1 - sim.subIterations / 3000));
      if (gmin > 0.1) gmin = 0.1;
    }

    const { leakage, vdcoef, vzcoef } = this;
    if (voltdiff >= 0 || this.zvoltage === 0) {
      // regular diode or forward-biased zener
      const evalue = Math.exp(voltdiff * vdcoef);
      const geq = vdcoef * leakage * evalue + gmin;
      const nc = (evalue - 1) * leakage - geq * voltdiff;
      sim.stampConductance(this.nodes[0], this.nodes[1], geq);
      sim.stampCurrentSource(this.nodes[0], this.nodes[1], nc);
    } else {
      // Zener diode. For reverse-biased Zener diodes, mimic the Zener breakdown curve with an
      // exponential similar to the ideal Shockley curve:
      //   I(Vd) = Is * (exp[Vd*C] - exp[(-Vd-Vz)*Cz] - 1)
      // geq is I'(Vd), nc is I(Vd) + I'(Vd)*(-Vd)
      const geq =
        leakage *
          (vdcoef * Math.exp(voltdiff * vdcoef) +
            vzcoef * Math.exp((-voltdiff - this.zoffset) * vzcoef)) +
        gmin;

      const nc =
        leakage *
          (Math.exp(voltdiff * vdcoef) - Math.exp((-voltdiff - this.zoffset) * vzcoef) - 1) +
        geq * -voltdiff;

      sim.stampConductance(this.nodes[0], this.nodes[1], geq);
      sim.stampCurrentSource(this.nodes[0], this.nodes[1], nc);
    }
  }

  calculateCurrent(voltdiff: number): number {
    const vzcoef = this.vzcoef;
    if (voltdiff >= 0 || this.zvoltage === 0)
      return this.leakage * (Math.exp(voltdiff * this.vdcoef) - 1);
    return (
      this.leakage *
      (Math.exp(voltdiff * this.vdcoef) - Math.exp((-voltdiff - this.zoffset) * vzcoef) - 1)
    );
  }
}
