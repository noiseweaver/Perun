// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/GateElm.java, AndGateElm.java,
// NandGateElm.java, OrGateElm.java, NorGateElm.java, XorGateElm.java and XnorGateElm.java (master)
// at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Point } from '@circuitjs-next/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt, parseJavaDouble, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentText, getUnitText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

/**
 * Defaults copied from the last gate edited (upstream's statics `GateElm.lastHighVoltage` and
 * `lastSchmitt`), shared by gates, inverters and tri-state buffers.
 */
export const gateDefaults = { lastHighVoltage: 5, lastSchmitt: false };

/** A logic gate with `inputCount` inputs and one output driven by a voltage source. */
export abstract class GateElm extends CircuitElm {
  static readonly FLAG_SMALL = 1 << 0;
  static readonly FLAG_SCHMITT = 1 << 1;
  static readonly FLAG_INVERT_INPUTS = 1 << 2;
  static readonly FLAG_DEMORGAN = 1 << 3;

  inputCount = 2;
  lastOutput = false;
  highVoltage = 5;
  /** Seconds; 0 is instant (the default). */
  propagationDelay = 0;
  /** Time at which a pending output change takes effect. */
  delayEndTime = 0;
  gsize = 2;
  gwidth = 14;
  gwidth2 = 28;
  gheight = 16;
  hs2 = 0;
  ww = 0;
  inPosts: Point[] = [];
  bodyLead2: Point = this.point2;
  pcircle: Point = this.point2;
  inputStates: boolean[] = [];
  oscillationCount = 0;
  lastTime = 0;

  override getDragLength(): number {
    return 96;
  }

  override initNew(): void {
    this.noDiagonal = true;
    this.inputCount = 2;
    this.allocNodes();
    this.setupVolts();
    // copy defaults from last gate edited
    this.highVoltage = gateDefaults.lastHighVoltage;
    if (gateDefaults.lastSchmitt) this.flags |= GateElm.FLAG_SCHMITT;
    this.setSize(this.useSmallGrid() ? 1 : 2);
  }

  override undump(st: StringTokenizer): void {
    this.inputCount = parseJavaInt(st.nextToken());
    const lastOutputVoltage = parseJavaDouble(st.nextToken());
    this.noDiagonal = true;
    this.highVoltage = 5;
    try {
      this.highVoltage = parseJavaDouble(st.nextToken());
    } catch {
      // older files have no high voltage
    }
    this.lastOutput = lastOutputVoltage > this.highVoltage * 0.5;
    this.setSize((this.flags & GateElm.FLAG_SMALL) !== 0 ? 1 : 2);
    this.allocNodes();
    this.setupVolts();
  }

  isInverting(): boolean {
    return false;
  }

  setSize(s: number): void {
    this.gsize = s;
    this.gwidth = 7 * s;
    this.gwidth2 = 14 * s;
    this.gheight = 8 * s;
    this.flags &= ~GateElm.FLAG_SMALL;
    this.flags |= s === 1 ? GateElm.FLAG_SMALL : 0;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    if (this.highVoltage !== 5) w.dumpAttr('hi', this.highVoltage);
    if (this.inputCount !== 2) w.dumpAttr('in', this.inputCount);
    if (this.propagationDelay !== 0) w.dumpAttr('pd', this.propagationDelay);
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    if (this.volts[this.inputCount] !== 0) w.dumpAttr('o', this.volts[this.inputCount]);
  }

  override undumpXml(r: XmlAttrReader): void {
    // "ix" marks a state restore inside a subcircuit: the element already has its flags and the
    // state record has no "f", so zeroing them would lose FLAG_SCHMITT and the rest
    const stateRestore = r.parseStringAttr('ix', null) !== null;
    if (!stateRestore) this.flags = 0; // SMALL might have gotten set
    super.undumpXml(r);
    this.highVoltage = r.parseDoubleAttr('hi', this.highVoltage);
    this.inputCount = r.parseIntAttr('in', this.inputCount);
    this.propagationDelay = r.parseDoubleAttr('pd', this.propagationDelay);
    const lastOutputVoltage = r.parseDoubleAttr('o', 0);
    this.lastOutput = lastOutputVoltage > this.highVoltage * 0.5;
    this.setSize((this.flags & GateElm.FLAG_SMALL) !== 0 ? 1 : 2);
    this.allocNodes();
    this.setupVolts();
  }

  override getXmlDumpType(): string {
    return this.getClassName().replace('GateElm', '');
  }

  override setPoints(): void {
    super.setPoints();
    this.inputStates = new Array<boolean>(this.inputCount).fill(false);
    if (this.dn > 150 && this.isCreating()) this.setSize(2);
    const hs = this.gheight;
    this.ww = this.gwidth2; // was 24
    if (this.ww > this.dn / 2) this.ww = javaDoubleToInt(this.dn / 2);
    if (this.isInverting() && this.ww + 8 > this.dn / 2) this.ww = javaDoubleToInt(this.dn / 2 - 8);
    this.calcLeads(this.ww * 2);
    this.inPosts = [];
    let i0 = -Math.trunc(this.inputCount / 2);
    for (let i = 0; i !== this.inputCount; i++, i0++) {
      if (i0 === 0 && (this.inputCount & 1) === 0) i0++;
      this.inPosts[i] = this.interpPointPerp(this.point1, this.point2, 0, hs * i0);
    }
    this.hs2 = this.gwidth * (Math.trunc(this.inputCount / 2) + 1);
    // the body is drawn up to the original lead2; an output bubble moves the output lead out
    this.bodyLead2 = this.lead2;
    if (this.isInverting() !== this.hasFlag(GateElm.FLAG_DEMORGAN)) {
      this.pcircle = this.interpPoint(this.point1, this.point2, 0.5 + (this.ww + 4) / this.dn);
      this.lead2 = this.interpPoint(this.point1, this.point2, 0.5 + (this.ww + 8) / this.dn);
    }
  }

  /** Row offset of input i, in gheight units (upstream's `i0` in setPoints). */
  inputRow(i: number): number {
    let i0 = -Math.trunc(this.inputCount / 2) + i;
    if ((this.inputCount & 1) === 0 && i0 >= 0) i0++;
    return i0;
  }

  /** Restore state if loading from file or volts is reallocated. */
  setupVolts(): void {
    // We don't remember all the inputs, just the last output.
    // Fill inputs with something that keeps output the same.
    for (let i = 0; i !== this.inputCount; i++)
      this.volts[i] = this.lastOutput !== this.isInverting() ? this.highVoltage : 0;
  }

  /** How far the input leads reach into a curved OR body (upstream `getLeadAdjustment`). */
  getLeadAdjustment(_ix: number, _euro: boolean): number {
    return 0;
  }

  getGateText(): string | null {
    return null;
  }

  override getPostCount(): number {
    return this.inputCount + 1;
  }
  override getPost(n: number): Point {
    if (n === this.inputCount) return this.point2;
    return this.inPosts[n];
  }
  override getVoltageSourceCount(): number {
    return 1;
  }

  abstract getGateName(): string;
  abstract drawAsAndGate(): boolean;
  abstract calcFunction(): boolean;

  override getInfo(arr: string[]): void {
    arr[0] = this.getGateName();
    arr[1] = 'Vout = ' + getVoltageText(this.volts[this.inputCount]);
    arr[2] = 'Iout = ' + getCurrentText(this.getCurrent());
    if (this.propagationDelay > 0) arr[3] = 'delay = ' + getUnitText(this.propagationDelay, 's');
  }

  setHighVoltage(hv: number): void {
    this.highVoltage = hv;
  }

  override stamp(): void {
    this.sim.stampVoltageSource(this.sim.ground, this.nodes[this.inputCount], this.voltSource);
  }

  hasSchmittInputs(): boolean {
    return (this.flags & GateElm.FLAG_SCHMITT) !== 0;
  }

  getInput(x: number): boolean {
    const high = !this.hasFlag(GateElm.FLAG_INVERT_INPUTS);
    if (!this.hasSchmittInputs()) return this.volts[x] > this.highVoltage * 0.5 ? high : !high;
    // allocated lazily too: elements inside a subcircuit never get setPoints()
    if (this.inputStates.length !== this.inputCount)
      this.inputStates = new Array<boolean>(this.inputCount).fill(false);
    const res = this.volts[x] > this.highVoltage * (this.inputStates[x] ? 0.35 : 0.55);
    this.inputStates[x] = res;
    return res ? high : !high;
  }

  override doStep(): void {
    let f = this.calcFunction();
    if (this.isInverting()) f = !f;
    const sim = this.sim;
    if (this.propagationDelay === 0 && this.lastTime !== sim.t) {
      // detect oscillation (using same strategy as Atanua)
      if (this.lastOutput === !f) {
        if (this.oscillationCount++ > 50) {
          // output is oscillating too much, randomly leave output the same
          this.oscillationCount = 0;
          if (this.getrand(10) > 5) f = this.lastOutput;
        }
      } else this.oscillationCount = 0;
      this.lastTime = sim.t;
    }
    if (this.propagationDelay > 0) {
      if (f !== this.lastOutput) {
        // desired output differs from current output: start the timer, or apply the change
        if (this.delayEndTime === 0) this.delayEndTime = sim.t + this.propagationDelay;
        else if (sim.t >= this.delayEndTime) {
          this.lastOutput = f;
          this.delayEndTime = 0;
        }
      } else this.delayEndTime = 0;
    } else this.lastOutput = f;
    const res = this.lastOutput ? this.highVoltage : 0;
    sim.updateVoltageSource(sim.ground, this.nodes[this.inputCount], this.voltSource, res);
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('# of Inputs', this.inputCount, 1, 8).setDimensionless();
    if (n === 1) return new EditInfo('High Logic Voltage', this.highVoltage, 1, 10).setUnitStep();
    if (n === 2) return EditInfo.createCheckbox('Schmitt Inputs', this.hasSchmittInputs());
    if (n === 3)
      return EditInfo.createCheckbox('Invert Inputs', this.hasFlag(GateElm.FLAG_INVERT_INPUTS));
    if (n === 4) return new EditInfo('Propagation Delay (s)', this.propagationDelay, 0, 0);
    if (n === 5)
      return EditInfo.createCheckbox("DeMorgan's Symbol", this.hasFlag(GateElm.FLAG_DEMORGAN));
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      if (ei.value >= 1) {
        this.inputCount = javaDoubleToInt(ei.value);
        this.allocNodes();
        this.setupVolts();
        this.setPoints();
      } else ei.setError('must be >= 1');
    }
    if (n === 1) this.highVoltage = gateDefaults.lastHighVoltage = ei.value;
    if (n === 2) {
      this.flags = ei.changeFlag(this.flags, GateElm.FLAG_SCHMITT);
      gateDefaults.lastSchmitt = this.hasSchmittInputs();
      this.setPoints();
    }
    // Invert Inputs (3) and DeMorgan's Symbol (5) are mutually exclusive
    if (n === 3) {
      if (ei.checkbox?.state === true) {
        this.flags |= GateElm.FLAG_INVERT_INPUTS;
        this.flags &= ~GateElm.FLAG_DEMORGAN;
      } else this.flags &= ~GateElm.FLAG_INVERT_INPUTS;
      this.setPoints();
    }
    if (n === 4) this.propagationDelay = ei.value;
    if (n === 5) {
      if (ei.checkbox?.state === true) {
        this.flags |= GateElm.FLAG_DEMORGAN;
        this.flags &= ~GateElm.FLAG_INVERT_INPUTS;
      } else this.flags &= ~GateElm.FLAG_DEMORGAN;
      this.setPoints();
    }
  }

  // there is no current path through the gate inputs, but there is an indirect path through the
  // output to ground.
  override validate(): boolean {
    return this.validateRailNode(this.inputCount);
  }
  override getConnection(_n1: number, _n2: number): boolean {
    return false;
  }
  override hasGroundConnection(n1: number): boolean {
    return n1 === this.inputCount;
  }
  override getCurrentIntoNode(n: number): number {
    if (n === this.inputCount) return this.current;
    return 0;
  }
}

export class AndGateElm extends GateElm {
  override getClassName(): string {
    return 'AndGateElm';
  }
  override getGateText(): string {
    return '&';
  }
  getGateName(): string {
    if (this.hasFlag(GateElm.FLAG_INVERT_INPUTS)) return 'NOR gate';
    return 'AND gate';
  }
  calcFunction(): boolean {
    let f = true;
    for (let i = 0; i !== this.inputCount; i++) f = this.getInput(i) && f;
    return f;
  }
  override getDumpType(): number {
    return 150;
  }
  override getShortcut(): number {
    return '2'.charCodeAt(0);
  }
  drawAsAndGate(): boolean {
    return !this.hasFlag(GateElm.FLAG_DEMORGAN);
  }
}

export class NandGateElm extends AndGateElm {
  override getClassName(): string {
    return 'NandGateElm';
  }
  override isInverting(): boolean {
    return true;
  }
  override getGateName(): string {
    if (this.hasFlag(GateElm.FLAG_INVERT_INPUTS)) return 'OR gate';
    return 'NAND gate';
  }
  override getDumpType(): number {
    return 151;
  }
  override getShortcut(): number {
    return '@'.charCodeAt(0);
  }
}

export class OrGateElm extends GateElm {
  override getClassName(): string {
    return 'OrGateElm';
  }
  getGateName(): string {
    if (this.hasFlag(GateElm.FLAG_INVERT_INPUTS)) return 'NAND gate';
    return 'OR gate';
  }
  override getLeadAdjustment(ix: number, euro: boolean): number {
    if (euro) return 0;
    const n = this.inputCount;
    if (n > 3 && (ix === 0 || ix === n - 1)) return -0.15;
    if (n > 7 && (ix === 1 || ix === n - 2)) return -0.25;
    if (n >= 12 && (ix === 2 || ix === n - 3)) return -0.35;
    return 0;
  }
  override getGateText(): string {
    return '≥1';
  }
  calcFunction(): boolean {
    let f = false;
    for (let i = 0; i !== this.inputCount; i++) f = this.getInput(i) || f;
    return f;
  }
  override getDumpType(): number {
    return 152;
  }
  override getShortcut(): number {
    return '3'.charCodeAt(0);
  }
  drawAsAndGate(): boolean {
    return this.hasFlag(GateElm.FLAG_DEMORGAN);
  }
}

export class NorGateElm extends OrGateElm {
  override getClassName(): string {
    return 'NorGateElm';
  }
  override getGateName(): string {
    if (this.hasFlag(GateElm.FLAG_INVERT_INPUTS)) return 'AND gate';
    return 'NOR gate';
  }
  override isInverting(): boolean {
    return true;
  }
  override getDumpType(): number {
    return 153;
  }
  override getShortcut(): number {
    return '#'.charCodeAt(0);
  }
}

export class XorGateElm extends OrGateElm {
  override getClassName(): string {
    return 'XorGateElm';
  }
  override getGateName(): string {
    return 'XOR gate';
  }
  override getGateText(): string {
    return '=1';
  }
  override calcFunction(): boolean {
    let f = false;
    for (let i = 0; i !== this.inputCount; i++) f = f !== this.getInput(i);
    return f;
  }
  // skip "Invert Inputs" (index 3 in GateElm); shift higher indices down
  override getEditInfo(n: number): EditInfo | null {
    return super.getEditInfo(n >= 3 ? n + 1 : n);
  }
  override setEditValue(n: number, ei: EditInfo): void {
    super.setEditValue(n >= 3 ? n + 1 : n, ei);
  }
  override getDumpType(): number {
    return 154;
  }
  override getShortcut(): number {
    return '4'.charCodeAt(0);
  }
  override drawAsAndGate(): boolean {
    return false;
  }
}

export class XnorGateElm extends XorGateElm {
  override getClassName(): string {
    return 'XnorGateElm';
  }
  override getGateName(): string {
    return 'XNOR gate';
  }
  override isInverting(): boolean {
    return true;
  }
  override getDumpType(): number {
    return 431;
  }
  override getShortcut(): number {
    return '$'.charCodeAt(0);
  }
}

export const AndGateElmType = elementType('AndGateElm', AndGateElm);
export const NandGateElmType = elementType('NandGateElm', NandGateElm);
export const OrGateElmType = elementType('OrGateElm', OrGateElm);
export const NorGateElmType = elementType('NorGateElm', NorGateElm);
export const XorGateElmType = elementType('XorGateElm', XorGateElm);
export const XnorGateElmType = elementType('XnorGateElm', XnorGateElm);
