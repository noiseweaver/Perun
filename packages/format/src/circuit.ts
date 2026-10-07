// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CircuitLoader.java,
// XMLDeserializer.java and XMLSerializer.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: clearing, reading and saving a circuit.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import {
  CustomCompositeModel,
  ExtListEntry,
  GraphicElm,
  GroundElm,
  LabeledNodeElm,
  SIDE_E,
  SIDE_N,
  SIDE_S,
  SIDE_W,
  SwitchElm,
  WireElm,
  ADJ_FLAG_LOG,
  ADJ_FLAG_SHARED,
  Adjustable,
  findEditItemByName,
  reorderAdjustables,
  ScopeElm,
  Simulation,
  StringTokenizer,
  classNameForXmlTag,
  constructElement,
  createCe,
  javaDoubleToInt,
  modelsFor,
  parseJavaDouble,
  parseJavaInt,
  scopesFor,
  type CircuitElm,
  type Scope,
  type ScopeHost,
  type ScopeManager,
  type XmlDocWriter,
  unescapeToken,
  NOMINAL_TEMPERATURE,
  formatParamList,
  parseParamList,
  type ParamDef,
} from '@circuitjs-next/elements';
import { AttrReader, AttrWriter } from './attrs.ts';
import { XmlElement, parseXml, prettyPrint } from './xml.ts';

/** Option flag bits kept in CircuitOptions.flags (64, adjustable timestep, lives on the sim). */
export const OptionFlag = {
  DOTS: 1,
  SMALL_GRID: 2,
  HIDE_VOLTAGE_COLORS: 4,
  POWER: 8,
  HIDE_VALUES: 16,
  ADJUST_TIMESTEP: 64,
  AUTO_DC_ON_RESET: 128,
} as const;

const KEPT_FLAGS =
  OptionFlag.DOTS |
  OptionFlag.SMALL_GRID |
  OptionFlag.HIDE_VOLTAGE_COLORS |
  OptionFlag.POWER |
  OptionFlag.HIDE_VALUES |
  OptionFlag.AUTO_DC_ON_RESET;

/** Display settings saved with a circuit (upstream keeps them in menus and sliders). */
export interface CircuitOptions {
  /** OptionFlag bits, without ADJUST_TIMESTEP. */
  flags: number;
  /** Simulation speed slider, 0..259. */
  speed: number;
  /** Current speed slider, 1..99. */
  currentBar: number;
  /** Power brightness slider, 1..99. */
  powerBar: number;
  voltageRange: number;
}

/** The element and posts the circuit's explanatory hint refers to (`h` record). */
export interface Hint {
  type: number;
  item1: number;
  item2: number;
}

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);

/** A loaded circuit: its simulation, elements and saved settings. */
export class Circuit {
  readonly sim = new Simulation();
  elements: CircuitElm[] = [];
  options: CircuitOptions = { flags: 0, speed: 117, currentBar: 50, powerBar: 50, voltageRange: 5 };
  hint: Hint = { type: -1, item1: 0, item2: 0 };
  /** Sliders (upstream `CirSim.adjustables`), those with their own slider first. */
  adjustables: Adjustable[] = [];
  /**
   * The circuit's parameters (PLAN.md Phase 16): what fields bind to with `{...}`, and what a
   * subcircuit made from the circuit lets each copy set. Not in upstream (DEVIATIONS.md): saved
   * as the extra XML attribute `prm`, only when there are any.
   */
  params: ParamDef[] = [];
  /**
   * While reading: every element record so far, with null for those this port can't load, so
   * scope element numbers count as upstream's do.
   */
  private loadList: (CircuitElm | null)[] = [];

  constructor() {
    this.sim.currentElements = () => this.elements;
    const scopes = this.scopes;
    scopes.host = {
      elements: () => this.elements,
      dotsEnabled: () => (this.options.flags & OptionFlag.DOTS) !== 0,
      createImage: () => null,
      defaultsStore: null,
    };
    scopes.undockedScopes = () => this.undockedScopes();
    this.sim.onTimeStep = () => scopes.timeStep();
    this.sim.canDelayWireProcessing = () => scopes.canDelayWireProcessing();
  }

  private undockedCache: { elements: CircuitElm[]; length: number; scopes: Scope[] } | null = null;

  /** Undocked scopes (ScopeElm), in element order; cached, as it is asked every timestep. */
  undockedScopes(): Scope[] {
    const els = this.elements;
    const c = this.undockedCache;
    if (c !== null && c.elements === els && c.length === els.length) return c.scopes;
    const scopes: Scope[] = [];
    for (const e of els) if (e instanceof ScopeElm) scopes.push(e.elmScope);
    this.undockedCache = { elements: els, length: els.length, scopes };
    return scopes;
  }

  /** Undocked scope elements, in element order. */
  scopeElms(): ScopeElm[] {
    return this.elements.filter((e): e is ScopeElm => e instanceof ScopeElm);
  }

  /**
   * Remove undocked scopes whose elements are all gone (upstream deleteUnusedScopeElms).
   * Returns whether any went.
   */
  removeUnusedScopeElms(): boolean {
    const keep = this.elements.filter((e) => !(e instanceof ScopeElm && e.elmScope.needToRemove()));
    if (keep.length === this.elements.length) return false;
    this.elements = keep;
    return true;
  }

  /** The docked scopes. */
  get scopes(): ScopeManager {
    return scopesFor(this.sim);
  }

  /** Give scopes what only the UI has (offscreen images, saved defaults). */
  setScopeUi(ui: Pick<ScopeHost, 'createImage' | 'defaultsStore'>): void {
    const host = this.scopes.host;
    this.scopes.host = {
      elements: host.elements,
      dotsEnabled: host.dotsEnabled,
      createImage: ui.createImage,
      defaultsStore: ui.defaultsStore,
    };
  }
  /** A subcircuit's circuit is open for editing: loading keeps the circuit's own models. */
  keepLocalModels = false;
  /** What upstream would print to its console while loading (unknown or broken records). */
  warnings: string[] = [];

  /** Upstream `getIterCount()`: the speed slider as iterations per frame. */
  getIterCount(): number {
    if (this.options.speed === 0) return 0;
    return 0.1 * Math.exp((this.options.speed - 61) / 24);
  }

  setSpeedFromIterCount(sp: number): void {
    this.options.speed = clamp(javaDoubleToInt(Math.log(10 * sp) * 24 + 61.5), 0, 259);
  }

  /** Upstream `CircuitLoader.clearCircuit()`, minus the UI. */
  clear(): void {
    const sim = this.sim;
    sim.resetTime();
    sim.solverType = 0;
    sim.temperature = NOMINAL_TEMPERATURE;
    this.params = [];
    this.elements = [];
    this.hint = { type: -1, item1: 0, item2: 0 };
    sim.maxTimeStep = 5e-6;
    sim.minTimeStep = 50e-12;
    this.options = { flags: 0, speed: 117, currentBar: 50, powerBar: 50, voltageRange: 5 };
    this.setGrid();
    this.adjustables = [];
    this.scopes.clearScopes();
    // upstream keeps them while a subcircuit is open for editing (its context stack)
    if (!this.keepLocalModels) modelsFor(sim).composite.clearLocalModels();
  }

  private setGrid(): void {
    this.sim.gridSize = (this.options.flags & OptionFlag.SMALL_GRID) !== 0 ? 8 : 16;
  }

  /**
   * Upstream `resetAction()` minus the UI: restart time, zero node voltages and element state, and
   * analyze again (finding the DC operating point first if the circuit asks for it). Node voltages
   * are reset as dev-ts does (`SimulationManager.resetNodes`), since they live on the nodes here.
   */
  reset(): void {
    const sim = this.sim;
    sim.analyzeFlag = true;
    if ((this.options.flags & OptionFlag.AUTO_DC_ON_RESET) !== 0) sim.dcAnalysisFlag = true;
    sim.resetTime();
    sim.resetNodes();
    for (const ce of this.elements) {
      // upstream CircuitElm.reset() zeroes volts[]
      ce.volts.fill(0);
      ce.reset();
    }
  }

  readCircuitFlags(flags: number): void {
    this.options.flags = flags & KEPT_FLAGS;
    this.sim.adjustTimeStep = (flags & OptionFlag.ADJUST_TIMESTEP) !== 0;
  }

  /** Load a circuit in either format, replacing this one (upstream `readCircuit(text, 0)`). */
  read(text: string): void {
    this.clear();
    this.beginRead();
    try {
      if (text.startsWith('<')) this.readXml(text, false);
      else this.readText(text, false);
    } finally {
      this.endRead();
    }
    // upstream finishReadCircuit: drop the adjustables that get no slider
    this.adjustables = this.adjustables.filter((a) => a.createSlider());
    this.finishRead();
  }

  /**
   * Load the parts of a subcircuit model as a circuit, to edit them (upstream
   * `XMLDeserializer.readCircuit(Document)`).
   */
  readElementsDoc(root: XmlElement): void {
    this.clear();
    this.beginRead();
    try {
      this.readElements(root, false);
    } finally {
      this.endRead();
    }
    this.adjustables = this.adjustables.filter((a) => a.createSlider());
    this.finishRead();
  }

  /**
   * Add a circuit's elements to this one, keeping this circuit's settings (upstream
   * `readCircuit(text, RC_RETAIN)`, used by paste). Returns the new elements, in file order.
   */
  readRetain(text: string): CircuitElm[] {
    const first = this.elements.length;
    this.beginRead();
    try {
      if (text.startsWith('<')) this.readXml(text, true);
      else this.readText(text, true);
    } finally {
      this.endRead();
    }
    this.finishRead();
    return this.elements.slice(first);
  }

  private beginRead(): void {
    this.loadList = [...this.elements];
    this.scopes.loadElements = this.loadList;
  }

  private endRead(): void {
    this.scopes.loadElements = null;
    this.loadList = [];
  }

  private finishRead(): void {
    this.sim.setElements(this.elements);
  }

  private addElement(ce: CircuitElm): void {
    ce.sim = this.sim;
    this.elements.push(ce);
    this.loadList.push(ce);
  }

  private addScope(sc: Scope): void {
    if (sc.serializer.missingElement) {
      this.warnings.push('a scope shows an element that is not supported yet');
      return;
    }
    this.scopes.addScope(sc);
  }

  /** An element record upstream would load but this port can't: keep its number taken. */
  private skipElement(): void {
    this.loadList.push(null);
  }

  // ---- text format ---------------------------------------------------------------------------

  private readText(text: string, retain: boolean): void {
    for (const line of text.split(/\r\n|\r|\n/)) {
      const st = new StringTokenizer(line, ' +\t\n\r\f');
      if (!st.hasMoreTokens()) continue;
      const type = st.nextToken();
      let tint = type.charCodeAt(0);
      try {
        if (type.charAt(0) === 'o') {
          // a pasted circuit's scopes would point at the wrong elements (and copies have none)
          if (retain) continue;
          const sc = this.scopes.newScope();
          sc.serializer.undump(st);
          this.addScope(sc);
          continue;
        }
        if (type.charAt(0) === 'h') {
          if (retain) continue;
          this.hint = {
            type: parseJavaInt(st.nextToken()),
            item1: parseJavaInt(st.nextToken()),
            item2: parseJavaInt(st.nextToken()),
          };
          continue;
        }
        if (type.charAt(0) === '$') {
          if (retain) {
            // a pasted circuit only turns the small grid on
            if ((parseJavaInt(st.nextToken()) & OptionFlag.SMALL_GRID) !== 0) {
              this.options.flags |= OptionFlag.SMALL_GRID;
              this.setGrid();
            }
          } else this.readOptions(st);
          continue;
        }
        if (type.charAt(0) === '!') {
          modelsFor(this.sim).customLogic.undumpModel(st);
          continue;
        }
        // afilter-specific records
        if ('%?B'.includes(type.charAt(0))) continue;

        if (tint >= 48 && tint <= 57) tint = parseJavaInt(type);

        if (tint === 34) {
          modelsFor(this.sim).diode.undumpModel(st);
          continue;
        }
        if (tint === 32) {
          modelsFor(this.sim).transistor.undumpModel(st);
          continue;
        }
        if (tint === 38) {
          if (!retain) this.readTextAdjustable(st);
          continue;
        }
        if (type.charAt(0) === '.') {
          modelsFor(this.sim).composite.undumpModel(st, this.sim);
          continue;
        }

        const x1 = parseJavaInt(st.nextToken());
        const y1 = parseJavaInt(st.nextToken());
        const x2 = parseJavaInt(st.nextToken());
        const y2 = parseJavaInt(st.nextToken());
        const f = parseJavaInt(st.nextToken());
        const ce = createCe(tint, x1, y1, x2, y2, f, st, this.sim);
        if (ce === null) {
          this.warnings.push('unrecognized dump type: ' + type);
          this.skipElement();
          continue;
        }
        ce.sim = this.sim;
        ce.setPoints();
        if (ce instanceof ScopeElm && ce.missingElement) {
          this.warnings.push('a scope shows an element that is not supported yet');
          this.skipElement();
          continue;
        }
        this.addElement(ce);
      } catch (e) {
        this.warnings.push(`exception while undumping ${String(e)}`);
      }
    }
  }

  /** Upstream `Adjustable(StringTokenizer)`: a text-format slider (`38` record). */
  private readTextAdjustable(st: StringTokenizer): void {
    const e = parseJavaInt(st.nextToken());
    if (e === -1) return;
    let flags = 0;
    let editItem = 0;
    let minValue = 0;
    let maxValue = 0;
    let shared: Adjustable | null = null;
    let sliderText = '';
    let sliderStep = 0;
    try {
      let ei = st.nextToken();
      // the initial code forgot a flags field, so it is an optional "F" token
      if (ei.startsWith('F')) {
        flags = parseJavaInt(ei.substring(1));
        ei = st.nextToken();
      }
      editItem = parseJavaInt(ei);
      minValue = parseJavaDouble(st.nextToken());
      maxValue = parseJavaDouble(st.nextToken());
      if ((flags & ADJ_FLAG_SHARED) !== 0) {
        const ano = parseJavaInt(st.nextToken());
        shared = ano === -1 ? null : (this.adjustables[ano] ?? null);
      }
      sliderText = unescapeToken(st.nextToken());
    } catch {
      // upstream keeps whatever it read before the record ran out
    }
    try {
      sliderStep = parseJavaDouble(st.nextToken());
    } catch {
      // older records have no step
    }
    const ce = this.loadList[e];
    if (ce === undefined || ce === null) return;
    const adj = new Adjustable(ce, editItem);
    adj.minValue = minValue;
    adj.maxValue = maxValue;
    adj.sharedSlider = shared;
    adj.sliderText = sliderText;
    adj.sliderStep = sliderStep;
    adj.logarithmic = (flags & ADJ_FLAG_LOG) !== 0;
    this.adjustables.push(adj);
  }

  private readOptions(st: StringTokenizer): void {
    const sim = this.sim;
    const flags = parseJavaInt(st.nextToken());
    this.readCircuitFlags(flags);
    sim.maxTimeStep = sim.timeStep = parseJavaDouble(st.nextToken());
    this.setSpeedFromIterCount(parseJavaDouble(st.nextToken()));
    this.options.currentBar = clamp(parseJavaInt(st.nextToken()), 1, 99);
    this.options.voltageRange = parseJavaDouble(st.nextToken());
    try {
      this.options.powerBar = clamp(parseJavaInt(st.nextToken()), 1, 99);
      sim.minTimeStep = parseJavaDouble(st.nextToken());
    } catch {
      // older files stop early
    }
    this.setGrid();
  }

  // ---- XML format ----------------------------------------------------------------------------

  private readXml(text: string, retain: boolean): void {
    const root = parseXml(text);
    const sim = this.sim;
    const r = new AttrReader(root);
    if (!retain) {
      this.readCircuitFlags(r.parseIntAttr('f', 0));
      sim.maxTimeStep = sim.timeStep = r.parseDoubleAttr('ts', sim.maxTimeStep);
      this.setSpeedFromIterCount(r.parseDoubleAttr('ic', this.getIterCount()));
      this.options.currentBar = clamp(r.parseIntAttr('cb', this.options.currentBar), 1, 99);
      this.options.voltageRange = r.parseDoubleAttr('vr', this.options.voltageRange);
      this.options.powerBar = clamp(r.parseIntAttr('pb', this.options.powerBar), 1, 99);
      sim.minTimeStep = r.parseDoubleAttr('mts', sim.minTimeStep);
      sim.solverType = r.parseIntAttr('st', sim.solverType) as typeof sim.solverType;
      // not in upstream (DEVIATIONS.md): the circuit temperature, saved only when not 27 °C
      sim.temperature = r.parseDoubleAttr('temp', NOMINAL_TEMPERATURE);
      this.params = parseParamList(r.parseStringAttr('prm', null));
      this.setGrid();
    }
    this.readElements(root, retain);
  }

  /** The records under `root`: elements, scopes, sliders, models (upstream `readElements`). */
  private readElements(root: XmlElement, retain: boolean): void {
    const sim = this.sim;
    const r = new AttrReader(root);
    for (const elem of root.elements()) {
      const tag = elem.name;
      r.elem = elem;
      if (tag === 'o') {
        if (retain) continue;
        const sc = this.scopes.newScope();
        try {
          sc.serializer.undumpXml(new AttrReader(elem));
          this.addScope(sc);
        } catch (e) {
          this.warnings.push(`exception while reading a scope: ${String(e)}`);
        }
        continue;
      }
      if (tag === 'adj') {
        if (!retain) this.readXmlAdjustable(r);
        continue;
      }
      if (tag === 'h') {
        if (retain) continue;
        this.hint = {
          type: r.parseIntAttr('t', -1),
          item1: r.parseIntAttr('i1', 0),
          item2: r.parseIntAttr('i2', 0),
        };
        continue;
      }
      if (tag === 'dm') {
        modelsFor(sim).diode.undumpModelXml(r);
        continue;
      }
      if (tag === 'tm') {
        modelsFor(sim).transistor.undumpModelXml(r);
        continue;
      }
      if (tag === 'mm') {
        modelsFor(sim).mosfet.undumpModelXml(r);
        continue;
      }
      if (tag === 'rlm') {
        modelsFor(sim).relay.undumpModelXml(r);
        continue;
      }
      if (tag === 'ccm') {
        modelsFor(sim).composite.undumpModelXml(r, sim);
        continue;
      }
      if (tag === 'clm') {
        modelsFor(sim).customLogic.undumpModelXml(r);
        continue;
      }
      // upstream's own regression-test records; only its test runner reads them
      if (tag === 'test' || tag === 'switchevent' || tag === 'scopedata') continue;

      const x = elem.getAttribute('x');
      if (x === null) continue;
      const className = classNameForXmlTag(tag);
      if (className === undefined) {
        this.warnings.push('unrecognized xml element: ' + tag);
        this.skipElement();
        continue;
      }
      const elm = constructElement(className, 0, 0, sim);
      if (elm === null) {
        this.skipElement();
        continue;
      }
      elm.sim = sim;
      elm.undumpXml(r);
      const xs = x.split(' ');
      const pos = [0, 1, 2, 3].map((i) => {
        const s = xs[i];
        if (s === undefined) throw new Error(`bad position "${x}" on <${tag}>`);
        return parseJavaInt(s);
      }) as [number, number, number, number];
      elm.setPosition(...pos);
      if (elm instanceof ScopeElm && elm.missingElement) {
        this.warnings.push('a scope shows an element that is not supported yet');
        this.skipElement();
        continue;
      }
      this.addElement(elm);
    }
  }

  /** Upstream `Adjustable.undumpXml`. */
  private readXmlAdjustable(r: AttrReader): void {
    const e = r.parseIntAttr('e', -1);
    if (e === -1) return;
    const elm = this.loadList[e];
    if (elm === undefined || elm === null) {
      this.warnings.push('a slider controls an element that could not be loaded');
      return;
    }
    const item = findEditItemByName(elm, r.parseStringAttr('en', null), r.parseIntAttr('ei', 0));
    const adj = new Adjustable(elm, item);
    adj.minValue = r.parseDoubleAttr('mn', 1);
    adj.maxValue = r.parseDoubleAttr('mx', 1000);
    adj.sliderText = r.parseStringAttr('st', '');
    adj.sliderStep = r.parseDoubleAttr('stp', 0);
    const ss = r.parseIntAttr('ss', -1);
    if (ss !== -1) adj.sharedSlider = this.adjustables[ss] ?? null;
    adj.logarithmic = r.parseIntAttr('log', 0) !== 0;
    this.adjustables.push(adj);
  }

  /** An `adj` record as upstream `Adjustable.dumpXml` writes it. */
  private adjElement(a: Adjustable): XmlElement {
    const adj = new XmlElement('adj');
    const w = new AttrWriter(adj);
    w.dumpAttr('e', this.elements.indexOf(a.elm));
    w.dumpAttr('ei', a.editItem);
    w.dumpAttr('en', a.getEditItemName());
    w.dumpAttr('mn', a.minValue);
    w.dumpAttr('mx', a.maxValue);
    w.dumpAttr('st', a.sliderText);
    if (a.sliderStep > 0) w.dumpAttr('stp', a.sliderStep);
    if (a.sharedSlider !== null) w.dumpAttr('ss', this.adjustables.indexOf(a.sharedSlider));
    if (a.logarithmic) w.dumpAttr('log', 1);
    return adj;
  }

  /**
   * Drop the sliders of elements no longer in the circuit (upstream `deleteSliders`, called as
   * elements are deleted). A slider others share passes to the first of them.
   */
  pruneAdjustables(): boolean {
    const live = new Set(this.elements);
    const gone = this.adjustables.filter((a) => !live.has(a.elm));
    if (gone.length === 0) return false;
    let list = this.adjustables.filter((a) => live.has(a.elm));
    for (const g of gone) {
      const heirs = list.filter((a) => a.sharedSlider === g);
      const heir = heirs[0];
      if (heir === undefined) continue;
      heir.sharedSlider = null;
      if (heir.sliderText.length === 0) heir.sliderText = g.sliderText;
      heir.position = g.position;
      for (const a of heirs.slice(1)) a.sharedSlider = heir;
    }
    list = reorderAdjustables(list);
    this.adjustables = list;
    return true;
  }

  // ---- saving --------------------------------------------------------------------------------

  /** The circuit as upstream saves it (`XMLSerializer.dumpCircuit()`). */
  dumpXml(): string {
    const sim = this.sim;
    const root = new XmlElement('cir');
    const w = new AttrWriter(root);
    w.dumpAttr('f', this.options.flags | (sim.adjustTimeStep ? OptionFlag.ADJUST_TIMESTEP : 0));
    w.dumpAttr('ts', sim.maxTimeStep);
    w.dumpAttr('ic', this.getIterCount());
    w.dumpAttr('cb', this.options.currentBar);
    w.dumpAttr('pb', this.options.powerBar);
    w.dumpAttr('vr', this.options.voltageRange);
    w.dumpAttr('mts', sim.minTimeStep);
    if (sim.solverType !== 0) w.dumpAttr('st', sim.solverType);
    if (sim.temperature !== NOMINAL_TEMPERATURE) w.dumpAttr('temp', sim.temperature);
    if (this.params.length > 0) w.dumpAttr('prm', formatParamList(this.params));

    modelsFor(sim).clearDumpedFlags();
    const doc = docWriter(root);
    for (const ce of this.elements) appendElement(root, doc, ce);
    for (const sc of this.scopes.scopes) sc.serializer.dumpXml(w);
    for (const a of this.adjustables) root.appendChild(this.adjElement(a));
    if (this.hint.type !== -1) {
      const h = new XmlElement('h');
      const hw = new AttrWriter(h);
      hw.dumpAttr('t', this.hint.type);
      hw.dumpAttr('i1', this.hint.item1);
      hw.dumpAttr('i2', this.hint.item2);
      root.appendChild(h);
    }
    return prettyPrint(root);
  }

  /**
   * The given elements as a bare `<cir>` document with the models they use, as upstream's
   * clipboard holds them (`CommandManager.copyOfSelectedElms`, which writes them last to first).
   */
  dumpElementsXml(elements: readonly CircuitElm[]): string {
    const root = new XmlElement('cir');
    modelsFor(this.sim).clearDumpedFlags();
    const doc = docWriter(root);
    // upstream leaves undocked scopes out: their element numbers would point elsewhere
    for (const ce of [...elements].reverse())
      if (!(ce instanceof ScopeElm)) appendElement(root, doc, ce);
    return prettyPrint(root);
  }
}

/** A subcircuit model made from a circuit, or why it can't be made. */
export type CompositeResult = { model: CustomCompositeModel } | { error: string | null };

/**
 * Upstream `SimulationManager.getCircuitAsComposite`: the circuit (or the selected part of it) as
 * a subcircuit model. Labeled nodes become its pins, on the side their label points to. The model
 * has no name and is in no model map yet. `error` is null when the circuit can't be analyzed (the
 * simulation shows why).
 */
export function getCircuitAsComposite(circuit: Circuit): CompositeResult {
  const sim = circuit.sim;
  const elements = circuit.elements;
  const elmRoot = new XmlElement('elms');
  modelsFor(sim).clearDumpedFlags();
  const sideLabels: LabeledNodeElm[][] = [[], [], [], []];
  const extList: ExtListEntry[] = [];
  const sel = elements.some((ce) => ce.selected);

  // open closed switches for a moment, so the model's node numbers reflect the open topology
  // (loading it closed merges them again)
  const closedSwitches: SwitchElm[] = [];
  for (const ce of elements)
    if (ce instanceof SwitchElm && ce.position === 0) {
      closedSwitches.push(ce);
      ce.position = 1;
    }
  // number the nodes again without picking a ground
  sim.setElements(elements);
  const ok = sim.preStampCircuit(true);
  for (const se of closedSwitches) se.position = 0;
  // the simulation must analyze the circuit again before it runs
  sim.analyzeFlag = true;
  if (!ok) return { error: null };

  const nodeCount = sim.nodeList.length;
  const used = new Array<boolean>(nodeCount).fill(false);
  const extnodes = new Array<boolean>(nodeCount).fill(false);

  // the labeled nodes, from the flat list as upstream (composite parts included)
  for (const ce of sim.elmList as CircuitElm[]) {
    if (sel && !ce.selected) continue;
    if (!(ce instanceof LabeledNodeElm)) continue;
    if (ce.isInternal()) continue;
    if (extnodes[ce.getNode(0).index]) continue;
    let side = SIDE_W;
    if (Math.abs(ce.dx) >= Math.abs(ce.dy) && ce.dx > 0) side = SIDE_E;
    if (Math.abs(ce.dx) <= Math.abs(ce.dy) && ce.dy < 0) side = SIDE_N;
    if (Math.abs(ce.dx) <= Math.abs(ce.dy) && ce.dy > 0) side = SIDE_S;
    sideLabels[side].push(ce);
    for (let j = 0; j < ce.busWidth; j++) {
      extnodes[ce.getNode(j).index] = true;
      if (ce.getNode(j).index === 0)
        return { error: `Node "${ce.text}" can't be connected to ground` };
    }
  }
  sideLabels[SIDE_W].sort((a, b) => Math.sign(a.y - b.y));
  sideLabels[SIDE_E].sort((a, b) => Math.sign(a.y - b.y));
  sideLabels[SIDE_N].sort((a, b) => Math.sign(a.x - b.x));
  sideLabels[SIDE_S].sort((a, b) => Math.sign(a.x - b.x));
  for (let side = 0; side < sideLabels.length; side++) {
    for (let pos = 0; pos < sideLabels[side].length; pos++) {
      const lne = sideLabels[side][pos];
      for (let j = 0; j < lne.busWidth; j++) {
        const ent = new ExtListEntry(lne.text, lne.getNode(j).index, pos, side);
        ent.busWidth = lne.busWidth;
        ent.busZ = j;
        extList.push(ent);
      }
    }
  }

  // the parts first, then wires, labels, scopes, graphics and grounds (from the top-level list,
  // not the flattened composite parts)
  const dumpList: CircuitElm[] = [];
  const extraList: CircuitElm[] = [];
  for (const ce of elements) {
    if (sel && !ce.selected) continue;
    if (
      ce instanceof WireElm ||
      ce instanceof LabeledNodeElm ||
      ce instanceof ScopeElm ||
      ce instanceof GraphicElm ||
      ce instanceof GroundElm
    )
      extraList.push(ce);
    else dumpList.push(ce);
  }
  dumpList.push(...extraList);

  const doc = docWriter(elmRoot);
  for (const ce of dumpList) {
    const nn: number[] = [];
    for (let j = 0; j !== ce.getPostCount(); j++) {
      const n = ce.getNode(j).index;
      used[n] = true;
      nn.push(n);
    }
    ce.dumpXmlModels(doc);
    const child = new XmlElement(ce.getXmlDumpType());
    const w = new AttrWriter(child);
    w.dumpAttr('nn', nn.join(' '));
    // a model definition, not an instance: no state
    ce.dumpXml(w);
    elmRoot.appendChild(child);
  }

  for (const ent of extList)
    if (!used[ent.node]) return { error: `Node "${ent.name}" is not used!` };

  const ccm = new CustomCompositeModel();
  ccm.elmDoc = elmRoot;
  ccm.extList = extList;
  ccm.params = circuit.params.map((d) => ({ ...d }));
  return { model: ccm };
}

function docWriter(root: XmlElement): XmlDocWriter {
  return {
    addElement(tag) {
      const e = new XmlElement(tag);
      root.appendChild(e);
      return new AttrWriter(e);
    },
  };
}

function appendElement(root: XmlElement, doc: XmlDocWriter, ce: CircuitElm): void {
  // upstream elements append their models from inside dumpXml, before the element itself
  ce.dumpXmlModels(doc);
  const elem = new XmlElement(ce.getXmlDumpType());
  const ew = new AttrWriter(elem);
  ce.dumpXml(ew);
  ce.dumpXmlState(ew);
  root.appendChild(elem);
}

/** Whether this port can load XML records with this tag as elements. */
export function isSupportedElementTag(tag: string): boolean {
  return classNameForXmlTag(tag) !== undefined;
}

/** Load a circuit from upstream text or XML. */
export function readCircuit(text: string): Circuit {
  const c = new Circuit();
  c.read(text);
  return c;
}
