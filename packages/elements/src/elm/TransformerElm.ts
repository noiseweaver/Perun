// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/TransformerElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Point } from '@perun/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentText, getUnitText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { Inductor } from './InductorElm.ts';

export class TransformerElm extends CircuitElm {
  static readonly FLAG_REVERSE = 4;
  static readonly FLAG_VERTICAL = 8;
  static readonly FLAG_FLIP = 16;

  inductance = 0;
  ratio = 0;
  couplingCoef = 0;
  /** 0 = disabled (linear core). */
  saturationCurrent = 0;
  ptEnds: Point[] = [];
  ptCoil: Point[] = [];
  ptCore: Point[] = [];
  currents = [0, 0];
  /** Polarity dots, when the secondary is reversed. */
  dots: Point[] | null = null;
  width = 0;
  polarity = 0;
  flip = 0;
  a1 = 0;
  a2 = 0;
  a3 = 0;
  a4 = 0;
  curSourceValue1 = 0;
  curSourceValue2 = 0;

  override getClassName(): string {
    return 'TransformerElm';
  }
  override getDumpType(): number {
    return 'T'.charCodeAt(0);
  }

  override initNew(): void {
    this.inductance = 4;
    this.ratio = this.polarity = 1;
    this.width = 32;
    this.noDiagonal = true;
    this.couplingCoef = 0.999;
  }

  override undump(st: StringTokenizer): void {
    if (this.hasFlag(TransformerElm.FLAG_VERTICAL))
      this.width = -Math.max(32, Math.abs(this.x2 - this.x));
    else this.width = Math.max(32, Math.abs(this.y2 - this.y));
    this.inductance = parseJavaDouble(st.nextToken());
    this.ratio = parseJavaDouble(st.nextToken());
    this.currents[0] = parseJavaDouble(st.nextToken());
    this.currents[1] = parseJavaDouble(st.nextToken());
    this.couplingCoef = 0.999;
    try {
      this.couplingCoef = parseJavaDouble(st.nextToken());
      this.saturationCurrent = parseJavaDouble(st.nextToken());
    } catch {
      // older files stop early
    }
    this.noDiagonal = true;
    this.polarity = this.hasFlag(TransformerElm.FLAG_REVERSE) ? -1 : 1;
  }

  override drag(xx: number, yy: number): void {
    xx = this.snapGrid(xx);
    yy = this.snapGrid(yy);
    if (Math.abs(xx - this.x) > Math.abs(yy - this.y)) this.flags &= ~TransformerElm.FLAG_VERTICAL;
    else this.flags |= TransformerElm.FLAG_VERTICAL;
    if (this.hasFlag(TransformerElm.FLAG_VERTICAL))
      this.width = -Math.max(32, Math.abs(xx - this.x));
    else this.width = Math.max(32, Math.abs(yy - this.y));
    if (xx === this.x) yy = this.y;
    this.x2 = xx;
    this.y2 = yy;
    this.setPoints();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('in', this.inductance);
    w.dumpAttr('ra', this.ratio);
    w.dumpAttr('co', this.couplingCoef);
    w.dumpAttr('wi', this.width);
    if (this.saturationCurrent !== 0) w.dumpAttr('isat', this.saturationCurrent);
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    w.dumpAttr('c0', this.currents[0]);
    w.dumpAttr('c1', this.currents[1]);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    if (this.hasFlag(TransformerElm.FLAG_VERTICAL))
      this.width = -Math.max(32, Math.abs(this.x2 - this.x));
    else this.width = Math.max(32, Math.abs(this.y2 - this.y));
    this.inductance = r.parseDoubleAttr('in', this.inductance);
    this.ratio = r.parseDoubleAttr('ra', this.ratio);
    this.couplingCoef = r.parseDoubleAttr('co', this.couplingCoef);
    this.width = r.parseIntAttr('wi', this.width);
    this.saturationCurrent = r.parseDoubleAttr('isat', this.saturationCurrent);
    this.currents[0] = r.parseDoubleAttr('c0', 0);
    this.currents[1] = r.parseDoubleAttr('c1', 0);
    this.polarity = this.hasFlag(TransformerElm.FLAG_REVERSE) ? -1 : 1;
  }

  override nonLinear(): boolean {
    return this.saturationCurrent > 0;
  }
  isTrapezoidal(): boolean {
    return (this.flags & Inductor.FLAG_BACK_EULER) === 0;
  }

  override setPoints(): void {
    super.setPoints();
    if (this.hasFlag(TransformerElm.FLAG_VERTICAL)) this.point2.x = this.point1.x;
    else this.point2.y = this.point1.y;
    const ptEnds = (this.ptEnds = this.newPointArray(4));
    const ptCoil = (this.ptCoil = this.newPointArray(4));
    const ptCore = (this.ptCore = this.newPointArray(4));
    ptEnds[0] = this.point1;
    ptEnds[1] = this.point2;
    this.flip = this.hasFlag(TransformerElm.FLAG_FLIP) ? -1 : 1;
    const off = -this.dsign * this.width * this.flip;
    ptEnds[2] = this.interpPointPerp(this.point1, this.point2, 0, off);
    ptEnds[3] = this.interpPointPerp(this.point1, this.point2, 1, off);
    const ce = 0.5 - 12 / this.dn;
    const cd = 0.5 - 2 / this.dn;
    for (let i = 0; i !== 4; i += 2) {
      ptCoil[i] = this.interpPoint(ptEnds[i], ptEnds[i + 1], ce);
      ptCoil[i + 1] = this.interpPoint(ptEnds[i], ptEnds[i + 1], 1 - ce);
      ptCore[i] = this.interpPoint(ptEnds[i], ptEnds[i + 1], cd);
      ptCore[i + 1] = this.interpPoint(ptEnds[i], ptEnds[i + 1], 1 - cd);
    }
    if (this.polarity === -1) {
      const vsign = this.hasFlag(TransformerElm.FLAG_VERTICAL) ? -1 : 1;
      const dotp = Math.abs(7 / this.width);
      const g = -7 * this.dsign * vsign * this.flip;
      this.dots = [
        this.interpPointPerp(ptCoil[0], ptCoil[2], dotp, g),
        this.interpPointPerp(ptCoil[3], ptCoil[1], dotp, g),
      ];
      let x = ptEnds[1];
      ptEnds[1] = ptEnds[3];
      ptEnds[3] = x;
      x = ptCoil[1];
      ptCoil[1] = ptCoil[3];
      ptCoil[3] = x;
    } else this.dots = null;
  }

  override getPost(n: number): Point {
    return this.ptEnds[n];
  }
  override getPostCount(): number {
    return 4;
  }

  override reset(): void {
    this.currents[0] = this.currents[1] = 0;
    this.volts[0] = this.volts[1] = this.volts[2] = this.volts[3] = 0;
    this.curSourceValue1 = this.curSourceValue2 = 0;
  }

  calcEffectiveInductance(l0: number, i: number, isat: number): number {
    if (isat <= 0) return l0;
    const ratio = i / isat;
    return l0 / (1 + ratio * ratio);
  }

  computeCoefficients(l1: number, l2: number, m: number): void {
    const deti = 1 / (l1 * l2 - m * m);
    const ts = this.isTrapezoidal() ? this.sim.timeStep / 2 : this.sim.timeStep;
    this.a1 = l2 * deti * ts;
    this.a2 = -m * deti * ts;
    this.a3 = -m * deti * ts;
    this.a4 = l1 * deti * ts;
  }

  override stamp(): void {
    // the coupled inductors are stamped as their inverse inductance matrix, scaled by the time
    // step: a conductance per winding plus voltage-controlled current sources between them
    const sim = this.sim;
    const n = this.nodes;
    const l1 = this.inductance;
    const l2 = this.inductance * this.ratio * this.ratio;
    const m = this.couplingCoef * Math.sqrt(l1 * l2);
    this.computeCoefficients(l1, l2, m);
    if (this.saturationCurrent > 0) {
      sim.stampNonLinear(n[0]);
      sim.stampNonLinear(n[1]);
      sim.stampNonLinear(n[2]);
      sim.stampNonLinear(n[3]);
    } else this.stampCoefficients();
    sim.stampRightSide(n[0]);
    sim.stampRightSide(n[1]);
    sim.stampRightSide(n[2]);
    sim.stampRightSide(n[3]);
  }

  private stampCoefficients(): void {
    const sim = this.sim;
    const n = this.nodes;
    sim.stampConductance(n[0], n[2], this.a1);
    sim.stampVCCurrentSource(n[0], n[2], n[1], n[3], this.a2);
    sim.stampVCCurrentSource(n[1], n[3], n[0], n[2], this.a3);
    sim.stampConductance(n[1], n[3], this.a4);
  }

  override startIteration(): void {
    if (this.saturationCurrent > 0) {
      const l1 = this.calcEffectiveInductance(
        this.inductance,
        this.currents[0],
        this.saturationCurrent,
      );
      const l2 = this.calcEffectiveInductance(
        this.inductance * this.ratio * this.ratio,
        this.currents[1],
        this.saturationCurrent * this.ratio,
      );
      const m = this.couplingCoef * Math.sqrt(l1 * l2);
      this.computeCoefficients(l1, l2, m);
    }
    const voltdiff1 = this.volts[0] - this.volts[2];
    const voltdiff2 = this.volts[1] - this.volts[3];
    if (this.isTrapezoidal()) {
      this.curSourceValue1 = voltdiff1 * this.a1 + voltdiff2 * this.a2 + this.currents[0];
      this.curSourceValue2 = voltdiff1 * this.a3 + voltdiff2 * this.a4 + this.currents[1];
    } else {
      this.curSourceValue1 = this.currents[0];
      this.curSourceValue2 = this.currents[1];
    }
  }

  override doStep(): void {
    if (this.saturationCurrent > 0) this.stampCoefficients();
    this.sim.stampCurrentSource(this.nodes[0], this.nodes[2], this.curSourceValue1);
    this.sim.stampCurrentSource(this.nodes[1], this.nodes[3], this.curSourceValue2);
  }

  override calculateCurrent(): void {
    const voltdiff1 = this.volts[0] - this.volts[2];
    const voltdiff2 = this.volts[1] - this.volts[3];
    this.currents[0] = voltdiff1 * this.a1 + voltdiff2 * this.a2 + this.curSourceValue1;
    this.currents[1] = voltdiff1 * this.a3 + voltdiff2 * this.a4 + this.curSourceValue2;
  }

  override getCurrentIntoNode(n: number): number {
    if (n < 2) return -this.currents[n];
    return this.currents[n - 2];
  }

  override getInfo(arr: string[]): void {
    arr[0] = this.saturationCurrent > 0 ? 'transformer (sat)' : 'transformer';
    arr[1] = 'L = ' + getUnitText(this.inductance, 'H');
    arr[2] = 'Ratio = 1:' + this.ratio;
    arr[3] = 'Vd1 = ' + getVoltageText(this.volts[0] - this.volts[2]);
    arr[4] = 'Vd2 = ' + getVoltageText(this.volts[1] - this.volts[3]);
    arr[5] = 'I1 = ' + getCurrentText(this.currents[0]);
    arr[6] = 'I2 = ' + getCurrentText(this.currents[1]);
    if (this.saturationCurrent > 0) {
      const l1Eff = this.calcEffectiveInductance(
        this.inductance,
        this.currents[0],
        this.saturationCurrent,
      );
      arr[7] = 'L1eff = ' + getUnitText(l1Eff, 'H');
    }
  }

  override getConnection(n1: number, n2: number): boolean {
    if (this.comparePair(n1, n2, 0, 2)) return true;
    if (this.comparePair(n1, n2, 1, 3)) return true;
    return false;
  }
  override getMatrixConnection(_n1: number, _n2: number): boolean {
    return true;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0)
      return new EditInfo('Primary Inductance (H)', this.inductance, 0.01, 5).setPositive();
    if (n === 1)
      return new EditInfo('Ratio (N1/N2)', 1 / this.ratio, 1, 10).setDimensionless().setPositive();
    if (n === 2)
      return new EditInfo('Coupling Coefficient', this.couplingCoef, 0, 1)
        .setDimensionless()
        .setPositive();
    if (n === 3) return EditInfo.createCheckbox('Trapezoidal Approximation', this.isTrapezoidal());
    if (n === 4) return EditInfo.createCheckbox('Swap Secondary Polarity', this.polarity === -1);
    if (n === 5) return new EditInfo('Saturation Current (A) (0=none)', this.saturationCurrent);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.value > 0) this.inductance = ei.value;
    if (n === 1 && ei.value > 0) this.ratio = 1 / ei.value;
    if (n === 2) {
      if (ei.value > 0 && ei.value < 1) this.couplingCoef = ei.value;
      else ei.setError('must be > 0 and < 1');
    }
    if (n === 3) {
      if (ei.checkbox?.state === true) this.flags &= ~Inductor.FLAG_BACK_EULER;
      else this.flags |= Inductor.FLAG_BACK_EULER;
    }
    if (n === 4) {
      const on = ei.checkbox?.state === true;
      this.polarity = on ? -1 : 1;
      if (on) this.flags |= TransformerElm.FLAG_REVERSE;
      else this.flags &= ~TransformerElm.FLAG_REVERSE;
      this.setPoints();
    }
    if (n === 5) {
      if (ei.value >= 0) this.saturationCurrent = ei.value;
      else ei.setError('must be >= 0');
    }
  }

  override flipX(c2: number, count: number): void {
    if (this.hasFlag(TransformerElm.FLAG_VERTICAL)) this.flags ^= TransformerElm.FLAG_FLIP;
    super.flipX(c2, count);
  }
  override flipY(c2: number, count: number): void {
    if (!this.hasFlag(TransformerElm.FLAG_VERTICAL)) this.flags ^= TransformerElm.FLAG_FLIP;
    super.flipY(c2, count);
  }
  override flipXY(xmy: number, count: number): void {
    this.flags ^= TransformerElm.FLAG_VERTICAL;
    this.width *= -1;
    super.flipXY(xmy, count);
  }
}

export const TransformerElmType = elementType('TransformerElm', TransformerElm);
