// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/BatteryElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { VoltageSource } from '@perun/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import { getCurrentText, getUnitText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import type { WireRouter } from '../WireRouter.ts';
import type { Point } from '@perun/engine';

const BATTERY_TYPE_NAMES = ['Alkaline 1.5V', 'Lithium-Ion', 'NiMH 1.2V', 'NiCd 1.2V', 'Lead-Acid'];
const BATTERY_TYPE_TABLES = [
  '0=0.8\n10=0.95\n20=1.05\n40=1.18\n60=1.28\n80=1.38\n90=1.43\n100=1.55\n', // alkaline
  '0=3.00\n5=3.30\n10=3.45\n20=3.55\n30=3.62\n40=3.68\n50=3.73\n60=3.79\n70=3.87\n80=3.97\n90=4.08\n95=4.15\n100=4.20\n', // lithium-ion
  '0=1.00\n10=1.15\n20=1.20\n50=1.25\n80=1.30\n90=1.33\n100=1.40\n', // NiMH
  '0=1.00\n10=1.15\n20=1.20\n50=1.22\n80=1.25\n90=1.28\n100=1.35\n', // NiCd
  '0=1.75\n10=1.90\n20=1.95\n50=2.05\n80=2.10\n90=2.12\n100=2.15\n', // lead-acid
];
/** Capacity (Ah), R0, R1 (ohms) and C1 (F) applied when the user picks a preset type. */
const BATTERY_TYPE_DEFAULTS = [
  [2.5, 0.15, 0.25, 1500], // alkaline (AA)
  [3.0, 0.025, 0.02, 2000], // lithium-ion (18650)
  [2.0, 0.03, 0.04, 1800], // NiMH (AA)
  [1.0, 0.02, 0.025, 1200], // NiCd (AA)
  [10, 0.008, 0.012, 5000], // lead-acid (2V)
];

/**
 * Battery: drawn like a DC source, modelled as (-) -- Vsrc -- A -- R0 -- B -- (R1 || C1) -- (+).
 * Vsrc follows the state of charge through a table; the charge is counted from the current.
 * Nodes: 0 (-), 1 (+), 2 between Vsrc and R0, 3 between R0 and R1/C1.
 */
export class BatteryElm extends CircuitElm {
  /** Upstream setPoints: calcLeads(8). */
  override routingLeads(): [Point, Point] | null {
    return super.routingLeads() ?? this.leadsFor(8);
  }

  override addRoutingObstacle(router: WireRouter): void {
    this.addRoutingObstacleWithLeads(router, 16);
  }

  static readonly FLAG_SHOW_VOLTAGE = 1;
  static readonly FLAG_SHOW_SOC = 2;
  static readonly BT_ALKALINE = 0;
  static readonly BT_LITHIUM = 1;
  static readonly BT_CUSTOM = -1;
  static readonly typeNames = BATTERY_TYPE_NAMES;

  batteryType = BatteryElm.BT_LITHIUM;
  r0 = 0.01;
  r1 = 0.02;
  c1 = 2000;
  capacityAh = 2;
  initialSoc = 1;
  soc = 1;
  compResistance = 0;
  capVoltDiff = 0;
  capCurrent = 0;
  curSourceValue = 0;
  socVoltageTable = BATTERY_TYPE_TABLES[BatteryElm.BT_LITHIUM] ?? '';
  /** [SOC percent, voltage] pairs, sorted by SOC. */
  socTable: [number, number][] = [];

  override getClassName(): string {
    return 'BatteryElm';
  }

  override initNew(): void {
    this.r0 = 0.01;
    this.r1 = 0.02;
    this.c1 = 2000;
    this.capacityAh = 2;
    this.initialSoc = 1;
    this.flags |= BatteryElm.FLAG_SHOW_VOLTAGE | BatteryElm.FLAG_SHOW_SOC;
    this.batteryType = BatteryElm.BT_LITHIUM;
    this.socVoltageTable = BATTERY_TYPE_TABLES[this.batteryType] ?? '';
    this.parseSocTable(null);
    this.reset();
  }

  override isBatteryElm(): boolean {
    return true;
  }
  override getInternalNodeCount(): number {
    return 2;
  }
  override getVoltageSourceCount(): number {
    return 1;
  }
  override getDragVertical(_requestedVertical: boolean): boolean {
    return true;
  }
  /** Point 2, not point 1, tracks the mouse during toolbar drag-and-drop. */
  override dragPlace(xa: number, ya: number, vertical: boolean): void {
    super.dragPlace(xa, ya, vertical);
    this.swapDragEndpoints();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('r0', this.r0);
    w.dumpAttr('r1', this.r1);
    w.dumpAttr('c1', this.c1);
    w.dumpAttr('cap', this.capacityAh);
    w.dumpAttr('isoc', this.initialSoc);
    w.dumpAttr('bt', this.batteryType);
    if (this.batteryType === BatteryElm.BT_CUSTOM && this.socVoltageTable.length > 0)
      w.appendText(this.socVoltageTable);
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    w.dumpAttr('soc', this.soc);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.r0 = r.parseDoubleAttr('r0', 0.01);
    this.r1 = r.parseDoubleAttr('r1', 0.02);
    this.c1 = r.parseDoubleAttr('c1', 2000);
    this.capacityAh = r.parseDoubleAttr('cap', 2);
    this.initialSoc = BatteryElm.clampSoc(r.parseDoubleAttr('isoc', 1));
    // soc itself isn't lower-clamped (over-discharge is modeled), only capped at 100%
    this.soc = Math.min(1, r.parseDoubleAttr('soc', this.initialSoc));
    this.batteryType = r.parseIntAttr('bt', BatteryElm.BT_LITHIUM);
    if (this.batteryType === BatteryElm.BT_CUSTOM) {
      const t = r.parseContents();
      this.socVoltageTable =
        t === null || t.length === 0 ? (BATTERY_TYPE_TABLES[BatteryElm.BT_LITHIUM] ?? '') : t;
    } else
      this.socVoltageTable =
        BATTERY_TYPE_TABLES[this.batteryType] ?? BATTERY_TYPE_TABLES[BatteryElm.BT_LITHIUM] ?? '';
    this.parseSocTable(null);
  }

  override reset(): void {
    this.soc = BatteryElm.clampSoc(this.initialSoc);
    this.capVoltDiff = this.capCurrent = this.curSourceValue = 0;
  }

  static clampSoc(s: number): number {
    return s < 0 ? 0 : s > 1 ? 1 : s;
  }

  parseSocTable(ei: EditInfo | null): void {
    const table: [number, number][] = [];
    this.socTable = table;
    if (this.socVoltageTable.length === 0) return;
    for (const raw of this.socVoltageTable.split('\n')) {
      const line = raw.trim();
      if (line.length === 0) continue;
      const eq = line.indexOf('=');
      if (eq < 0) {
        ei?.setError('missing =: ' + line);
        continue;
      }
      try {
        const socPct = parseJavaDouble(line.substring(0, eq).trim());
        const v = parseJavaDouble(line.substring(eq + 1).trim());
        table.push([socPct, v]);
      } catch {
        ei?.setError('bad line: ' + line);
      }
    }
    // insertion sort by SOC percent, as upstream (stable for equal keys)
    for (let i = 1; i < table.length; i++) {
      const cur = table[i] as [number, number];
      let j = i - 1;
      while (j >= 0 && (table[j] as [number, number])[0] > cur[0]) {
        table[j + 1] = table[j] as [number, number];
        j--;
      }
      table[j + 1] = cur;
    }
  }

  getVoltageForSoc(socFrac: number): number {
    const socPct = socFrac * 100;
    if (socPct < 0) {
      // over-discharged: extrapolate linearly using the slope between 0% and 10%
      const v0 = this.interpSocTable(0);
      const v10 = this.interpSocTable(10);
      const slope = (v10 - v0) / 10; // volts per percent SOC
      return v0 + slope * 3 * socPct;
    }
    return this.interpSocTable(socPct);
  }

  interpSocTable(socPct: number): number {
    const t = this.socTable;
    const n = t.length;
    if (n === 0) return 3.7;
    const first = t[0] as [number, number];
    const last = t[n - 1] as [number, number];
    if (n === 1) return first[1];
    if (socPct <= first[0]) return first[1];
    if (socPct >= last[0]) return last[1];
    for (let i = 0; i < n - 1; i++) {
      const a = t[i] as [number, number];
      const b = t[i + 1] as [number, number];
      if (socPct >= a[0] && socPct <= b[0]) {
        if (b[0] === a[0]) return a[1];
        const frac = (socPct - a[0]) / (b[0] - a[0]);
        return a[1] + frac * (b[1] - a[1]);
      }
    }
    return last[1];
  }

  override setVoltageSource(n: number, v: VoltageSource): void {
    super.setVoltageSource(n, v);
    v.setNodes(this.nodes[0], this.nodes[2]);
  }

  override stamp(): void {
    const sim = this.sim;
    const nodes = this.nodes;
    sim.stampVoltageSource(nodes[0], nodes[2], this.voltSource);
    sim.stampResistor(nodes[2], nodes[3], this.r0);
    sim.stampResistor(nodes[3], nodes[1], this.r1);
    // DC operating point: the capacitor becomes a 100M resistor; otherwise its trapezoidal
    // companion model, a resistor in parallel with a current source
    this.compResistance = this.doDcAnalysis() ? 1e8 : sim.timeStep / (2 * this.c1);
    sim.stampResistor(nodes[3], nodes[1], this.compResistance);
    sim.stampRightSide(nodes[3]);
    sim.stampRightSide(nodes[1]);
  }

  override startIteration(): void {
    if (this.doDcAnalysis()) this.curSourceValue = 0;
    else this.curSourceValue = -this.capVoltDiff / this.compResistance - this.capCurrent;
  }

  override doStep(): void {
    const sim = this.sim;
    const nodes = this.nodes;
    sim.updateVoltageSource(nodes[0], nodes[2], this.voltSource, this.getVoltageForSoc(this.soc));
    sim.stampCurrentSource(nodes[3], nodes[1], this.curSourceValue);
  }

  override stepFinished(): void {
    this.capVoltDiff = this.volts[3] - this.volts[1];
    if (this.compResistance > 0)
      this.capCurrent = this.capVoltDiff / this.compResistance + this.curSourceValue;
    // coulomb counting: "current" (the internal source's) is positive while discharging
    if (this.capacityAh > 0 && !this.doDcAnalysis()) {
      this.soc -= (this.current * this.sim.timeStep) / (3600 * this.capacityAh);
      // no lower clamp: below 0% the voltage table is extrapolated (see getVoltageForSoc)
      if (this.soc > 1) this.soc = 1;
    }
  }

  override getPower(): number {
    return -this.getVoltageDiff() * this.current;
  }
  override getVoltageDiff(): number {
    return this.volts[1] - this.volts[0];
  }

  /** SOC as a whole percentage. */
  getSocText(): string {
    return String(Math.round(this.soc * 100)) + '%';
  }

  getBatteryTypeName(): string {
    return BATTERY_TYPE_NAMES[this.batteryType] ?? 'Custom';
  }

  override getElmType(): string {
    return 'battery';
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'battery (' + this.getBatteryTypeName() + ')';
    arr[1] = 'I = ' + getCurrentText(this.getCurrent());
    arr[2] = 'Vd = ' + getVoltageText(this.getVoltageDiff());
    arr[3] = 'SOC = ' + this.getSocText();
    arr[4] = 'P = ' + getUnitText(this.getPower(), 'W');
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0)
      return EditInfo.createChoice(
        'Battery Type',
        [...BATTERY_TYPE_NAMES, 'Custom'],
        this.batteryType === BatteryElm.BT_CUSTOM ? BATTERY_TYPE_NAMES.length : this.batteryType,
      );
    if (n === 1) return new EditInfo('Capacity (Ah)', this.capacityAh).setPositive();
    if (n === 2)
      return new EditInfo(
        'Initial State of Charge (%)',
        this.initialSoc * 100,
        0,
        100,
      ).setDimensionless();
    if (n === 3) return new EditInfo('R0, Ohmic Resistance (ohms)', this.r0).setPositive();
    if (n === 4) return new EditInfo('R1, Polarization Resistance (ohms)', this.r1).setPositive();
    if (n === 5) return new EditInfo('C1, Polarization Capacitance (F)', this.c1).setPositive();
    if (n === 6)
      return EditInfo.createCheckbox(
        'Show Voltage',
        (this.flags & BatteryElm.FLAG_SHOW_VOLTAGE) !== 0,
      );
    if (n === 7)
      return EditInfo.createCheckbox(
        'Show State of Charge',
        (this.flags & BatteryElm.FLAG_SHOW_SOC) !== 0,
      );
    if (n === 8 && this.batteryType === BatteryElm.BT_CUSTOM) {
      const ei = EditInfo.text('SOC(%) = Voltage Table', this.socVoltageTable);
      ei.multiline = true;
      return ei;
    }
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.choice !== null) {
      const oldType = this.batteryType;
      const sel = ei.choice.selected;
      this.batteryType = sel >= BATTERY_TYPE_NAMES.length ? BatteryElm.BT_CUSTOM : sel;
      if (this.batteryType !== BatteryElm.BT_CUSTOM) {
        this.socVoltageTable = BATTERY_TYPE_TABLES[this.batteryType] ?? '';
        if (this.batteryType !== oldType) {
          const d = BATTERY_TYPE_DEFAULTS[this.batteryType] ?? [2, 0.01, 0.02, 2000];
          this.capacityAh = d[0] ?? 2;
          this.r0 = d[1] ?? 0.01;
          this.r1 = d[2] ?? 0.02;
          this.c1 = d[3] ?? 2000;
        }
      } else if (oldType !== BatteryElm.BT_CUSTOM)
        this.socVoltageTable = BATTERY_TYPE_TABLES[oldType] ?? '';
      this.parseSocTable(null);
      if (this.batteryType !== oldType) ei.newDialog = true;
    }
    if (n === 1) this.capacityAh = ei.value;
    if (n === 2) this.initialSoc = Math.min(100, Math.max(0, ei.value)) * 0.01;
    if (n === 3) this.r0 = ei.value;
    if (n === 4) this.r1 = ei.value;
    if (n === 5) this.c1 = ei.value;
    if (n === 6 && ei.checkbox !== null)
      this.flags = ei.changeFlag(this.flags, BatteryElm.FLAG_SHOW_VOLTAGE);
    if (n === 7 && ei.checkbox !== null)
      this.flags = ei.changeFlag(this.flags, BatteryElm.FLAG_SHOW_SOC);
    if (n === 8) {
      this.socVoltageTable = ei.text ?? '';
      this.parseSocTable(ei);
    }
  }
}

export const BatteryElmType = elementType('BatteryElm', BatteryElm);
