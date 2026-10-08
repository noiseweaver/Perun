// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CustomCompositeModel.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Simulation } from '@perun/engine';
import { unescapeToken } from '../escape.ts';
import { elementFactory } from '../factory.ts';
import { parseJavaInt } from '../java.ts';
import { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlDocWriter } from '../xml.ts';
import { AttrReader, AttrWriter, copyInto } from '../xmlattrs.ts';
import { XmlElement, parseXml, prettyPrint } from '../xmldoc.ts';
import { modelsFor } from './ModelLibrary.ts';
import { formatParamList, parseParamList, type ParamDef } from '../params.ts';

/** A pin of a subcircuit: its name, internal node, and place on the chip outline. */
export class ExtListEntry {
  name: string;
  node: number;
  pos = 0;
  side = 2; // ChipElm.SIDE_W
  busWidth = 1;
  busZ = 0;

  constructor(name: string, node: number, pos?: number, side?: number) {
    this.name = name;
    this.node = node;
    if (pos !== undefined) this.pos = pos;
    if (side !== undefined) this.side = side;
  }
}

/** Java `String.compareTo` order on model names. */
function compareNames(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** The XML reader's element (subcircuit models keep their parts as XML). */
function elementOf(r: XmlAttrReader): XmlElement {
  if (!(r instanceof AttrReader)) throw new Error('subcircuit models need an XML element reader');
  return r.elem;
}

/** A subcircuit model: its pins and its parts, kept as XML records. */
export class CustomCompositeModel {
  static readonly FLAG_SHOW_LABEL = 1;

  flags = 0;
  sizeX = 0;
  sizeY = 0;
  name = '';
  extList: ExtListEntry[] = [];
  /** The parts: each child has tag = XML dump type, `nn` = node numbers, plus its state. */
  elmDoc = new XmlElement('elms');
  /** The model's own circuit (old storage format), if it has one. */
  modelCircuit: string | null = null;
  dumped = false;
  /** Not shown in the model list. */
  internal = false;
  /** Included by default; can't be deleted. */
  builtin = false;
  /**
   * Parameters each placed copy can set (PLAN.md Phase 16). Not in upstream (DEVIATIONS.md):
   * saved as the extra XML attribute `prm`, only when there are any.
   */
  params: ParamDef[] = [];

  showLabel(): boolean {
    return (this.flags & CustomCompositeModel.FLAG_SHOW_LABEL) !== 0;
  }
  setShowLabel(sl: boolean): void {
    this.flags = sl
      ? this.flags | CustomCompositeModel.FLAG_SHOW_LABEL
      : this.flags & ~CustomCompositeModel.FLAG_SHOW_LABEL;
  }

  undump(st: StringTokenizer, sim: Simulation): void {
    this.flags = parseJavaInt(st.nextToken());
    this.sizeX = parseJavaInt(st.nextToken());
    this.sizeY = parseJavaInt(st.nextToken());
    const extCount = parseJavaInt(st.nextToken());
    this.extList = [];
    for (let i = 0; i !== extCount; i++) {
      const s = unescapeToken(st.nextToken());
      const n = parseJavaInt(st.nextToken());
      const p = parseJavaInt(st.nextToken());
      const sd = parseJavaInt(st.nextToken());
      this.extList.push(new ExtListEntry(s, n, p, sd));
    }
    const nodeList = unescapeToken(st.nextToken());
    const elmDump = unescapeToken(st.nextToken());
    this.convertOldFormatToXml(nodeList, elmDump, sim);
  }

  /** Turn the old node list and element dump strings into XML part records. */
  convertOldFormatToXml(nodeList: string, elmDump: string, sim: Simulation): void {
    const root = new XmlElement('elms');
    this.elmDoc = root;
    const modelLinet = new StringTokenizer(nodeList, '\r');
    const elmSt = new StringTokenizer(elmDump, ' ');

    while (modelLinet.hasMoreTokens()) {
      const line = modelLinet.nextToken();
      const stModel = new StringTokenizer(line, ' +\t\n\r\f');
      const ceType = stModel.nextToken();

      // build nn (node list) from the remaining tokens
      const nn: string[] = [];
      while (stModel.hasMoreTokens()) nn.push(stModel.nextToken());

      // construct the element and apply its state from elmDump
      let ce = elementFactory.construct(ceType, 0, 0, sim);
      if (ce === null) throw new Error('unknown subcircuit part ' + ceType);
      if (elmSt.hasMoreTokens()) {
        const dumpedCe = unescapeToken(elmSt.nextToken());
        const stCe = new StringTokenizer(dumpedCe, ' ');
        const ceFlags = parseJavaInt(stCe.nextToken());
        ce = elementFactory.createCe(ce.getDumpType(), 0, 0, 0, 0, ceFlags, stCe, sim);
        if (ce === null) throw new Error('unknown subcircuit part ' + ceType);
      }
      // needed for very old dumps which still have GroundElm
      if (ce.getClassName() === 'GroundElm') ce.flags |= 1;

      const child = new XmlElement(ce.getXmlDumpType());
      const w = new AttrWriter(child);
      w.dumpAttr('nn', nn.join(' '));
      ce.dumpXml(w);
      child.removeAttribute('x');
      root.appendChild(child);
    }
  }

  /** Whether all bus pins have consecutive nodes, so the compact form can be saved. */
  busNodesConsecutive(): boolean {
    for (let i = 0; i < this.extList.length; i++) {
      const ent = this.extList[i];
      if (ent.busZ > 0 && ent.node !== this.extList[i - 1].node + 1) return false;
    }
    return true;
  }

  /** Write the model's attributes, pins and parts into `elem`. */
  buildXmlElement(w: AttrWriter | ReturnType<XmlDocWriter['addElement']>): void {
    w.dumpAttr('nm', this.name);
    w.dumpAttr('f', this.flags);
    w.dumpAttr('sx', this.sizeX);
    w.dumpAttr('sy', this.sizeY);
    const bcs = this.busNodesConsecutive();
    if (bcs) w.dumpAttr('bcs', 1);
    if (this.params.length > 0) w.dumpAttr('prm', formatParamList(this.params));
    for (const ent of this.extList) {
      if (bcs && ent.busZ > 0) continue;
      const ext = w.addChild('ext');
      ext.dumpAttr('nm', ent.name);
      ext.dumpAttr('nd', ent.node);
      ext.dumpAttr('ps', ent.pos);
      ext.dumpAttr('sd', ent.side);
      if (ent.busWidth > 1) {
        ext.dumpAttr('bw', ent.busWidth);
        if (!bcs) ext.dumpAttr('bz', ent.busZ);
      }
    }
    // copy the part records
    for (const c of this.elmDoc.elements()) copyInto(w.addChild(c.name), c);
  }

  dumpXml(doc: XmlDocWriter): void {
    if (this.internal) return;
    this.dumped = true;
    this.buildXmlElement(doc.addElement('ccm'));
  }

  /** Read attributes and children; models among the parts are registered right away. */
  parseXmlElement(r: XmlAttrReader, sim: Simulation): void {
    this.flags = r.parseIntAttr('f', this.flags);
    this.sizeX = r.parseIntAttr('sx', this.sizeX);
    this.sizeY = r.parseIntAttr('sy', this.sizeY);
    const bcs = r.parseIntAttr('bcs', 0) !== 0;
    this.params = parseParamList(r.parseStringAttr('prm', null));
    this.extList = [];
    const root = new XmlElement('elms');
    this.elmDoc = root;
    const models = modelsFor(sim);

    for (const cr of r.getChildElements()) {
      const child = elementOf(cr);
      if (child.name === 'ext') {
        const s = cr.parseStringAttr('nm', '');
        const n = cr.parseIntAttr('nd', 0);
        const p = cr.parseIntAttr('ps', 0);
        const sd = cr.parseIntAttr('sd', 0);
        const bw = cr.parseIntAttr('bw', 1);
        if (bcs && bw > 1) {
          // expand compact bus entries
          for (let j = 0; j < bw; j++) {
            const ent = new ExtListEntry(s, n + j, p, sd);
            ent.busWidth = bw;
            ent.busZ = j;
            this.extList.push(ent);
          }
        } else {
          const ent = new ExtListEntry(s, n, p, sd);
          ent.busWidth = bw;
          ent.busZ = cr.parseIntAttr('bz', 0);
          this.extList.push(ent);
        }
        continue;
      }
      // a part: keep it. Models must be registered now, since parts look them up by name as
      // soon as they are built.
      root.appendChild(child);
      if (child.name === 'dm') models.diode.undumpModelXml(cr);
      else if (child.name === 'rlm') models.relay.undumpModelXml(cr);
      else if (child.name === 'tm') models.transistor.undumpModelXml(cr);
      else if (child.name === 'mm') models.mosfet.undumpModelXml(cr);
      else if (child.name === 'ccm') models.composite.undumpModelXml(cr, sim);
      else if (child.name === 'clm') models.customLogic.undumpModelXml(cr);
    }
  }

  /** The part records, for CompositeElm.loadCompositeXml. */
  getElmEntries(): XmlElement[] {
    return this.elmDoc.elements();
  }

  /** The old-format node list ("ClassName n1 n2" lines), for loadComposite. */
  getNodeList(): string {
    const lines: string[] = [];
    for (const child of this.getElmEntries()) {
      const className = elementFactory.classNameForXmlTag(child.name);
      if (className === undefined) continue;
      const nn = child.getAttribute('nn');
      lines.push(className + (nn !== null && nn.length > 0 ? ' ' + nn : ''));
    }
    return lines.join('\r');
  }

  /** Whether the model keeps a circuit that can be opened for editing. */
  canLoadModelCircuit(): boolean {
    if (this.modelCircuit !== null && this.modelCircuit.length > 0) return true;
    return this.getElmEntries().some((e) => e.getAttribute('x') !== null);
  }
}

/** Where models saved across sessions live (the browser's localStorage). */
export interface ModelStorage {
  readonly length: number;
  key(i: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_PREFIX = 'subcircuit:';

/**
 * The subcircuit models a circuit can use. Upstream keeps a global map (saved and built-in
 * models) and a local one (models loaded with the current circuit), both static.
 */
export class CustomCompositeModels {
  readonly globalModelMap = new Map<string, CustomCompositeModel>();
  readonly localModelMap = new Map<string, CustomCompositeModel>();
  /** Bumped on every change, so menus know when to rebuild. */
  sequenceNumber = 0;
  /** Upstream `CustomCompositeElm.lastModelName`: the model for new subcircuits. */
  lastModelName = 'default';
  private initialized = false;
  /** Saved models; null where there is no storage (tests, Node). */
  storage: ModelStorage | null = null;

  /** Upstream `initModelMap`: the default stub model and the built-in ones. */
  private init(sim: Simulation): void {
    if (this.initialized) return;
    this.initialized = true;
    const d = this.createModelFromOldFormat(
      'default',
      '0 0',
      'GroundElm 1',
      [new ExtListEntry('gnd', 1)],
      sim,
    );
    d.sizeX = d.sizeY = 1;
    d.builtin = true;
    this.localModelMap.delete(d.name);
    this.globalModelMap.set(d.name, d);
    this.sequenceNumber = 1;
    this.loadInternalModels(sim);
  }

  getModelWithName(name: string, sim: Simulation): CustomCompositeModel | null {
    this.init(sim);
    return this.localModelMap.get(name) ?? this.globalModelMap.get(name) ?? null;
  }

  createModelFromOldFormat(
    name: string,
    elmDump: string,
    nodeList: string,
    extList: ExtListEntry[],
    sim: Simulation,
  ): CustomCompositeModel {
    const lm = new CustomCompositeModel();
    lm.name = name;
    lm.extList = extList;
    lm.convertOldFormatToXml(nodeList, elmDump, sim);
    this.localModelMap.set(name, lm);
    this.sequenceNumber++;
    return lm;
  }

  clearDumpedFlags(): void {
    for (const m of this.globalModelMap.values()) m.dumped = false;
    for (const m of this.localModelMap.values()) m.dumped = false;
  }

  /** Models for the picker: local ones win on a name collision; internal ones are hidden. */
  getModelList(sim: Simulation): CustomCompositeModel[] {
    this.init(sim);
    const merged = new Map(this.globalModelMap);
    for (const [k, v] of this.localModelMap) merged.set(k, v);
    return [...merged.values()].filter((m) => !m.internal).sort(compareNames);
  }

  /** The model to read a definition into: a new local one, or a local shadow of a global one. */
  private modelToLoad(name: string, sim: Simulation): CustomCompositeModel {
    let model = this.getModelWithName(name, sim);
    if (model === null || (this.globalModelMap.has(name) && !this.localModelMap.has(name))) {
      model = new CustomCompositeModel();
      model.name = name;
      this.localModelMap.set(name, model);
      this.sequenceNumber++;
    }
    return model;
  }

  /** A text-format `.` line, after the dot. */
  undumpModel(st: StringTokenizer, sim: Simulation): CustomCompositeModel {
    const name = unescapeToken(st.nextToken());
    const model = this.modelToLoad(name, sim);
    model.undump(st, sim);
    return model;
  }

  undumpModelXml(r: XmlAttrReader, sim: Simulation): CustomCompositeModel {
    const name = r.parseStringAttr('nm', null) ?? 'null';
    const model = this.modelToLoad(name, sim);
    model.parseXmlElement(r, sim);
    return model;
  }

  /** A saved model (upstream's local storage) becomes a global one. */
  loadModelFromStorage(data: string, parse: (xml: string) => XmlElement, sim: Simulation): void {
    const root = parse(data);
    const r = new AttrReader(root);
    const model = new CustomCompositeModel();
    model.name = r.parseStringAttr('nm', null) ?? 'null';
    model.parseXmlElement(r, sim);
    this.globalModelMap.set(model.name, model);
    this.sequenceNumber++;
  }

  /** Upstream `loadModelsFromStorage`: every saved model becomes a global one. */
  loadModelsFromStorage(sim: Simulation): void {
    this.init(sim);
    const stor = this.storage;
    if (stor === null) return;
    for (let i = 0; i !== stor.length; i++) {
      const key = stor.key(i);
      if (key === null || !key.startsWith(STORAGE_PREFIX)) continue;
      const data = stor.getItem(key);
      if (data === null) continue;
      try {
        if (data.startsWith('<')) {
          this.loadModelFromStorage(data, parseXml, sim);
        } else {
          // old format: the model line, then the model's own circuit
          const lineLen = data.indexOf('\n');
          const firstLine = lineLen !== -1 ? data.substring(0, lineLen) : data;
          const st = new StringTokenizer(firstLine, ' ');
          if (st.nextToken() === '.') {
            const model = this.undumpModel(st, sim);
            if (lineLen !== -1) model.modelCircuit = data.substring(lineLen + 1);
            this.localModelMap.delete(model.name);
            this.globalModelMap.set(model.name, model);
          }
        }
      } catch {
        // upstream logs the exception and skips the model
      }
    }
  }

  /** Upstream `setName`: rename a model in whichever map holds it (global if neither). */
  setName(model: CustomCompositeModel, n: string): void {
    if (this.localModelMap.get(model.name) === model) {
      this.localModelMap.delete(model.name);
      model.name = n;
      this.localModelMap.set(n, model);
    } else {
      this.globalModelMap.delete(model.name);
      model.name = n;
      this.globalModelMap.set(n, model);
    }
    this.sequenceNumber++;
  }

  /** Whether the model is saved across sessions. */
  isSaved(model: CustomCompositeModel): boolean {
    if (model.name.length === 0 || this.storage === null) return false;
    return this.storage.getItem(STORAGE_PREFIX + model.name) !== null;
  }

  /** Save the model across sessions (it also becomes a global model), or forget it. */
  setSaved(model: CustomCompositeModel, sv: boolean): void {
    const stor = this.storage;
    if (stor === null) return;
    if (sv) {
      const root = new XmlElement('ccm');
      model.buildXmlElement(new AttrWriter(root));
      stor.setItem(STORAGE_PREFIX + model.name, prettyPrint(root));
      this.globalModelMap.set(model.name, model);
    } else stor.removeItem(STORAGE_PREFIX + model.name);
  }

  /** Delete a model everywhere. */
  remove(model: CustomCompositeModel): void {
    this.setSaved(model, false);
    this.localModelMap.delete(model.name);
    this.globalModelMap.delete(model.name);
    this.sequenceNumber++;
  }

  /** Put a model in the local map (after editing a model's circuit, upstream `replaceModel`). */
  replaceModel(model: CustomCompositeModel): void {
    this.localModelMap.set(model.name, model);
    this.sequenceNumber++;
  }

  clearLocalModels(): void {
    this.localModelMap.clear();
    this.sequenceNumber++;
  }

  private loadInternalModels(sim: Simulation): void {
    for (const s of INTERNAL_MODELS) {
      const st = new StringTokenizer(s, ' ');
      st.nextToken();
      const model = this.undumpModel(st, sim);
      model.internal = model.builtin = true;
      // these are built in, so they are global
      this.localModelMap.delete(model.name);
      this.globalModelMap.set(model.name, model);
    }
  }
}

/** Upstream `loadInternalModels`: the LM317 and TL431 subcircuits (old text format). */
// prettier-ignore
const INTERNAL_MODELS = [
  '. ~LM317-v2 0 2 2 3 adj 2 1 1 in 1 0 2 out 3 0 3 JfetElm\\s3\\s4\\s1\\s\\rResistorElm\\s5\\s39\\rCapacitorElm\\s39\\s6\\rCapacitorElm\\s39\\s5\\rTransistorElm\\s39\\s5\\s6\\s\\rResistorElm\\s7\\s40\\rCapacitorElm\\s40\\s8\\rCapacitorElm\\s40\\s5\\rTransistorElm\\s40\\s5\\s8\\s\\rResistorElm\\s5\\s41\\rCapacitorElm\\s41\\s9\\rCapacitorElm\\s41\\s7\\rTransistorElm\\s41\\s7\\s9\\s\\rResistorElm\\s7\\s42\\rCapacitorElm\\s42\\s3\\rCapacitorElm\\s42\\s10\\rTransistorElm\\s42\\s10\\s3\\s\\rResistorElm\\s10\\s43\\rCapacitorElm\\s43\\s11\\rCapacitorElm\\s43\\s3\\rTransistorElm\\s43\\s3\\s11\\s\\rResistorElm\\s10\\s44\\rCapacitorElm\\s44\\s13\\rCapacitorElm\\s44\\s12\\rTransistorElm\\s44\\s12\\s13\\s\\rResistorElm\\s5\\s45\\rCapacitorElm\\s45\\s14\\rCapacitorElm\\s45\\s11\\rTransistorElm\\s45\\s11\\s14\\s\\rResistorElm\\s12\\s46\\rCapacitorElm\\s46\\s11\\rCapacitorElm\\s46\\s15\\rTransistorElm\\s46\\s15\\s11\\s\\rResistorElm\\s5\\s47\\rCapacitorElm\\s47\\s17\\rCapacitorElm\\s47\\s16\\rTransistorElm\\s47\\s16\\s17\\s\\rResistorElm\\s15\\s48\\rCapacitorElm\\s48\\s18\\rCapacitorElm\\s48\\s16\\rTransistorElm\\s48\\s16\\s18\\s\\rResistorElm\\s19\\s49\\rCapacitorElm\\s49\\s16\\rCapacitorElm\\s49\\s3\\rTransistorElm\\s49\\s3\\s16\\s\\rResistorElm\\s20\\s50\\rCapacitorElm\\s50\\s19\\rCapacitorElm\\s50\\s1\\rTransistorElm\\s50\\s1\\s19\\s\\rResistorElm\\s5\\s51\\rCapacitorElm\\s51\\s21\\rCapacitorElm\\s51\\s20\\rTransistorElm\\s51\\s20\\s21\\s\\rResistorElm\\s22\\s52\\rCapacitorElm\\s52\\s20\\rCapacitorElm\\s52\\s3\\rTransistorElm\\s52\\s3\\s20\\s\\rResistorElm\\s23\\s53\\rCapacitorElm\\s53\\s16\\rCapacitorElm\\s53\\s22\\rTransistorElm\\s53\\s22\\s16\\s\\rResistorElm\\s3\\s54\\rCapacitorElm\\s54\\s24\\rCapacitorElm\\s54\\s22\\rTransistorElm\\s54\\s22\\s24\\s\\rResistorElm\\s23\\s55\\rCapacitorElm\\s55\\s16\\rCapacitorElm\\s55\\s23\\rTransistorElm\\s55\\s23\\s16\\s\\rResistorElm\\s3\\s56\\rCapacitorElm\\s56\\s25\\rCapacitorElm\\s56\\s23\\rTransistorElm\\s56\\s23\\s25\\s\\rResistorElm\\s26\\s57\\rCapacitorElm\\s57\\s16\\rCapacitorElm\\s57\\s3\\rTransistorElm\\s57\\s3\\s16\\s\\rResistorElm\\s27\\s58\\rCapacitorElm\\s58\\s3\\rCapacitorElm\\s58\\s26\\rTransistorElm\\s58\\s26\\s3\\s\\rResistorElm\\s28\\s59\\rCapacitorElm\\s59\\s1\\rCapacitorElm\\s59\\s28\\rTransistorElm\\s59\\s28\\s1\\s\\rResistorElm\\s28\\s60\\rCapacitorElm\\s60\\s1\\rCapacitorElm\\s60\\s16\\rTransistorElm\\s60\\s16\\s1\\s\\rResistorElm\\s16\\s61\\rCapacitorElm\\s61\\s29\\rCapacitorElm\\s61\\s28\\rTransistorElm\\s61\\s28\\s29\\s\\rResistorElm\\s31\\s62\\rCapacitorElm\\s62\\s32\\rCapacitorElm\\s62\\s30\\rTransistorElm\\s62\\s30\\s32\\s\\rResistorElm\\s31\\s63\\rCapacitorElm\\s63\\s33\\rCapacitorElm\\s63\\s30\\rTransistorElm\\s63\\s30\\s33\\s\\rResistorElm\\s34\\s64\\rCapacitorElm\\s64\\s35\\rCapacitorElm\\s64\\s1\\rTransistorElm\\s64\\s1\\s35\\s\\rResistorElm\\s35\\s65\\rCapacitorElm\\s65\\s36\\rCapacitorElm\\s65\\s1\\rTransistorElm\\s65\\s1\\s36\\s\\rDiodeElm\\s3\\s4\\rDiodeElm\\s37\\s1\\rDiodeElm\\s32\\s38\\rResistorElm\\s1\\s6\\rResistorElm\\s1\\s9\\rResistorElm\\s1\\s14\\rResistorElm\\s1\\s17\\rResistorElm\\s1\\s21\\rResistorElm\\s4\\s7\\rResistorElm\\s7\\s10\\rResistorElm\\s11\\s12\\rResistorElm\\s8\\s3\\rResistorElm\\s13\\s3\\rResistorElm\\s15\\s3\\rResistorElm\\s18\\s3\\rResistorElm\\s19\\s3\\rResistorElm\\s2\\s24\\rResistorElm\\s24\\s25\\rResistorElm\\s16\\s26\\rResistorElm\\s16\\s31\\rResistorElm\\s29\\s35\\rResistorElm\\s16\\s34\\rResistorElm\\s27\\s30\\rResistorElm\\s30\\s31\\rResistorElm\\s3\\s35\\rResistorElm\\s37\\s38\\rResistorElm\\s33\\s32\\rResistorElm\\s33\\s36\\rResistorElm\\s36\\s3\\rCapacitorElm\\s22\\s3\\rCapacitorElm\\s22\\s2\\rCapacitorElm\\s26\\s27\\rCapacitorElm\\s5\\s3\\rCapacitorElm\\s28\\s3\\rCapacitorElm\\s23\\s3\\r 0\\\\s-7\\\\s0.0001\\s0\\\\s200\\s2\\\\s1.5000000000000002e-13\\\\s0\\\\s0\\s2\\\\s1e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.1\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s200\\s2\\\\s1.5000000000000002e-13\\\\s0\\\\s0\\s2\\\\s1e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.1\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s50\\s2\\\\s4e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s10\\s2\\\\s3e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A2\\s0\\\\s10\\s2\\\\s3e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A2\\s0\\\\s50\\s2\\\\s4e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A2\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s20\\s2\\\\s1e-11\\\\s0\\\\s0\\s2\\\\s5e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A5\\s0\\\\s2\\s2\\\\s1e-10\\\\s0\\\\s0\\s2\\\\s5e-11\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A50\\s2\\\\s~lm317-dz\\s2\\\\s~lm317-dz\\s2\\\\s~lm317-dz\\s0\\\\s310\\s0\\\\s310\\s0\\\\s190\\s0\\\\s82\\s0\\\\s5600\\s0\\\\s100000\\s0\\\\s130\\s0\\\\s12400\\s0\\\\s180\\s0\\\\s4100\\s0\\\\s5800\\s0\\\\s72\\s0\\\\s5100\\s0\\\\s12000\\s0\\\\s2400\\s0\\\\s6700\\s0\\\\s12000\\s0\\\\s130\\s0\\\\s370\\s0\\\\s13000\\s0\\\\s400\\s0\\\\s160\\s0\\\\s18000\\s0\\\\s160\\s0\\\\s3\\s0\\\\s0.1\\s2\\\\s3e-11\\\\s0\\\\s0\\s2\\\\s3e-11\\\\s0\\\\s0\\s2\\\\s5e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s1e-12\\\\s0\\\\s0',
  '. ~TL431 0 1 3 3 A 2 0 1 C 1 0 0 ref 3 1 2 ResistorElm\\s3\\s18\\rCapacitorElm\\s18\\s4\\rCapacitorElm\\s18\\s1\\rTransistorElm\\s18\\s1\\s4\\s\\rResistorElm\\s4\\s5\\rResistorElm\\s5\\s6\\rResistorElm\\s5\\s7\\rResistorElm\\s6\\s19\\rCapacitorElm\\s19\\s2\\rCapacitorElm\\s19\\s6\\rTransistorElm\\s19\\s6\\s2\\s\\rResistorElm\\s6\\s20\\rCapacitorElm\\s20\\s8\\rCapacitorElm\\s20\\s7\\rTransistorElm\\s20\\s7\\s8\\s\\rResistorElm\\s8\\s2\\rResistorElm\\s4\\s21\\rCapacitorElm\\s21\\s10\\rCapacitorElm\\s21\\s9\\rTransistorElm\\s21\\s9\\s10\\s\\rResistorElm\\s10\\s11\\rResistorElm\\s7\\s22\\rCapacitorElm\\s22\\s2\\rCapacitorElm\\s22\\s11\\rTransistorElm\\s22\\s11\\s2\\s\\rResistorElm\\s13\\s23\\rCapacitorElm\\s23\\s2\\rCapacitorElm\\s23\\s12\\rTransistorElm\\s23\\s12\\s2\\s\\rResistorElm\\s9\\s24\\rCapacitorElm\\s24\\s14\\rCapacitorElm\\s24\\s9\\rTransistorElm\\s24\\s9\\s14\\s\\rResistorElm\\s9\\s25\\rCapacitorElm\\s25\\s15\\rCapacitorElm\\s25\\s12\\rTransistorElm\\s25\\s12\\s15\\s\\rResistorElm\\s1\\s14\\rResistorElm\\s1\\s15\\rResistorElm\\s12\\s26\\rCapacitorElm\\s26\\s16\\rCapacitorElm\\s26\\s1\\rTransistorElm\\s26\\s1\\s16\\s\\rResistorElm\\s17\\s16\\rResistorElm\\s17\\s27\\rCapacitorElm\\s27\\s2\\rCapacitorElm\\s27\\s1\\rTransistorElm\\s27\\s1\\s2\\s\\rResistorElm\\s17\\s2\\rResistorElm\\s12\\s28\\rCapacitorElm\\s28\\s3\\rCapacitorElm\\s28\\s12\\rTransistorElm\\s28\\s12\\s3\\s\\rDiodeElm\\s2\\s12\\rResistorElm\\s13\\s6\\rDiodeElm\\s2\\s1\\rCapacitorElm\\s1\\s12\\rCapacitorElm\\s7\\s11\\r 0\\\\s40\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed\\s0\\\\s3280\\s0\\\\s2400\\s0\\\\s7200\\s0\\\\s33.333333333333336\\s2\\\\s1.2e-12\\\\s0\\\\s0\\s2\\\\s2.4e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed-A1.2\\s0\\\\s18.18181818181818\\s2\\\\s2.2000000000000003e-12\\\\s0\\\\s0\\s2\\\\s4.400000000000001e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed-A2.2\\s0\\\\s800\\s0\\\\s40\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed\\s0\\\\s4000\\s0\\\\s40\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed\\s0\\\\s80\\s2\\\\s5e-13\\\\s0\\\\s0\\s2\\\\s1e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed-A0.5\\s0\\\\s80\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s3e-12\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s60\\\\s~tl431ed-qp_ed\\s0\\\\s80\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s3e-12\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s60\\\\s~tl431ed-qp_ed\\s0\\\\s800\\s0\\\\s800\\s0\\\\s40\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed\\s0\\\\s150\\s0\\\\s8\\s2\\\\s5e-12\\\\s0\\\\s0\\s2\\\\s1e-11\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed-A5\\s0\\\\s10000\\s0\\\\s40\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed\\s2\\\\s~tl431ed-d_ed\\s0\\\\s1000\\s2\\\\s~tl431ed-d_ed\\s2\\\\s1e-11\\\\s0\\\\s0\\s2\\\\s2e-11\\\\s0\\\\s0',
];
