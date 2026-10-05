// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ProbeElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, with ts/ProbeElm.ts (dev-ts) at
// 7ec858d662d8be1d76d54241ba3a5c1d1c524f51 for the node-voltage model.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { SCALE_AUTO } from '../constants.ts';
import { parseJavaDouble, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { getUnitText, getUnitTextWithScale, getVoltageText, showFormat } from '../view/units.ts';

/**
 * Voltmeter between two posts, optionally with a finite input resistance. The measurement
 * statistics (RMS, min/max, period ...) are display only.
 */
export class ProbeElm extends CircuitElm {
  static readonly FLAG_SHOWVOLTAGE = 1;
  static readonly FLAG_CIRCLE = 2;
  static readonly TP_VOL = 0;
  static readonly TP_RMS = 1;
  static readonly TP_MAX = 2;
  static readonly TP_MIN = 3;
  static readonly TP_P2P = 4;
  static readonly TP_BIN = 5;
  static readonly TP_FRQ = 6;
  static readonly TP_PER = 7;
  static readonly TP_PWI = 8;
  /** Mark to space ratio. */
  static readonly TP_DUT = 9;
  static readonly TP_AVG = 10;

  meter = 0;
  scale = 0;
  resistance = 0;

  override getClassName(): string {
    return 'ProbeElm';
  }
  override getDumpType(): number {
    return 'p'.charCodeAt(0);
  }

  override initNew(): void {
    this.meter = ProbeElm.TP_VOL;
    // default for new elements
    this.flags = ProbeElm.FLAG_SHOWVOLTAGE | ProbeElm.FLAG_CIRCLE;
    this.scale = SCALE_AUTO;
    this.resistance = 1e7;
  }

  override undump(st: StringTokenizer): void {
    this.meter = ProbeElm.TP_VOL;
    this.scale = SCALE_AUTO;
    this.resistance = 0;
    try {
      this.meter = parseJavaInt(st.nextToken());
      this.scale = parseJavaInt(st.nextToken());
      this.resistance = parseJavaDouble(st.nextToken());
    } catch {
      // older files stop early
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('me', this.meter);
    w.dumpAttr('sc', this.scale);
    w.dumpAttr('re', this.resistance);
  }

  override undumpXml(r: XmlAttrReader): void {
    this.flags = 0;
    super.undumpXml(r);
    this.meter = r.parseIntAttr('me', this.meter);
    this.scale = r.parseIntAttr('sc', this.scale);
    this.resistance = r.parseDoubleAttr('re', 0);
  }

  override calculateCurrent(): void {
    this.current = this.resistance === 0 ? 0 : (this.volts[0] - this.volts[1]) / this.resistance;
  }

  override stamp(): void {
    if (this.resistance !== 0)
      this.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
  }

  override getConnection(_n1: number, _n2: number): boolean {
    return this.resistance !== 0;
  }

  mustShowVoltage(): boolean {
    return (this.flags & ProbeElm.FLAG_SHOWVOLTAGE) !== 0;
  }
  drawAsCircle(): boolean {
    return (this.flags & ProbeElm.FLAG_CIRCLE) !== 0;
  }

  // ---- measurement statistics (display only, updated once per maxTimeStep) -----------------

  rmsV = 0;
  total = 0;
  count = 0;
  avgV = 0;
  totalV = 0;
  /** 0 or 1; a double upstream because it is passed back to web pages. */
  binaryLevel = 0;
  zerocount = 0;
  maxV = 0;
  lastMaxV = 0;
  minV = 0;
  lastMinV = 0;
  frequency = 0;
  period = 0;
  pulseWidth = 0;
  dutyCycle = 0;
  increasingV = true;
  decreasingV = true;
  started = false;
  lastStepCount = 0;
  /** Simulated time between consecutive maximum values. */
  periodStart = 0;
  periodLength = 0;
  pulseStart = 0;

  override reset(): void {
    super.reset();
    this.zerocount = 0;
    this.rmsV = this.total = this.count = 0;
    this.avgV = this.totalV = 0;
    this.maxV = this.lastMaxV = 0;
    this.minV = this.lastMinV = 0;
    this.binaryLevel = 0;
    this.period = this.pulseWidth = this.dutyCycle = 0;
    this.periodStart = this.periodLength = this.pulseStart = 0;
    this.increasingV = true;
    this.decreasingV = true;
    this.started = false;
    this.lastStepCount = 0;
  }

  override stepFinished(): void {
    const sim = this.sim;
    if (sim.timeStepCount === this.lastStepCount) return;
    this.lastStepCount = sim.timeStepCount;
    // how many counts are in a cycle
    this.count++;
    const v = this.getVoltageDiff();
    // sum of squares
    this.total += v * v;
    this.totalV += v;

    // binary threshold is a fixed 2.5V (assumes ~5V logic levels)
    this.binaryLevel = v < 2.5 ? 0 : 1;

    if (!this.started) {
      // prime max/min tracking with the first sample instead of the stale defaults
      this.started = true;
      this.maxV = this.minV = v;
      this.increasingV = true;
      this.decreasingV = false;
      this.periodStart = this.pulseStart = sim.t;
    }

    // V going up, track maximum value
    if (v > this.maxV && this.increasingV) {
      this.maxV = v;
      this.increasingV = true;
      this.decreasingV = false;
    }
    if (v < this.maxV && this.increasingV) {
      // change of direction V now going down - at start of waveform
      this.lastMaxV = this.maxV;
      this.periodLength = sim.t - this.periodStart;
      this.periodStart = sim.t;
      this.period = this.periodLength;
      this.pulseWidth = sim.t - this.pulseStart;
      this.dutyCycle = this.pulseWidth / this.periodLength;
      this.minV = v;
      this.increasingV = false;
      this.decreasingV = true;
      this.endCycle();
    }
    if (v < this.minV && this.decreasingV) {
      // V going down, track minimum value
      this.minV = v;
      this.increasingV = false;
      this.decreasingV = true;
    }
    if (v > this.minV && this.decreasingV) {
      // change of direction V now going up
      this.lastMinV = this.minV;
      this.pulseStart = sim.t;
      this.maxV = v;
      this.increasingV = true;
      this.decreasingV = false;
      this.endCycle();
    }
    // need to zero the rms value if it stays at 0 for a while
    if (v === 0) {
      this.zerocount++;
      if (this.zerocount > 5) {
        this.total = 0;
        this.rmsV = 0;
        this.avgV = 0;
        this.maxV = 0;
        this.minV = 0;
      }
    } else this.zerocount = 0;
  }

  /** The rms and average bookkeeping both direction changes share upstream. */
  private endCycle(): void {
    this.total = this.total / this.count;
    this.rmsV = Math.sqrt(this.total);
    if (Number.isNaN(this.rmsV)) this.rmsV = 0;
    this.avgV = this.totalV / this.count;
    if (Number.isNaN(this.avgV)) this.avgV = 0;
    this.count = 0;
    this.total = 0;
    this.totalV = 0;
  }

  /** The text shown next to the probe for its meter setting (upstream `draw`). */
  meterValueText(): string {
    const scale = this.scale;
    switch (this.meter) {
      case ProbeElm.TP_VOL:
        return getUnitTextWithScale(this.getVoltageDiff(), 'V', scale);
      case ProbeElm.TP_RMS:
        return getUnitTextWithScale(this.rmsV, 'V(rms)', scale);
      case ProbeElm.TP_AVG:
        return getUnitTextWithScale(this.avgV, 'V(avg)', scale);
      case ProbeElm.TP_MAX:
        return getUnitTextWithScale(this.lastMaxV, 'Vpk', scale);
      case ProbeElm.TP_MIN:
        return getUnitTextWithScale(this.lastMinV, 'Vmin', scale);
      case ProbeElm.TP_P2P:
        return getUnitTextWithScale(this.lastMaxV - this.lastMinV, 'Vp2p', scale);
      case ProbeElm.TP_BIN:
        return String(this.binaryLevel);
      case ProbeElm.TP_FRQ:
        return getUnitText(this.frequency, 'Hz');
      case ProbeElm.TP_PWI:
        return getUnitText(this.pulseWidth, 's');
      case ProbeElm.TP_DUT:
        return showFormat(this.dutyCycle);
    }
    return '';
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'voltmeter';
    let i = 1;
    const m = this.meter;
    arr[i++] = this.getMeterLine(m);
    // the rest of the tracked values, skipping the selected one; frequency is never computed and
    // binary is left out to make room for average, as upstream
    for (const k of [
      ProbeElm.TP_VOL,
      ProbeElm.TP_MAX,
      ProbeElm.TP_MIN,
      ProbeElm.TP_RMS,
      ProbeElm.TP_AVG,
      ProbeElm.TP_P2P,
      ProbeElm.TP_PER,
      ProbeElm.TP_PWI,
      ProbeElm.TP_DUT,
    ])
      if (m !== k) arr[i++] = this.getMeterLine(k);
  }

  getMeterLine(m: number): string {
    switch (m) {
      case ProbeElm.TP_VOL:
        return 'Vd = ' + getVoltageText(this.getVoltageDiff());
      case ProbeElm.TP_RMS:
        return 'V(rms) = ' + getVoltageText(this.rmsV);
      case ProbeElm.TP_AVG:
        return 'V(avg) = ' + getVoltageText(this.avgV);
      case ProbeElm.TP_MAX:
        return 'Vmax = ' + getVoltageText(this.lastMaxV);
      case ProbeElm.TP_MIN:
        return 'Vmin = ' + getVoltageText(this.lastMinV);
      case ProbeElm.TP_P2P:
        return 'Vp2p = ' + getVoltageText(this.lastMaxV - this.lastMinV);
      case ProbeElm.TP_BIN:
        return 'Binary = ' + String(this.binaryLevel);
      case ProbeElm.TP_FRQ:
        return 'Freq = ' + getUnitText(this.frequency, 'Hz');
      case ProbeElm.TP_PER:
        return 'Period = ' + getUnitText(this.period, 's');
      case ProbeElm.TP_PWI:
        return 'Pulse width = ' + getUnitText(this.pulseWidth, 's');
      case ProbeElm.TP_DUT:
        return 'Duty cycle = ' + showFormat(this.dutyCycle);
    }
    return '';
  }

  override getElmType(): string {
    return 'voltmeter';
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return EditInfo.createCheckbox('Show Value', this.mustShowVoltage());
    if (n === 1) {
      // TP_AVG's value isn't contiguous with the other meter constants shown here (it was
      // appended after TP_DUT to avoid renumbering saved circuits), so map it explicitly.
      // Frequency, Period, Pulse Width and Duty Cycle are commented out upstream.
      return EditInfo.createChoice(
        'Value',
        [
          'Voltage',
          'RMS Voltage',
          'Average Voltage',
          'Max Voltage',
          'Min Voltage',
          'P2P Voltage',
          'Binary Value',
        ],
        this.meterChoiceIndex(this.meter),
      );
    }
    if (n === 2) return EditInfo.createChoice('Scale', ['Auto', 'V', 'mV', 'μV'], this.scale);
    if (n === 3) return EditInfo.createCheckbox('Use Circle Symbol', this.drawAsCircle());
    if (n === 4) return new EditInfo('Series Resistance (0 = infinite)', this.resistance);
    return null;
  }

  meterChoices(): number[] {
    return [
      ProbeElm.TP_VOL,
      ProbeElm.TP_RMS,
      ProbeElm.TP_AVG,
      ProbeElm.TP_MAX,
      ProbeElm.TP_MIN,
      ProbeElm.TP_P2P,
      ProbeElm.TP_BIN,
    ];
  }

  meterChoiceIndex(m: number): number {
    const choices = this.meterChoices();
    for (let i = 0; i !== choices.length; i++) if (choices[i] === m) return i;
    return 0;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      // upstream assigns (not ORs) the flag here, clearing FLAG_CIRCLE
      if (ei.checkbox?.state === true) this.flags = ProbeElm.FLAG_SHOWVOLTAGE;
      else this.flags &= ~ProbeElm.FLAG_SHOWVOLTAGE;
    }
    if (n === 1) this.meter = this.meterChoices()[ei.choice?.selected ?? 0];
    if (n === 2) this.scale = ei.choice?.selected ?? 0;
    if (n === 3) this.flags = ei.changeFlag(this.flags, ProbeElm.FLAG_CIRCLE);
    if (n === 4) this.resistance = ei.value;
  }
}

export const ProbeElmType = elementType('ProbeElm', ProbeElm);
