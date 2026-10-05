// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/AudioOutputElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt, parseJavaDouble, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

const samplingRateChoices = [8000, 11025, 16000, 22050, 44100, 48000];

/** Upstream `AudioOutputElm.lastSamplingRate`. */
let lastSamplingRate = 8000;
/** Upstream `okToChangeTimeStep`: the user already agreed to a timestep change. */
let okToChangeTimeStep = false;

/** Records the voltage at its post so it can be played as sound. */
export class AudioOutputElm extends CircuitElm {
  /**
   * Plays 16-bit samples (upstream `playJS`); set by the app. Null (no audio) does nothing.
   */
  static player: ((samples: Int16Array, samplingRate: number) => void) | null = null;
  /** Asked before changing the timestep (upstream `Window.confirm`); null (no UI) declines. */
  static confirmAdjustTimestep: ((message: string) => boolean) | null = null;

  dataCount = 0;
  dataPtr = 0;
  data = new Float64Array(0);
  dataFull = false;
  samplingRate = 0;
  labelNum = 0;
  duration = 0;
  sampleStep = 0;
  dataStart = 0;
  dataSampleCount = 0;
  nextDataSample = 0;
  dataSample = 0;

  override getClassName(): string {
    return 'AudioOutputElm';
  }
  override getDumpType(): number {
    return 211;
  }
  override getXmlDumpType(): string {
    return 'aout';
  }

  override initNew(): void {
    this.duration = 1;
    this.samplingRate = lastSamplingRate;
    this.labelNum = this.getNextLabelNum();
    this.setDataCount();
  }

  override undump(st: StringTokenizer): void {
    this.duration = parseJavaDouble(st.nextToken());
    this.samplingRate = parseJavaInt(st.nextToken());
    this.labelNum = parseJavaInt(st.nextToken());
    this.setDataCount();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('du', this.duration);
    w.dumpAttr('sa', this.samplingRate);
    w.dumpAttr('la', this.labelNum);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.duration = r.parseDoubleAttr('du', this.duration);
    this.samplingRate = r.parseIntAttr('sa', this.samplingRate);
    this.labelNum = r.parseIntAttr('la', this.labelNum);
    this.setDataCount();
  }

  override draggingDone(): void {
    this.setTimeStep();
  }

  /** The next unused label number. */
  getNextLabelNum(): number {
    let num = 1;
    for (const ce of this.sim.elements) {
      if (!(ce instanceof AudioOutputElm)) continue;
      if (ce.labelNum >= num) num = ce.labelNum + 1;
    }
    return num;
  }

  /** The label drawn at the end of the lead. */
  getLabel(): string {
    return this.labelNum > 1 ? 'Audio ' + this.labelNum : 'Audio Out';
  }

  override getPostCount(): number {
    return 1;
  }

  override reset(): void {
    this.dataPtr = 0;
    this.dataFull = false;
    this.dataSampleCount = 0;
    this.nextDataSample = 0;
    this.dataSample = 0;
  }

  override getVoltageDiff(): number {
    return this.volts[0];
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'audio output';
    arr[1] = 'V = ' + getVoltageText(this.volts[0]);
    const ct = this.dataFull ? this.dataCount : this.dataPtr;
    const dur = this.sampleStep * ct;
    arr[2] =
      'start = ' + getUnitText(this.dataFull ? this.sim.t - this.duration : this.dataStart, 's');
    arr[3] = 'dur = ' + getUnitText(dur, 's');
    arr[4] = 'samples = ' + ct + (this.dataFull ? '' : '/' + this.dataCount);
  }

  override stepFinished(): void {
    this.dataSample += this.volts[0];
    this.dataSampleCount++;
    if (this.sim.t >= this.nextDataSample) {
      this.nextDataSample += this.sampleStep;
      this.data[this.dataPtr++] = this.dataSample / this.dataSampleCount;
      this.dataSampleCount = 0;
      this.dataSample = 0;
      if (this.dataPtr >= this.dataCount) {
        this.dataPtr = 0;
        this.dataFull = true;
      }
    }
  }

  setDataCount(): void {
    this.dataCount = javaDoubleToInt(this.samplingRate * this.duration);
    this.data = new Float64Array(this.dataCount);
    this.dataStart = this.sim.t;
    this.dataPtr = 0;
    this.dataFull = false;
    this.sampleStep = 1 / this.samplingRate;
    this.nextDataSample = this.sim.t + this.sampleStep;
  }

  /** How far the recording buffer is filled, 0 to 1 (drawn behind the label). */
  fillFraction(): number {
    return this.dataFull ? 1 : this.dataCount > 0 ? this.dataPtr / this.dataCount : 0;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Duration (s)', this.duration, 0, 5).setPositive();
    if (n === 1) {
      const sel = samplingRateChoices.indexOf(this.samplingRate);
      return EditInfo.createChoice(
        'Sampling Rate',
        samplingRateChoices.map((r) => String(r)),
        sel < 0 ? 0 : sel,
      );
    }
    // upstream's play button sits in the side panel; ours is in the element's dialog
    if (n === 2) return EditInfo.createButton('Play Audio', () => this.play());
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.value > 0) {
      this.duration = ei.value;
      this.setDataCount();
    }
    if (n === 1) {
      const nsr = samplingRateChoices[ei.choice?.selected ?? 0];
      if (nsr !== this.samplingRate) {
        this.samplingRate = nsr;
        lastSamplingRate = nsr;
        this.setDataCount();
        this.setTimeStep();
      }
    }
  }

  setTimeStep(): void {
    const target = this.sampleStep / 8;
    const sim = this.sim;
    if (sim.maxTimeStep !== target) {
      const ok =
        okToChangeTimeStep ||
        (AudioOutputElm.confirmAdjustTimestep?.(
          'Adjust timestep for best audio quality and performance?',
        ) ??
          false);
      if (ok) {
        sim.maxTimeStep = target;
        okToChangeTimeStep = true;
      }
    }
  }

  /**
   * The recorded samples, centred and scaled to a quarter of full scale with a 1/20 s fade at
   * each end, or null if less than 50 ms is recorded.
   */
  getPlaybackSamples(): Int16Array | null {
    let ct = this.dataPtr;
    let base = 0;
    if (this.dataFull) {
      ct = this.dataCount;
      base = this.dataPtr;
    }
    if (ct * this.sampleStep < 0.05) return null;

    // rescale data to maximize
    let max = -1e8;
    let min = 1e8;
    for (let i = 0; i !== ct; i++) {
      if (this.data[i] > max) max = this.data[i];
      if (this.data[i] < min) min = this.data[i];
    }
    const adj = -(max + min) / 2;
    const mult = (0.25 * 32766) / (max + adj);

    // fade in over 1/20 sec
    const fadeLen = Math.trunc(this.samplingRate / 20);
    const fadeOut = ct - fadeLen;
    const fadeMult = mult / fadeLen;
    const out = new Int16Array(ct);
    for (let i = 0; i !== ct; i++) {
      const fade = i < fadeLen ? i * fadeMult : i > fadeOut ? (ct - i) * fadeMult : mult;
      out[i] = javaDoubleToInt((this.data[(i + base) % this.dataCount] + adj) * fade);
    }
    return out;
  }

  play(): void {
    const samples = this.getPlaybackSamples();
    if (samples === null) {
      AudioOutputElm.notify?.(
        'Audio data is not ready yet.  Increase simulation speed to make data ready sooner.',
      );
      return;
    }
    AudioOutputElm.player?.(samples, this.samplingRate);
  }

  /** Shows a message (upstream `Window.alert`); set by the app. */
  static notify: ((message: string) => void) | null = null;
}

export const AudioOutputElmType = elementType('AudioOutputElm', AudioOutputElm);
