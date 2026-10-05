// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ThermistorNTCElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { unescapeToken } from '../escape.ts';
import { parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentDText, getUnitText, getVoltageDText, OHM } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

const T0 = 273.15;
const T25 = T0 + 25;

/**
 * An NTC thermistor (Bill Collis, June 2015; model from the Vishay NTCLE100 datasheet, no self
 * heating). The temperature comes from a 0..100 slider in upstream's side panel; `sliderValue`
 * models that slider.
 */
export class ThermistorNTCElm extends CircuitElm {
  /** Slider position, 0.005 to 0.995. */
  position = 0.34;
  resistance = 0;
  minTempr = -40;
  maxTempr = 150;
  temperature = 0;
  r25 = 10000;
  r50 = 3605;
  rneg40 = 0;
  b25100 = 0;
  sliderText = '';
  sliderValue = 0;

  override getClassName(): string {
    return 'ThermistorNTCElm';
  }
  override getDumpType(): number {
    return 350;
  }

  override initNew(): void {
    this.minTempr = -40;
    this.maxTempr = 150;
    this.r25 = 10000; // default 10k thermistor e.g. NTCLE100E3010 Vishay
    this.r50 = 3605;
    this.position = 0.34; // 25 degC for -40 to 150 degC
    this.updateModel();
    this.sliderText = 'Temperature';
    this.createSlider();
  }

  override undump(st: StringTokenizer): void {
    this.r25 = parseJavaDouble(st.nextToken());
    this.r50 = parseJavaDouble(st.nextToken());
    this.minTempr = parseJavaDouble(st.nextToken());
    this.maxTempr = parseJavaDouble(st.nextToken());
    this.position = parseJavaDouble(st.nextToken());
    this.updateModel();
    this.sliderText = unescapeToken(st.nextToken());
    this.createSlider();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('r25', this.r25);
    w.dumpAttr('r50', this.r50);
    w.dumpAttr('mnt', this.minTempr);
    w.dumpAttr('mxt', this.maxTempr);
    w.dumpAttr('ps', this.position);
    w.dumpAttr('st', this.sliderText);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.r25 = r.parseDoubleAttr('r25', this.r25);
    this.r50 = r.parseDoubleAttr('r50', this.r50);
    this.minTempr = r.parseDoubleAttr('mnt', this.minTempr);
    this.maxTempr = r.parseDoubleAttr('mxt', this.maxTempr);
    this.position = r.parseDoubleAttr('ps', this.position);
    this.sliderText = r.parseStringAttr('st', this.sliderText);
    this.updateModel();
    this.createSlider();
  }

  /** Upstream repeats these four lines wherever a parameter changes. */
  updateModel(): void {
    this.rneg40 = this.calcResistance(this.minTempr); // for 10k ntc about 400k
    this.b25100 = this.calcB25100();
    this.temperature = this.temprFromSliderPos();
    this.resistance = this.calcResistance(this.temperature);
  }

  /** A new slider starts at the current position, unclamped (upstream Scrollbar constructor). */
  createSlider(): void {
    this.sliderValue = Math.trunc(this.position * 100);
  }

  override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    this.position = this.sliderValue * 0.0099 + 0.005;
    this.temperature = this.temprFromSliderPos();
    this.resistance = this.calcResistance(this.temperature);
  }

  override calculateCurrent(): void {
    this.current = (this.volts[0] - this.volts[1]) / this.resistance;
  }

  override stamp(): void {
    this.temperature = this.temprFromSliderPos();
    this.resistance = this.calcResistance(this.temperature);
    this.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'thermistor';
    arr[1] = 'I = ' + getCurrentDText(this.current);
    arr[2] = 'Vd = ' + getVoltageDText(this.getVoltageDiff());
    arr[3] = 'R = ' + getUnitText(this.resistance, OHM);
    arr[4] = 'P = ' + getUnitText(this.getPower(), 'W');
    arr[5] = 'T = ' + getUnitText(this.temperature, '°C');
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('R at 25°C', this.r25, this.r50 + 100, 100000);
    if (n === 1) return new EditInfo('R at 50°C', this.r50, 100, this.r25 - 100);
    if (n === 2) return new EditInfo('Slider min temp (°C)', this.minTempr, -40, this.maxTempr);
    if (n === 3) return new EditInfo('Slider max temp (°C)', this.maxTempr, this.minTempr, 150);
    if (n === 4) {
      const ei = new EditInfo('Slider Text', 0, -1, -1);
      ei.text = this.sliderText;
      return ei;
    }
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.r25 = ei.value;
    if (n === 1) this.r50 = ei.value;
    if (n === 2) this.minTempr = ei.value;
    if (n === 3) this.maxTempr = ei.value;
    // upstream also relabels the slider; the slider UI reads sliderText
    if (n === 4) this.sliderText = ei.text ?? '';
    this.updateModel();
  }

  calcResistance(tempr: number): number {
    return Math.round(this.r25 * Math.exp(this.b25100 * (1 / (tempr + T0) - 1 / T25)));
  }

  temprFromSliderPos(): number {
    return Math.round(this.position * (this.maxTempr - this.minTempr) + this.minTempr);
  }

  /** B constant from R at 25 and 50 degC (R25=10000 and R50=3605 give 3932). */
  calcB25100(): number {
    const kelvin1 = T0 + 25;
    const kelvin2 = T0 + 50;
    return (Math.log(this.r25) - Math.log(this.r50)) / (1 / kelvin1 - 1 / kelvin2);
  }
}

export const ThermistorNTCElmType = elementType('ThermistorNTCElm', ThermistorNTCElm);
