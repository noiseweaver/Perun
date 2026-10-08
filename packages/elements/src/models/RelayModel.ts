// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/RelayModel.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { EditInfo, type Editable } from '../edit/EditInfo.ts';
import { pickModelName } from '../edit/modelEditor.ts';
import type { XmlAttrReader, XmlDocWriter } from '../xml.ts';

/** Java `String.compareTo` order on model names (UTF-16 code units), for the model lists. */
function compareNames(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

export class RelayModel implements Editable {
  flags = 0;
  name = '';
  description: string | null = null;
  inductance = 0.2;
  r_on = 0.05;
  r_off = 1e6;
  onCurrent = 0.02;
  offCurrent = 0.015;
  coilR = 20;
  switchingTime = 5e-3;
  /** 0 = both sides, 1 = side 1, 2 = side 2. */
  coilStyle = 0;
  poleCount = 1;
  showBox = true;
  pulldown = true;

  dumped = false;
  readOnly = false;
  builtIn = false;
  oldStyle = false;
  /** The library's map, so a renamed model registers itself (upstream's static modelMap). */
  modelMap: Map<string, RelayModel> | null = null;

  static copyOf(copy: RelayModel): RelayModel {
    const m = new RelayModel();
    m.flags = copy.flags;
    m.inductance = copy.inductance;
    m.r_on = copy.r_on;
    m.r_off = copy.r_off;
    m.onCurrent = copy.onCurrent;
    m.offCurrent = copy.offCurrent;
    m.coilR = copy.coilR;
    m.switchingTime = copy.switchingTime;
    m.coilStyle = copy.coilStyle;
    m.poleCount = copy.poleCount;
    m.showBox = copy.showBox;
    m.pulldown = copy.pulldown;
    return m;
  }

  getDialogTitle(): string {
    return 'Edit Relay Model';
  }

  getEditInfo(n: number): EditInfo | null {
    if (n === 0) return EditInfo.text('Model Name', this.name);
    if (n === 1) return new EditInfo('Inductance (H)', this.inductance, 0, 0).setPositive();
    if (n === 2) return new EditInfo('On Resistance (ohms)', this.r_on, 0, 0).setPositive();
    if (n === 3) return new EditInfo('Off Resistance (ohms)', this.r_off, 0, 0).setPositive();
    if (n === 4) return new EditInfo('On Current (A)', this.onCurrent, 0, 0).setPositive();
    if (n === 5) return new EditInfo('Off Current (A)', this.offCurrent, 0, 0).setPositive();
    if (n === 6) return new EditInfo('Number of Poles', this.poleCount, 1, 4).setDimensionless();
    if (n === 7) return new EditInfo('Coil Resistance (ohms)', this.coilR, 0, 0).setPositive();
    if (n === 8) return new EditInfo('Switching Time (s)', this.switchingTime, 0, 0).setPositive();
    if (n === 9)
      return EditInfo.createChoice(
        'Coil Style',
        ['Both Sides', 'Side 1', 'Side 2'],
        this.coilStyle,
      );
    if (n === 10) return EditInfo.createCheckbox('Show Box', this.showBox);
    if (n === 11) return EditInfo.createCheckbox('Pulldown Resistor', this.pulldown);
    return null;
  }

  /** Set a field; the caller then refetches every element's model (upstream updateModels). */
  setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      this.name = ei.text ?? '';
      if (this.name.length > 0) this.modelMap?.set(this.name, this);
    }
    if (n === 1 && ei.value > 0) this.inductance = ei.value;
    if (n === 2 && ei.value > 0) this.r_on = ei.value;
    if (n === 3 && ei.value > 0) this.r_off = ei.value;
    if (n === 4 && ei.value > 0) this.onCurrent = ei.value;
    if (n === 5 && ei.value > 0) this.offCurrent = ei.value;
    if (n === 6 && ei.value >= 1) this.poleCount = Math.trunc(ei.value);
    if (n === 7 && ei.value > 0) this.coilR = ei.value;
    if (n === 8 && ei.value > 0) this.switchingTime = ei.value;
    if (n === 9) this.coilStyle = ei.choice?.selected ?? 0;
    if (n === 10) this.showBox = ei.checkbox?.state === true;
    if (n === 11) this.pulldown = ei.checkbox?.state === true;
  }

  pickName(): void {
    this.name = pickModelName('relaymodel', this.modelMap ?? new Map());
  }

  getDescription(): string {
    if (this.description === null) return this.name;
    return this.name + ' (' + this.description + ')';
  }

  dumpXml(doc: XmlDocWriter): void {
    this.dumped = true;
    const w = doc.addElement('rlm');
    w.dumpAttr('nm', this.name);
    w.dumpAttr('f', this.flags);
    w.dumpAttr('in', this.inductance);
    w.dumpAttr('ron', this.r_on);
    w.dumpAttr('rof', this.r_off);
    w.dumpAttr('on', this.onCurrent);
    w.dumpAttr('of', this.offCurrent);
    w.dumpAttr('coR', this.coilR);
    w.dumpAttr('sw', this.switchingTime);
    w.dumpAttr('cs', this.coilStyle);
    if (this.poleCount !== 1) w.dumpAttr('po', this.poleCount);
    if (this.showBox) w.dumpAttr('sb', 1);
    if (this.pulldown) w.dumpAttr('pd', 1);
  }

  undumpXml(r: XmlAttrReader): void {
    this.flags = r.parseIntAttr('f', this.flags);
    this.inductance = r.parseDoubleAttr('in', this.inductance);
    this.r_on = r.parseDoubleAttr('ron', this.r_on);
    this.r_off = r.parseDoubleAttr('rof', this.r_off);
    this.onCurrent = r.parseDoubleAttr('on', this.onCurrent);
    this.offCurrent = r.parseDoubleAttr('of', this.offCurrent);
    this.coilR = r.parseDoubleAttr('coR', this.coilR);
    this.switchingTime = r.parseDoubleAttr('sw', this.switchingTime);
    this.coilStyle = r.parseIntAttr('cs', this.coilStyle);
    this.poleCount = r.parseIntAttr('po', this.poleCount);
    // upstream writes sb and pd only when set, and reads a missing one as the current value
    this.showBox = r.parseIntAttr('sb', this.showBox ? 1 : 0) !== 0;
    this.pulldown = r.parseIntAttr('pd', this.pulldown ? 1 : 0) !== 0;
  }
}

/** Upstream's static `RelayModel.modelMap` and its functions, one per simulation. */
export class RelayModels {
  readonly modelMap = new Map<string, RelayModel>();

  constructor() {
    this.addDefaultModel('default', new RelayModel());
    const m2 = new RelayModel();
    m2.poleCount = 2;
    this.addDefaultModel('default-2-poles', m2);
    const m3 = new RelayModel();
    m3.poleCount = 3;
    this.addDefaultModel('default-3-poles', m3);
  }

  private addDefaultModel(name: string, rm: RelayModel): void {
    this.modelMap.set(name, rm);
    rm.readOnly = rm.builtIn = true;
    rm.name = name;
  }

  getModelWithName(name: string): RelayModel {
    let lm = this.modelMap.get(name);
    if (lm !== undefined) return lm;
    lm = new RelayModel();
    lm.name = name;
    this.modelMap.set(name, lm);
    return lm;
  }

  getModelWithNameOrCopy(name: string, oldmodel: RelayModel | null): RelayModel {
    let lm = this.modelMap.get(name);
    if (lm !== undefined) return lm;
    // upstream logs "relay model not found" here
    if (oldmodel === null) return this.getDefaultModel();
    lm = RelayModel.copyOf(oldmodel);
    lm.name = name;
    this.modelMap.set(name, lm);
    return lm;
  }

  getDefaultModel(): RelayModel {
    return this.getModelWithName('default');
  }

  getModelList(): RelayModel[] {
    const vector: RelayModel[] = [];
    for (const rm of this.modelMap.values()) if (!vector.includes(rm)) vector.push(rm);
    return vector.sort(compareNames);
  }

  /** A model for old files that stored the relay's parameters on the element. */
  getModelWithParameters(
    inductance: number,
    r_on: number,
    r_off: number,
    onCurrent: number,
    offCurrent: number,
    coilR: number,
    switchingTime: number,
    coilStyle: number,
    showBox: boolean,
    pulldown: boolean,
    poleCount: number,
  ): RelayModel {
    for (const rm of this.modelMap.values()) {
      if (
        Math.abs(rm.inductance - inductance) < 1e-15 &&
        Math.abs(rm.r_on - r_on) < 1e-15 &&
        Math.abs(rm.r_off - r_off) < 1e-15 &&
        Math.abs(rm.onCurrent - onCurrent) < 1e-15 &&
        Math.abs(rm.offCurrent - offCurrent) < 1e-15 &&
        Math.abs(rm.coilR - coilR) < 1e-15 &&
        Math.abs(rm.switchingTime - switchingTime) < 1e-15 &&
        rm.coilStyle === coilStyle &&
        rm.showBox === showBox &&
        rm.pulldown === pulldown &&
        rm.poleCount === poleCount
      )
        return rm;
    }
    const baseName = 'old-relay';
    let name = baseName;
    if (this.modelMap.get(name) !== undefined) {
      for (let num = 2; ; num++) {
        const n = baseName + '-' + num;
        if (this.modelMap.get(n) === undefined) {
          name = n;
          break;
        }
      }
    }
    const rm = this.getModelWithName(name);
    rm.inductance = inductance;
    rm.r_on = r_on;
    rm.r_off = r_off;
    rm.onCurrent = onCurrent;
    rm.offCurrent = offCurrent;
    rm.coilR = coilR;
    rm.switchingTime = switchingTime;
    rm.coilStyle = coilStyle;
    rm.showBox = showBox;
    rm.pulldown = pulldown;
    rm.poleCount = poleCount;
    rm.oldStyle = true;
    return rm;
  }

  undumpModelXml(r: XmlAttrReader): RelayModel {
    const name = r.parseStringAttr('nm', null);
    const rm = this.getModelWithName(name ?? 'null');
    rm.undumpXml(r);
    return rm;
  }

  clearDumpedFlags(): void {
    for (const rm of this.modelMap.values()) rm.dumped = false;
  }
}
