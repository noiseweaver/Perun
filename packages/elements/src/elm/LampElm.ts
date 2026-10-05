// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/LampElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Point } from '@circuitjs-next/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt, parseJavaDouble } from '../java.ts';
import { UNITS_OHMS, VAL_R } from '../scope/constants.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText, OHM } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

const ROOM_TEMP = 300;

/** An incandescent lamp whose filament resistance follows its temperature. */
export class LampElm extends CircuitElm {
  static readonly FILAMENT_LEN = 24;

  resistance = 0;
  temp = 0;
  nom_pow = 0;
  nom_v = 0;
  warmTime = 0;
  coolTime = 0;
  bulbLead: Point[] = [];
  filament: Point[] = [];
  bulb: Point | null = null;
  bulbR = 20;

  override getClassName(): string {
    return 'LampElm';
  }
  override getDumpType(): number {
    return 181;
  }

  override initNew(): void {
    this.temp = ROOM_TEMP;
    this.nom_pow = 100;
    this.nom_v = 120;
    this.warmTime = 0.4;
    this.coolTime = 0.4;
    // upstream's constructor has its (zero) node voltages by now
    this.allocNodes();
    this.startIteration(); // set resistance
  }

  override undump(st: StringTokenizer): void {
    this.temp = parseJavaDouble(st.nextToken());
    if (Number.isNaN(this.temp)) this.temp = ROOM_TEMP;
    this.nom_pow = parseJavaDouble(st.nextToken());
    this.nom_v = parseJavaDouble(st.nextToken());
    this.warmTime = parseJavaDouble(st.nextToken());
    this.coolTime = parseJavaDouble(st.nextToken());
    this.allocNodes();
    this.startIteration(); // set resistance
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('te', this.temp);
    w.dumpAttr('np', this.nom_pow);
    w.dumpAttr('nv', this.nom_v);
    w.dumpAttr('wa', this.warmTime);
    w.dumpAttr('co', this.coolTime);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.temp = r.parseDoubleAttr('te', this.temp);
    this.nom_pow = r.parseDoubleAttr('np', this.nom_pow);
    this.nom_v = r.parseDoubleAttr('nv', this.nom_v);
    this.warmTime = r.parseDoubleAttr('wa', this.warmTime);
    this.coolTime = r.parseDoubleAttr('co', this.coolTime);
  }

  override reset(): void {
    super.reset();
    this.temp = ROOM_TEMP;
    this.startIteration(); // set resistance
  }

  override setPoints(): void {
    super.setPoints();
    const llen = 16;
    this.calcLeads(llen);
    const fl = LampElm.FILAMENT_LEN;
    this.bulbR = 20;
    this.filament = [
      this.interpPointPerp(this.lead1, this.lead2, 0, fl),
      this.interpPointPerp(this.lead1, this.lead2, 1, fl),
    ];
    const br = fl - Math.sqrt(this.bulbR * this.bulbR - llen * llen);
    this.bulbLead = [
      this.interpPointPerp(this.lead1, this.lead2, 0, br),
      this.interpPointPerp(this.lead1, this.lead2, 1, br),
    ];
    this.bulb = this.interpPoint(this.filament[0], this.filament[1], 0.5);
  }

  /** The filament's glow at its temperature, 0..255 (circuit data, not styling). */
  getTempColor(): [number, number, number] {
    const t = this.temp;
    if (t < 1200) return [Math.max(0, javaDoubleToInt((255 * (t - 800)) / 400)), 0, 0];
    if (t < 1700) return [255, Math.max(0, javaDoubleToInt((255 * (t - 1200)) / 500)), 0];
    if (t < 2400) return [255, 255, Math.max(0, javaDoubleToInt((255 * (t - 1700)) / 700))];
    return [255, 255, 255];
  }

  override calculateCurrent(): void {
    this.current = (this.volts[0] - this.volts[1]) / this.resistance;
    if (this.resistance === 0) this.current = 0;
  }

  override stamp(): void {
    this.sim.stampNonLinear(this.nodes[0]);
    this.sim.stampNonLinear(this.nodes[1]);
  }

  override nonLinear(): boolean {
    return true;
  }

  override startIteration(): void {
    // based on http://www.intusoft.com/nlpdf/nl11.pdf
    const nom_r = (this.nom_v * this.nom_v) / this.nom_pow;
    // this formula doesn't work for values over 5390
    const tp = this.temp > 5390 ? 5390 : this.temp;
    this.resistance =
      nom_r * (1.26104 - 4.90662 * Math.sqrt(17.1839 / tp - 0.00318794) - 7.8569 / (tp - 187.56));
    const cap = 1.57e-4 * this.nom_pow;
    const capw = (cap * this.warmTime) / 0.4;
    const capc = (cap * this.coolTime) / 0.4;
    this.temp += (this.getPower() * this.sim.timeStep) / capw;
    const cr = 2600 / this.nom_pow;
    this.temp -= (this.sim.timeStep * (this.temp - ROOM_TEMP)) / (capc * cr);
  }

  override doStep(): void {
    this.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'lamp';
    this.getBasicInfo(arr);
    arr[3] = 'R = ' + getUnitText(this.resistance, OHM);
    arr[4] = 'P = ' + getUnitText(this.getPower(), 'W');
    arr[5] = 'T = ' + javaDoubleToInt(this.temp) + ' K';
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Nominal Power', this.nom_pow, 0, 0).setPositive();
    if (n === 1)
      return new EditInfo('Nominal Voltage', this.nom_v, 0, 0).setPositive().setUnitStep();
    if (n === 2) return new EditInfo('Warmup Time (s)', this.warmTime, 0, 0).setPositive();
    if (n === 3) return new EditInfo('Cooldown Time (s)', this.coolTime, 0, 0).setPositive();
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.value > 0) this.nom_pow = ei.value;
    if (n === 1 && ei.value > 0) this.nom_v = ei.value;
    if (n === 2 && ei.value > 0) this.warmTime = ei.value;
    if (n === 3 && ei.value > 0) this.coolTime = ei.value;
  }

  override getScopeValue(x: number): number {
    return x === VAL_R ? this.resistance : super.getScopeValue(x);
  }
  override getScopeUnits(x: number): number {
    return x === VAL_R ? UNITS_OHMS : super.getScopeUnits(x);
  }
  override canShowValueInScope(x: number): boolean {
    return x === VAL_R;
  }
}

export const LampElmType = elementType('LampElm', LampElm);
