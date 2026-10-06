// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/RelayElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Point } from '@circuitjs-next/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble, parseJavaInt } from '../java.ts';
import { modelsFor } from '../models/ModelLibrary.ts';
import { modelEditor } from '../edit/modelEditor.ts';
import { RelayModel } from '../models/RelayModel.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentDText, getVoltageDText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter, XmlDocWriter } from '../xml.ts';
import { Inductor } from './InductorElm.ts';

/**
 * A relay: a coil (an inductor and a resistor) that throws `poleCount` SPDT switches.
 * Posts 3p, 3p+1 and 3p+2 are pole p's common and its two throws; then the two coil ends.
 * One internal node joins the coil's inductor and resistor.
 */
export class RelayElm extends CircuitElm {
  static readonly FLAG_SWAP_COIL = 1;
  static readonly FLAG_SHOW_BOX = 2;
  static readonly FLAG_BOTH_SIDES_COIL = 4;
  static readonly FLAG_FLIP = 8;
  static readonly FLAG_PULLDOWN = 16;

  modelName = 'default';
  model: RelayModel | null = null;
  models: RelayModel[] | null = null;
  ind = new Inductor(this);
  coilPosts: Point[] = [];
  coilLeads: Point[] = [];
  swposts: Point[][] = [];
  swpoles: Point[][] = [];
  outline: Point[] = [];
  coilCurrent = 0;
  switchCurrent: number[] = [];
  /** Fractional position, between 0 and 1 inclusive. */
  d_position = 0;
  /** Integer position: 0 (off), 1 (on) or 2 (in between). */
  i_position = 0;
  openhs = 0;
  dflip = 0;
  onState = false;
  nCoil1 = 0;
  nCoil2 = 0;
  nCoil3 = 0;
  currentOffset1 = 0;
  currentOffset2 = 0;

  override getClassName(): string {
    return 'RelayElm';
  }
  override getDumpType(): number {
    return 178;
  }
  override getXmlDumpType(): string {
    return 'rl';
  }
  override getShortcut(): number {
    return 'R'.charCodeAt(0);
  }

  getModel(): RelayModel {
    this.model ??= modelsFor(this.sim).relay.getDefaultModel();
    return this.model;
  }

  needsPulldown(): boolean {
    return this.model !== null && this.model.pulldown;
  }

  coilStyleFromFlags(f: number): number {
    if ((f & RelayElm.FLAG_SWAP_COIL) !== 0) return 2;
    if ((f & RelayElm.FLAG_BOTH_SIDES_COIL) !== 0) return 0;
    return 1;
  }

  inductance(): number {
    return this.getModel().inductance;
  }
  r_on(): number {
    return this.getModel().r_on;
  }
  r_off(): number {
    return this.getModel().r_off;
  }
  onCurrent(): number {
    return this.getModel().onCurrent;
  }
  offCurrent(): number {
    return this.getModel().offCurrent;
  }
  coilR(): number {
    return this.getModel().coilR;
  }
  switchingTime(): number {
    return this.getModel().switchingTime;
  }
  poleCount(): number {
    return this.model === null ? 1 : this.model.poleCount;
  }

  override initNew(): void {
    this.modelName = modelsFor(this.sim).relayLastModelName;
    this.model = modelsFor(this.sim).relay.getModelWithName(this.modelName);
    this.ind.setup(this.inductance(), 0, Inductor.FLAG_BACK_EULER);
    this.noDiagonal = true;
    this.coilCurrent = 0;
    this.setupPoles();
  }

  /** The old text format, which kept the parameters on the element. */
  override undump(st: StringTokenizer): void {
    const poleCount = parseJavaInt(st.nextToken());
    const inductance = parseJavaDouble(st.nextToken());
    this.coilCurrent = parseJavaDouble(st.nextToken());
    const r_on = parseJavaDouble(st.nextToken());
    const r_off = parseJavaDouble(st.nextToken());
    const onCurrent = parseJavaDouble(st.nextToken());
    const coilR = parseJavaDouble(st.nextToken());
    let offCurrent = onCurrent;
    let switchingTime = 0;
    try {
      offCurrent = parseJavaDouble(st.nextToken());
      switchingTime = parseJavaDouble(st.nextToken());
      this.d_position = this.i_position = parseJavaInt(st.nextToken());
    } catch {
      // older files stop early
    }
    const f = this.flags;
    this.model = modelsFor(this.sim).relay.getModelWithParameters(
      inductance,
      r_on,
      r_off,
      onCurrent,
      offCurrent,
      coilR,
      switchingTime,
      this.coilStyleFromFlags(f),
      (f & RelayElm.FLAG_SHOW_BOX) !== 0,
      (f & RelayElm.FLAG_PULLDOWN) !== 0,
      poleCount,
    );
    this.modelName = this.model.name;
    this.postUndump();
  }

  postUndump(): void {
    if (this.i_position === 1) this.onState = true;
    if (this.i_position === 2) this.d_position = 0.5;
    this.noDiagonal = true;
    this.ind = new Inductor(this);
    this.ind.setup(this.inductance(), this.coilCurrent, Inductor.FLAG_BACK_EULER);
    this.setupPoles();
    this.allocNodes();
  }

  setup(): void {
    this.model = modelsFor(this.sim).relay.getModelWithNameOrCopy(this.modelName, this.model);
    this.modelName = this.model.name;
    this.ind.setup(this.inductance(), this.coilCurrent, Inductor.FLAG_BACK_EULER);
  }

  updateModels(): void {
    this.setup();
    this.setPoints();
  }

  setupPoles(): void {
    const pc = this.poleCount();
    this.nCoil1 = 3 * pc;
    this.nCoil2 = this.nCoil1 + 1;
    this.nCoil3 = this.nCoil1 + 2;
    if (this.switchCurrent.length !== pc) this.switchCurrent = new Array<number>(pc).fill(0);
  }

  override dumpXmlModels(doc: XmlDocWriter): void {
    const model = this.getModel();
    if (!(model.builtIn || model.dumped)) model.dumpXml(doc);
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('mo', this.modelName);
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    w.dumpAttr('i', this.coilCurrent);
    w.dumpAttr('ip', this.i_position);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    const mo = r.parseStringAttr('mo', null);
    const relays = modelsFor(this.sim).relay;
    if (mo !== null) {
      // new format: the model has the parameters, the pole count included
      this.modelName = mo;
      this.model = relays.getModelWithNameOrCopy(this.modelName, this.model);
      this.modelName = this.model.name;
    } else if (r.parseStringAttr('ix', null) === null) {
      // old format: the parameters are on the element. "ix" marks a state restore inside a
      // subcircuit, which keeps the model its definition set.
      const poleCount = r.parseIntAttr('po', 1);
      const defaults = new RelayModel();
      const f = this.flags;
      this.model = relays.getModelWithParameters(
        r.parseDoubleAttr('in', defaults.inductance),
        r.parseDoubleAttr('ron', defaults.r_on),
        r.parseDoubleAttr('roff', defaults.r_off),
        r.parseDoubleAttr('on', defaults.onCurrent),
        r.parseDoubleAttr('of', defaults.offCurrent),
        r.parseDoubleAttr('coR', defaults.coilR),
        r.parseDoubleAttr('sw', defaults.switchingTime),
        this.coilStyleFromFlags(f),
        (f & RelayElm.FLAG_SHOW_BOX) !== 0,
        (f & RelayElm.FLAG_PULLDOWN) !== 0,
        poleCount,
      );
      this.modelName = this.model.name;
    }
    this.coilCurrent = r.parseDoubleAttr('i', this.coilCurrent);
    this.d_position = this.i_position = r.parseIntAttr('ip', this.i_position);
    this.postUndump();
  }

  override setPoints(): void {
    super.setPoints();
    this.setupPoles();
    this.allocNodes();
    const pc = this.poleCount();
    const model = this.getModel();
    this.dflip = this.hasFlag(RelayElm.FLAG_FLIP) ? -this.dsign : this.dsign;
    const openhs = (this.openhs = -this.dflip * 16);
    const p1 = this.point1;
    const p2 = this.point2;
    this.calcLeads(32);
    const l1 = this.lead1;
    const l2 = this.lead2;
    this.swposts = [];
    this.swpoles = [];
    for (let i = 0; i !== pc; i++) {
      const o = -openhs * 3 * i;
      this.swpoles.push([
        this.interpPointPerp(l1, l2, 0, o),
        this.interpPointPerp(l1, l2, 1, o - openhs),
        this.interpPointPerp(l1, l2, 1, o + openhs),
      ]);
      this.swposts.push([
        this.interpPointPerp(p1, p2, 0, o),
        this.interpPointPerp(p1, p2, 1, o - openhs),
        this.interpPointPerp(p1, p2, 1, o + openhs),
      ]);
    }
    const x = model.coilStyle === 2 ? 1 : 0;
    let boxSize: number;
    if (model.coilStyle !== 0) {
      this.coilPosts = [
        this.interpPointPerp(p1, p2, x, openhs * 2),
        this.interpPointPerp(p1, p2, x, openhs * 3),
      ];
      this.coilLeads = [
        this.interpPointPerp(p1, p2, 0.5, openhs * 2),
        this.interpPointPerp(p1, p2, 0.5, openhs * 3),
      ];
      boxSize = 56;
    } else {
      this.coilPosts = [
        this.interpPointPerp(p1, p2, 0, openhs * 2),
        this.interpPointPerp(p1, p2, 1, openhs * 2),
      ];
      this.coilLeads = [
        this.interpPointPerp(p1, p2, 0.5 - 16 / this.dn, openhs * 2),
        this.interpPointPerp(p1, p2, 0.5 + 16 / this.dn, openhs * 2),
      ];
      boxSize = 40;
    }
    const boxWScale = Math.min(0.4, 25.0 / this.dn);
    const far = -(openhs * 3 * pc) - 24.0 * this.dflip;
    this.outline = [
      this.interpPointPerp(p1, p2, 0.5 - boxWScale, -boxSize * this.dflip),
      this.interpPointPerp(p1, p2, 0.5 + boxWScale, -boxSize * this.dflip),
      this.interpPointPerp(p1, p2, 0.5 + boxWScale, far),
      this.interpPointPerp(p1, p2, 0.5 - boxWScale, far),
    ];
    const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
    this.currentOffset1 = dist(this.coilPosts[0], this.coilLeads[0]);
    this.currentOffset2 = this.currentOffset1 + dist(this.coilLeads[0], this.coilLeads[1]);
  }

  override getPost(n: number): Point {
    const pc3 = 3 * this.poleCount();
    if (n < pc3) return this.swposts[Math.trunc(n / 3)][n % 3];
    return this.coilPosts[n - pc3];
  }
  override getPostCount(): number {
    return 2 + this.poleCount() * 3;
  }
  override getInternalNodeCount(): number {
    return 1;
  }

  override reset(): void {
    super.reset();
    this.ind.reset();
    this.coilCurrent = 0;
    this.switchCurrent.fill(0);
    this.d_position = this.i_position = 0;
    // upstream keeps onState, or the relay flip-flop example is left in a weird state on reset
  }

  override stamp(): void {
    const sim = this.sim;
    const n = this.nodes;
    // inductor from coil post 1 to the internal node, resistor from there to coil post 2
    this.ind.stamp(n[this.nCoil1], n[this.nCoil3]);
    sim.stampResistor(n[this.nCoil3], n[this.nCoil2], this.coilR());
    const pc = this.poleCount();
    for (let i = 0; i !== pc * 3; i++) sim.stampNonLinear(n[i]);
    // pulldown resistors from the throws to ground, like the analog switch
    if (this.needsPulldown()) {
      for (let i = 0; i < pc; i++) {
        sim.stampResistor(n[1 + i * 3], sim.ground, this.r_off());
        sim.stampResistor(n[2 + i * 3], sim.ground, this.r_off());
      }
    }
  }

  override startIteration(): void {
    if (this.switchingTime() === 0) {
      this.startIterationOld();
      return;
    }
    this.ind.startIteration(this.volts[this.nCoil1] - this.volts[this.nCoil3]);
    const absCurrent = Math.abs(this.coilCurrent);
    if (this.onState) {
      // on or turning on: turn off below the off current
      if (absCurrent < this.offCurrent()) {
        this.onState = false;
        this.i_position = 2;
      } else {
        this.d_position += this.sim.timeStep / this.switchingTime();
        if (this.d_position >= 1) this.d_position = this.i_position = 1;
      }
    } else {
      // off or turning off: turn on above the on current
      if (absCurrent > this.onCurrent()) {
        this.onState = true;
        this.i_position = 2;
      } else {
        this.d_position -= this.sim.timeStep / this.switchingTime();
        if (this.d_position <= 0) this.d_position = this.i_position = 0;
      }
    }
  }

  /** Relays saved before switching time existed. */
  startIterationOld(): void {
    this.ind.startIteration(this.volts[this.nCoil1] - this.volts[this.nCoil3]);
    // upstream's magic value balances operate and reset speed, not at all realistically
    const magic = 1.3;
    const pmult = Math.sqrt(magic + 1);
    const c = this.onCurrent();
    const p = (this.coilCurrent * pmult) / c;
    this.d_position = Math.abs(p * p) - 1.3;
    if (this.d_position < 0) this.d_position = 0;
    if (this.d_position > 1) this.d_position = 1;
    if (this.d_position < 0.1) this.i_position = 0;
    else if (this.d_position > 0.9) this.i_position = 1;
    else this.i_position = 2;
  }

  override nonLinear(): boolean {
    return true;
  }

  override doStep(): void {
    const sim = this.sim;
    const n = this.nodes;
    this.ind.doStep(this.volts[this.nCoil1] - this.volts[this.nCoil3]);
    const pulldown = this.needsPulldown();
    for (let p = 0; p !== this.poleCount() * 3; p += 3) {
      if (this.i_position === 0) {
        sim.stampResistor(n[p], n[p + 1], this.r_on());
        if (!pulldown) sim.stampResistor(n[p], n[p + 2], this.r_off());
      } else if (this.i_position === 1) {
        sim.stampResistor(n[p], n[p + 2], this.r_on());
        if (!pulldown) sim.stampResistor(n[p], n[p + 1], this.r_off());
      } else {
        // in between: both contacts open, r_off keeps the pole from floating
        sim.stampResistor(n[p], n[p + 1], this.r_off());
        sim.stampResistor(n[p], n[p + 2], this.r_off());
      }
    }
  }

  override calculateCurrent(): void {
    this.coilCurrent = this.ind.calculateCurrent(this.volts[this.nCoil1] - this.volts[this.nCoil3]);
    // not quite right: a little current flows through an open switch
    for (let p = 0; p !== this.poleCount(); p++) {
      if (this.i_position === 2) this.switchCurrent[p] = 0;
      else
        this.switchCurrent[p] =
          (this.volts[p * 3] - this.volts[p * 3 + 1 + this.i_position]) / this.r_on();
    }
  }

  override getCurrentIntoNode(n: number): number {
    if (n < 3 * this.poleCount()) {
      const p = Math.trunc(n / 3);
      const k = n % 3;
      if (k === 0) return -this.switchCurrent[p];
      if (k === 1 + this.i_position) return this.switchCurrent[p];
      return 0;
    }
    if (n === 3 * this.poleCount()) return -this.coilCurrent;
    return this.coilCurrent;
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'relay (' + (this.switchingTime() === 0 ? 'old model' : this.modelName) + ')';
    arr[1] = this.i_position === 0 ? 'off' : 'on';
    let ln = 2;
    for (let i = 0; i !== this.poleCount(); i++)
      arr[ln++] = 'I' + (i + 1) + ' = ' + getCurrentDText(this.switchCurrent[i]);
    arr[ln++] = 'coil I = ' + getCurrentDText(this.coilCurrent);
    arr[ln] = 'coil Vd = ' + getVoltageDText(this.volts[this.nCoil1] - this.volts[this.nCoil2]);
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      const models = modelsFor(this.sim).relay.getModelList();
      this.models = models;
      let selected = 0;
      for (let i = 0; i !== models.length; i++) if (models[i] === this.model) selected = i;
      return EditInfo.createChoice(
        'Model',
        models.map((rm) => rm.getDescription()),
        selected,
      );
    }
    if (n === 1) return EditInfo.createButton('Create New Model', () => this.newModel());
    if (n === 2) {
      if (this.getModel().readOnly) return null;
      return EditInfo.createButton('Edit Model', () => this.editModel());
    }
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      const models = this.models ?? modelsFor(this.sim).relay.getModelList();
      this.model = models[ei.choice?.selected ?? 0];
      this.modelName = this.model.name;
      modelsFor(this.sim).relayLastModelName = this.modelName;
      this.ind.setup(this.inductance(), this.coilCurrent, Inductor.FLAG_BACK_EULER);
      this.setPoints();
      ei.newDialog = true;
    }
  }

  /** Upstream button 1: edit a copy of the model, which this relay then uses. */
  private newModel(): void {
    this.openModelDialog(RelayModel.copyOf(this.getModel()), true);
  }

  /** Upstream button 2: edit the model itself. */
  private editModel(): void {
    this.openModelDialog(this.getModel(), false);
  }

  /** Upstream EditRelayModelDialog. */
  private openModelDialog(rm: RelayModel, created: boolean): void {
    rm.modelMap = modelsFor(this.sim).relay.modelMap;
    modelEditor.open?.({
      target: rm,
      applyButton: false,
      onApply: () => {
        if (rm.name.length === 0) rm.pickName();
        if (created) this.newModelCreated(rm);
      },
    });
  }

  newModelCreated(rm: RelayModel): void {
    this.model = rm;
    this.modelName = rm.name;
    modelsFor(this.sim).relayLastModelName = this.modelName;
    this.ind.setup(this.inductance(), this.coilCurrent, Inductor.FLAG_BACK_EULER);
    this.setPoints();
  }

  override getConnection(n1: number, n2: number): boolean {
    // the coil, or one pole's three contacts
    return Math.trunc(n1 / 3) === Math.trunc(n2 / 3);
  }

  override hasGroundConnection(n: number): boolean {
    return this.needsPulldown() && n < this.nCoil1;
  }

  override flipX(c2: number, count: number): void {
    if (this.dx === 0) this.flags ^= RelayElm.FLAG_FLIP;
    super.flipX(c2, count);
  }
  override flipY(c2: number, count: number): void {
    if (this.dy === 0) this.flags ^= RelayElm.FLAG_FLIP;
    super.flipY(c2, count);
  }
  override flipXY(c2: number, count: number): void {
    this.flags ^= RelayElm.FLAG_FLIP;
    super.flipXY(c2, count);
  }
}

export const RelayElmType = elementType('RelayElm', RelayElm);
