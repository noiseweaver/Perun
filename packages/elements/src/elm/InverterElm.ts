// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/InverterElm.java,
// InvertingSchmittElm.java, SchmittElm.java, TriStateElm.java and DelayBufferElm.java (master)
// at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Point, type VoltageSource } from '@circuitjs-next/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt, parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentDText, getUnitText, getVoltageDText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { gateDefaults } from './GateElm.ts';
import type { WireRouter } from '../WireRouter.ts';

/**
 * Shared by one-input, one-output logic symbols: no path from input to output, but the output
 * (post 1) is a voltage source to ground.
 */
abstract class BufferLikeElm extends CircuitElm {
  override getVoltageSourceCount(): number {
    return 1;
  }
  override stamp(): void {
    this.sim.stampVoltageSource(this.sim.ground, this.nodes[1], this.voltSource);
  }
  override getVoltageDiff(): number {
    return this.volts[0];
  }
  override getConnection(_n1: number, _n2: number): boolean {
    return false;
  }
  override hasGroundConnection(n1: number): boolean {
    return n1 === 1;
  }
  override getCurrentIntoNode(n: number): number {
    if (n === 1) return this.current;
    return 0;
  }
}

/** Inverter with a slew-rate limited output. */
export class InverterElm extends BufferLikeElm {
  /** Upstream setPoints: the body around the middle. */
  override routingLeads(): [Point, Point] | null {
    let ww = 16;
    if (ww > this.dn / 2) ww = Math.trunc(this.dn / 2);
    return [
      this.interpPoint(this.point1, this.point2, 0.5 - ww / this.dn),
      this.interpPoint(this.point1, this.point2, 0.5 + (ww + 2) / this.dn),
    ];
  }

  override addRoutingObstacle(router: WireRouter): void {
    this.addRoutingObstacleWithLeads(router, 16);
  }

  static readonly FLAG_DEMORGAN = 1 << 3;

  /** V/ns. */
  slewRate = 0.5;
  highVoltage = 5;
  lastOutputVoltage = 0;

  override getClassName(): string {
    return 'InverterElm';
  }
  override getDumpType(): number {
    return 'I'.charCodeAt(0);
  }

  override initNew(): void {
    this.noDiagonal = true;
    this.slewRate = 0.5;
    // copy defaults from last gate edited
    this.highVoltage = gateDefaults.lastHighVoltage;
  }

  override undump(st: StringTokenizer): void {
    this.noDiagonal = true;
    this.slewRate = 0.5;
    this.highVoltage = 5;
    try {
      this.slewRate = parseJavaDouble(st.nextToken());
      this.highVoltage = parseJavaDouble(st.nextToken());
    } catch {
      // older files lack these
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('sl', this.slewRate);
    w.dumpAttr('hi', this.highVoltage);
  }
  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.slewRate = r.parseDoubleAttr('sl', this.slewRate);
    this.highVoltage = r.parseDoubleAttr('hi', this.highVoltage);
    this.noDiagonal = true;
  }

  override setHighVoltage(hv: number): void {
    this.highVoltage = hv;
  }

  override startIteration(): void {
    this.lastOutputVoltage = this.volts[1];
  }

  override doStep(): void {
    let out = this.volts[0] > this.highVoltage * 0.5 ? 0 : this.highVoltage;
    const maxStep = this.slewRate * this.sim.timeStep * 1e9;
    out = Math.max(
      Math.min(this.lastOutputVoltage + maxStep, out),
      this.lastOutputVoltage - maxStep,
    );
    this.sim.updateVoltageSource(this.sim.ground, this.nodes[1], this.voltSource, out);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'inverter';
    arr[1] = 'Vi = ' + getVoltageText(this.volts[0]);
    arr[2] = 'Vo = ' + getVoltageText(this.volts[1]);
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Slew Rate (V/ns)', this.slewRate, 0, 0);
    if (n === 1) return new EditInfo('High Logic Voltage', this.highVoltage, 1, 10).setUnitStep();
    if (n === 2)
      return EditInfo.createCheckbox("DeMorgan's Symbol", this.hasFlag(InverterElm.FLAG_DEMORGAN));
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.slewRate = ei.value;
    if (n === 1) this.highVoltage = gateDefaults.lastHighVoltage = ei.value;
    if (n === 2) {
      this.flags = ei.changeFlag(this.flags, InverterElm.FLAG_DEMORGAN);
      this.setPoints();
    }
  }

  override validate(): boolean {
    return this.validateRailNode(1);
  }

  override getShortcut(): number {
    return '1'.charCodeAt(0);
  }
}

/** Schmitt trigger with an inverting output. Contributed upstream by Edward Calver. */
export class InvertingSchmittElm extends BufferLikeElm {
  /** Upstream setPoints: the body around the middle. */
  override routingLeads(): [Point, Point] | null {
    let ww = 16;
    if (ww > this.dn / 2) ww = Math.trunc(this.dn / 2);
    return [
      this.interpPoint(this.point1, this.point2, 0.5 - ww / this.dn),
      this.interpPoint(this.point1, this.point2, 0.5 + (ww + 2) / this.dn),
    ];
  }

  /** V/ns. */
  slewRate = 0.5;
  lowerTrigger = 1.66;
  upperTrigger = 3.33;
  state = false;
  logicOnLevel = 5;
  logicOffLevel = 0;
  /** Edited thresholds, sorted into lower and upper when any field is set. */
  dlt = 0;
  dut = 0;

  override getClassName(): string {
    return 'InvertingSchmittElm';
  }
  override getDumpType(): number {
    return 183;
  }

  override initNew(): void {
    this.noDiagonal = true;
  }

  override undump(st: StringTokenizer): void {
    this.noDiagonal = true;
    try {
      this.slewRate = parseJavaDouble(st.nextToken());
      this.lowerTrigger = parseJavaDouble(st.nextToken());
      this.upperTrigger = parseJavaDouble(st.nextToken());
      this.logicOnLevel = parseJavaDouble(st.nextToken());
      this.logicOffLevel = parseJavaDouble(st.nextToken());
    } catch {
      // older files lack some of these
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('slr', this.slewRate);
    w.dumpAttr('lt', this.lowerTrigger);
    w.dumpAttr('ut', this.upperTrigger);
    w.dumpAttr('lon', this.logicOnLevel);
    w.dumpAttr('loff', this.logicOffLevel);
  }
  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.slewRate = r.parseDoubleAttr('slr', this.slewRate);
    this.lowerTrigger = r.parseDoubleAttr('lt', this.lowerTrigger);
    this.upperTrigger = r.parseDoubleAttr('ut', this.upperTrigger);
    this.logicOnLevel = r.parseDoubleAttr('lon', this.logicOnLevel);
    this.logicOffLevel = r.parseDoubleAttr('loff', this.logicOffLevel);
    this.noDiagonal = true;
  }

  override doStep(): void {
    const v0 = this.volts[1];
    let out: number;
    if (this.state) {
      // output is high; input high enough sets it low
      if (this.volts[0] > this.upperTrigger) {
        this.state = false;
        out = this.logicOffLevel;
      } else out = this.logicOnLevel;
    } else {
      // output is low; input low enough sets it high
      if (this.volts[0] < this.lowerTrigger) {
        this.state = true;
        out = this.logicOnLevel;
      } else out = this.logicOffLevel;
    }
    const maxStep = this.slewRate * this.sim.timeStep * 1e9;
    out = Math.max(Math.min(v0 + maxStep, out), v0 - maxStep);
    this.sim.updateVoltageSource(this.sim.ground, this.nodes[1], this.voltSource, out);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'inverting Schmitt trigger';
    arr[1] = 'Vi = ' + getVoltageText(this.volts[0]);
    arr[2] = 'Vo = ' + getVoltageText(this.volts[1]);
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      this.dlt = this.lowerTrigger;
      return new EditInfo('Lower threshold (V)', this.lowerTrigger, 0.01, 5);
    }
    if (n === 1) {
      this.dut = this.upperTrigger;
      return new EditInfo('Upper threshold (V)', this.upperTrigger, 0.01, 5);
    }
    if (n === 2) return new EditInfo('Slew Rate (V/ns)', this.slewRate, 0, 0);
    if (n === 3) return new EditInfo('High Logic Voltage', this.logicOnLevel, 0, 0).setUnitStep();
    if (n === 4) return new EditInfo('Low Voltage (V)', this.logicOffLevel, 0, 0).setUnitStep();
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.dlt = ei.value;
    if (n === 1) this.dut = ei.value;
    if (n === 2) this.slewRate = ei.value;
    if (n === 3) this.logicOnLevel = ei.value;
    if (n === 4) this.logicOffLevel = ei.value;
    if (this.dlt > this.dut) {
      this.upperTrigger = this.dlt;
      this.lowerTrigger = this.dut;
    } else {
      this.upperTrigger = this.dut;
      this.lowerTrigger = this.dlt;
    }
  }
}

/** Non-inverting Schmitt trigger. */
export class SchmittElm extends InvertingSchmittElm {
  /** Upstream setPoints: the body around the middle. */
  override routingLeads(): [Point, Point] | null {
    let ww = 16;
    if (ww > this.dn / 2) ww = Math.trunc(this.dn / 2);
    return [
      this.interpPoint(this.point1, this.point2, 0.5 - ww / this.dn),
      this.interpPoint(this.point1, this.point2, 0.5 + (ww - 3) / this.dn),
    ];
  }

  lastOutputVoltage = 0;

  override getClassName(): string {
    return 'SchmittElm';
  }
  override getDumpType(): number {
    return 182;
  }

  override startIteration(): void {
    this.lastOutputVoltage = this.volts[1];
  }

  override doStep(): void {
    let out: number;
    if (this.state) {
      if (this.volts[0] > this.upperTrigger) {
        this.state = false;
        out = this.logicOnLevel;
      } else out = this.logicOffLevel;
    } else {
      if (this.volts[0] < this.lowerTrigger) {
        this.state = true;
        out = this.logicOffLevel;
      } else out = this.logicOnLevel;
    }
    const maxStep = this.slewRate * this.sim.timeStep * 1e9;
    out = Math.max(
      Math.min(this.lastOutputVoltage + maxStep, out),
      this.lastOutputVoltage - maxStep,
    );
    this.sim.updateVoltageSource(this.sim.ground, this.nodes[1], this.voltSource, out);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'Schmitt Trigger';
  }
}

/**
 * Tri-state buffer, optionally a bus. Node layout: inputs 0..bw-1, outputs bw..2bw-1, control
 * 2bw, then one internal node per bit. Contributed upstream by Edward Calver.
 */
export class TriStateElm extends CircuitElm {
  static readonly FLAG_FLIP = 1;
  static readonly FLAG_FLIP_X = 2;
  static readonly FLAG_FLIP_Y = 4;

  resistance = 0;
  r_on = 0.1;
  r_off = 1e10;
  r_off_ground = 1e8;
  highVoltage = 5;
  busWidth = 1;
  voltageSources: (VoltageSource | null)[] = [];
  open = false;
  point3: Point = this.point1;
  lead3: Point = this.point1;
  busLead1: Point = this.point1;

  override getClassName(): string {
    return 'TriStateElm';
  }
  override getDumpType(): number {
    return 180;
  }
  override getXmlDumpType(): string {
    return 'ts';
  }

  override initNew(): void {
    this.r_on = 0.1;
    this.r_off = 1e10;
    this.r_off_ground = 1e8;
    this.noDiagonal = true;
    // copy defaults from last gate edited
    this.highVoltage = gateDefaults.lastHighVoltage;
  }

  override undump(st: StringTokenizer): void {
    this.r_on = 0.1;
    this.r_off = 1e10;
    this.r_off_ground = 0;
    this.noDiagonal = true;
    this.highVoltage = 5;
    try {
      this.r_on = parseJavaDouble(st.nextToken());
      this.r_off = parseJavaDouble(st.nextToken());
      this.r_off_ground = parseJavaDouble(st.nextToken());
      this.highVoltage = parseJavaDouble(st.nextToken());
    } catch {
      // older files lack some of these
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('ron', this.r_on);
    w.dumpAttr('roff', this.r_off);
    w.dumpAttr('rog', this.r_off_ground);
    w.dumpAttr('hi', this.highVoltage);
    if (this.busWidth !== 1) w.dumpAttr('bw', this.busWidth);
  }
  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.r_on = r.parseDoubleAttr('ron', this.r_on);
    this.r_off = r.parseDoubleAttr('roff', this.r_off);
    this.r_off_ground = r.parseDoubleAttr('rog', this.r_off_ground);
    this.highVoltage = r.parseDoubleAttr('hi', this.highVoltage);
    this.busWidth = r.parseIntAttr('bw', 1);
    this.noDiagonal = true;
  }

  override setHighVoltage(hv: number): void {
    this.highVoltage = hv;
  }

  override setPoints(): void {
    super.setPoints();
    const len = 32;
    this.calcLeads(len);
    this.adjustLeadsToGrid(
      (this.flags & TriStateElm.FLAG_FLIP_X) !== 0,
      (this.flags & TriStateElm.FLAG_FLIP_Y) !== 0,
    );
    const hs = 16;
    // busLead1 is lead1 pulled back slightly so a thick bus line doesn't bleed into the triangle
    this.busLead1 = this.interpPoint(this.point1, this.lead1, 1 - 2 / this.dn);
    const sign = (this.flags & TriStateElm.FLAG_FLIP) === 0 ? -1 : 1;
    this.point3 = this.interpPointPerp(this.lead1, this.lead2, 0.5, sign * hs);
    this.lead3 = this.interpPointPerp(this.lead1, this.lead2, 0.5, sign * (hs / 2 + 2));
  }

  controlNode(): number {
    return 2 * this.busWidth;
  }
  internalNode(bit: number): number {
    return 2 * this.busWidth + 1 + bit;
  }

  override calculateCurrent(): void {
    this.current = 0;
    for (let i = 0; i < this.busWidth; i++) {
      const intNode = this.internalNode(i);
      const outNode = this.busWidth + i;
      const current31 = (this.volts[intNode] - this.volts[outNode]) / this.resistance;
      const current10 = this.r_off_ground === 0 ? 0 : this.volts[outNode] / this.r_off_ground;
      this.current += current31 - current10;
    }
  }

  override getCurrentIntoNode(n: number): number {
    if (n >= this.busWidth && n < 2 * this.busWidth) return this.current / this.busWidth;
    return 0;
  }

  // we need this to be able to change the matrix for each step
  override nonLinear(): boolean {
    return true;
  }

  override stamp(): void {
    const sim = this.sim;
    for (let i = 0; i < this.busWidth; i++) {
      const internal = this.nodes[this.internalNode(i)];
      sim.stampVoltageSource(sim.ground, internal, this.voltageSources[i]);
      sim.stampNonLinear(internal);
      sim.stampNonLinear(this.nodes[this.busWidth + i]);
    }
  }

  override doStep(): void {
    const sim = this.sim;
    this.open = this.volts[this.controlNode()] < this.highVoltage * 0.5;
    this.resistance = this.open ? this.r_off : this.r_on;
    for (let i = 0; i < this.busWidth; i++) {
      const intNode = this.internalNode(i);
      const outNode = this.busWidth + i;
      sim.stampResistor(this.nodes[intNode], this.nodes[outNode], this.resistance);
      if (this.r_off_ground > 0)
        sim.stampResistor(this.nodes[outNode], sim.ground, this.r_off_ground);
      sim.updateVoltageSource(
        sim.ground,
        this.nodes[intNode],
        this.voltageSources[i],
        this.volts[i] > this.highVoltage * 0.5 ? this.highVoltage : 0,
      );
    }
  }

  /** The mouse picks which side the enable input goes on. */
  override drag(xx: number, yy: number): void {
    let flip = xx < this.x === yy < this.y;
    xx = this.snapGrid(xx);
    yy = this.snapGrid(yy);
    if (Math.abs(this.x - xx) < Math.abs(this.y - yy)) xx = this.x;
    else {
      flip = !flip;
      yy = this.y;
    }
    this.flags = flip ? this.flags | TriStateElm.FLAG_FLIP : this.flags & ~TriStateElm.FLAG_FLIP;
    super.drag(xx, yy);
  }

  /** busWidth inputs, busWidth outputs and the control. */
  override getPostCount(): number {
    return 2 * this.busWidth + 1;
  }
  override getInternalNodeCount(): number {
    return this.busWidth;
  }
  override getVoltageSourceCount(): number {
    return this.busWidth;
  }

  override setVoltageSource(n: number, v: VoltageSource): void {
    if (this.voltageSources.length !== this.busWidth)
      this.voltageSources = new Array<VoltageSource | null>(this.busWidth).fill(null);
    this.voltageSources[n] = v;
    v.setNodes(this.sim.ground, this.nodes[this.internalNode(n)]);
  }

  override getMatrixConnection(n1: number, n2: number): boolean {
    // each internal node connects to its corresponding output node
    for (let i = 0; i < this.busWidth; i++)
      if (this.comparePair(n1, n2, this.busWidth + i, this.internalNode(i))) return true;
    return false;
  }

  override getPost(n: number): Point {
    const bw = this.busWidth;
    if (n < bw) return bw > 1 ? new Point(this.point1.x, this.point1.y, n) : this.point1;
    if (n < 2 * bw) return bw > 1 ? new Point(this.point2.x, this.point2.y, n - bw) : this.point2;
    return this.point3;
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'tri-state buffer';
    if (this.busWidth > 1) arr[0] += ' (' + this.busWidth + ')';
    arr[1] = this.open ? 'open' : 'closed';
    arr[2] = 'Vd = ' + getVoltageDText(this.getVoltageDiff());
    arr[3] = 'I = ' + getCurrentDText(this.getCurrent());
    arr[4] = 'Vc = ' + getVoltageText(this.volts[this.controlNode()]);
  }

  // there is no current path through the input, but there is an indirect path through the
  // output to ground.
  override getConnection(_n1: number, _n2: number): boolean {
    return false;
  }
  override hasGroundConnection(n1: number): boolean {
    return n1 >= this.busWidth && n1 < 2 * this.busWidth;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('On Resistance (ohms)', this.r_on, 0, 0).setPositive();
    if (n === 1) return new EditInfo('Off Resistance (ohms)', this.r_off, 0, 0).setPositive();
    if (n === 2)
      return new EditInfo(
        'Output Pulldown Resistance (ohms)',
        this.r_off_ground,
        0,
        0,
      ).setPositive();
    if (n === 3) return new EditInfo('High Logic Voltage', this.highVoltage, 1, 10).setUnitStep();
    if (n === 4) return new EditInfo('Bus Width', this.busWidth, 1, 32).setDimensionless();
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.value > 0) this.r_on = ei.value;
    if (n === 1 && ei.value > 0) this.r_off = ei.value;
    if (n === 2 && ei.value > 0) this.r_off_ground = ei.value;
    if (n === 3) this.highVoltage = gateDefaults.lastHighVoltage = ei.value;
    if (n === 4) {
      if (ei.value >= 1) {
        this.busWidth = javaDoubleToInt(ei.value);
        this.allocNodes();
      } else ei.setError('must be >= 1');
    }
  }

  override flipX(c2: number, count: number): void {
    this.flags ^= TriStateElm.FLAG_FLIP | TriStateElm.FLAG_FLIP_X;
    super.flipX(c2, count);
  }
  override flipY(c2: number, count: number): void {
    this.flags ^= TriStateElm.FLAG_FLIP | TriStateElm.FLAG_FLIP_Y;
    super.flipY(c2, count);
  }
  override flipXY(c2: number, count: number): void {
    this.flags ^= TriStateElm.FLAG_FLIP;
    super.flipXY(c2, count);
  }
}

/** Buffer whose output follows the input after a fixed delay. */
export class DelayBufferElm extends BufferLikeElm {
  /** Upstream setPoints: the body around the middle. */
  override routingLeads(): [Point, Point] | null {
    let ww = 16 - 2;
    if (ww > this.dn / 2) ww = Math.trunc(this.dn / 2);
    return [
      this.interpPoint(this.point1, this.point2, 0.5 - ww / this.dn),
      this.interpPoint(this.point1, this.point2, 0.5 + ww / this.dn),
    ];
  }

  delay = 0;
  threshold = 2.5;
  highVoltage = 5;
  delayEndTime = 0;

  override getClassName(): string {
    return 'DelayBufferElm';
  }
  override getDumpType(): number {
    return 422;
  }

  override initNew(): void {
    this.noDiagonal = true;
  }

  override undump(st: StringTokenizer): void {
    this.noDiagonal = true;
    this.delay = parseJavaDouble(st.nextToken());
    try {
      this.threshold = parseJavaDouble(st.nextToken());
      this.highVoltage = parseJavaDouble(st.nextToken());
    } catch {
      // older files lack these
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('dl', this.delay);
    w.dumpAttr('th', this.threshold);
    w.dumpAttr('hv', this.highVoltage);
  }
  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.delay = r.parseDoubleAttr('dl', this.delay);
    this.threshold = r.parseDoubleAttr('th', this.threshold);
    this.highVoltage = r.parseDoubleAttr('hv', this.highVoltage);
    this.noDiagonal = true;
  }

  override setHighVoltage(hv: number): void {
    this.highVoltage = hv;
  }

  override doStep(): void {
    const inState = this.volts[0] > this.threshold;
    let outState = this.volts[1] > this.threshold;
    if (inState !== outState) {
      if (this.sim.t >= this.delayEndTime) outState = inState;
    } else this.delayEndTime = this.sim.t + this.delay;
    const v = outState ? this.highVoltage : 0;
    this.sim.updateVoltageSource(this.sim.ground, this.nodes[1], this.voltSource, v);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'buffer';
    arr[1] = 'delay = ' + getUnitText(this.delay, 's');
    arr[2] = 'Vi = ' + getVoltageText(this.volts[0]);
    arr[3] = 'Vo = ' + getVoltageText(this.volts[1]);
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Delay (s)', this.delay, 0, 0);
    if (n === 1) return new EditInfo('Threshold (V)', this.threshold, 0, 0);
    if (n === 2) return new EditInfo('High Logic Voltage', this.highVoltage, 0, 0).setUnitStep();
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.delay = ei.value;
    if (n === 1) this.threshold = ei.value;
    if (n === 2) this.highVoltage = ei.value;
  }
}

export const InverterElmType = elementType('InverterElm', InverterElm);
export const InvertingSchmittElmType = elementType('InvertingSchmittElm', InvertingSchmittElm);
export const SchmittElmType = elementType('SchmittElm', SchmittElm);
export const TriStateElmType = elementType('TriStateElm', TriStateElm);
export const DelayBufferElmType = elementType('DelayBufferElm', DelayBufferElm);
