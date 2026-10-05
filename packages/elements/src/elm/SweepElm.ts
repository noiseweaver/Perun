// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/SweepElm.java, AMElm.java and
// FMElm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentDText, getCurrentText, getUnitText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

const pi = Math.PI;

/** One-terminal source referenced to ground: the part SweepElm, AMElm and FMElm share. */
abstract class GroundedSourceElm extends CircuitElm {
  override getPostCount(): number {
    return 1;
  }
  override getVoltageSourceCount(): number {
    return 1;
  }
  override stamp(): void {
    this.sim.stampVoltageSource(this.sim.ground, this.nodes[0], this.voltSource);
  }
  override getVoltageDiff(): number {
    return this.volts[0];
  }
  override validate(): boolean {
    return this.validateRailNode(0);
  }
  override hasGroundConnection(_n1: number): boolean {
    return true;
  }
  override getPower(): number {
    return -this.getVoltageDiff() * this.current;
  }
}

/** A sine wave whose frequency sweeps between two limits, linearly or logarithmically. */
export class SweepElm extends GroundedSourceElm {
  static readonly FLAG_LOG = 1;
  static readonly FLAG_BIDIR = 2;

  maxV = 5;
  maxF = 4000;
  minF = 20;
  sweepTime = 0.1;
  frequency = 0;
  fadd = 0;
  fmul = 0;
  freqTime = 0;
  savedTimeStep = 0;
  dir = 1;
  v = 0;

  override getClassName(): string {
    return 'SweepElm';
  }
  override getDumpType(): number {
    return 170;
  }
  override getXmlDumpType(): string {
    return 'sw';
  }

  override initNew(): void {
    this.minF = 20;
    this.maxF = 4000;
    this.maxV = 5;
    this.sweepTime = 0.1;
    this.flags = SweepElm.FLAG_BIDIR;
    this.reset();
  }

  override undump(st: StringTokenizer): void {
    this.minF = parseJavaDouble(st.nextToken());
    this.maxF = parseJavaDouble(st.nextToken());
    this.maxV = parseJavaDouble(st.nextToken());
    this.sweepTime = parseJavaDouble(st.nextToken());
    this.reset();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('mi', this.minF);
    w.dumpAttr('ma', this.maxF);
    w.dumpAttr('mv', this.maxV);
    w.dumpAttr('sw', this.sweepTime);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.minF = r.parseDoubleAttr('mi', this.minF);
    this.maxF = r.parseDoubleAttr('ma', this.maxF);
    this.maxV = r.parseDoubleAttr('mv', this.maxV);
    this.sweepTime = r.parseDoubleAttr('sw', this.sweepTime);
    this.reset();
  }

  setParams(): void {
    const ts = this.sim.timeStep;
    if (this.frequency < this.minF || this.frequency > this.maxF) {
      this.frequency = this.minF;
      this.freqTime = 0;
      this.dir = 1;
    }
    if ((this.flags & SweepElm.FLAG_LOG) === 0) {
      this.fadd = (this.dir * ts * (this.maxF - this.minF)) / this.sweepTime;
      this.fmul = 1;
    } else {
      this.fadd = 0;
      this.fmul = Math.pow(this.maxF / this.minF, (this.dir * ts) / this.sweepTime);
    }
    this.savedTimeStep = ts;
  }

  override reset(): void {
    this.frequency = this.minF;
    this.freqTime = 0;
    this.dir = 1;
    this.setParams();
  }

  override startIteration(): void {
    const sim = this.sim;
    // has timestep been changed?
    if (sim.timeStep !== this.savedTimeStep) this.setParams();
    this.v = Math.sin(this.freqTime) * this.maxV;
    this.freqTime += this.frequency * 2 * pi * sim.timeStep;
    this.frequency = this.frequency * this.fmul + this.fadd;
    if (this.frequency >= this.maxF && this.dir === 1) {
      if ((this.flags & SweepElm.FLAG_BIDIR) !== 0) {
        this.fadd = -this.fadd;
        this.fmul = 1 / this.fmul;
        this.dir = -1;
      } else this.frequency = this.minF;
    }
    if (this.frequency <= this.minF && this.dir === -1) {
      this.fadd = -this.fadd;
      this.fmul = 1 / this.fmul;
      this.dir = 1;
    }
  }

  override doStep(): void {
    this.sim.updateVoltageSource(this.sim.ground, this.nodes[0], this.voltSource, this.v);
  }

  override getElmType(): string {
    return 'sweep';
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'sweep ' + ((this.flags & SweepElm.FLAG_LOG) === 0 ? '(linear)' : '(log)');
    arr[1] = 'I = ' + getCurrentDText(this.getCurrent());
    arr[2] = 'V = ' + getVoltageText(this.volts[0]);
    arr[3] = 'f = ' + getUnitText(this.frequency, 'Hz');
    arr[4] = 'range = ' + getUnitText(this.minF, 'Hz') + ' .. ' + getUnitText(this.maxF, 'Hz');
    arr[5] = 'time = ' + getUnitText(this.sweepTime, 's');
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Min Frequency (Hz)', this.minF, 0, 0);
    if (n === 1) return new EditInfo('Max Frequency (Hz)', this.maxF, 0, 0);
    if (n === 2) return new EditInfo('Sweep Time (s)', this.sweepTime, 0, 0);
    if (n === 3)
      return EditInfo.createCheckbox('Logarithmic', (this.flags & SweepElm.FLAG_LOG) !== 0);
    if (n === 4) return new EditInfo('Max Voltage', this.maxV, 0, 0).setUnitStep();
    if (n === 5)
      return EditInfo.createCheckbox('Bidirectional', (this.flags & SweepElm.FLAG_BIDIR) !== 0);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    const maxfreq = 1 / (8 * this.sim.timeStep);
    if (n === 0) {
      this.minF = ei.value;
      if (this.minF > maxfreq) this.minF = maxfreq;
    }
    if (n === 1) {
      this.maxF = ei.value;
      if (this.maxF > maxfreq) this.maxF = maxfreq;
    }
    if (n === 2) this.sweepTime = ei.value;
    if (n === 3) this.flags = ei.changeFlag(this.flags, SweepElm.FLAG_LOG);
    if (n === 4) this.maxV = ei.value;
    if (n === 5) this.flags = ei.changeFlag(this.flags, SweepElm.FLAG_BIDIR);
    this.setParams();
  }
}

/** Amplitude-modulated sine (contributed upstream by Edward Calver). */
export class AMElm extends GroundedSourceElm {
  static readonly FLAG_COS = 2;
  carrierfreq = 1000;
  signalfreq = 40;
  maxVoltage = 5;
  freqTimeZero = 0;

  override getClassName(): string {
    return 'AMElm';
  }
  override getDumpType(): number {
    return 200;
  }

  override initNew(): void {
    this.maxVoltage = 5;
    this.carrierfreq = 1000;
    this.signalfreq = 40;
    this.reset();
  }

  override undump(st: StringTokenizer): void {
    this.carrierfreq = parseJavaDouble(st.nextToken());
    this.signalfreq = parseJavaDouble(st.nextToken());
    this.maxVoltage = parseJavaDouble(st.nextToken());
    if ((this.flags & AMElm.FLAG_COS) !== 0) this.flags &= ~AMElm.FLAG_COS;
    this.reset();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('cf', this.carrierfreq);
    w.dumpAttr('sf', this.signalfreq);
    w.dumpAttr('mv', this.maxVoltage);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.carrierfreq = r.parseDoubleAttr('cf', this.carrierfreq);
    this.signalfreq = r.parseDoubleAttr('sf', this.signalfreq);
    this.maxVoltage = r.parseDoubleAttr('mv', this.maxVoltage);
    this.reset();
  }

  override reset(): void {
    this.freqTimeZero = 0;
  }

  override doStep(): void {
    this.sim.updateVoltageSource(
      this.sim.ground,
      this.nodes[0],
      this.voltSource,
      this.getVoltage(),
    );
  }

  getVoltage(): number {
    const w = 2 * pi * (this.sim.t - this.freqTimeZero);
    return (
      ((Math.sin(w * this.signalfreq) + 1) / 2) * Math.sin(w * this.carrierfreq) * this.maxVoltage
    );
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'AM Source';
    arr[1] = 'I = ' + getCurrentText(this.getCurrent());
    arr[2] = 'V = ' + getVoltageText(this.getVoltageDiff());
    arr[3] = 'cf = ' + getUnitText(this.carrierfreq, 'Hz');
    arr[4] = 'sf = ' + getUnitText(this.signalfreq, 'Hz');
    arr[5] = 'Vmax = ' + getVoltageText(this.maxVoltage);
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Max Voltage', this.maxVoltage, -20, 20).setUnitStep();
    if (n === 1) return new EditInfo('Carrier Frequency (Hz)', this.carrierfreq, 4, 500);
    if (n === 2) return new EditInfo('Signal Frequency (Hz)', this.signalfreq, 4, 500);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.maxVoltage = ei.value;
    if (n === 1) this.carrierfreq = ei.value;
    if (n === 2) this.signalfreq = ei.value;
  }
}

/** Frequency-modulated sine (contributed upstream by Edward Calver). */
export class FMElm extends GroundedSourceElm {
  static readonly FLAG_COS = 2;
  carrierfreq = 800;
  signalfreq = 40;
  maxVoltage = 5;
  freqTimeZero = 0;
  deviation = 200;
  lasttime = 0;
  funcx = 0;

  override getClassName(): string {
    return 'FMElm';
  }
  override getDumpType(): number {
    return 201;
  }

  override initNew(): void {
    this.deviation = 200;
    this.maxVoltage = 5;
    this.carrierfreq = 800;
    this.signalfreq = 40;
    this.reset();
  }

  override undump(st: StringTokenizer): void {
    this.carrierfreq = parseJavaDouble(st.nextToken());
    this.signalfreq = parseJavaDouble(st.nextToken());
    this.maxVoltage = parseJavaDouble(st.nextToken());
    this.deviation = parseJavaDouble(st.nextToken());
    if ((this.flags & FMElm.FLAG_COS) !== 0) this.flags &= ~FMElm.FLAG_COS;
    this.reset();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('cf', this.carrierfreq);
    w.dumpAttr('sf', this.signalfreq);
    w.dumpAttr('mv', this.maxVoltage);
    w.dumpAttr('dv', this.deviation);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.carrierfreq = r.parseDoubleAttr('cf', this.carrierfreq);
    this.signalfreq = r.parseDoubleAttr('sf', this.signalfreq);
    this.maxVoltage = r.parseDoubleAttr('mv', this.maxVoltage);
    this.deviation = r.parseDoubleAttr('dv', this.deviation);
    this.reset();
  }

  override reset(): void {
    this.freqTimeZero = 0;
  }

  override doStep(): void {
    this.sim.updateVoltageSource(
      this.sim.ground,
      this.nodes[0],
      this.voltSource,
      this.getVoltage(),
    );
  }

  /** Integrates the frequency, so it changes state: upstream calls it once per subiteration. */
  getVoltage(): number {
    const t = this.sim.t;
    const deltaT = t - this.lasttime;
    this.lasttime = t;
    const signalamplitude = Math.sin(2 * pi * (t - this.freqTimeZero) * this.signalfreq);
    this.funcx += deltaT * (this.carrierfreq + signalamplitude * this.deviation);
    const w = 2 * pi * this.funcx;
    return Math.sin(w) * this.maxVoltage;
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'FM Source';
    arr[1] = 'I = ' + getCurrentText(this.getCurrent());
    arr[2] = 'V = ' + getVoltageText(this.getVoltageDiff());
    arr[3] = 'cf = ' + getUnitText(this.carrierfreq, 'Hz');
    arr[4] = 'sf = ' + getUnitText(this.signalfreq, 'Hz');
    arr[5] = 'dev =' + getUnitText(this.deviation, 'Hz');
    arr[6] = 'Vmax = ' + getVoltageText(this.maxVoltage);
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Max Voltage', this.maxVoltage, -20, 20).setUnitStep();
    if (n === 1) return new EditInfo('Carrier Frequency (Hz)', this.carrierfreq, 4, 500);
    if (n === 2) return new EditInfo('Signal Frequency (Hz)', this.signalfreq, 4, 500);
    if (n === 3) return new EditInfo('Deviation (Hz)', this.deviation, 4, 500);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.maxVoltage = ei.value;
    if (n === 1) this.carrierfreq = ei.value;
    if (n === 2) this.signalfreq = ei.value;
    if (n === 3) this.deviation = ei.value;
  }
}

export const SweepElmType = elementType('SweepElm', SweepElm);
export const AMElmType = elementType('AMElm', AMElm);
export const FMElmType = elementType('FMElm', FMElm);
