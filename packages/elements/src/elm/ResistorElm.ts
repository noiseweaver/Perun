// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ResistorElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, with ts/ResistorElm.ts (dev-ts) at
// 7ec858d662d8be1d76d54241ba3a5c1d1c524f51 for the node-voltage model.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { OHM, getUnitText } from '../view/units.ts';
import { resistanceAtTemperature } from '../temperature.ts';
import type { WireRouter } from '../WireRouter.ts';
import type { Point } from '@circuitjs-next/engine';

export class ResistorElm extends CircuitElm {
  /** Upstream setPoints: calcLeads(32). */
  override routingLeads(): [Point, Point] | null {
    return super.routingLeads() ?? this.leadsFor(32);
  }

  override addRoutingObstacle(router: WireRouter): void {
    this.addRoutingObstacleWithLeads(router, 6);
  }

  resistance = 0;
  /**
   * Not in upstream (DEVIATIONS.md): tolerance in percent for Monte Carlo runs, 0 for none. Saved
   * as the extra XML attribute `tol` only when set; upstream ignores it.
   */
  tolerance = 0;
  /**
   * Not in upstream (DEVIATIONS.md): temperature coefficient in ppm/°C, 0 for none. The
   * resistance is its value at 27 °C. Saved as the extra XML attribute `tc` only when set.
   */
  tempco = 0;

  /** The resistance at the circuit temperature: `resistance` unless a coefficient is set. */
  simResistance(): number {
    return resistanceAtTemperature(this.resistance, this.tempco, this.sim.temperature);
  }

  override getClassName(): string {
    return 'ResistorElm';
  }
  override getDumpType(): number {
    return 'r'.charCodeAt(0);
  }

  override initNew(): void {
    this.resistance = 1000;
  }

  override undump(st: StringTokenizer): void {
    this.resistance = parseJavaDouble(st.nextToken());
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('r', this.resistance);
    if (this.tolerance !== 0) w.dumpAttr('tol', this.tolerance);
    if (this.tempco !== 0) w.dumpAttr('tc', this.tempco);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.resistance = r.parseDoubleAttr('r', this.resistance);
    this.tolerance = Math.max(0, r.parseDoubleAttr('tol', 0));
    this.tempco = r.parseDoubleAttr('tc', 0);
  }

  override calculateCurrent(): void {
    this.current = (this.volts[0] - this.volts[1]) / this.simResistance();
  }

  override stamp(): void {
    this.sim.stampResistor(this.nodes[0], this.nodes[1], this.simResistance());
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'resistor';
    this.getBasicInfo(arr);
    arr[3] = 'R = ' + getUnitText(this.simResistance(), OHM);
    arr[4] = 'P = ' + getUnitText(this.getPower(), 'W');
  }

  override getScopeText(_v: number): string {
    return 'resistor, ' + getUnitText(this.resistance, OHM);
  }

  override getElmType(): string {
    return 'resistor';
  }

  override getEditInfo(n: number): EditInfo | null {
    // ohmString doesn't work here on linux
    if (n === 0) return new EditInfo('Resistance (ohms)', this.resistance, 0, 0);
    if (n === 1) {
      return new EditInfo('Temperature coefficient (ppm/°C)', this.tempco, 0, 0)
        .setDimensionless()
        .setUnitStep();
    }
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 1) {
      this.tempco = ei.value;
      return;
    }
    this.resistance = ei.value <= 0 ? 1e-9 : ei.value;
  }

  override getShortcut(): number {
    return 'r'.charCodeAt(0);
  }
}

export const ResistorElmType = elementType('ResistorElm', ResistorElm);
