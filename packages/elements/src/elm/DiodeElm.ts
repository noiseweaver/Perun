// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/DiodeElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, with ts/DiodeElm.ts (dev-ts) at
// 7ec858d662d8be1d76d54241ba3a5c1d1c524f51 for the node-voltage model.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { unescapeToken } from '../escape.ts';
import { parseJavaDouble } from '../java.ts';
import { modelEditor } from '../edit/modelEditor.ts';
import { DiodeModel } from '../models/DiodeModel.ts';
import { modelsFor } from '../models/ModelLibrary.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter, XmlDocWriter } from '../xml.ts';
import { Diode } from './Diode.ts';
import { heatStep, Thermal } from '../thermal.ts';
import { getCurrentText, getUnitText, getVoltageText } from '../view/units.ts';
import type { WireRouter } from '../WireRouter.ts';
import type { Point } from '@circuitjs-next/engine';

export class DiodeElm extends CircuitElm {
  /** Upstream setPoints: calcLeads(16). */
  override routingLeads(): [Point, Point] | null {
    return super.routingLeads() ?? this.leadsFor(16);
  }

  /** Half the body width, for routing around it (upstream `hs`). */
  override addRoutingObstacle(router: WireRouter): void {
    this.addRoutingObstacleWithLeads(router, 8);
  }

  static readonly FLAG_FWDROP = 1;
  static readonly FLAG_MODEL = 2;
  /** Upstream `DiodeElm.lastModelName`: the model for new diodes (the UI changes it). */
  static readonly defaultModelName: string = 'default';

  diode = new Diode(this);
  /** Self-heating (thermal.ts): a small glass diode in free air. */
  override thermal: Thermal | null = new Thermal(300);
  modelName = '';
  model: DiodeModel | null = null;
  hasResistance = false;
  diodeEndNode = 1;
  /** The model list last shown by getEditInfo, which setEditValue indexes into. */
  models: DiodeModel[] | null = null;

  override getClassName(): string {
    return 'DiodeElm';
  }
  override getDumpType(): number {
    return 'd'.charCodeAt(0);
  }

  override initNew(): void {
    this.modelName = DiodeElm.defaultModelName;
    this.setup();
  }

  override undump(st: StringTokenizer): void {
    const defaultdrop = 0.805904783;
    let fwdrop = defaultdrop;
    const zvoltage = 0;
    if ((this.flags & DiodeElm.FLAG_MODEL) !== 0) {
      this.modelName = unescapeToken(st.nextToken());
    } else {
      if ((this.flags & DiodeElm.FLAG_FWDROP) > 0) {
        try {
          fwdrop = parseJavaDouble(st.nextToken());
        } catch {
          // keep the default
        }
      }
      this.model = modelsFor(this.sim).diode.getModelWithParameters(fwdrop, zvoltage);
      this.modelName = this.model.name;
    }
    this.setup();
  }

  override nonLinear(): boolean {
    return true;
  }

  getModel(): DiodeModel {
    return this.model as DiodeModel;
  }

  setup(): void {
    const model = modelsFor(this.sim).diode.getModelWithNameOrCopy(this.modelName, this.model);
    this.model = model;
    this.modelName = model.name; // in case we couldn't find that model
    this.diode.setup(model);
    this.hasResistance = model.seriesResistance > 0;
    this.diodeEndNode = this.hasResistance ? 2 : 1;
  }

  override getInternalNodeCount(): number {
    return this.hasResistance ? 1 : 0;
  }

  updateModels(): void {
    this.setup();
  }

  override dumpXmlModels(doc: XmlDocWriter): void {
    const model = this.getModel();
    if (!(model.builtIn || model.dumped)) model.dumpXml(doc);
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('mo', this.modelName);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.modelName = r.parseStringAttr('mo', this.modelName);
    this.setup();
  }

  /** Master also zeroes its own copy of the node voltages, which live on the nodes here. */
  override reset(): void {
    this.diode.reset();
  }

  override stamp(): void {
    if (this.hasResistance) {
      // create diode from node 0 to internal node
      this.diode.stamp(this.nodes[0], this.nodes[2]);
      // create resistor from internal node to node 1
      this.sim.stampResistor(this.nodes[1], this.nodes[2], this.getModel().seriesResistance);
    } else {
      // don't need any internal nodes if no series resistance
      this.diode.stamp(this.nodes[0], this.nodes[1]);
    }
  }

  override doStep(): void {
    this.diode.doStep(this.volts[0] - this.volts[this.diodeEndNode]);
  }

  override calculateCurrent(): void {
    this.current = this.diode.calculateCurrent(this.volts[0] - this.volts[this.diodeEndNode]);
  }

  override stepFinished(): void {
    // stop for huge currents that make simulator act weird
    if (Math.abs(this.current) > 1e12) this.sim.stop('max current exceeded', this);
    heatStep(this, this.getPower());
  }

  override getInfo(arr: string[]): void {
    const model = this.model;
    if (model === null || model.oldStyle) arr[0] = 'diode';
    else arr[0] = 'diode (' + this.modelName + ')';
    arr[1] = 'I = ' + getCurrentText(this.getCurrent());
    arr[2] = 'Vd = ' + getVoltageText(this.getVoltageDiff());
    arr[3] = 'P = ' + getUnitText(this.getPower(), 'W');
    if (model?.oldStyle === true) arr[4] = 'Vf = ' + getVoltageText(model.fwdrop);
  }

  override getElmType(): string {
    return 'diode';
  }

  /** Zener diodes list only models with a breakdown voltage. */
  protected isZener(): boolean {
    return false;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      const models = modelsFor(this.sim).diode.getModelList(this.isZener());
      this.models = models;
      let selected = 0;
      for (let i = 0; i !== models.length; i++) if (models[i] === this.model) selected = i;
      return EditInfo.createChoice(
        'Model',
        models.map((dm) => dm.getDescription()),
        selected,
      );
    }
    if (n === 1) return EditInfo.createButton('Create New Simple Model', () => this.newModel(true));
    if (n === 2)
      return EditInfo.createButton('Create New Advanced Model', () => this.newModel(false));
    if (n === 3) {
      if (this.getModel().readOnly) return null;
      return EditInfo.createButton('Edit Model', () => this.editModel());
    }
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      const models = this.models ?? modelsFor(this.sim).diode.getModelList(this.isZener());
      this.model = models[ei.choice?.selected ?? 0];
      this.modelName = this.model.name;
      this.setup();
      ei.newDialog = true;
      return;
    }
  }

  /** Upstream buttons 1 and 2: edit a copy of the model, which this diode then uses. */
  private newModel(simple: boolean): void {
    const dm = DiodeModel.copyOf(this.getModel());
    dm.modelMap = modelsFor(this.sim).diode.modelMap;
    dm.setSimple(simple);
    if (dm.isSimple()) dm.setForwardVoltage();
    this.openModelDialog(dm, true);
  }

  /** Upstream button 3: edit the model itself. */
  private editModel(): void {
    const dm = this.getModel();
    dm.modelMap = modelsFor(this.sim).diode.modelMap;
    if (dm.isSimple()) dm.setForwardVoltage();
    this.openModelDialog(dm, false);
  }

  /** Upstream EditDiodeModelDialog. */
  private openModelDialog(dm: DiodeModel, created: boolean): void {
    modelEditor.open?.({
      target: dm,
      applyButton: false,
      onApply: () => {
        if (dm.name.length === 0) dm.pickName();
        if (created) this.newModelCreated(dm);
      },
    });
  }

  newModelCreated(dm: DiodeModel): void {
    this.model = dm;
    this.modelName = dm.name;
    this.setup();
  }

  override getShortcut(): number {
    return 'd'.charCodeAt(0);
  }
}

export const DiodeElmType = elementType('DiodeElm', DiodeElm);
