// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CustomTransformerElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { invertMatrix, Point } from '@perun/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { unescapeToken } from '../escape.ts';
import { parseJavaDouble, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentText, getUnitText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { Inductor } from './InductorElm.ts';

/** Java `StringTokenizer(desc, ",:+", true)`: runs of other characters, and each delimiter. */
function descriptionTokens(desc: string): string[] {
  return desc.match(/[,:+]|[^,:+]+/g) ?? [];
}

/**
 * A transformer with any number of coils, described by text: each number is a coil (its turns
 * ratio to the base inductance coil; negative reverses polarity), "," separates coils, "+" joins
 * two coils at a tap, and ":" separates the primary from the secondary.
 */
export class CustomTransformerElm extends CircuitElm {
  static readonly FLAG_FLIP = 1;

  coilCurrents: number[] = [];
  coilInductances: number[] = [];
  coilCurSourceValues: number[] = [];
  coilPolarities: number[] = [];
  nodeCurrents: number[] = [];
  flip = 1;
  /** Node number of the first node of each coil (the second is n + 1). */
  coilNodes: number[] = [];
  coilCount = 0;
  nodeCount = 0;
  /** Number of primary coils. */
  primaryCoils = 0;
  nodePoints: Point[] = [];
  nodeTaps: Point[] = [];
  ptCore: Point[] = [];
  description = '';
  inductance = 4;
  couplingCoef = 0.999;
  needDots = false;
  /** Polarity dots, one per coil, when any coil is reversed. */
  dots: Point[] | null = null;
  width = 32;
  xformMatrix: number[][] | null = null;

  override getClassName(): string {
    return 'CustomTransformerElm';
  }
  override getDumpType(): number {
    return 406;
  }

  override initNew(): void {
    this.inductance = 4;
    this.width = 32;
    this.noDiagonal = true;
    this.couplingCoef = 0.999;
    this.description = '1,1:1';
    this.parseDescription(this.description);
  }

  override undump(st: StringTokenizer): void {
    this.width = 32;
    this.inductance = parseJavaDouble(st.nextToken());
    this.couplingCoef = parseJavaDouble(st.nextToken());
    this.description = unescapeToken(st.nextToken());
    this.coilCount = parseJavaInt(st.nextToken());
    this.coilCurrents = new Array<number>(this.coilCount).fill(0);
    for (let i = 0; i !== this.coilCount; i++)
      this.coilCurrents[i] = parseJavaDouble(st.nextToken());
    this.noDiagonal = true;
    this.parseDescription(this.description);
  }

  override drag(xx: number, yy: number): void {
    xx = this.snapGrid(xx);
    yy = this.snapGrid(yy);
    if (xx === this.x) yy = this.y;
    this.x2 = xx;
    this.y2 = yy;
    this.setPoints();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('in', this.inductance);
    w.dumpAttr('cc', this.couplingCoef);
    w.dumpAttr('ds', this.description);
    w.dumpAttr('nc', this.coilCount);
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    let s = '';
    for (let i = 0; i !== this.coilCount; i++) {
      if (i > 0) s += ' ';
      s += String(this.coilCurrents[i]);
    }
    w.dumpAttr('ci', s);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.inductance = r.parseDoubleAttr('in', this.inductance);
    this.couplingCoef = r.parseDoubleAttr('cc', this.couplingCoef);
    this.description = r.parseStringAttr('ds', this.description);
    this.coilCount = r.parseIntAttr('nc', this.coilCount);
    this.coilCurrents = new Array<number>(this.coilCount).fill(0);
    const ci = r.parseStringAttr('ci', null);
    if (ci !== null) {
      const toks = ci.split(' ').filter((t) => t !== '');
      for (let i = 0; i !== this.coilCount && i < toks.length; i++)
        this.coilCurrents[i] = parseJavaDouble(toks[i]);
    }
    this.parseDescription(this.description);
  }

  /** Set up coils and nodes from a description; false (and an error on `ei`) if it is bad. */
  parseDescription(desc: string, ei: EditInfo | null = null): boolean {
    let toks = descriptionTokens(desc);
    // count coils/nodes
    this.coilCount = this.nodeCount = 0;
    for (const s of toks) {
      if (s === '+') this.nodeCount--;
      if (s === ',' || s === '+' || s === ':') continue;
      this.nodeCount += 2;
      this.coilCount++;
    }
    if (this.coilCount === 0) {
      ei?.setError('no coils defined');
      return false;
    }
    const coilCount = this.coilCount;
    this.coilNodes = new Array<number>(coilCount).fill(0);
    this.coilInductances = new Array<number>(coilCount).fill(0);
    // keep the coil currents if possible (needed for undumping)
    if (this.coilCurrents.length !== coilCount)
      this.coilCurrents = new Array<number>(coilCount).fill(0);
    this.coilCurSourceValues = new Array<number>(coilCount).fill(0);
    this.coilPolarities = new Array<number>(coilCount).fill(0);
    this.nodePoints = this.newPointArray(this.nodeCount);
    this.nodeTaps = this.newPointArray(this.nodeCount);
    this.nodeCurrents = new Array<number>(this.nodeCount).fill(0);

    // start over
    toks = descriptionTokens(desc);
    let k = 0;
    let nodeNum = 0;
    let coilNum = 0;
    this.primaryCoils = 0;
    let secondary = false;
    this.needDots = false;
    for (;;) {
      let tok = toks[k++] ?? '';
      let n: number;
      try {
        n = parseJavaDouble(tok);
      } catch {
        ei?.setError("expected number, got '" + tok + "'");
        return false;
      }
      if (n === 0) {
        ei?.setError('turns ratio cannot be zero');
        return false;
      }
      // create new coil
      this.coilNodes[coilNum] = nodeNum;
      this.coilInductances[coilNum] = n * n * this.inductance;
      this.coilPolarities[coilNum] = 1;
      if (n < 0) {
        this.coilPolarities[coilNum] = -1;
        this.needDots = true;
      }
      nodeNum += 2;
      coilNum++;
      if (!secondary) this.primaryCoils = coilNum;
      if (k >= toks.length) break;
      tok = toks[k++];
      if (tok === ',') continue;
      if (tok === '+') {
        nodeNum--;
        continue;
      }
      if (tok === ':') {
        // switch to secondary
        if (secondary) {
          ei?.setError("only one ':' separator allowed");
          return false;
        }
        secondary = true;
        continue;
      }
      ei?.setError("unexpected '" + tok + "'");
      return false;
    }
    this.allocNodes();
    this.setPoints();
    this.xformMatrix = null;
    return true;
  }

  isTrapezoidal(): boolean {
    return (this.flags & Inductor.FLAG_BACK_EULER) === 0;
  }

  override setPoints(): void {
    super.setPoints();
    this.point2 = new Point(this.point2.x, this.point1.y);
    const p1 = this.point1;
    const p2 = this.point2;
    this.flip = this.hasFlag(CustomTransformerElm.FLAG_FLIP) ? -1 : 1;
    const primaryNodes =
      this.primaryCoils === this.coilCount ? this.nodeCount : this.coilNodes[this.primaryCoils];
    this.dn = Math.abs(p1.x - p2.x);
    const ce = 0.5 - 12 / this.dn;
    const cd = 0.5 - 2 / this.dn;
    let maxWidth = 0;
    for (let step = 0; step !== 2; step++) {
      let c = 0;
      let offset = 0;
      for (let i = 0; i !== this.nodeCount; i++) {
        if (i === primaryNodes) offset = 0;
        if (step === 1) {
          if (i === primaryNodes - 1 || i === this.nodeCount - 1) offset = maxWidth;
          const prim = i < primaryNodes;
          this.nodePoints[i] = this.interpPointPerp(p1, p2, prim ? 0 : 1, -offset * this.flip);
          this.nodeTaps[i] = this.interpPointPerp(p1, p2, prim ? ce : 1 - ce, -offset * this.flip);
        }
        maxWidth = Math.max(maxWidth, offset);
        const nn = c < this.coilCount ? this.coilNodes[c] : -1;
        if (nn === i) {
          // first node of a coil: make room
          c++;
          offset += this.width;
        } else {
          // last node of a coil: small gap
          offset += 16;
        }
      }
    }
    this.ptCore = this.newPointArray(4);
    for (let i = 0; i !== 4; i += 2) {
      const h = i === 2 ? -maxWidth * this.flip : 0;
      this.ptCore[i] = this.interpPointPerp(p1, p2, cd, h);
      this.ptCore[i + 1] = this.interpPointPerp(p1, p2, 1 - cd, h);
    }
    if (this.needDots) {
      const dots: Point[] = [];
      const dotp = Math.abs(7 / this.width);
      for (let i = 0; i !== this.coilCount; i++) {
        const n = this.coilNodes[i];
        dots.push(
          this.interpPointPerp(
            this.nodeTaps[n],
            this.nodeTaps[n + 1],
            this.coilPolarities[i] > 0 ? dotp : 1 - dotp,
            i < this.primaryCoils ? -7 : 7,
          ),
        );
      }
      this.dots = dots;
    } else this.dots = null;
  }

  override getPost(n: number): Point {
    return this.nodePoints[n];
  }
  override getPostCount(): number {
    return this.nodeCount;
  }

  // upstream's reset doesn't call super.reset()
  override reset(): void {
    for (let i = 0; i !== this.coilCount; i++)
      this.coilCurrents[i] = this.coilCurSourceValues[i] = 0;
    for (let i = 0; i !== this.nodeCount; i++) this.volts[i] = this.nodeCurrents[i] = 0;
  }

  override stamp(): void {
    // The coil equations v = L di/dt (with mutual inductances) are inverted to di/dt = A v and
    // integrated (trapezoidal, or backward Euler): each coil becomes a current source, a
    // conductance, and voltage-controlled current sources for the other coils.
    const coilCount = this.coilCount;
    const xform: number[][] = [];
    for (let i = 0; i !== coilCount; i++) xform.push(new Array<number>(coilCount).fill(0));
    this.xformMatrix = xform;
    const L = this.coilInductances;
    const pol = this.coilPolarities;
    for (let i = 0; i !== coilCount; i++) xform[i][i] = L[i];
    for (let i = 0; i !== coilCount; i++)
      for (let j = 0; j !== i; j++)
        xform[i][j] = xform[j][i] = this.couplingCoef * Math.sqrt(L[i] * L[j]) * pol[i] * pol[j];
    invertMatrix(xform, coilCount);
    const sim = this.sim;
    const nodes = this.nodes;
    const ts = this.isTrapezoidal() ? sim.timeStep / 2 : sim.timeStep;
    for (let i = 0; i !== coilCount; i++)
      for (let j = 0; j !== coilCount; j++) {
        // multiply in dt/2 (or dt for backward euler)
        xform[i][j] *= ts;
        const ni = this.coilNodes[i];
        const nj = this.coilNodes[j];
        if (i === j) sim.stampConductance(nodes[ni], nodes[ni + 1], xform[i][i]);
        else
          sim.stampVCCurrentSource(nodes[ni], nodes[ni + 1], nodes[nj], nodes[nj + 1], xform[i][j]);
      }
    for (let i = 0; i !== this.nodeCount; i++) sim.stampRightSide(nodes[i]);
  }

  override startIteration(): void {
    const xform = this.xformMatrix as number[][];
    for (let i = 0; i !== this.coilCount; i++) {
      let val = this.coilCurrents[i];
      if (this.isTrapezoidal())
        for (let j = 0; j !== this.coilCount; j++) {
          const n = this.coilNodes[j];
          const voltdiff = this.volts[n] - this.volts[n + 1];
          val += voltdiff * xform[i][j];
        }
      this.coilCurSourceValues[i] = val;
    }
  }

  override doStep(): void {
    for (let i = 0; i !== this.coilCount; i++) {
      const n = this.coilNodes[i];
      this.sim.stampCurrentSource(this.nodes[n], this.nodes[n + 1], this.coilCurSourceValues[i]);
    }
  }

  override calculateCurrent(): void {
    this.nodeCurrents.fill(0);
    const xform = this.xformMatrix;
    for (let i = 0; i !== this.coilCount; i++) {
      let val = this.coilCurSourceValues[i];
      if (xform !== null)
        for (let j = 0; j !== this.coilCount; j++) {
          const n = this.coilNodes[j];
          const voltdiff = this.volts[n] - this.volts[n + 1];
          val += voltdiff * xform[i][j];
        }
      this.coilCurrents[i] = val;
      const ni = this.coilNodes[i];
      this.nodeCurrents[ni] += val;
      this.nodeCurrents[ni + 1] -= val;
    }
  }

  override getCurrentIntoNode(n: number): number {
    return -this.nodeCurrents[n];
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'transformer (custom)';
    arr[1] = 'L = ' + getUnitText(this.inductance, 'H');
    // upstream's info array holds 10 lines
    for (let i = 0; i !== this.coilCount; i++) {
      if (2 + i * 2 >= 10) break;
      const ni = this.coilNodes[i];
      arr[2 + i * 2] = 'Vd' + (i + 1) + ' = ' + getVoltageText(this.volts[ni] - this.volts[ni + 1]);
      arr[3 + i * 2] = 'I' + (i + 1) + ' = ' + getCurrentText(this.coilCurrents[i]);
    }
  }

  override getConnection(n1: number, n2: number): boolean {
    for (let i = 0; i !== this.coilCount; i++)
      if (this.comparePair(n1, n2, this.coilNodes[i], this.coilNodes[i] + 1)) return true;
    return false;
  }

  // VCCS stamps couple all nodes, so they must all be in the same matrix
  override getMatrixConnection(_n1: number, _n2: number): boolean {
    return true;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Base Inductance (H)', this.inductance, 0.01, 5).setPositive();
    if (n === 1) {
      const ei = new EditInfo(
        EditInfo.makeLink('customtransformer.html', 'Description'),
        0,
        -1,
        -1,
      );
      ei.setErrorFieldName('Description');
      ei.text = this.description;
      ei.disallowSliders();
      return ei;
    }
    if (n === 2)
      return new EditInfo('Coupling Coefficient', this.couplingCoef, 0, 1)
        .setDimensionless()
        .setPositive();
    if (n === 3) {
      const ei = new EditInfo('', 0, -1, -1);
      ei.checkbox = { label: 'Trapezoidal Approximation', state: this.isTrapezoidal() };
      return ei;
    }
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.value > 0) {
      this.inductance = ei.value;
      this.parseDescription(this.description);
    }
    if (n === 1) {
      const s = ei.text ?? '';
      if (s !== this.description) {
        if (!this.parseDescription(s, ei)) this.parseDescription(this.description);
        else this.description = s;
        this.setPoints();
      }
    }
    if (n === 2) {
      if (ei.value > 0 && ei.value < 1) {
        this.couplingCoef = ei.value;
        this.parseDescription(this.description);
      } else ei.setError('must be > 0 and < 1');
    }
    if (n === 3) {
      if (ei.checkbox?.state) this.flags &= ~Inductor.FLAG_BACK_EULER;
      else this.flags |= Inductor.FLAG_BACK_EULER;
      this.parseDescription(this.description);
    }
  }

  override flipX(c2: number, count: number): void {
    this.flags ^= CustomTransformerElm.FLAG_FLIP;
    super.flipX(c2, count);
  }
  override flipY(c2: number, count: number): void {
    this.flags ^= CustomTransformerElm.FLAG_FLIP;
    super.flipY(c2, count);
  }
  // vertical not supported
  override canFlipXY(): boolean {
    return false;
  }
}

export const CustomTransformerElmType = elementType('CustomTransformerElm', CustomTransformerElm);
