// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/VCCSElm.java, VCVSElm.java,
// CCCSElm.java, CCVSElm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import {
  FindPathInfo,
  PathType,
  type CircuitNode,
  type SimElement,
  type VoltageSource,
} from '@circuitjs-next/engine';
import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { unescapeToken } from '../escape.ts';
import { Expr, ExprParser, ExprState } from '../Expr.ts';
import { javaDoubleToInt, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { ChipElm, SIDE_E, SIDE_W } from './ChipElm.ts';
import { VoltageElm } from './VoltageElm.ts';

const letter = (i: number): string => String.fromCharCode(65 + i);

/** A voltage-controlled current source whose output is a function of up to 8 input voltages. */
export class VCCSElm extends ChipElm {
  inputCount = 0;
  expr: Expr | null = null;
  exprState = new ExprState(0);
  exprString = '';
  broken = false;
  lastVolts = new Float64Array(0);

  override getClassName(): string {
    return 'VCCSElm';
  }

  override initNew(): void {
    this.inputCount = 2;
    this.exprString = '.1*(a-b)';
    this.parseExpr();
    super.initNew();
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.inputCount = parseJavaInt(st.nextToken());
    this.exprString = unescapeToken(st.nextToken());
    this.parseExpr();
    this.setupPins();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('ic', this.inputCount);
    w.dumpAttr('ex', this.exprString);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.inputCount = r.parseIntAttr('ic', this.inputCount);
    this.exprString = r.parseStringAttr('ex', this.exprString) ?? this.exprString;
    this.parseExpr();
    this.setupPins();
  }

  newExprState(n: number): ExprState {
    return new ExprState(n, () => this.sim.timeStep);
  }

  setupPins(): void {
    const ic = this.inputCount;
    this.sizeX = 2;
    this.sizeY = ic > 2 ? ic : 2;
    this.pins = new Array(ic + 2);
    for (let i = 0; i !== ic; i++) this.pins[i] = this.newPin(i, SIDE_W, letter(i));
    this.pins[ic] = this.newPin(0, SIDE_E, 'C+');
    this.pins[ic + 1] = this.newPin(1, SIDE_E, 'C-');
    this.lastVolts = new Float64Array(ic);
    this.exprState = this.newExprState(ic);
    this.allocNodes();
  }

  override getChipName(): string {
    return 'VCCS';
  }
  override nonLinear(): boolean {
    return true;
  }
  override isDigitalChip(): boolean {
    return false;
  }

  override stamp(): void {}

  sign(a: number, b: number): number {
    return a > 0 ? b : -b;
  }

  /** The largest change in an input per iteration that still counts as converged. */
  getConvergeLimit(): number {
    // be more lenient over time
    if (this.sim.subIterations < 10) return 0.001;
    if (this.sim.subIterations < 200) return 0.01;
    return 0.1;
  }

  hasCurrentOutput(): boolean {
    return true;
  }
  getOutputNode(n: number): CircuitNode {
    return this.nodes[n + this.inputCount];
  }

  override doStep(): void {
    const sim = this.sim;
    const ic = this.inputCount;
    const volts = this.volts;
    // no current path?  give up
    if (this.broken) {
      this.pins[ic].current = 0;
      this.pins[ic + 1].current = 0;
      // avoid singular matrix errors
      sim.stampResistor(this.nodes[ic], this.nodes[ic + 1], 1e8);
      return;
    }

    // converged yet?
    const convergeLimit = this.getConvergeLimit();
    for (let i = 0; i !== ic; i++)
      if (Math.abs(volts[i] - this.lastVolts[i]) > convergeLimit) sim.converged = false;
    const expr = this.expr;
    if (expr !== null) {
      const es = this.exprState;
      // calculate output
      for (let i = 0; i !== ic; i++) es.values[i] = volts[i];
      es.t = sim.t;
      const v0 = -expr.eval(es);
      let rs = v0;

      // calculate and stamp output derivatives
      for (let i = 0; i !== ic; i++) {
        let dv = volts[i] - this.lastVolts[i];
        if (Math.abs(dv) < 1e-6) dv = 1e-6;
        es.values[i] = volts[i];
        const v = -expr.eval(es);
        es.values[i] = volts[i] - dv;
        const v2 = -expr.eval(es);
        let dx = (v - v2) / dv;
        if (Math.abs(dx) < 1e-6) dx = this.sign(dx, 1e-6);
        sim.stampVCCurrentSource(this.nodes[ic], this.nodes[ic + 1], this.nodes[i], sim.ground, dx);
        // adjust right side
        rs -= dx * volts[i];
        es.values[i] = volts[i];
      }
      sim.stampCurrentSource(this.nodes[ic], this.nodes[ic + 1], rs);
      this.pins[ic].current = -v0;
      this.pins[ic + 1].current = v0;
    }

    for (let i = 0; i !== ic; i++) this.lastVolts[i] = volts[i];
  }

  override stepFinished(): void {
    this.exprState.updateLastValues(this.pins[this.inputCount].current);
  }

  override getPostCount(): number {
    return this.inputCount + 2;
  }
  override getVoltageSourceCount(): number {
    return 0;
  }
  override getDumpType(): number {
    return 213;
  }

  override getConnection(n1: number, n2: number): boolean {
    return this.comparePair(this.inputCount, this.inputCount + 1, n1, n2);
  }
  override getMatrixConnection(_n1: number, _n2: number): boolean {
    return true;
  }
  override hasGroundConnection(_n1: number): boolean {
    return false;
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      const ei = new EditInfo('Output Function', 0, -1, -1);
      ei.text = this.exprString;
      ei.disallowSliders();
      return ei;
    }
    if (n === 1) return new EditInfo('# of Inputs', this.inputCount, 1, 8).setDimensionless();
    return null;
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      this.exprString = ei.text ?? '';
      this.parseExpr(ei);
      return;
    }
    if (n === 1) {
      if (ei.value < 0 || ei.value > 8) return;
      this.inputCount = javaDoubleToInt(ei.value);
      this.setupPins();
      this.allocNodes();
      this.setPoints();
    }
  }

  setExpr(expr: string): void {
    this.exprString = expr;
    this.parseExpr();
  }

  parseExpr(ei: EditInfo | null = null): void {
    const parser = new ExprParser(this.exprString);
    this.expr = parser.parseExpression();
    const err = parser.gotError();
    if (err !== null && ei !== null) {
      ei.setErrorFieldName('Output Function');
      ei.setError('Parse error in expression: ' + this.exprString + ': ' + err);
    }
  }

  override getInfo(arr: string[]): void {
    super.getInfo(arr);
    arr.push('I = ' + getCurrentText(this.pins[this.inputCount].current));
  }

  override reset(): void {
    super.reset();
    this.exprState.reset();
  }

  override validate(): boolean {
    const fpi = new FindPathInfo(PathType.INDUCT, this, this.getOutputNode(0), this.sim);
    this.broken = this.hasCurrentOutput() && !fpi.findPath(this.getOutputNode(1));
    return true;
  }
}

/** A voltage-controlled voltage source. */
export class VCVSElm extends VCCSElm {
  override getClassName(): string {
    return 'VCVSElm';
  }

  override setupPins(): void {
    const ic = this.inputCount;
    this.sizeX = 2;
    this.sizeY = ic > 2 ? ic : 2;
    this.pins = new Array(ic + 2);
    for (let i = 0; i !== ic; i++) this.pins[i] = this.newPin(i, SIDE_W, letter(i));
    this.pins[ic] = this.newPin(0, SIDE_E, 'V+');
    this.pins[ic].output = true;
    this.pins[ic + 1] = this.newPin(1, SIDE_E, 'V-');
    this.lastVolts = new Float64Array(ic);
    this.exprState = this.newExprState(ic);
    this.allocNodes();
  }

  override getChipName(): string {
    return 'VCVS';
  }

  override stamp(): void {
    const ic = this.inputCount;
    this.sim.stampVoltageSource(this.nodes[ic + 1], this.nodes[ic], this.pins[ic].voltSource);
  }

  override doStep(): void {
    const sim = this.sim;
    const ic = this.inputCount;
    const volts = this.volts;
    // converged yet?
    const convergeLimit = this.getConvergeLimit();
    for (let i = 0; i !== ic; i++)
      if (Math.abs(volts[i] - this.lastVolts[i]) > convergeLimit) sim.converged = false;
    const vn = this.pinVoltSource(ic);
    const expr = this.expr;
    if (expr !== null) {
      const es = this.exprState;
      // calculate output
      for (let i = 0; i !== ic; i++) es.values[i] = volts[i];
      es.t = sim.t;
      const v0 = expr.eval(es);
      if (Math.abs(volts[ic] - volts[ic + 1] - v0) > Math.abs(v0) * 0.01 && sim.subIterations < 100)
        sim.converged = false;
      let rs = v0;

      // calculate and stamp output derivatives
      for (let i = 0; i !== ic; i++) {
        let dv = volts[i] - this.lastVolts[i];
        if (Math.abs(dv) < 1e-6) dv = 1e-6;
        es.values[i] = volts[i];
        const v = expr.eval(es);
        es.values[i] = volts[i] - dv;
        const v2 = expr.eval(es);
        let dx = (v - v2) / dv;
        if (Math.abs(dx) < 1e-6) dx = this.sign(dx, 1e-6);
        sim.stampMatrixVN(vn, this.nodes[i], -dx);
        // adjust right side
        rs -= dx * volts[i];
        es.values[i] = volts[i];
      }
      sim.stampRightSideVS(vn, rs);
    }

    for (let i = 0; i !== ic; i++) this.lastVolts[i] = volts[i];
  }

  override stepFinished(): void {
    const ic = this.inputCount;
    this.exprState.updateLastValues(this.volts[ic] - this.volts[ic + 1]);
  }

  override getVoltageSourceCount(): number {
    return 1;
  }
  override getDumpType(): number {
    return 212;
  }
  override hasCurrentOutput(): boolean {
    return false;
  }
  // upstream VCVS inherits VCCS's getConnection

  override setVoltageSource(j: number, vs: VoltageSource): void {
    super.setVoltageSource(j, vs);
    vs.setNodes(this.nodes[this.inputCount + 1], this.nodes[this.inputCount]);
  }

  override setCurrent(vs: VoltageSource, c: number): void {
    const ic = this.inputCount;
    if (this.pins[ic].voltSource === vs) {
      this.pins[ic].current = c;
      this.pins[ic + 1].current = -c;
    }
  }
}

/**
 * Shared by the current-controlled sources: input pairs A+/A-, B+/B-…, each measured by a 0 V
 * source (or, in SPICE style, by a voltage source element already across the pair).
 */
abstract class CurrentControlledElm extends VCCSElm {
  static readonly FLAG_SPICE = 2;
  voltageSources: (VoltageElm | undefined)[] = [];
  inputPairCount = 0;
  lastCurrents = new Float64Array(0);

  override initNew(): void {
    super.initNew();
    this.exprString = '2*a';
    this.parseExpr();
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.setupPins();
  }

  abstract outputNames(): [string, string];
  abstract lastCurrentCount(): number;

  override setupPins(): void {
    const ic = this.inputCount;
    this.sizeX = 2;
    this.sizeY = ic > 2 ? ic : 2;
    this.inputPairCount = Math.trunc(ic / 2);
    this.pins = new Array(ic + 2);
    let i = 0;
    for (; i !== this.inputPairCount; i++) {
      this.pins[i * 2] = this.newPin(i * 2, SIDE_W, letter(i) + '+');
      this.pins[i * 2 + 1] = this.newPin(i * 2 + 1, SIDE_W, letter(i) + '-');
      this.pins[i * 2 + 1].output = true;
    }
    const [pos, neg] = this.outputNames();
    this.pins[i * 2] = this.newPin(0, SIDE_E, pos);
    this.pins[i * 2].output = true;
    this.pins[i * 2 + 1] = this.newPin(1, SIDE_E, neg);
    this.exprState = this.newExprState(this.inputPairCount);
    this.lastCurrents = new Float64Array(this.lastCurrentCount());
    this.allocNodes();
  }

  isSpiceStyle(): boolean {
    return (this.flags & CurrentControlledElm.FLAG_SPICE) !== 0;
  }

  /** Stamp the 0 V sources that measure the input currents (or adopt the SPICE ones). */
  stampInputs(): void {
    const ic = this.inputCount;
    if (this.isSpiceStyle()) {
      for (let i = 0; i !== ic; i += 2)
        this.pins[i + 1].voltSource = this.voltageSources[i / 2]?.voltSource ?? null;
    } else {
      // voltage sources (0V) between C+ and C- so we can measure current
      for (let i = 0; i !== ic; i += 2)
        this.sim.stampVoltageSource(
          this.nodes[i],
          this.nodes[i + 1],
          this.pins[i + 1].voltSource,
          0,
        );
    }
  }

  /** In SPICE style, read the input currents from the adopted voltage sources. */
  loadSpiceCurrents(): void {
    if (!this.isSpiceStyle()) return;
    for (let i = 0; i !== this.inputPairCount; i++)
      this.pins[i * 2 + 1].current = this.voltageSources[i]?.getCurrent() ?? 0;
  }

  setCurrentExprValue(n: number, cur: number): void {
    // set i to current for backward compatibility
    if (n === 0 && this.inputPairCount < 9) this.exprState.values[8] = cur;
    this.exprState.values[n] = cur;
  }

  override getPostCount(): number {
    return this.inputCount + 2;
  }
  override getConnection(n1: number, n2: number): boolean {
    return Math.trunc(n1 / 2) === Math.trunc(n2 / 2);
  }

  override setParentList(list: SimElement[]): void {
    if (!this.isSpiceStyle()) return;
    // look for voltage sources across our inputs and use them rather than creating our own.
    // this is useful for converting spice subcircuits
    this.voltageSources = new Array<VoltageElm | undefined>(this.inputPairCount);
    for (let i = 0; i !== this.inputCount; i += 2) {
      for (const ce of list) {
        if (!(ce instanceof VoltageElm)) continue;
        if (ce.getNode(0) === this.nodes[i] && ce.getNode(1) === this.nodes[i + 1])
          this.voltageSources[i / 2] = ce;
      }
    }
  }

  override getInfo(arr: string[]): void {
    super.getInfo(arr);
    let i = 1;
    let j = 0;
    for (; j !== this.inputCount; j += 2)
      arr[i++] = this.pins[j].text + ' = ' + getCurrentText(-this.pins[j].current);
    arr[i++] =
      this.pins[j].text +
      ' = ' +
      getVoltageText(this.volts[j]) +
      '; ' +
      this.pins[j + 1].text +
      ' = ' +
      getVoltageText(this.volts[j + 1]);
    arr[i++] = 'I = ' + getCurrentText(this.pins[j].current);
    arr.length = i;
  }

  /** Upstream checks the new input count is even. */
  setInputCount(ei: EditInfo): void {
    if (ei.value < 0 || ei.value > 8 || ei.value % 2 === 1) return;
    this.inputCount = javaDoubleToInt(ei.value);
    this.setupPins();
    this.allocNodes();
    this.setPoints();
  }
}

/** A current-controlled current source. */
export class CCCSElm extends CurrentControlledElm {
  override getClassName(): string {
    return 'CCCSElm';
  }
  outputNames(): [string, string] {
    return ['O+', 'O-'];
  }
  lastCurrentCount(): number {
    return this.inputPairCount + 1;
  }
  override getChipName(): string {
    return 'CCCS';
  }

  override stamp(): void {
    this.stampInputs();
  }

  override doStep(): void {
    const sim = this.sim;
    const ic = this.inputCount;
    // no current path?  give up
    if (this.broken) {
      this.pins[ic].current = 0;
      this.pins[ic + 1].current = 0;
      // avoid singular matrix errors
      sim.stampResistor(this.nodes[ic], this.nodes[ic + 1], 1e8);
      return;
    }
    this.loadSpiceCurrents();

    // converged yet?
    const convergeLimit = this.getConvergeLimit() * 0.1;
    for (let i = 0; i <= this.inputPairCount; i++) {
      const cur = this.pins[i * 2 + 1].current;
      if (Math.abs(cur - this.lastCurrents[i]) > convergeLimit) sim.converged = false;
    }
    for (let i = 0; i <= this.inputPairCount; i++)
      this.lastCurrents[i] = this.pins[i * 2 + 1].current;

    const expr = this.expr;
    if (expr !== null) {
      const es = this.exprState;
      // calculate output
      for (let i = 0; i !== this.inputPairCount; i++)
        this.setCurrentExprValue(i, this.pins[i * 2 + 1].current);
      es.t = sim.t;
      const v0 = expr.eval(es);
      let rs = v0;

      this.pins[ic].current = v0;
      this.pins[ic + 1].current = -v0;

      for (let i = 0; i !== this.inputPairCount; i++) {
        const cur = this.pins[i * 2 + 1].current;
        let dv = cur - this.lastCurrents[i];
        if (Math.abs(dv) < 1e-6) dv = 1e-6;
        this.setCurrentExprValue(i, cur);
        const v = expr.eval(es);
        this.setCurrentExprValue(i, cur - dv);
        const v2 = expr.eval(es);
        let dx = (v - v2) / dv;
        if (Math.abs(dx) < 1e-6) dx = this.sign(dx, 1e-6);
        sim.stampCCCS(this.nodes[ic + 1], this.nodes[ic], this.pinVoltSource(i * 2 + 1), dx);
        // adjust right side
        rs -= dx * cur;
        this.setCurrentExprValue(i, cur);
      }
      sim.stampCurrentSource(this.nodes[ic + 1], this.nodes[ic], rs);
    }
  }

  override stepFinished(): void {
    this.exprState.updateLastValues(this.pins[this.inputCount].current);
  }

  override getVoltageSourceCount(): number {
    return this.isSpiceStyle() ? 0 : this.inputPairCount;
  }
  override getDumpType(): number {
    return 215;
  }
  override hasCurrentOutput(): boolean {
    return true;
  }

  override setCurrent(vs: VoltageSource, c: number): void {
    for (let i = 0; i !== this.inputCount; i += 2)
      if (this.pins[i + 1].voltSource === vs) {
        this.pins[i].current = -c;
        this.pins[i + 1].current = c;
        return;
      }
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 1) this.setInputCount(ei);
    else super.setEditValue(n, ei);
  }

  override setVoltageSource(j: number, vs: VoltageSource): void {
    if (this.isSpiceStyle()) this.pins[this.inputCount].voltSource = vs;
    else {
      super.setVoltageSource(j, vs);
      vs.setNodes(this.nodes[j * 2], this.nodes[j * 2 + 1]);
    }
  }
}

/** A current-controlled voltage source. */
export class CCVSElm extends CurrentControlledElm {
  outputVS: VoltageSource | null = null;
  lastOutput = 0;

  override getClassName(): string {
    return 'CCVSElm';
  }
  outputNames(): [string, string] {
    return ['V+', 'V-'];
  }
  lastCurrentCount(): number {
    return this.inputPairCount;
  }
  override getChipName(): string {
    return 'CCVS';
  }

  override stamp(): void {
    this.stampInputs();
    // voltage source for outputs
    const ic = this.inputCount;
    const vn2 = this.pins[ic].voltSource;
    this.outputVS = vn2;
    this.sim.stampVoltageSource(this.nodes[ic + 1], this.nodes[ic], vn2);
  }

  override doStep(): void {
    const sim = this.sim;
    const ic = this.inputCount;
    this.loadSpiceCurrents();

    // converged yet?
    const convergeLimitCurrent = this.getConvergeLimit() * 0.1;
    for (let i = 0; i !== this.inputPairCount; i++) {
      const cur = this.pins[i * 2 + 1].current;
      if (Math.abs(cur - this.lastCurrents[i]) > convergeLimitCurrent) sim.converged = false;
    }
    const convergeLimitVoltage = this.getConvergeLimit();
    if (Math.abs(this.volts[ic] - this.volts[ic + 1] - this.lastOutput) > convergeLimitVoltage)
      sim.converged = false;

    const vno = this.outputVS;
    const expr = this.expr;
    if (expr !== null && vno !== null) {
      const es = this.exprState;
      // calculate output
      for (let i = 0; i !== this.inputPairCount; i++)
        this.setCurrentExprValue(i, this.pins[i * 2 + 1].current);
      es.t = sim.t;
      const v0 = expr.eval(es);
      let rs = v0;

      for (let i = 0; i !== this.inputPairCount; i++) {
        const cur = this.pins[i * 2 + 1].current;
        const vni = this.pinVoltSource(i * 2 + 1);
        // upstream computes cur - lastCurrents[i] here, then always uses 1e-9
        const dv = 1e-9;
        this.setCurrentExprValue(i, cur);
        const v = expr.eval(es);
        this.setCurrentExprValue(i, cur - dv);
        const v2 = expr.eval(es);
        let dx = (v - v2) / dv;
        if (Math.abs(dx) < 1e-6) dx = this.sign(dx, 1e-6);
        sim.stampMatrixVV(vno, vni, -dx);
        // adjust right side
        rs -= dx * cur;
        this.setCurrentExprValue(i, cur);
      }
      sim.stampRightSideVS(vno, rs);
    }

    for (let i = 0; i !== this.inputPairCount; i++)
      this.lastCurrents[i] = this.pins[i * 2 + 1].current;
    this.lastOutput = this.volts[ic] - this.volts[ic + 1];
  }

  override stepFinished(): void {
    const ic = this.inputCount;
    this.exprState.updateLastValues(this.volts[ic] - this.volts[ic + 1]);
    for (let i = 0; i !== this.inputPairCount; i++)
      this.exprState.lastValues[i] = this.pins[i * 2 + 1].current;
  }

  override getVoltageSourceCount(): number {
    return this.isSpiceStyle() ? 1 : 1 + this.inputPairCount;
  }
  override getDumpType(): number {
    return 214;
  }
  override hasCurrentOutput(): boolean {
    return false;
  }

  override setCurrent(vs: VoltageSource, c: number): void {
    let i: number;
    if (!this.isSpiceStyle()) {
      for (i = 0; i !== this.inputCount; i += 2)
        if (this.pins[i + 1].voltSource === vs) {
          this.pins[i].current = -c;
          this.pins[i + 1].current = c;
          return;
        }
    } else i = this.inputCount;
    if (this.pins[i].voltSource === vs) {
      this.pins[i].current = c;
      this.pins[i + 1].current = -c;
    }
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 1) this.setInputCount(ei);
    else super.setChipEditValue(n, ei);
  }

  override setVoltageSource(j: number, vs: VoltageSource): void {
    const ic = this.inputCount;
    if (this.isSpiceStyle()) {
      this.pins[ic].voltSource = vs;
      vs.setNodes(this.nodes[ic + 1], this.nodes[ic]);
    } else {
      super.setVoltageSource(j, vs);
      if (j < this.inputPairCount) vs.setNodes(this.nodes[j * 2], this.nodes[j * 2 + 1]);
      else vs.setNodes(this.nodes[ic + 1], this.nodes[ic]);
    }
  }
}

export const VCCSElmType = elementType('VCCSElm', VCCSElm);
export const VCVSElmType = elementType('VCVSElm', VCVSElm);
export const CCCSElmType = elementType('CCCSElm', CCCSElm);
export const CCVSElmType = elementType('CCVSElm', CCVSElm);
