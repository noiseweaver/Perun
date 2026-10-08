// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CustomCompositeElm.java and
// CustomCompositeChipElm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType, type CircuitElm, type ElementType } from '../CircuitElm.ts';
import { elementFactory } from '../factory.ts';
import { parseJavaInt } from '../java.ts';
import { AttrReader } from '../xmlattrs.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { unescapeToken } from '../escape.ts';
import type { CustomCompositeModel } from '../models/CustomCompositeModel.ts';
import { modelsFor } from '../models/ModelLibrary.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter, XmlDocWriter } from '../xml.ts';
import { formatParamValues, paramEnv, parseParamValues } from '../params.ts';
import { ChipElm } from './ChipElm.ts';
import { CompositeElm } from './CompositeElm.ts';
import type { WireRouter } from '../WireRouter.ts';

/**
 * A plain chip outline other elements use to draw themselves (a subcircuit can't be both a
 * ChipElm and a CompositeElm).
 */
export class CustomCompositeChipElm extends ChipElm {
  label: string | null = null;

  constructor(x1: number, y1: number, x2: number, y2: number, f: number) {
    super(x1, y1, x2, y2, f);
    this.noDiagonal = true;
    this.setSize(2);
  }

  override getClassName(): string {
    return 'CustomCompositeChipElm';
  }
  override getDumpType(): number {
    return 0;
  }
  override needsBits(): boolean {
    return false;
  }
  override setupPins(): void {}
  override getVoltageSourceCount(): number {
    return 0;
  }
  allocPins(n: number): void {
    this.pins = new Array(n);
  }
  setPin(n: number, p: number, s: number, t: string): void {
    this.pins[n] = this.newPin(p, s, t);
    this.pins[n].fixName();
  }
  setLabel(text: string | null): void {
    this.label = text;
  }
  override getPostCount(): number {
    return this.pins.length;
  }
}

/** Buttons in a subcircuit's edit dialog that open other editors; the app fills these in. */
export interface SubcircuitHooks {
  editPinLayout(e: CustomCompositeElm): void;
  viewComponents(e: CustomCompositeElm): void;
  editModel(e: CustomCompositeElm): void;
  alert(message: string): void;
}

/** An instance of a subcircuit model. */
export class CustomCompositeElm extends CompositeElm {
  override addRoutingObstacle(router: WireRouter): void {
    this.chip?.addRoutingObstacle(router);
  }

  static readonly FLAG_SMALL = 2;
  static hooks: SubcircuitHooks | null = null;

  modelName = 'default';
  chip: CustomCompositeChipElm | null = null;
  postCount = 0;
  model: CustomCompositeModel | null = null;
  highVoltage = 0;
  /**
   * This copy's parameter values, where they differ from the model's defaults (PLAN.md Phase
   * 16). Not in upstream (DEVIATIONS.md): saved as the extra XML attribute `pv`.
   */
  paramValues = new Map<string, number>();
  private models: CustomCompositeModel[] = [];

  override getClassName(): string {
    return 'CustomCompositeElm';
  }
  override getDumpType(): number {
    return 410;
  }
  override getXmlDumpType(): string {
    return 'cc';
  }

  private library() {
    return modelsFor(this.sim).composite;
  }

  override initNew(): void {
    // use the last model for a new element placed in the editor; parts of other subcircuits
    // (built at 0,0) start from the default one, which avoids endless nesting
    this.modelName = this.x === 0 && this.y === 0 ? 'default' : this.library().lastModelName;
    this.initFlags();
    this.updateModels();
  }

  /** Upstream's `(xx, yy, name)` constructor, for "CustomCompositeElm:name" menu entries. */
  initWithModel(name: string): void {
    this.modelName = name;
    this.initFlags();
    this.updateModels();
  }

  private initFlags(): void {
    this.flags |= CompositeElm.FLAG_ESCAPE;
    if (this.useSmallGrid()) this.flags |= CustomCompositeElm.FLAG_SMALL;
  }

  override undump(st: StringTokenizer): void {
    this.modelName = unescapeToken(st.nextToken());
    this.updateModelsFrom(st);
  }

  override dumpXmlModels(doc: XmlDocWriter): void {
    // models of the parts first
    for (const ce of this.compElmList) ce.dumpXmlModels(doc);
    // a missing model keeps its name in `mo`, so it can still be found later
    if (this.model !== null && !(this.model.builtin || this.model.dumped)) this.model.dumpXml(doc);
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('mo', this.modelName);
    if (this.highVoltage !== 0) w.dumpAttr('hv', this.highVoltage);
    const values = this.ownParamValues();
    if (values.size > 0) w.dumpAttr('pv', formatParamValues(values));
  }

  override undumpXml(r: XmlAttrReader): void {
    this.modelName = r.parseStringAttr('mo', this.modelName) ?? this.modelName;
    this.highVoltage = r.parseDoubleAttr('hv', 0);
    this.paramValues = parseParamValues(r.parseStringAttr('pv', null));
    this.updateModels();
    super.undumpXml(r);
  }

  override loadNestedModel(r: XmlAttrReader): void {
    this.library().undumpModelXml(r, this.sim);
  }

  override setPoints(): void {
    const chip = new CustomCompositeChipElm(this.x, this.y, this.x, this.y, 0);
    chip.sim = this.sim;
    this.chip = chip;
    chip.x2 = this.x2;
    chip.y2 = this.y2;
    chip.flags = this.flags & (ChipElm.FLAG_FLIP_X | ChipElm.FLAG_FLIP_Y | ChipElm.FLAG_FLIP_XY);

    const model = this.model;
    if (model === null) {
      // the model couldn't be found: draw a labeled placeholder so the circuit stays usable
      chip.setSize((this.flags & CustomCompositeElm.FLAG_SMALL) !== 0 ? 1 : 2);
      chip.setLabel('?');
      chip.sizeX = chip.sizeY = 2;
      chip.allocPins(0);
      chip.allocNodes();
      chip.setPoints();
      return;
    }

    if (this.x2 - this.x > model.sizeX * 16 && this.isCreating())
      this.flags &= ~CustomCompositeElm.FLAG_SMALL;
    chip.setSize((this.flags & CustomCompositeElm.FLAG_SMALL) !== 0 ? 1 : 2);
    chip.setLabel(model.showLabel() ? model.name : null);
    chip.sizeX = model.sizeX;
    chip.sizeY = model.sizeY;
    chip.allocPins(this.postCount);
    for (let i = 0; i !== this.postCount; i++) {
      const pin = model.extList[i];
      chip.setPin(i, pin.pos, pin.side, pin.name);
      chip.pins[i].busWidth = pin.busWidth;
      chip.pins[i].busZ = pin.busZ;
    }
    chip.allocNodes();
    chip.setPoints();
    for (let i = 0; i !== this.getPostCount(); i++) this.setPost(i, chip.getPost(i));
  }

  /** Copy this element's state to the chip before drawing it. */
  syncChip(): CustomCompositeChipElm | null {
    const chip = this.chip;
    if (chip === null) return null;
    for (let i = 0; i !== this.postCount; i++) {
      chip.volts[i] = this.volts[i];
      chip.pins[i].current = this.getCurrentIntoNode(i);
    }
    return chip;
  }

  updateModels(): void {
    this.model = null;
    this.updateModelsFrom(null);
  }

  override flipX(center2: number, count: number): void {
    this.flags ^= ChipElm.FLAG_FLIP_X;
    if (count !== 1 && this.chip !== null) {
      const xs = (this.chip.flippedSizeX + 1) * this.chip.cspc2;
      this.x = center2 - this.x - xs;
      this.x2 = center2 - this.x2;
    }
    this.setPoints();
  }

  override flipY(center2: number, count: number): void {
    this.flags ^= ChipElm.FLAG_FLIP_Y;
    if (count !== 1 && this.chip !== null) {
      const ys = (this.chip.flippedSizeY - 1) * this.chip.cspc2;
      this.y = center2 - this.y - ys;
      this.y2 = center2 - this.y2;
    }
    this.setPoints();
  }

  isFlippedX(): boolean {
    return (this.flags & ChipElm.FLAG_FLIP_X) !== 0;
  }
  isFlippedY(): boolean {
    return (this.flags & ChipElm.FLAG_FLIP_Y) !== 0;
  }

  override flipXY(xmy: number, count: number): void {
    this.flags ^= ChipElm.FLAG_FLIP_XY;
    // FLAG_FLIP_XY is applied first, so X and Y swap
    if (this.isFlippedX() !== this.isFlippedY())
      this.flags ^= ChipElm.FLAG_FLIP_X | ChipElm.FLAG_FLIP_Y;
    if (count !== 1 && this.chip !== null) {
      const cspc2 = this.chip.cspc2;
      this.x += cspc2;
      super.flipXY(xmy, count);
      this.x -= cspc2;
    }
    this.setPoints();
  }

  /** Upstream `updateModels(StringTokenizer)`: build the parts from the model. */
  updateModelsFrom(st: StringTokenizer | null): void {
    if (this.model !== null && this.model.name === this.modelName) return;
    const model = this.library().getModelWithName(this.modelName, this.sim);
    this.model = model;
    if (model === null) {
      // keep modelName, so a later updateModels() can still find the model
      this.postCount = 0;
      this.compElmList = [];
      this.compNodeInfo = [];
      this.extNodeIds = [];
      this.numPosts = this.numNodes = 0;
      this.posts = [];
      this.allocNodes();
      this.setPoints();
      return;
    }
    this.postCount = model.extList.length;
    const externalNodes = model.extList.map((e) => e.node);
    // the old text format keeps each part's state in the element line
    if (st !== null) this.loadComposite(st, model.getNodeList(), externalNodes);
    else
      this.loadCompositeXml(
        model.getElmEntries(),
        externalNodes,
        model.params.length > 0 ? paramEnv(model.params, this.paramValues) : undefined,
      );
    this.propagateHighVoltage();
    this.allocNodes();
    this.setPoints();
  }

  /** The values this copy sets that its model has, and that differ from the defaults. */
  ownParamValues(): Map<string, number> {
    const out = new Map<string, number>();
    for (const d of this.model?.params ?? []) {
      const v = this.paramValues.get(d.name);
      if (v !== undefined && v !== d.value) out.set(d.name, v);
    }
    // a missing model: keep what the file says, so it is saved again
    if (this.model === null) return new Map(this.paramValues);
    return out;
  }

  /** Edit item of the model's first parameter (they follow the other items). */
  private paramBase(): number {
    const model = this.model;
    if (model === null) return -1;
    const hvIdx = this.canViewComponents() ? 3 : 2;
    return hvIdx + 1 + (model.canLoadModelCircuit() ? 1 : 0);
  }

  propagateHighVoltage(): void {
    if (this.highVoltage === 0) return;
    for (const ce of this.compElmList) {
      ce.setHighVoltage(this.highVoltage);
      if (ce instanceof CustomCompositeElm) ce.propagateHighVoltage();
    }
  }

  override setHighVoltage(hv: number): void {
    this.highVoltage = hv;
  }

  override getPostCount(): number {
    return this.postCount;
  }
  override getPostWidth(n: number): number {
    return this.chip !== null ? this.chip.getPostWidth(n) : 1;
  }

  /**
   * The parts to show for View Components: the simulated ones, plus the wires, labels and other
   * display-only parts the simulation leaves out, all at their places in the model's circuit.
   */
  buildDisplayElmList(): CircuitElm[] {
    const all: CircuitElm[] = [...this.compElmList];
    const model = this.model;
    if (model === null) return all;
    let compIdx = 0;
    for (const childElem of model.getElmEntries()) {
      const className = elementFactory.classNameForXmlTag(childElem.name);
      if (className === undefined) continue;
      let ce: CircuitElm | null | undefined;
      if (
        className === 'WireElm' ||
        className === 'RoutedWireElm' ||
        className === 'LabeledNodeElm' ||
        className === 'ScopeElm' ||
        className === 'GraphicElm' ||
        (className === 'GroundElm' && childElem.getAttribute('x') !== null)
      ) {
        ce = elementFactory.construct(className, 0, 0, this.sim);
        if (ce === null) continue;
        ce.undumpXml(new AttrReader(childElem));
        all.push(ce);
      } else ce = this.compElmList[compIdx++];
      if (ce === undefined) continue;
      const x = childElem.getAttribute('x');
      if (x === null) continue;
      const xs = x.split(' ').map((v) => parseJavaInt(v));
      ce.setPosition(xs[0], xs[1], xs[2], xs[3]);
      if (ce.nodes.length === 0) ce.allocNodes();
    }
    return all;
  }

  /** Whether the model keeps part positions, so its parts can be shown. */
  canViewComponents(): boolean {
    if (this.model === null) return false;
    return this.model.getElmEntries().some((e) => e.getAttribute('x') !== null);
  }

  override getEditInfo(n: number): EditInfo | null {
    const model = this.model;
    // an internal model can't be changed
    if (model !== null && model.internal) n += 2;
    if (n === 0) {
      const label =
        model === null
          ? 'Model not found: ' + this.modelName
          : EditInfo.makeLink('subcircuits.html', 'Model Name');
      this.models = this.library().getModelList(this.sim);
      return EditInfo.createChoice(
        label,
        this.models.map((m) => m.name),
        Math.max(0, this.models.indexOf(model as CustomCompositeModel)),
      );
    }
    // the rest need a model
    if (model === null) return null;
    const hooks = CustomCompositeElm.hooks;
    if (n === 1) return EditInfo.createButton('Edit Pin Layout', () => this.editPinLayout());
    if (n === 2 && this.canViewComponents())
      return EditInfo.createButton('View Components', () => hooks?.viewComponents(this));
    const hvIdx = this.canViewComponents() ? 3 : 2;
    if (n === hvIdx)
      return new EditInfo('High Logic Voltage (0=default)', this.highVoltage, 0, 10).setUnitStep();
    if (n === hvIdx + 1 && model.canLoadModelCircuit())
      return EditInfo.createButton('Edit Model', () => hooks?.editModel(this));
    const param = model.params[n - this.paramBase()];
    if (param !== undefined && n >= this.paramBase())
      // no sliders: upstream would find no such item when it reads the file
      return new EditInfo(
        param.name,
        this.paramValues.get(param.name) ?? param.value,
        -1,
        -1,
      ).disallowSliders();
    return null;
  }

  private editPinLayout(): void {
    const model = this.model;
    if (model === null) return;
    if (model.name === 'default') {
      CustomCompositeElm.hooks?.alert("Can't edit this model.");
      return;
    }
    CustomCompositeElm.hooks?.editPinLayout(this);
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (this.model !== null && this.model.internal) n += 2;
    if (n === 0) {
      const model = this.models[ei.choice?.selected ?? 0];
      if (model === undefined) return;
      this.modelName = model.name;
      this.library().lastModelName = model.name;
      this.updateModels();
      this.setPoints();
      return;
    }
    if (this.model === null) return;
    // buttons (1, 2 and the last) act through their onClick
    const hvIdx = this.canViewComponents() ? 3 : 2;
    if (n === hvIdx) {
      this.highVoltage = ei.value;
      this.propagateHighVoltage();
    }
    const param = this.model.params[n - this.paramBase()];
    if (param !== undefined && n >= this.paramBase()) {
      if (ei.value === param.value) this.paramValues.delete(param.name);
      else this.paramValues.set(param.name, ei.value);
      // build the parts again with the new values
      this.updateModels();
    }
  }

  override getInfo(arr: string[]): void {
    const model = this.model;
    if (model === null) {
      arr[0] = 'subcircuit (missing: ' + this.modelName + ')';
      return;
    }
    if (model.builtin && model.name.startsWith('~')) arr[0] = model.name.substring(1);
    else arr[0] = 'subcircuit (' + model.name + ')';
    let a = 1;
    for (let i = 0; i !== this.postCount; i++) {
      if (a >= arr.length) break;
      const ent = model.extList[i];
      if (ent.busZ > 0) continue;
      if (ent.busWidth > 1) {
        const threshold = this.chip?.getThreshold() ?? 2.5;
        let value = 0;
        for (let j = 0; j < ent.busWidth; j++) if (this.volts[i + j] > threshold) value |= 1 << j;
        arr[a] = ent.name + ' = ' + value + ' / 0x' + value.toString(16).toUpperCase();
      } else {
        arr[a] = ent.name + ' = ' + getVoltageText(this.volts[i]);
      }
      a++;
    }
  }

  override getNumHandles(): number {
    return 0;
  }
}

export const CustomCompositeElmType: ElementType = elementType(
  'CustomCompositeElm',
  CustomCompositeElm,
);
