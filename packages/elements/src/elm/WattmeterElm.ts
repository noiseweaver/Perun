// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/WattmeterElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.
// Also ported from WattmeterTrueElm.java at the same commit.

import { Point, type VoltageSource } from '@perun/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

export const PM_INST = 0;
export const PM_AVG = 1;

/** Geometry and editing shared by both wattmeters (upstream duplicates it in each class). */
abstract class WattmeterBase extends CircuitElm {
  width = 0;
  /** 0: instantaneous, 1: average. */
  meter = PM_INST;
  voltSources: (VoltageSource | null)[] = [null, null];
  currents = [0, 0];
  posts: Point[] = [];
  inner: Point[] = [];
  rectPoints: Point[] = [];
  center = new Point();
  maxTextLen = 0;

  override getPostCount(): number {
    return 4;
  }
  override getPost(n: number): Point {
    return this.posts[n];
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('w', this.width);
    w.dumpAttr('meter', this.meter);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.width = r.parseIntAttr('w', this.width);
    this.meter = r.parseIntAttr('meter', this.meter);
    this.setup();
  }

  setup(): void {
    this.voltSources = [null, null];
    this.currents = [0, 0];
  }

  override drag(xx: number, yy: number): void {
    xx = this.snapGrid(xx);
    yy = this.snapGrid(yy);
    const gridSize = this.sim.gridSize;
    const w1 = Math.max(gridSize, Math.abs(yy - this.y));
    const w2 = Math.max(gridSize, Math.abs(xx - this.x));
    if (w1 > w2) {
      xx = this.x;
      this.width = w2;
    } else {
      yy = this.y;
      this.width = w1;
    }
    this.x2 = xx;
    this.y2 = yy;
    this.setPoints();
  }

  /** Post order: true wattmeters swap the voltage terminals so C sits under M. */
  abstract swapVoltagePosts(): boolean;

  override setPoints(): void {
    super.setPoints();
    const p1 = this.point1;
    const p2 = this.point2;
    const ds = this.dy === 0 ? Math.sign(this.dx) : -Math.sign(this.dy);
    // 2 more terminals
    const p3 = this.interpPointPerp(p1, p2, 0, -this.width * ds);
    const p4 = this.interpPointPerp(p1, p2, 1, -this.width * ds);
    // stubs
    const sep = this.sim.gridSize;
    const p5 = this.interpPoint(p1, p2, sep / this.dn);
    const p6 = this.interpPoint(p1, p2, 1 - sep / this.dn);
    const p7 = this.interpPoint(p3, p4, sep / this.dn);
    const p8 = this.interpPoint(p3, p4, 1 - sep / this.dn);
    // the lower-numbered posts are on the bottom, so if some are unconnected (which is often
    // true) the bottom ones are attached to ground automatically
    if (this.swapVoltagePosts()) {
      this.posts = [p4, p3, p1, p2];
      this.inner = [p8, p7, p5, p6];
    } else {
      this.posts = [p3, p4, p1, p2];
      this.inner = [p7, p8, p5, p6];
    }
    // the box
    const r1 = this.interpPointPerp(p1, p2, sep / this.dn, ds * sep);
    const r2 = this.interpPointPerp(p1, p2, 1 - sep / this.dn, ds * sep);
    const r3 = this.interpPointPerp(p1, p2, sep / this.dn, -ds * (sep + this.width));
    const r4 = this.interpPointPerp(p1, p2, 1 - sep / this.dn, -ds * (sep + this.width));
    this.rectPoints = [r1, r2, r4, r3];
    this.center = this.interpPoint(r1, r4, 0.5);
    this.maxTextLen = Math.max(Math.abs(r1.x - r4.x) - 5, 5);
  }

  override getCurrentIntoNode(n: number): number {
    const i = Math.trunc(n / 2);
    if (n % 2 === 0) return -this.currents[i];
    return this.currents[i];
  }

  override getConnection(n1: number, n2: number): boolean {
    return Math.trunc(n1 / 2) === Math.trunc(n2 / 2);
  }
  override hasGroundConnection(_n1: number): boolean {
    return false;
  }
  override canViewInScope(): boolean {
    return true;
  }
  override getCurrent(): number {
    return this.currents[1];
  }
  override getPower(): number {
    return this.getVoltageDiff() * this.getCurrent();
  }
  override canFlipX(): boolean {
    return false;
  }
  override canFlipY(): boolean {
    return false;
  }

  /** The value shown in the box. */
  abstract meterPower(): number;
  /** Unit of the value shown in the box. */
  abstract meterUnit(): string;
}

/** The old wattmeter: two zero-volt sources measure both currents (upstream "Wattmeter (old)"). */
export class WattmeterElm extends WattmeterBase {
  avgPower = 0;
  totalEnergy = 0;
  cycleTime = 0;
  lastCycleTime = 0;
  runEnergy = 0;
  runTime = 0;
  zeroTime = 0;
  peak = 0;
  trough = 0;
  wasAboveMid = false;
  haveFullCycle = false;

  override getClassName(): string {
    return 'WattmeterElm';
  }
  override getDumpType(): number {
    return 420;
  }
  override swapVoltagePosts(): boolean {
    return false;
  }

  override undump(st: StringTokenizer): void {
    this.width = parseJavaInt(st.nextToken());
    try {
      this.meter = parseJavaInt(st.nextToken());
    } catch {
      // older files have no meter
    }
    this.setup();
  }

  override getVoltageSourceCount(): number {
    return 2;
  }

  override stamp(): void {
    // zero-valued voltage sources from 0 to 1 and 2 to 3, so we can measure current
    const n = this.nodes;
    this.sim.stampVoltageSource(n[0], n[1], this.voltSources[0], 0);
    this.sim.stampVoltageSource(n[2], n[3], this.voltSources[1], 0);
  }

  override setVoltageSource(j: number, vs: VoltageSource): void {
    this.voltSources[j] = vs;
    vs.setNodes(this.nodes[j * 2], this.nodes[j * 2 + 1]);
  }

  override setCurrent(vs: VoltageSource, c: number): void {
    this.currents[vs === this.voltSources[0] ? 0 : 1] = c;
  }

  override stepFinished(): void {
    const p = this.getPower();
    const dt = this.sim.timeStep;
    this.cycleTime += dt;
    this.totalEnergy += p * dt;
    this.runTime += dt;
    this.runEnergy += p * dt;

    // average over whole cycles, delimited by rising crossings of the long-run mean
    const mid = this.runEnergy / this.runTime;

    // compare against the threshold with hysteresis, so constant power (which equals its own
    // mean) doesn't chatter on rounding noise
    if (p > this.peak) this.peak = p;
    if (p < this.trough) this.trough = p;
    const band = (this.peak - this.trough) * 0.05 + Math.abs(this.peak) * 1e-9;
    const above = this.wasAboveMid ? p > mid - band : p > mid + band;

    if (above && !this.wasAboveMid) {
      if (this.haveFullCycle) {
        this.avgPower = this.totalEnergy / this.cycleTime;
        if (Number.isNaN(this.avgPower)) this.avgPower = 0;
        this.lastCycleTime = this.cycleTime;
      } else {
        // the run up to the first crossing is a partial cycle
        this.haveFullCycle = true;
      }
      this.totalEnergy = 0;
      this.cycleTime = 0;
    } else if (this.lastCycleTime > 0 && this.cycleTime > this.lastCycleTime * 8) {
      // the waveform stopped or changed shape; don't freeze on a stale reading
      this.avgPower = this.totalEnergy / this.cycleTime;
      if (Number.isNaN(this.avgPower)) this.avgPower = 0;
      this.totalEnergy = 0;
      this.cycleTime = 0;
    }
    this.wasAboveMid = above;

    // constant power never crosses its own mean: report the running mean until a period is seen
    if (this.lastCycleTime === 0) this.avgPower = mid;

    // clear the reading once the power has been off for longer than a period
    if (p === 0) {
      this.zeroTime += dt;
      if (this.lastCycleTime > 0 && this.zeroTime > this.lastCycleTime * 1.5) {
        this.avgPower = 0;
        this.totalEnergy = 0;
        this.cycleTime = 0;
      }
    } else this.zeroTime = 0;
  }

  override getVoltageDiff(): number {
    return this.volts[2] - this.volts[0];
  }

  override meterPower(): number {
    return this.meter === PM_AVG ? this.avgPower : this.getPower();
  }
  override meterUnit(): string {
    return this.meter === PM_AVG ? 'W(avg)' : 'W';
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'wattmeter (old)';
    this.getBasicInfo(arr);
    arr[3] = 'P = ' + getUnitText(this.getPower(), 'W');
    if (this.meter === PM_AVG) arr[4] = 'Pavg = ' + getUnitText(this.avgPower, 'W');
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      const ei = EditInfo.createChoice('Value', ['Instantaneous', 'Average'], this.meter);
      ei.value = 0;
      return ei;
    }
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.choice !== null) this.meter = ei.choice.selected;
  }
}

/**
 * The wattmeter: a zero-volt source measures the current and a 100 MΩ resistor the voltage.
 * Terminals are marked M L (current coil) over C V (voltage coil). Saved in XML only.
 */
export class WattmeterTrueElm extends WattmeterBase {
  selectedValue = 0;
  avgPower = 0;
  totalPower = 0;
  count = 0;
  zerocount = 0;
  maxP = 0;
  lastMaxP = 0;
  minP = 0;
  lastMinP = 0;
  increasingP = true;
  decreasingP = true;

  override getClassName(): string {
    return 'WattmeterTrueElm';
  }
  override swapVoltagePosts(): boolean {
    return true;
  }

  override getVoltageSourceCount(): number {
    return 1;
  }

  override stamp(): void {
    // zero-valued voltage source from 2 to 3, so we can measure current, and 0 to 1 a resistor so
    // we can measure voltage
    const n = this.nodes;
    this.sim.stampVoltageSource(n[2], n[3], this.voltSources[0], 0);
    this.sim.stampResistor(n[0], n[1], 1e8);
  }

  override setVoltageSource(j: number, vs: VoltageSource): void {
    this.voltSources[j] = vs;
  }

  override setCurrent(vs: VoltageSource, c: number): void {
    // upstream compares with voltSources[1], which is never set, so this is always currents[1]
    this.currents[vs === this.voltSources[1] ? 0 : 1] = c;
  }

  override stepFinished(): void {
    const p = this.getPower();
    this.count++;
    this.totalPower += p;
    if (p > this.maxP && this.increasingP) {
      this.maxP = p;
      this.increasingP = true;
      this.decreasingP = false;
    }
    if (p < this.maxP && this.increasingP) {
      this.lastMaxP = this.maxP;
      this.minP = p;
      this.increasingP = false;
      this.decreasingP = true;
      this.endCycle();
    }
    if (p < this.minP && this.decreasingP) {
      this.minP = p;
      this.increasingP = false;
      this.decreasingP = true;
    }
    if (p > this.minP && this.decreasingP) {
      this.lastMinP = this.minP;
      this.maxP = p;
      this.increasingP = true;
      this.decreasingP = false;
      this.endCycle();
    }
    if (p === 0) {
      this.zerocount++;
      if (this.zerocount > 5) {
        this.totalPower = 0;
        this.avgPower = 0;
        this.maxP = 0;
        this.minP = 0;
      }
    } else this.zerocount = 0;
  }

  private endCycle(): void {
    this.avgPower = this.totalPower / this.count;
    if (Number.isNaN(this.avgPower)) this.avgPower = 0;
    this.count = 0;
    this.totalPower = 0;
  }

  override getVoltageDiff(): number {
    return this.volts[1] - this.volts[0];
  }

  override meterPower(): number {
    if (this.meter === PM_INST) return this.getVoltageDiff() * this.getCurrent();
    if (this.meter === PM_AVG) return this.avgPower;
    return -1;
  }
  override meterUnit(): string {
    return 'W';
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'wattmeter';
    this.getBasicInfo(arr);
    arr[3] = 'P = ' + getUnitText(this.getVoltageDiff() * this.getCurrent(), 'W');
    arr[4] = 'P = ' + getUnitText(this.avgPower, 'W');
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      const ei = EditInfo.createChoice(
        'Value',
        ['Instantaneous Power', 'Average Power'],
        this.meter,
      );
      ei.value = this.selectedValue;
      return ei;
    }
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.choice !== null) this.meter = ei.choice.selected;
  }
}

export const WattmeterElmType = elementType('WattmeterElm', WattmeterElm);
export const WattmeterTrueElmType = elementType('WattmeterTrueElm', WattmeterTrueElm);
