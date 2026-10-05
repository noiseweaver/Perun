// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/VaractorElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { VoltageSource } from '@circuitjs-next/engine';
import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { DiodeElm } from './DiodeElm.ts';

/**
 * A varactor: a diode in parallel with a capacitor whose capacitance falls with reverse bias.
 * The capacitor is a voltage source from node 0 to an internal node plus a resistor to node 1.
 */
export class VaractorElm extends DiodeElm {
  baseCapacitance = 0;
  capacitance = 0;
  capCurrent = 0;
  compResistance = 0;
  /** Voltage across the varactor at the last time step. */
  capvoltdiff = 0;
  voltSourceValue = 0;

  override getClassName(): string {
    return 'VaractorElm';
  }
  override getDumpType(): number {
    return 176;
  }
  override getElmType(): string {
    return 'varactor';
  }
  override getShortcut(): number {
    return 0;
  }

  override initNew(): void {
    super.initNew();
    this.baseCapacitance = 4e-12;
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.capvoltdiff = parseJavaDouble(st.nextToken());
    this.baseCapacitance = parseJavaDouble(st.nextToken());
  }

  override getInfo(arr: string[]): void {
    super.getInfo(arr);
    arr[0] = 'varactor';
    arr[5] = 'C = ' + getUnitText(this.capacitance, 'F');
  }

  override stepFinished(): void {
    this.capvoltdiff = this.volts[0] - this.volts[1];
  }

  override calculateCurrent(): void {
    super.calculateCurrent();
    this.current += this.capCurrent;
  }

  override reset(): void {
    super.reset();
    this.capvoltdiff = 0;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('ca', this.capvoltdiff);
    w.dumpAttr('ba', this.baseCapacitance);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.capvoltdiff = r.parseDoubleAttr('ca', this.capvoltdiff);
    this.baseCapacitance = r.parseDoubleAttr('ba', this.baseCapacitance);
  }

  override setVoltageSource(n: number, v: VoltageSource): void {
    super.setVoltageSource(n, v);
    v.setNodes(this.nodes[0], this.nodes[2]);
  }

  override stamp(): void {
    super.stamp();
    this.sim.stampVoltageSource(this.nodes[0], this.nodes[2], this.voltSource);
    this.sim.stampNonLinear(this.nodes[2]);
  }

  override startIteration(): void {
    super.startIteration();
    // trapezoidal capacitor companion model (Thevenin): a voltage source in series with a
    // resistor
    const c0 = this.baseCapacitance;
    if (this.capvoltdiff > 0) this.capacitance = c0;
    else this.capacitance = c0 / Math.pow(1 - this.capvoltdiff / this.getModel().fwdrop, 0.5);
    this.compResistance = this.sim.timeStep / (2 * this.capacitance);
    this.voltSourceValue = -this.capvoltdiff - this.capCurrent * this.compResistance;
  }

  override doStep(): void {
    super.doStep();
    this.sim.stampResistor(this.nodes[2], this.nodes[1], this.compResistance);
    this.sim.updateVoltageSource(
      this.nodes[0],
      this.nodes[2],
      this.voltSource,
      this.voltSourceValue,
    );
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 1) return new EditInfo('Capacitance @ 0V (F)', this.baseCapacitance, 10, 1000);
    return super.getEditInfo(n);
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 1) {
      this.baseCapacitance = ei.value;
      return;
    }
    super.setEditValue(n, ei);
  }

  override setCurrent(_vs: VoltageSource, c: number): void {
    this.capCurrent = c;
  }
  override getVoltageSourceCount(): number {
    return 1;
  }
  override getInternalNodeCount(): number {
    return 1;
  }
}

export const VaractorElmType = elementType('VaractorElm', VaractorElm);
