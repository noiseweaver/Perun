// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/DCMotorElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { VoltageSource } from '@perun/engine';
import { Point } from '@perun/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText, OHM } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { Inductor } from './InductorElm.ts';

/**
 * A DC motor (after the University of Michigan CTMS motor model). Internally an armature
 * inductor and resistor with a back-EMF source, coupled to a mechanical analog where the
 * inertia is an inductor whose current is the speed.
 */
export class DCMotorElm extends CircuitElm {
  ind = new Inductor(this);
  indInertia = new Inductor(this);
  // electrical parameters
  resistance = 1;
  inductance = 0.5;
  // electro-mechanical parameters (tau is reserved for static friction)
  K = 0.15;
  Kb = 0.15;
  J = 0.02;
  b = 0.05;
  gearRatio = 1;
  tau = 0;
  angle = Math.PI / 2;
  speed = 0;
  coilCurrent = 0;
  inertiaCurrent = 0;
  voltSources: (VoltageSource | null)[] = [null, null];
  motorCenter = new Point();

  override getClassName(): string {
    return 'DCMotorElm';
  }
  override getDumpType(): number {
    return 415;
  }

  override initNew(): void {
    this.setupInductors();
  }

  setupInductors(): void {
    this.ind = new Inductor(this);
    this.indInertia = new Inductor(this);
    this.ind.setup(this.inductance, 0, Inductor.FLAG_BACK_EULER);
    this.indInertia.setup(this.J, 0, Inductor.FLAG_BACK_EULER);
  }

  override undump(st: StringTokenizer): void {
    this.inductance = parseJavaDouble(st.nextToken());
    this.resistance = parseJavaDouble(st.nextToken());
    this.K = parseJavaDouble(st.nextToken());
    this.Kb = parseJavaDouble(st.nextToken());
    this.J = parseJavaDouble(st.nextToken());
    this.b = parseJavaDouble(st.nextToken());
    this.gearRatio = parseJavaDouble(st.nextToken());
    this.tau = parseJavaDouble(st.nextToken());
    this.setupInductors();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('in', this.inductance);
    w.dumpAttr('rs', this.resistance);
    w.dumpAttr('k', this.K);
    w.dumpAttr('kb', this.Kb);
    w.dumpAttr('j', this.J);
    w.dumpAttr('b', this.b);
    w.dumpAttr('gr', this.gearRatio);
    w.dumpAttr('ta', this.tau);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.inductance = r.parseDoubleAttr('in', this.inductance);
    this.resistance = r.parseDoubleAttr('rs', this.resistance);
    this.K = r.parseDoubleAttr('k', this.K);
    this.Kb = r.parseDoubleAttr('kb', this.Kb);
    this.J = r.parseDoubleAttr('j', this.J);
    this.b = r.parseDoubleAttr('b', this.b);
    this.gearRatio = r.parseDoubleAttr('gr', this.gearRatio);
    this.tau = r.parseDoubleAttr('ta', this.tau);
    this.setupInductors();
  }

  getAngle(): number {
    return this.angle;
  }

  override setPoints(): void {
    super.setPoints();
    this.calcLeads(36);
    this.motorCenter = this.interpPoint(this.point1, this.point2, 0.5);
    this.allocNodes();
  }

  override getPostCount(): number {
    return 2;
  }
  override getInternalNodeCount(): number {
    return 4;
  }
  override getVoltageSourceCount(): number {
    return 2;
  }

  override setVoltageSource(n: number, v: VoltageSource): void {
    this.voltSources[n] = v;
    if (n === 0) v.setNodes(this.nodes[3], this.nodes[1]);
    else v.setNodes(this.nodes[4], this.sim.ground);
  }

  override reset(): void {
    super.reset();
    this.volts.fill(0);
    this.ind.reset();
    this.indInertia.reset();
    this.coilCurrent = 0;
    this.inertiaCurrent = 0;
  }

  // internal parts simulate the motor (it would be better to do this in code and keep the
  // matrix small)
  override stamp(): void {
    const sim = this.sim;
    const n = this.nodes;
    // electrical part: inductor from post 0 to node 2, resistor from 2 to 3, back EMF from 3 to
    // post 1
    this.ind.stamp(n[0], n[2]);
    sim.stampResistor(n[2], n[3], this.resistance);
    sim.stampVoltageSource(n[3], n[1], this.voltSources[0]);
    // mechanical part: inertia inductor from 4 to 5, friction resistor from 5 to ground, torque
    // source from 4 to ground
    this.indInertia.stamp(n[4], n[5]);
    sim.stampResistor(n[5], sim.ground, this.b);
    sim.stampVoltageSource(n[4], sim.ground, this.voltSources[1]);
  }

  override startIteration(): void {
    const v = this.volts;
    this.ind.startIteration(v[0] - v[2]);
    this.indInertia.startIteration(v[4] - v[5]);
    this.angle = this.angle + this.speed * this.sim.timeStep;
  }

  override doStep(): void {
    const sim = this.sim;
    const n = this.nodes;
    const v = this.volts;
    sim.updateVoltageSource(n[4], sim.ground, this.voltSources[1], this.coilCurrent * this.K);
    sim.updateVoltageSource(n[3], n[1], this.voltSources[0], this.inertiaCurrent * this.Kb);
    this.ind.doStep(v[0] - v[2]);
    this.indInertia.doStep(v[4] - v[5]);
  }

  override calculateCurrent(): void {
    const v = this.volts;
    this.coilCurrent = this.ind.calculateCurrent(v[0] - v[2]);
    this.inertiaCurrent = this.indInertia.calculateCurrent(v[4] - v[5]);
    this.speed = this.inertiaCurrent;
  }

  override setCurrent(vs: VoltageSource, c: number): void {
    if (vs === this.voltSources[0]) this.current = c;
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'DC Motor';
    this.getBasicInfo(arr);
    arr[3] = 'speed = ' + getUnitText((60 * Math.abs(this.speed)) / (2 * Math.PI), 'RPM');
    arr[4] = 'L = ' + getUnitText(this.inductance, 'H');
    arr[5] = 'R = ' + getUnitText(this.resistance, OHM);
    arr[6] = 'P = ' + getUnitText(this.getPower(), 'W');
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0)
      return new EditInfo('Armature inductance (H)', this.inductance, 0, 0).setPositive();
    if (n === 1)
      return new EditInfo('Armature Resistance (ohms)', this.resistance, 0, 0).setPositive();
    if (n === 2) return new EditInfo('Torque constant (Nm/A)', this.K, 0, 0).setPositive();
    if (n === 3) return new EditInfo('Moment of inertia (Kg.m^2)', this.J, 0, 0).setPositive();
    if (n === 4) return new EditInfo('Friction coefficient (Nms/rad)', this.b, 0, 0).setPositive();
    if (n === 5) return new EditInfo('Gear Ratio', this.gearRatio, 0, 0).setPositive();
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    const v = ei.value;
    if (n === 0 && v > 0) {
      this.inductance = v;
      this.ind.setup(this.inductance, this.current, Inductor.FLAG_BACK_EULER);
    }
    if (n === 1 && v > 0) this.resistance = v;
    if (n === 2 && v > 0) {
      this.K = v;
      this.Kb = this.K;
    }
    if (n === 3 && v > 0) {
      this.J = v;
      this.indInertia.setup(this.J, this.inertiaCurrent, Inductor.FLAG_BACK_EULER);
    }
    if (n === 4 && v > 0) this.b = v;
    if (n === 5 && v > 0) this.gearRatio = v;
  }
}

export const DCMotorElmType = elementType('DCMotorElm', DCMotorElm);
