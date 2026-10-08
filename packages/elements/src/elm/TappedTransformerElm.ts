// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/TappedTransformerElm.java (master)
// at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Point } from '@perun/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { Inductor } from './InductorElm.ts';

/** A transformer with a center-tapped secondary. */
export class TappedTransformerElm extends CircuitElm {
  static readonly FLAG_FLIP = 1;

  inductance = 0;
  ratio = 0;
  couplingCoef = 0;
  flip = 0;
  ptEnds: Point[] = [];
  ptCoil: Point[] = [];
  ptCore: Point[] = [];
  /** Primary, upper half, lower half, and the tap. */
  currents = [0, 0, 0, 0];
  a = new Array<number>(9).fill(0);
  curSourceValue = [0, 0, 0];
  voltdiff = [0, 0, 0];

  override getClassName(): string {
    return 'TappedTransformerElm';
  }
  override getDumpType(): number {
    return 169;
  }
  override getXmlDumpType(): string {
    return 'tt';
  }

  override initNew(): void {
    this.inductance = 4;
    this.ratio = 1;
    this.noDiagonal = true;
    this.couplingCoef = 0.99;
  }

  override undump(st: StringTokenizer): void {
    this.inductance = parseJavaDouble(st.nextToken());
    this.ratio = parseJavaDouble(st.nextToken());
    this.currents[0] = parseJavaDouble(st.nextToken());
    this.currents[1] = parseJavaDouble(st.nextToken());
    try {
      this.currents[2] = parseJavaDouble(st.nextToken());
    } catch {
      // older files stop early
    }
    this.couplingCoef = 0.99;
    try {
      this.couplingCoef = parseJavaDouble(st.nextToken());
    } catch {
      // older files stop early
    }
    this.noDiagonal = true;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('in', this.inductance);
    w.dumpAttr('ra', this.ratio);
    w.dumpAttr('co', this.couplingCoef);
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    w.dumpAttr('c0', this.currents[0]);
    w.dumpAttr('c1', this.currents[1]);
    w.dumpAttr('c2', this.currents[2]);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.inductance = r.parseDoubleAttr('in', this.inductance);
    this.ratio = r.parseDoubleAttr('ra', this.ratio);
    this.couplingCoef = r.parseDoubleAttr('co', this.couplingCoef);
    this.currents[0] = r.parseDoubleAttr('c0', 0);
    this.currents[1] = r.parseDoubleAttr('c1', 0);
    this.currents[2] = r.parseDoubleAttr('c2', 0);
  }

  override setPoints(): void {
    super.setPoints();
    this.flip = this.hasFlag(TappedTransformerElm.FLAG_FLIP) ? -1 : 1;
    const hs = 32 * this.flip;
    const p1 = this.point1;
    const p2 = this.point2;
    const ends = (this.ptEnds = [
      p1,
      this.interpPointPerp(p1, p2, 0, -hs * 2),
      p2,
      this.interpPointPerp(p1, p2, 1, -hs),
      this.interpPointPerp(p1, p2, 1, -hs * 2),
    ]);
    const ce = 0.5 - 12 / this.dn;
    const cd = 0.5 - 2 / this.dn;
    this.ptCoil = [
      this.interpPoint(ends[0], ends[2], ce),
      this.interpPointPerp(ends[0], ends[2], ce, -hs * 2),
      this.interpPoint(ends[0], ends[2], 1 - ce),
      this.interpPointPerp(ends[0], ends[2], 1 - ce, -hs),
      this.interpPointPerp(ends[0], ends[2], 1 - ce, -hs * 2),
    ];
    const core = (this.ptCore = this.newPointArray(4));
    for (let i = 0; i !== 2; i++) {
      const b = -hs * i * 2;
      core[i] = this.interpPointPerp(ends[0], ends[2], cd, b);
      core[i + 2] = this.interpPointPerp(ends[0], ends[2], 1 - cd, b);
    }
  }

  override getPost(n: number): Point {
    return this.ptEnds[n];
  }
  override getPostCount(): number {
    return 5;
  }

  override reset(): void {
    this.currents.fill(0);
    this.volts.fill(0);
    this.curSourceValue.fill(0);
  }

  isTrapezoidal(): boolean {
    return (this.flags & Inductor.FLAG_BACK_EULER) === 0;
  }

  override stamp(): void {
    const sim = this.sim;
    const n = this.nodes;
    const a = this.a;
    const l1 = this.inductance;
    const l2 = (this.inductance * this.ratio * this.ratio) / 4;
    const m1 = this.couplingCoef * Math.sqrt(l1 * l2);
    const m2 = this.couplingCoef * l2;
    // inverse of the 3x3 inductance matrix (primary and the two secondary halves)
    a[0] = l2 + m2;
    a[1] = a[2] = a[3] = a[6] = -m1;
    a[4] = a[8] = (l1 * l2 - m1 * m1) / (l2 - m2);
    a[5] = a[7] = (m1 * m1 - l1 * m2) / (l2 - m2);
    const det = l1 * (l2 + m2) - 2 * m1 * m1;
    for (let i = 0; i !== 9; i++)
      a[i] *= (this.isTrapezoidal() ? sim.timeStep / 2 : sim.timeStep) / det;
    sim.stampConductance(n[0], n[1], a[0]);
    sim.stampVCCurrentSource(n[0], n[1], n[2], n[3], a[1]);
    sim.stampVCCurrentSource(n[0], n[1], n[3], n[4], a[2]);
    sim.stampVCCurrentSource(n[2], n[3], n[0], n[1], a[3]);
    sim.stampConductance(n[2], n[3], a[4]);
    sim.stampVCCurrentSource(n[2], n[3], n[3], n[4], a[5]);
    sim.stampVCCurrentSource(n[3], n[4], n[0], n[1], a[6]);
    sim.stampVCCurrentSource(n[3], n[4], n[2], n[3], a[7]);
    sim.stampConductance(n[3], n[4], a[8]);
    for (let i = 0; i !== 5; i++) sim.stampRightSide(n[i]);
  }

  private computeVoltDiffs(): void {
    const v = this.volts;
    this.voltdiff[0] = v[0] - v[1];
    this.voltdiff[1] = v[2] - v[3];
    this.voltdiff[2] = v[3] - v[4];
  }

  override startIteration(): void {
    this.computeVoltDiffs();
    for (let i = 0; i !== 3; i++) {
      this.curSourceValue[i] = this.currents[i];
      if (this.isTrapezoidal())
        for (let j = 0; j !== 3; j++)
          this.curSourceValue[i] += this.a[i * 3 + j] * this.voltdiff[j];
    }
  }

  override doStep(): void {
    const n = this.nodes;
    this.sim.stampCurrentSource(n[0], n[1], this.curSourceValue[0]);
    this.sim.stampCurrentSource(n[2], n[3], this.curSourceValue[1]);
    this.sim.stampCurrentSource(n[3], n[4], this.curSourceValue[2]);
  }

  override calculateCurrent(): void {
    this.computeVoltDiffs();
    for (let i = 0; i !== 3; i++) {
      this.currents[i] = this.curSourceValue[i];
      for (let j = 0; j !== 3; j++) this.currents[i] += this.a[i * 3 + j] * this.voltdiff[j];
    }
    this.currents[3] = this.currents[1] - this.currents[2];
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'transformer';
    arr[1] = 'L = ' + getUnitText(this.inductance, 'H');
    arr[2] = 'Ratio = 1:' + this.ratio;
    arr[3] = 'Vd1 = ' + getVoltageText(this.volts[0] - this.volts[2]);
    arr[4] = 'Vd2 = ' + getVoltageText(this.volts[1] - this.volts[3]);
  }

  override getCurrentIntoNode(n: number): number {
    if (n === 0) return -this.currents[0];
    if (n === 1) return this.currents[0];
    if (n === 2) return -this.currents[1];
    if (n === 3) return this.currents[3];
    return this.currents[2];
  }

  override getConnection(n1: number, n2: number): boolean {
    if (this.comparePair(n1, n2, 0, 1)) return true;
    if (this.comparePair(n1, n2, 2, 3)) return true;
    if (this.comparePair(n1, n2, 3, 4)) return true;
    if (this.comparePair(n1, n2, 2, 4)) return true;
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
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.value > 0) this.inductance = ei.value;
    // upstream tests the old ratio here, not the new value
    if (n === 1 && this.ratio > 0) this.ratio = 1 / ei.value;
    if (n === 2) {
      if (ei.value > 0 && ei.value < 1) this.couplingCoef = ei.value;
      else ei.setError('must be > 0 and < 1');
    }
    if (n === 3) {
      if (ei.checkbox?.state === true) this.flags &= ~Inductor.FLAG_BACK_EULER;
      else this.flags |= Inductor.FLAG_BACK_EULER;
    }
  }

  override flipX(c2: number, count: number): void {
    this.flags ^= TappedTransformerElm.FLAG_FLIP;
    super.flipX(c2, count);
  }
  override flipY(c2: number, count: number): void {
    this.flags ^= TappedTransformerElm.FLAG_FLIP;
    super.flipY(c2, count);
  }
  override flipXY(c2: number, count: number): void {
    this.flags ^= TappedTransformerElm.FLAG_FLIP;
    super.flipXY(c2, count);
  }
}

export const TappedTransformerElmType = elementType('TappedTransformerElm', TappedTransformerElm);
