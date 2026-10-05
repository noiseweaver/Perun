// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/LDRElm.java (master) at
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

/**
 * A light-dependent resistor. Upstream sets the light level with a 0..100 slider in the side
 * panel; `sliderValue` models that slider, and setPoints() reads the position back from it.
 */
export class LDRElm extends CircuitElm {
  /** Slider position, 0.0001 to 0.9901. */
  position = 0.34;
  resistance = 0;
  minLux = 0.1; // dark
  maxLux = 10000; // sunlight
  lux = 0;
  sliderText = '';
  sliderValue = 0;

  override getClassName(): string {
    return 'LDRElm';
  }
  override getDumpType(): number {
    return 374;
  }

  override initNew(): void {
    this.position = 0.34;
    this.lux = this.luxFromSliderPos();
    this.resistance = this.calcResistance(this.lux);
    this.sliderText = 'Light Brightness';
    this.createSlider();
  }

  override undump(st: StringTokenizer): void {
    this.position = parseJavaDouble(st.nextToken());
    this.lux = this.luxFromSliderPos();
    this.resistance = this.calcResistance(this.lux);
    this.sliderText = unescapeToken(st.nextToken());
    this.createSlider();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('ps', this.position);
    w.dumpAttr('st', this.sliderText);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.position = r.parseDoubleAttr('ps', this.position);
    this.sliderText = r.parseStringAttr('st', this.sliderText);
    this.lux = this.luxFromSliderPos();
    this.resistance = this.calcResistance(this.lux);
    // Scrollbar.setValue clamps to the slider range
    this.sliderValue = Math.min(Math.max(Math.trunc(this.position * 100), 0), 100);
  }

  /** A new slider starts at the current position, unclamped (upstream Scrollbar constructor). */
  createSlider(): void {
    this.sliderValue = Math.trunc(this.position * 100);
  }

  override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    this.position = this.sliderValue * 0.0099 + 0.0001;
    this.lux = this.luxFromSliderPos();
    this.resistance = this.calcResistance(this.lux);
  }

  override calculateCurrent(): void {
    this.current = (this.volts[0] - this.volts[1]) / this.resistance;
  }

  override stamp(): void {
    this.lux = this.luxFromSliderPos();
    this.resistance = this.calcResistance(this.lux);
    this.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'photoresistor';
    arr[1] = 'I = ' + getCurrentDText(this.current);
    arr[2] = 'Vd = ' + getVoltageDText(this.getVoltageDiff());
    arr[3] = 'R = ' + getUnitText(this.resistance, OHM);
    arr[4] = 'P = ' + getUnitText(this.getPower(), 'W');
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      const ei = new EditInfo('Slider Text', 0, -1, -1);
      ei.text = this.sliderText;
      return ei;
    }
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    // upstream also relabels the slider; the slider UI reads sliderText
    if (n === 0) this.sliderText = ei.text ?? '';
    this.lux = this.luxFromSliderPos();
    this.resistance = this.calcResistance(this.lux);
  }

  calcResistance(lux: number): number {
    return Math.round((this.maxLux - lux + 1) * 10);
  }

  luxFromSliderPos(): number {
    return this.maxLux * this.position + this.minLux;
  }
}

export const LDRElmType = elementType('LDRElm', LDRElm);
