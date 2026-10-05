// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ACRailElm.java, SquareRailElm.java,
// ClockElm.java, NoiseElm.java, AntennaElm.java, ExtVoltageElm.java and VarRailElm.java (master)
// at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType, type ElementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { unescapeToken } from '../escape.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { RailElm } from './RailElm.ts';
import { VoltageElm } from './VoltageElm.ts';

const pi = Math.PI;

/** A/C rail from the menu; saved as a RailElm. */
export class ACRailElm extends RailElm {
  override getClassName(): string {
    return 'ACRailElm';
  }
  override initNew(): void {
    this.initWaveform(VoltageElm.WF_AC);
    this.maxVoltage = 120 * Math.sqrt(2);
  }
  override getShortcut(): number {
    return 0;
  }
}

/** Square wave rail from the menu; saved as a RailElm. */
export class SquareRailElm extends RailElm {
  override getClassName(): string {
    return 'SquareRailElm';
  }
  override initNew(): void {
    this.initWaveform(VoltageElm.WF_SQUARE);
  }
  override getShortcut(): number {
    return 0;
  }
}

/** Clock: a 0..5 V square wave rail labeled CLK; saved as a RailElm with FLAG_CLOCK. */
export class ClockElm extends RailElm {
  override getClassName(): string {
    return 'ClockElm';
  }
  override initNew(): void {
    this.initWaveform(VoltageElm.WF_SQUARE);
    this.maxVoltage = 2.5;
    this.bias = 2.5;
    this.frequency = 100;
    this.flags |= RailElm.FLAG_CLOCK;
  }
  override getShortcut(): number {
    return 0;
  }
}

/** Noise rail. Saved as a RailElm; old files used dump type `n`, which still loads as this. */
export class NoiseElm extends RailElm {
  override getClassName(): string {
    return 'NoiseElm';
  }
  override initNew(): void {
    this.initWaveform(VoltageElm.WF_NOISE);
  }
  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.waveform = VoltageElm.WF_NOISE;
  }
  override getShortcut(): number {
    return 0;
  }
}

/** An amplified antenna: a fixed mix of AM and FM signals. */
export class AntennaElm extends RailElm {
  fmphase = 0;

  override getClassName(): string {
    return 'AntennaElm';
  }
  override getDumpType(): number {
    return 'A'.charCodeAt(0);
  }
  override initNew(): void {
    this.initWaveform(VoltageElm.WF_AC);
  }
  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.waveform = VoltageElm.WF_AC;
  }

  override railLabel(): string | null {
    return 'Ant';
  }

  override getVoltage(): number {
    const t = this.sim.t;
    const fm = 3 * Math.sin(this.fmphase);
    return (
      Math.sin(2 * pi * t * 3000) * (1.3 + Math.sin(2 * pi * t * 12)) * 3 +
      Math.sin(2 * pi * t * 2710) * (1.3 + Math.sin(2 * pi * t * 13)) * 3 +
      Math.sin(2 * pi * t * 2433) * (1.3 + Math.sin(2 * pi * t * 14)) * 3 +
      fm
    );
  }

  override stepFinished(): void {
    this.fmphase += 2 * pi * (2200 + Math.sin(2 * pi * this.sim.t * 13) * 100) * this.sim.timeStep;
  }

  override getShortcut(): number {
    return 0;
  }

  override getInfo(arr: string[]): void {
    super.getInfo(arr);
    arr[0] = 'Antenna (amplified)';
  }

  override getEditInfo(_n: number): EditInfo | null {
    return null;
  }
}

/** A rail whose voltage is set from JavaScript (upstream's `setExtVoltage` API), by name. */
export class ExtVoltageElm extends RailElm {
  name = 'ext';
  voltage = 0;

  override getClassName(): string {
    return 'ExtVoltageElm';
  }
  override getDumpType(): number {
    return 418;
  }
  override initNew(): void {
    this.initWaveform(VoltageElm.WF_AC);
    this.name = 'ext';
  }
  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.name = unescapeToken(st.nextToken());
    this.waveform = VoltageElm.WF_AC;
  }
  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('nm', this.name);
  }
  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.name = r.parseStringAttr('nm', this.name);
  }

  override railLabel(): string | null {
    return this.name;
  }

  setVoltage(v: number): void {
    if (!Number.isNaN(v)) this.voltage = v;
  }
  getName(): string {
    return this.name;
  }
  override getVoltage(): number {
    return this.voltage;
  }

  override getShortcut(): number {
    return 0;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return EditInfo.text('Name', this.name);
    return null;
  }
  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.name = ei.text ?? '';
  }

  override getElmType(): string {
    return 'ext. voltage';
  }
  override getInfo(arr: string[]): void {
    super.getInfo(arr);
    arr[0] = 'ext. voltage (' + this.name + ')';
  }
}

/**
 * A rail set by its own slider. The slider holds a whole number 0..100 between the min voltage
 * (`bias`) and `maxVoltage`; `frequency` stores the voltage it last gave, as upstream saves it.
 */
export class VarRailElm extends RailElm {
  sliderText = 'Voltage';
  /** Upstream's `Scrollbar` value: an int, not clamped when set from a file. */
  sliderValue = 0;

  override getClassName(): string {
    return 'VarRailElm';
  }
  override getDumpType(): number {
    return 172;
  }

  override initNew(): void {
    this.initWaveform(VoltageElm.WF_VAR);
    this.sliderText = 'Voltage';
    this.frequency = this.maxVoltage;
    this.createSlider();
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    let text = st.nextToken();
    while (st.hasMoreTokens()) text += ' ' + st.nextToken();
    this.sliderText = text.replace(/%2[bB]/g, '+');
    this.createSlider();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('st', this.sliderText);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.sliderText = r.parseStringAttr('st', this.sliderText);
    this.sliderValue = this.sliderFromVoltage();
  }

  private sliderFromVoltage(): number {
    return javaDoubleToInt(((this.frequency - this.bias) * 100) / (this.maxVoltage - this.bias));
  }

  createSlider(): void {
    this.waveform = VoltageElm.WF_VAR;
    this.sliderValue = this.sliderFromVoltage();
  }

  /** Move the slider (upstream `Scrollbar.setValue`, which clamps to 0..100). */
  setSliderValue(v: number): void {
    this.sliderValue = Math.max(0, Math.min(100, Math.round(v)));
  }

  override getVoltage(): number {
    this.frequency = (this.sliderValue * (this.maxVoltage - this.bias)) / 100 + this.bias;
    return this.frequency;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Min Voltage', this.bias, -20, 20).setUnitStep();
    if (n === 1) return new EditInfo('Max Voltage', this.maxVoltage, -20, 20).setUnitStep();
    if (n === 2) return EditInfo.text('Slider Text', this.sliderText);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.bias = ei.value;
    if (n === 1) this.maxVoltage = ei.value;
    if (n === 2) this.sliderText = ei.text ?? '';
  }

  override getShortcut(): number {
    return 0;
  }
}

export const ACRailElmType = elementType('ACRailElm', ACRailElm);
export const SquareRailElmType = elementType('SquareRailElm', SquareRailElm);
export const ClockElmType = elementType('ClockElm', ClockElm);
export const NoiseElmType = elementType('NoiseElm', NoiseElm);
export const AntennaElmType = elementType('AntennaElm', AntennaElm);
export const ExtVoltageElmType = elementType('ExtVoltageElm', ExtVoltageElm);
export const VarRailElmType: ElementType = elementType('VarRailElm', VarRailElm);
