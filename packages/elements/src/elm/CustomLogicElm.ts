// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CustomLogicElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { modelEditor } from '../edit/modelEditor.ts';
import { unescapeToken } from '../escape.ts';
import { parseJavaDouble } from '../java.ts';
import type { CustomLogicModel } from '../models/CustomLogicModel.ts';
import { modelsFor } from '../models/ModelLibrary.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter, XmlDocWriter } from '../xml.ts';
import { ChipElm, SIDE_E, SIDE_W } from './ChipElm.ts';

/** A chip whose outputs follow a truth table of rules (its model). */
export class CustomLogicElm extends ChipElm {
  modelName: string | null = null;
  postCount = 0;
  inputCount = 0;
  outputCount = 0;
  model: CustomLogicModel | null = null;
  lastValues: boolean[] = [];
  patternValues: boolean[] = [];
  highImpedance: boolean[] = [];

  override getClassName(): string {
    return 'CustomLogicElm';
  }
  override getDumpType(): number {
    return 208;
  }
  override getXmlDumpType(): string {
    return 'cl';
  }

  private library() {
    return modelsFor(this.sim).customLogic;
  }

  override initNew(): void {
    this.modelName = this.library().lastModelName;
    super.initNew();
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.modelName = unescapeToken(st.nextToken());
    this.updateModels();
    for (let i = 0; i !== this.getPostCount(); i++) {
      if (this.pins[i].output) {
        this.volts[i] = parseJavaDouble(st.nextToken());
        this.pins[i].value = this.volts[i] > this.getThreshold();
      }
    }
  }

  override dumpXmlModels(doc: XmlDocWriter): void {
    if (this.model !== null && !this.model.dumped) this.model.dumpXml(doc);
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    if (this.modelName !== null) w.dumpAttr('mo', this.modelName);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.modelName = r.parseStringAttr('mo', null) ?? this.modelName;
    this.updateModels();
  }

  /** Rebuild the pins after the model changed. */
  updateModels(): void {
    this.model = this.library().getModelWithNameOrCopy(this.modelName ?? 'default', this.model);
    this.setupPins();
    this.allocNodes();
    this.setPoints();
  }

  override setupPins(): void {
    if (this.modelName === null) {
      this.postCount = this.bits;
      this.allocNodes();
      return;
    }
    const model = this.library().getModelWithName(this.modelName);
    this.model = model;
    this.inputCount = model.inputs.length;
    this.outputCount = model.outputs.length;
    this.sizeY = Math.max(this.inputCount, this.outputCount);
    if (this.sizeY === 0) this.sizeY = 1;
    this.sizeX = 2;
    this.postCount = this.inputCount + this.outputCount;
    this.pins = new Array(this.postCount);
    for (let i = 0; i !== this.inputCount; i++) {
      this.pins[i] = this.newPin(i, SIDE_W, model.inputs[i]);
      this.pins[i].fixName();
    }
    for (let i = 0; i !== this.outputCount; i++) {
      const p = this.newPin(i, SIDE_E, model.outputs[i]);
      p.output = true;
      p.fixName();
      this.pins[i + this.inputCount] = p;
    }
    this.lastValues = new Array<boolean>(this.postCount).fill(false);
    this.patternValues = new Array<boolean>(26).fill(false);
    this.highImpedance = new Array<boolean>(this.postCount).fill(false);
  }

  override getPostCount(): number {
    return this.postCount;
  }
  override getVoltageSourceCount(): number {
    return this.outputCount;
  }

  /** Whether any output can float; without that the outputs drive their pins directly. */
  hasTriState(): boolean {
    return this.model?.triState ?? false;
  }
  override nonLinear(): boolean {
    return this.hasTriState();
  }
  // a tri-state output's source drives an internal node, with a resistor to the pin; all
  // outputs do this if any is tri-state
  override getInternalNodeCount(): number {
    return this.hasTriState() ? this.outputCount : 0;
  }

  override stamp(): void {
    const add = this.hasTriState() ? this.outputCount : 0;
    for (let i = 0; i !== this.getPostCount(); i++) {
      const p = this.pins[i];
      if (p.output) this.sim.stampVoltageSource(this.sim.ground, this.nodes[i + add], p.voltSource);
    }
  }

  override doStep(): void {
    const tri = this.hasTriState();
    const add = tri ? this.outputCount : 0;
    for (let i = 0; i !== this.getPostCount(); i++) {
      const p = this.pins[i];
      if (!p.output) continue;
      // the source drives the internal node if tri-state, else the output directly
      this.sim.updateVoltageSource(
        this.sim.ground,
        this.nodes[i + add],
        p.voltSource,
        p.value ? this.highVoltage : 0,
      );
      if (tri)
        this.sim.stampResistor(
          this.nodes[i + add],
          this.nodes[i],
          this.highImpedance[i] ? 1e8 : 1e-3,
        );
    }
  }

  override execute(): void {
    const model = this.model;
    if (model === null) return;
    const pins = this.pins;
    for (let i = 0; i !== model.rulesLeft.length; i++) {
      // check for a match
      const rl = model.rulesLeft[i];
      let j: number;
      for (j = 0; j !== rl.length; j++) {
        const x = rl.charAt(j);
        if (x === '0' || x === '1') {
          if (pins[j].value === (x === '1')) continue;
          break;
        }
        if (x === '?') continue; // don't care
        if (x === '+') {
          // rising edge
          if (pins[j].value && !this.lastValues[j]) continue;
          break;
        }
        if (x === '-') {
          // falling edge
          if (!pins[j].value && this.lastValues[j]) continue;
          break;
        }
        if (x >= 'a' && x <= 'z') {
          // remember a pattern value
          this.patternValues[x.charCodeAt(0) - 97] = pins[j].value;
          continue;
        }
        if (x >= 'A' && x <= 'z') {
          // compare with a remembered one
          if (this.patternValues[x.charCodeAt(0) - 65] !== pins[j].value) break;
          continue;
        }
      }
      if (j !== rl.length) continue;

      // a match
      const rr = model.rulesRight[i];
      for (j = 0; j !== rr.length; j++) {
        const x = rr.charAt(j);
        const k = j + this.inputCount;
        this.highImpedance[k] = false;
        if (x >= 'a' && x <= 'z') pins[k].value = this.patternValues[x.charCodeAt(0) - 97];
        else if (x === '_') this.highImpedance[k] = true;
        else pins[k].value = x === '1';
      }
      break;
    }
    // for edge detection
    for (let j = 0; j !== this.postCount; j++) this.lastValues[j] = pins[j].value;
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) return EditInfo.text('Model Name', this.modelName ?? '');
    if (n === 1)
      return EditInfo.createButton('Edit Model', () => {
        // upstream opens a plain EditDialog on the model
        const model = this.model;
        if (model !== null) modelEditor.open?.({ target: model, applyButton: true });
      });
    return null;
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n !== 0) return;
    const newModelName = ei.text ?? '';
    if (this.modelName === newModelName) return;
    this.modelName = newModelName;
    this.library().lastModelName = newModelName;
    this.model = this.library().getModelWithNameOrCopy(newModelName, this.model);
    this.setupPins();
    this.allocNodes();
    this.setPoints();
  }

  override getElmType(): string {
    return 'custom logic';
  }

  override getInfo(arr: string[]): void {
    super.getInfo(arr);
    if (this.model !== null) arr[0] = this.model.infoText;
  }
}

export const CustomLogicElmType = elementType('CustomLogicElm', CustomLogicElm);
