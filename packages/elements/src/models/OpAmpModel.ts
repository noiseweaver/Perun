// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/**
 * Behavioural op-amp models for the real op-amp (OpAmpRealElm), not in upstream
 * (docs/deviations/audio-op-amps.md). Built-in ones come from datasheets (audioParts.ts); the user
 * can copy one and edit the copy, or make their own. A circuit saves the custom models it uses as
 * `om` records, which CircuitJS1 skips; the op-amp itself is saved as an LM741 with the model's
 * slew rate and current limit, so CircuitJS1 still runs something close.
 */

import { EditInfo, type Editable } from '../edit/EditInfo.ts';
import { pickModelName } from '../edit/modelEditor.ts';
import type { XmlAttrReader, XmlDocWriter } from '../xml.ts';
import { OPAMP_PARTS, type OpAmpPart } from './audioParts.ts';
import type { ModelStorage } from './CustomCompositeModel.ts';

/** Java `String.compareTo` order on model names (UTF-16 code units), for the model lists. */
function compareNames(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** The datasheet figures a behavioural op-amp is built from (see elm/opAmpMacro.ts). */
export type OpAmpMacroSpec = Omit<OpAmpPart, 'name' | 'description'>;

const FIELDS = [
  'gbw',
  'slewRate',
  'avol',
  'rin',
  'ib',
  'iq',
  'ilim',
  'rout',
  'headroomHigh',
  'headroomLow',
] as const;
type Field = (typeof FIELDS)[number];

/** XML attribute names of the fields. */
const ATTRS: Record<Field, string> = {
  gbw: 'gbw',
  slewRate: 'sr',
  avol: 'av',
  rin: 'rin',
  ib: 'ib',
  iq: 'iq',
  ilim: 'il',
  rout: 'ro',
  headroomHigh: 'hh',
  headroomLow: 'hl',
};

export class OpAmpModel implements Editable, OpAmpMacroSpec {
  name = '';
  description: string | null = null;
  gbw = 3e6;
  slewRate = 13;
  avol = 200e3;
  rin = 1e12;
  ib = 0;
  iq = 1.4e-3;
  ilim = 26e-3;
  rout = 100;
  headroomHigh = 1.5;
  headroomLow = 1.5;

  dumped = false;
  readOnly = false;
  builtIn = false;
  /** The library, so a renamed model registers itself and can be kept across circuits. */
  library: OpAmpModels | null = null;

  static ofPart(p: OpAmpPart): OpAmpModel {
    const m = new OpAmpModel();
    m.description = p.description;
    for (const f of FIELDS) m[f] = p[f];
    return m;
  }

  static copyOf(copy: OpAmpModel): OpAmpModel {
    const m = new OpAmpModel();
    for (const f of FIELDS) m[f] = copy[f];
    return m;
  }

  getDialogTitle(): string {
    return 'Edit Op-Amp Model';
  }

  getEditInfo(n: number): EditInfo | null {
    if (n === 0) return EditInfo.text('Model Name', this.name);
    if (n === 1) return new EditInfo('Unity-Gain Bandwidth (Hz)', this.gbw).setPositive();
    if (n === 2) return new EditInfo('Slew Rate (V/usec)', this.slewRate).setPositive();
    if (n === 3) return new EditInfo('Open-Loop Gain (V/V)', this.avol).setPositive();
    if (n === 4) return new EditInfo('Input Resistance (ohms)', this.rin).setPositive();
    if (n === 5) return new EditInfo('Input Bias Current (A), negative flows out', this.ib);
    if (n === 6) return new EditInfo('Supply Current (A)', this.iq).setNonNegative();
    if (n === 7) return new EditInfo('Output Current Limit (A)', this.ilim).setPositive();
    if (n === 8) return new EditInfo('Output Resistance (ohms)', this.rout).setPositive();
    if (n === 9)
      return new EditInfo('Output Swing Below V+ (V)', this.headroomHigh).setNonNegative();
    if (n === 10)
      return new EditInfo('Output Swing Above V- (V)', this.headroomLow).setNonNegative();
    if (n === 11 && this.library?.storage != null)
      return EditInfo.createCheckbox('Keep in My Models (all circuits)', this.isSaved());
    return null;
  }

  /** Set a field; the caller then rebuilds every op-amp using a model (updateModels). */
  setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      const name = (ei.text ?? '').trim();
      if (name !== this.name) this.library?.rename(this, name);
    }
    if (n === 1 && ei.value > 0) this.gbw = ei.value;
    if (n === 2 && ei.value > 0) this.slewRate = ei.value;
    if (n === 3 && ei.value > 0) this.avol = ei.value;
    if (n === 4 && ei.value > 0) this.rin = ei.value;
    if (n === 5) this.ib = ei.value;
    if (n === 6 && ei.value >= 0) this.iq = ei.value;
    if (n === 7 && ei.value > 0) this.ilim = ei.value;
    if (n === 8 && ei.value > 0) this.rout = ei.value;
    if (n === 9 && ei.value >= 0) this.headroomHigh = ei.value;
    if (n === 10 && ei.value >= 0) this.headroomLow = ei.value;
    if (n === 11) this.library?.setSaved(this, ei.checkbox?.state === true);
    // a kept model follows its edits
    else if (this.isSaved()) this.library?.setSaved(this, true);
  }

  isSaved(): boolean {
    return this.library?.isSaved(this) ?? false;
  }

  pickName(): void {
    this.library?.rename(this, pickModelName('opampmodel', this.library.modelMap));
  }

  getDescription(): string {
    if (this.description === null) return this.name;
    return this.name + ' (' + this.description + ')';
  }

  dumpXml(doc: XmlDocWriter): void {
    this.dumped = true;
    const w = doc.addElement('om');
    w.dumpAttr('nm', this.name);
    for (const f of FIELDS) w.dumpAttr(ATTRS[f], this[f]);
  }

  undumpXml(r: XmlAttrReader): void {
    for (const f of FIELDS) this[f] = r.parseDoubleAttr(ATTRS[f], this[f]);
  }

  /** The fields as a plain object, as the model library keeps them. */
  toJson(): Record<string, number | string> {
    const o: Record<string, number | string> = { name: this.name };
    for (const f of FIELDS) o[f] = this[f];
    return o;
  }

  fromJson(o: Record<string, unknown>): void {
    for (const f of FIELDS) {
      const v = o[f];
      if (typeof v === 'number' && Number.isFinite(v)) this[f] = v;
    }
  }
}

const STORAGE_PREFIX = 'opamp-model:';

/** Model numbers a preview build of PR #56 wrote, before op-amp models had names. */
const LEGACY_TYPES: Readonly<Record<number, string>> = { 3: 'TL072', 4: 'NE5532', 5: 'RC4558' };

/** The op-amp models a circuit can use: the datasheet parts, the user's kept ones, and its own. */
export class OpAmpModels {
  readonly modelMap = new Map<string, OpAmpModel>();
  /** The user's kept models (the browser's localStorage); null in tests and Node. */
  storage: ModelStorage | null = null;
  /** The model for new op-amp models' copies and unknown names. */
  static readonly DEFAULT = 'TL072';

  constructor() {
    for (const p of OPAMP_PARTS) {
      const m = OpAmpModel.ofPart(p);
      m.name = p.name;
      m.readOnly = m.builtIn = true;
      m.library = this;
      this.modelMap.set(p.name, m);
    }
  }

  /** The model called `name`; an unknown name gets a copy of the default under that name. */
  getModelWithName(name: string): OpAmpModel {
    let m = this.modelMap.get(name);
    if (m !== undefined) return m;
    m = OpAmpModel.copyOf(this.getDefaultModel());
    m.name = name;
    m.library = this;
    this.modelMap.set(name, m);
    return m;
  }

  getDefaultModel(): OpAmpModel {
    const m = this.modelMap.get(OpAmpModels.DEFAULT);
    if (m === undefined) throw new Error('no default op-amp model');
    return m;
  }

  /** A model number from an early preview build, or null. */
  legacyModel(type: number): OpAmpModel | null {
    const name = LEGACY_TYPES[type];
    return name === undefined ? null : this.getModelWithName(name);
  }

  /** A new model to edit, copied from `from` and named after it; it joins the list on OK. */
  createCopy(from: OpAmpModel): OpAmpModel {
    const m = OpAmpModel.copyOf(from);
    m.name = pickModelName(from.name + ' copy', this.modelMap);
    m.library = this;
    return m;
  }

  /**
   * Give a model a new name (keeping a kept model under its new name). A name another model has
   * gets a number added, so a datasheet model is never replaced.
   */
  rename(m: OpAmpModel, name: string): void {
    const kept = this.isSaved(m);
    if (kept) this.setSaved(m, false);
    if (this.modelMap.get(m.name) === m) this.modelMap.delete(m.name);
    const other = this.modelMap.get(name);
    if (other !== undefined && other !== m) name = pickModelName(name, this.modelMap);
    m.name = name;
    if (name.length > 0) this.modelMap.set(name, m);
    if (kept) this.setSaved(m, true);
  }

  getModelList(): OpAmpModel[] {
    const list: OpAmpModel[] = [];
    for (const m of this.modelMap.values()) if (!list.includes(m)) list.push(m);
    return list.sort(compareNames);
  }

  isSaved(m: OpAmpModel): boolean {
    if (m.builtIn || m.name.length === 0 || this.storage === null) return false;
    try {
      return this.storage.getItem(STORAGE_PREFIX + m.name) !== null;
    } catch {
      return false;
    }
  }

  /** Keep the model for every circuit (the browser's storage), or forget it there. */
  setSaved(m: OpAmpModel, keep: boolean): void {
    const stor = this.storage;
    if (stor === null || m.builtIn || m.name.length === 0) return;
    try {
      if (keep) stor.setItem(STORAGE_PREFIX + m.name, JSON.stringify(m.toJson()));
      else stor.removeItem(STORAGE_PREFIX + m.name);
    } catch {
      // storage full or blocked: the model stays in this circuit only
    }
  }

  /** Every kept model joins the list (a circuit's own model of the same name replaces it). */
  loadModelsFromStorage(): void {
    const stor = this.storage;
    if (stor === null) return;
    try {
      for (let i = 0; i < stor.length; i++) {
        const key = stor.key(i);
        if (key?.startsWith(STORAGE_PREFIX) !== true) continue;
        const data = stor.getItem(key);
        if (data === null) continue;
        const name = key.slice(STORAGE_PREFIX.length);
        const existing = this.modelMap.get(name);
        if (existing?.builtIn === true) continue;
        const m = existing ?? this.getModelWithName(name);
        m.fromJson(JSON.parse(data) as Record<string, unknown>);
      }
    } catch {
      // unreadable storage: the kept models are missing this session
    }
  }

  undumpModelXml(r: XmlAttrReader): OpAmpModel {
    const m = this.getModelWithName(r.parseStringAttr('nm', null) ?? 'null');
    // a circuit can't change a datasheet model
    if (!m.builtIn) m.undumpXml(r);
    return m;
  }

  clearDumpedFlags(): void {
    for (const m of this.modelMap.values()) m.dumped = false;
  }
}
