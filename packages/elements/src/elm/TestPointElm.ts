// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/TestPointElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { unescapeToken } from '../escape.ts';
import { parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText, showFormat } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

export const TP_VOL = 0;
export const TP_RMS = 1;
export const TP_MAX = 2;
export const TP_MIN = 3;
export const TP_P2P = 4;
export const TP_BIN = 5;
export const TP_FRQ = 6;
export const TP_PER = 7;
export const TP_PWI = 8;
/** Mark to space ratio. */
export const TP_DUT = 9;
export const TP_AVG = 10;

/** The meters the edit dialog offers, in its order. */
const METER_CHOICES = [TP_VOL, TP_RMS, TP_AVG, TP_MAX, TP_MIN, TP_P2P, TP_BIN];

/**
 * A one-post test point that measures its node: voltage, RMS, average, peaks, peak to peak or a
 * binary level, tracked cycle by cycle.
 */
export class TestPointElm extends CircuitElm {
  static readonly FLAG_LABEL = 1;

  meter = TP_VOL;
  label = 'TP';
  zerocount = 0;
  rmsV = 0;
  total = 0;
  count = 0;
  avgV = 0;
  totalV = 0;
  maxV = 0;
  lastMaxV = 0;
  minV = 0;
  lastMinV = 0;
  frequency = 0;
  period = 0;
  /** 0 or 1. */
  binaryLevel = 0;
  pulseWidth = 0;
  dutyCycle = 0;
  selectedValue = 0;
  lastStepCount = 0;
  increasingV = true;
  decreasingV = true;
  started = false;
  periodStart = 0;
  periodLength = 0;
  pulseStart = 0;

  override getClassName(): string {
    return 'TestPointElm';
  }
  override getDumpType(): number {
    return 368;
  }
  override getPostCount(): number {
    return 1;
  }

  override undump(st: StringTokenizer): void {
    this.meter = parseJavaInt(st.nextToken());
    if (this.hasFlag(TestPointElm.FLAG_LABEL)) this.label = unescapeToken(st.nextToken());
    else this.label = 'TP';
  }

  override reset(): void {
    super.reset();
    this.zerocount = 0;
    this.rmsV = this.total = this.count = 0;
    this.avgV = this.totalV = 0;
    this.maxV = this.lastMaxV = 0;
    this.minV = this.lastMinV = 0;
    this.binaryLevel = 0;
    this.period = this.pulseWidth = this.dutyCycle = 0;
    this.selectedValue = 0;
    this.periodStart = this.periodLength = this.pulseStart = 0;
    this.increasingV = true;
    this.decreasingV = true;
    this.started = false;
    this.lastStepCount = 0;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('me', this.meter);
    if (this.label !== 'TP') w.dumpAttr('lb', this.label);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.meter = r.parseIntAttr('me', this.meter);
    this.label = r.parseStringAttr('lb', 'TP');
  }

  getMeter(): string {
    switch (this.meter) {
      case TP_VOL:
        return 'V';
      case TP_RMS:
        return 'V(rms)';
      case TP_AVG:
        return 'V(avg)';
      case TP_MAX:
        return 'Vmax';
      case TP_MIN:
        return 'Vmin';
      case TP_P2P:
        return 'Peak to peak';
      case TP_BIN:
        return 'Binary';
      case TP_FRQ:
        return 'Frequency';
      case TP_PER:
        return 'Period';
      case TP_PWI:
        return 'Pulse width';
      case TP_DUT:
        return 'Duty cycle';
    }
    return '';
  }

  /** End the current cycle: RMS and average over it, then start counting again. */
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

  override stepFinished(): void {
    const sim = this.sim;
    if (sim.timeStepCount === this.lastStepCount) return;
    this.lastStepCount = sim.timeStepCount;
    const v = this.volts[0];
    this.count++; // how many counts are in a cycle
    this.total += v * v; // sum of squares
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
      // change of direction, V now going down: at start of waveform
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
      // change of direction, V now going up
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
    this.selectedValue = this.meterValue(this.meter);
  }

  meterValue(m: number): number {
    switch (m) {
      case TP_VOL:
        return this.volts[0];
      case TP_RMS:
        return this.rmsV;
      case TP_AVG:
        return this.avgV;
      case TP_MAX:
        return this.lastMaxV;
      case TP_MIN:
        return this.lastMinV;
      case TP_P2P:
        return this.lastMaxV - this.lastMinV;
      case TP_BIN:
        return this.binaryLevel;
      case TP_FRQ:
        return this.frequency;
      case TP_PER:
        return this.period;
      case TP_PWI:
        return this.pulseWidth;
      case TP_DUT:
        return this.dutyCycle;
    }
    return this.selectedValue;
  }

  override getScopeValue(_x: number): number {
    return this.selectedValue;
  }

  override getVoltageDiff(): number {
    return this.volts[0];
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'Test Point';
    let i = 1;
    arr[i++] = this.getMeterLine(this.meter);
    // the other tracked values, skipping the selected one (frequency is never computed, and the
    // binary value makes room for the average)
    for (const m of [TP_VOL, TP_MAX, TP_MIN, TP_RMS, TP_AVG, TP_P2P, TP_PER, TP_PWI, TP_DUT])
      if (this.meter !== m) arr[i++] = this.getMeterLine(m);
  }

  getMeterLine(m: number): string {
    switch (m) {
      case TP_VOL:
        return 'V = ' + getUnitText(this.volts[0], 'V');
      case TP_RMS:
        return 'V(rms) = ' + getUnitText(this.rmsV, 'V');
      case TP_AVG:
        return 'V(avg) = ' + getUnitText(this.avgV, 'V');
      case TP_MAX:
        return 'Vmax = ' + getUnitText(this.lastMaxV, 'Vpk');
      case TP_MIN:
        return 'Vmin = ' + getUnitText(this.lastMinV, 'Vmin');
      case TP_P2P:
        return 'Vp2p = ' + getUnitText(this.lastMaxV - this.lastMinV, 'Vp2p');
      case TP_BIN:
        return 'Binary:' + String(this.binaryLevel);
      case TP_FRQ:
        return 'Freq = ' + getUnitText(this.frequency, 'Hz');
      case TP_PER:
        return 'Period = ' + getUnitText(this.period, 's');
      case TP_PWI:
        return 'Pulse width = ' + getUnitText(this.pulseWidth, 's');
      case TP_DUT:
        return 'Duty cycle = ' + showFormat(this.dutyCycle);
    }
    return '';
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      const ei = EditInfo.createChoice(
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
      ei.value = this.selectedValue;
      return ei;
    }
    if (n === 1) {
      const ei = new EditInfo('Label', 0, -1, -1);
      ei.text = this.label;
      return ei;
    }
    return null;
  }

  meterChoiceIndex(m: number): number {
    const i = METER_CHOICES.indexOf(m);
    return i < 0 ? 0 : i;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.choice !== null) this.meter = METER_CHOICES[ei.choice.selected] ?? TP_VOL;
    if (n === 1) this.label = ei.text ?? '';
  }
}

export const TestPointElmType = elementType('TestPointElm', TestPointElm);
