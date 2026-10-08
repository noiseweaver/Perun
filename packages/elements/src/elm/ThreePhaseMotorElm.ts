// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ThreePhaseMotorElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { invertMatrix, Point, type CircuitNode, type VoltageSource } from '@perun/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { formatNumber, MU } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

const N001 = 6;
const N002 = 7;
const N003 = 8;
const N004 = 9;
const N005 = 10;
const N006 = 11;
const N007 = 12;
const ZP = 2;
const COIL_COUNT = 5;
/** Both ends of each coupled coil: three stator phases, then the two rotor axes. */
const COIL_NODES = [N001, 1, N003, 3, N005, 5, N002, N004, N006, N007];

/** Upstream `getUnitTextRPM`: GWT "####.##" with a unit prefix. */
function getUnitTextRPM(v: number, u: string): string {
  const nf = (x: number): string => formatNumber(x, 2);
  const va = Math.abs(v);
  if (va < 1e-14) return '0 ' + u;
  if (va < 1e-9) return nf(v * 1e12) + ' p' + u;
  if (va < 1e-6) return nf(v * 1e9) + ' n' + u;
  if (va < 1e-3) return nf(v * 1e6) + ' ' + MU + u;
  if (va < 1) return nf(v * 1e3) + ' m' + u;
  if (va < 1e3) return nf(v) + ' ' + u;
  if (va < 1e6) return nf(v * 1e-3) + ' k' + u;
  if (va < 1e9) return nf(v * 1e-6) + ' M' + u;
  if (va < 1e12) return nf(v * 1e-9) + ' G' + u;
  const [m = '0', e = '0'] = v.toExponential(2).split('e');
  const exp = parseInt(e, 10);
  const mant = m.replace(/0+$/, '').replace(/\.$/, '');
  return `${mant}E${exp < 0 ? '-' : ''}${String(Math.abs(exp)).padStart(3, '0')} ${u}`;
}

/**
 * A three-phase induction motor: three stator coils (U, V, W, each with two posts) magnetically
 * coupled to a two-axis rotor whose back EMF comes from two internal voltage sources.
 */
export class ThreePhaseMotorElm extends CircuitElm {
  Rs = 0.435;
  Rr = 0.816;
  Ls = 0.0294;
  Lr = 0.0297;
  Lm = 0.0287;
  b = 0.05;
  J = 1;
  angle = Math.PI / 2;
  speed = 0;
  filteredSpeed = 0;
  posts: Point[] = [];
  leads: Point[] = [];
  motorCenter = new Point();
  coilCurrents = new Array<number>(COIL_COUNT).fill(0);
  coilCurSourceValues = new Array<number>(COIL_COUNT).fill(0);
  xformMatrix: number[][] | null = null;
  nodeCurrents: number[] | null = null;
  voltSources: (VoltageSource | null)[] = [null, null];
  vs1value = 0;
  vs2value = 0;

  override getClassName(): string {
    return 'ThreePhaseMotorElm';
  }
  override getDumpType(): number {
    return 427;
  }

  override undump(st: StringTokenizer): void {
    this.Rs = parseJavaDouble(st.nextToken());
    this.Rr = parseJavaDouble(st.nextToken());
    this.Ls = parseJavaDouble(st.nextToken());
    this.Lr = parseJavaDouble(st.nextToken());
    this.Lm = parseJavaDouble(st.nextToken());
    this.b = parseJavaDouble(st.nextToken());
    try {
      this.J = parseJavaDouble(st.nextToken());
    } catch {
      this.J = 1;
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('rs', this.Rs);
    w.dumpAttr('rr', this.Rr);
    w.dumpAttr('ls', this.Ls);
    w.dumpAttr('lr', this.Lr);
    w.dumpAttr('lm', this.Lm);
    w.dumpAttr('b', this.b);
    w.dumpAttr('j', this.J);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.Rs = r.parseDoubleAttr('rs', this.Rs);
    this.Rr = r.parseDoubleAttr('rr', this.Rr);
    this.Ls = r.parseDoubleAttr('ls', this.Ls);
    this.Lr = r.parseDoubleAttr('lr', this.Lr);
    this.Lm = r.parseDoubleAttr('lm', this.Lm);
    this.b = r.parseDoubleAttr('b', this.b);
    this.J = r.parseDoubleAttr('j', this.J);
  }

  getAngle(): number {
    return this.angle;
  }

  override setPoints(): void {
    super.setPoints();
    const p1 = this.point1;
    const p2 = this.point2;
    const q = Math.abs(this.dy) > Math.abs(this.dx) ? -1 : 1;
    this.posts = this.newPointArray(6);
    this.leads = this.newPointArray(6);
    for (let i = 0; i !== 3; i++) {
      this.posts[i * 2] = this.interpPointPerp(p1, p2, 0, -q * 32 * (i - 1));
      this.leads[i * 2] = this.interpPointPerp(p1, p2, 0.45, -q * 32 * (i - 1));
      this.posts[i * 2 + 1] = this.interpPointPerp(p1, p2, 1, q * 32 * (i - 1));
      this.leads[i * 2 + 1] = this.interpPointPerp(p1, p2, 0.55, q * 32 * (i - 1));
    }
    this.motorCenter = this.interpPoint(p1, p2, 0.5);
    this.allocNodes();
  }

  override getPostCount(): number {
    return 6;
  }
  override getPost(n: number): Point {
    return this.posts[n];
  }
  override getInternalNodeCount(): number {
    return 7;
  }
  override getVoltageSourceCount(): number {
    return 2;
  }

  override reset(): void {
    super.reset();
    this.volts.fill(0);
    this.filteredSpeed = this.speed = 0;
    this.coilCurSourceValues = new Array<number>(COIL_COUNT).fill(0);
    this.coilCurrents = new Array<number>(COIL_COUNT).fill(0);
  }

  // based on https://forum.kicad.info/t/ac-motors-simulation-1-phase-3-phase/14188/3
  override stamp(): void {
    const sim = this.sim;
    const nodes = this.nodes;
    const ground = sim.ground;
    sim.stampResistor(nodes[0], nodes[N001], this.Rs);
    sim.stampResistor(nodes[2], nodes[N003], this.Rs);
    sim.stampResistor(nodes[4], nodes[N005], this.Rs);
    sim.stampResistor(nodes[N004], ground, 1.5 * this.Rr);
    sim.stampResistor(nodes[N007], ground, 1.5 * this.Rr);

    const Lr2 = this.Lr * 1.5;
    const coilInductances = [this.Ls, this.Ls, this.Ls, Lr2, Lr2];
    const couplingCoefs: number[][] = [];
    const xform: number[][] = [];
    for (let i = 0; i !== COIL_COUNT; i++) {
      couplingCoefs.push(new Array<number>(COIL_COUNT).fill(0));
      xform.push(new Array<number>(COIL_COUNT).fill(0));
    }
    this.xformMatrix = xform;

    // see CustomTransformerElm.java
    for (let i = 0; i !== COIL_COUNT; i++) xform[i][i] = coilInductances[i];

    const k0 = this.Lm / Math.sqrt(this.Ls * Lr2);
    couplingCoefs[0][3] = couplingCoefs[3][0] = k0;
    couplingCoefs[1][3] = couplingCoefs[3][1] = -k0 / 2;
    couplingCoefs[1][4] = couplingCoefs[4][1] = (k0 * Math.sqrt(3)) / 2;
    couplingCoefs[2][3] = couplingCoefs[3][2] = -k0 / 2;
    couplingCoefs[2][4] = couplingCoefs[4][2] = (-k0 * Math.sqrt(3)) / 2;

    for (let i = 0; i !== COIL_COUNT; i++)
      for (let j = 0; j !== i; j++)
        xform[i][j] = xform[j][i] =
          couplingCoefs[i][j] * Math.sqrt(coilInductances[i] * coilInductances[j]);

    invertMatrix(xform, COIL_COUNT);

    const ts = sim.timeStep;
    for (let i = 0; i !== COIL_COUNT; i++)
      for (let j = 0; j !== COIL_COUNT; j++) {
        // multiply in dt/2 (or dt for backward euler)
        xform[i][j] *= ts;
        const ni1 = nodes[COIL_NODES[i * 2]];
        const nj1 = nodes[COIL_NODES[j * 2]];
        const ni2 = nodes[COIL_NODES[i * 2 + 1]];
        const nj2 = nodes[COIL_NODES[j * 2 + 1]];
        if (i === j) sim.stampConductance(ni1, ni2, xform[i][i]);
        else sim.stampVCCurrentSource(ni1, ni2, nj1, nj2, xform[i][j]);
      }
    for (let i = 0; i !== 10; i++) sim.stampRightSide(nodes[COIL_NODES[i]]);

    sim.stampVoltageSource(nodes[N002], ground, this.voltSources[0]);
    sim.stampVoltageSource(nodes[N006], ground, this.voltSources[1]);

    if (this.coilCurSourceValues.length !== COIL_COUNT)
      this.coilCurSourceValues = new Array<number>(COIL_COUNT).fill(0);
    if (this.coilCurrents.length !== COIL_COUNT)
      this.coilCurrents = new Array<number>(COIL_COUNT).fill(0);
    const nodeCount = this.getNodeCount();
    if (this.nodeCurrents === null || this.nodeCurrents.length !== nodeCount)
      this.nodeCurrents = new Array<number>(nodeCount).fill(0);
  }

  override setVoltageSource(n: number, v: VoltageSource): void {
    this.voltSources[n] = v;
    const ground: CircuitNode = this.sim.ground;
    if (n === 0) v.setNodes(this.nodes[N002], ground);
    else v.setNodes(this.nodes[N006], ground);
  }

  override startIteration(): void {
    const c = this.coilCurrents;
    for (let i = 0; i !== COIL_COUNT; i++) this.coilCurSourceValues[i] = c[i];
    const ts = this.sim.timeStep;
    const torque =
      ((ZP * Math.sqrt(3)) / 2) * this.Lm * ((c[1] - c[2]) * c[3] - Math.sqrt(3) * c[0] * c[4]);
    this.speed += (ts * (torque - this.b * this.speed)) / this.J;
    this.angle = this.angle + this.speed * ts;
    this.vs1value =
      -ZP * this.speed * (((this.Lm * Math.sqrt(3)) / 2) * (c[1] - c[2]) + 1.5 * this.Lr * c[4]);
    this.vs2value = ZP * this.speed * ((3 / 2.0) * this.Lm * c[0] + 1.5 * this.Lr * c[3]);
  }

  override doStep(): void {
    const sim = this.sim;
    const nodes = this.nodes;
    for (let i = 0; i !== COIL_COUNT; i++)
      sim.stampCurrentSource(
        nodes[COIL_NODES[i * 2]],
        nodes[COIL_NODES[i * 2 + 1]],
        this.coilCurSourceValues[i],
      );
    sim.updateVoltageSource(nodes[N002], sim.ground, this.voltSources[0], -this.vs1value);
    sim.updateVoltageSource(nodes[N006], sim.ground, this.voltSources[1], -this.vs2value);
  }

  override calculateCurrent(): void {
    const nc = this.nodeCurrents;
    if (nc === null) return;
    nc.fill(0);
    const volts = this.volts;
    for (let i = 0; i !== COIL_COUNT; i++) {
      let val = this.coilCurSourceValues[i];
      const xform = this.xformMatrix;
      if (xform !== null)
        for (let j = 0; j !== COIL_COUNT; j++) {
          const voltdiff = volts[COIL_NODES[j * 2]] - volts[COIL_NODES[j * 2 + 1]];
          val += voltdiff * xform[i][j];
        }
      this.coilCurrents[i] = val;
      // upstream indexes COIL_NODES by coil, not by end; nodeCurrents is never read
      const ni = COIL_NODES[i];
      nc[ni] += val;
      nc[ni + 1] -= val;
    }
  }

  /** Upstream smooths the shown speed once per drawn frame. */
  filterSpeed(): void {
    this.filteredSpeed = this.filteredSpeed * 0.98 + this.speed * 0.02;
  }

  override hasGroundConnection(_n1: number): boolean {
    return false;
  }

  override getConnection(_n1: number, _n2: number): boolean {
    return true;
  }

  override getInfo(arr: string[]): void {
    arr[0] = '3-Phase Motor';
    this.getBasicInfo(arr);
    arr[3] =
      'speed = ' + getUnitTextRPM((60 * Math.abs(this.filteredSpeed)) / (2 * Math.PI), 'RPM');
  }

  override getCurrentIntoNode(n: number): number {
    const i = Math.trunc(n / 2);
    if (n % 2 === 1) return this.coilCurrents[i];
    return -this.coilCurrents[i];
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Stator Inductance (H)', this.Ls, 0, 0);
    if (n === 1) return new EditInfo('Rotor Inductance (H)', this.Lr, 0, 0);
    if (n === 2)
      return new EditInfo(
        'Coupling Coefficient',
        this.Lm / Math.sqrt(this.Ls * this.Lr),
        0,
        0,
      ).setDimensionless();
    if (n === 3) return new EditInfo('Stator Resistance (ohms)', this.Rs, 0, 0);
    if (n === 4) return new EditInfo('Rotor Resistance (ohms)', this.Rr, 0, 0);
    if (n === 5) return new EditInfo('Friction coefficient (Nms/rad)', this.b, 0, 0);
    if (n === 6) return new EditInfo('Moment of inertia (Kg.m^2)', this.J, 0, 0);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    const v = ei.value;
    if (v > 0 && n === 0) this.Ls = v;
    if (v > 0 && n === 1) this.Lr = v;
    if (v > 0 && v < 1 && n === 2) this.Lm = v * Math.sqrt(this.Ls * this.Lr);
    if (v > 0 && n === 3) this.Rs = v;
    if (v > 0 && n === 4) this.Rr = v;
    if (n === 5) this.b = v;
    if (v > 0 && n === 6) this.J = v;
  }

  override canFlipX(): boolean {
    return false;
  }
  override canFlipY(): boolean {
    return false;
  }
}

export const ThreePhaseMotorElmType = elementType('ThreePhaseMotorElm', ThreePhaseMotorElm);
