// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// Not in upstream (docs/deviations/vactrol.md). A vactrol is saved as an upstream subcircuit
// built only from upstream parts, so CircuitJS1 opens and simulates it as that subcircuit.

import { Point } from '@perun/engine';
import { EditInfo } from '../edit/EditInfo.ts';
import { elementType } from '../CircuitElm.ts';
import { elementFactory } from '../factory.ts';
import { CustomCompositeModel, ExtListEntry } from '../models/CustomCompositeModel.ts';
import { modelsFor } from '../models/ModelLibrary.ts';
import { getCurrentText, getUnitText, getVoltageText, OHM } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter, XmlDocWriter } from '../xml.ts';
import { AttrWriter } from '../xmlattrs.ts';
import { XmlElement } from '../xmldoc.ts';
import { SIDE_E, SIDE_W } from './ChipElm.ts';
import { CustomCompositeElm } from './CustomCompositeElm.ts';
import type { CapacitorElm } from './CapacitorElm.ts';
import type { LampElm } from './LampElm.ts';
import type { LEDElm } from './LEDElm.ts';
import type { ResistorElm } from './ResistorElm.ts';
import type { VCCSElm } from './VCCSElm.ts';

/** The light source inside: an LED, or a small incandescent lamp. */
export const VACTROL_LED = 0;
export const VACTROL_LAMP = 1;

/** What sets a vactrol's behaviour. Times in seconds, currents in amps. */
export interface VactrolParams {
  source: number;
  /** Resistance when lit by `iref`. */
  ron: number;
  /** The light source current that gives `ron`. */
  iref: number;
  /** Resistance in the dark. */
  rdark: number;
  /** Resistance falls as (current / iref) to this power. */
  slope: number;
  /** Time to 63 % of the final conductance after the light comes on. */
  attack: number;
  /** Time to rise to 100 kΩ after the light goes off. */
  release: number;
}

export interface VactrolPreset {
  id: string;
  params: VactrolParams;
}

/**
 * Typical datasheet values. Each part's resistance at 1, 10 and 40 mA is fitted with one slope,
 * so the curve is right at the reference current and within a factor of about 1.5 elsewhere.
 * VTL5C parts: PerkinElmer/Excelitas datasheets; NSL-32SR3: Advanced Photonix datasheet (on
 * resistance read at 10 mA between its 5 mA and 20 mA figures). The lamp one is a generic
 * grain-of-wheat bulb and LDR, as in optical tremolos.
 */
export const VACTROL_PRESETS: readonly VactrolPreset[] = [
  {
    id: 'VTL5C1',
    params: {
      source: 0,
      ron: 600,
      iref: 0.01,
      rdark: 50e6,
      slope: 1.25,
      attack: 2.5e-3,
      release: 0.035,
    },
  },
  {
    id: 'VTL5C2',
    params: {
      source: 0,
      ron: 800,
      iref: 0.01,
      rdark: 1e6,
      slope: 0.9,
      attack: 3.5e-3,
      release: 0.5,
    },
  },
  {
    id: 'VTL5C3',
    params: {
      source: 0,
      ron: 1000,
      iref: 0.01,
      rdark: 10e6,
      slope: 0.81,
      attack: 2.5e-3,
      release: 0.035,
    },
  },
  {
    id: 'VTL5C4',
    params: {
      source: 0,
      ron: 125,
      iref: 0.01,
      rdark: 400e3,
      slope: 0.75,
      attack: 6e-3,
      release: 1.5,
    },
  },
  {
    id: 'NSL-32SR3',
    params: {
      source: 0,
      ron: 95,
      iref: 0.01,
      rdark: 25e6,
      slope: 0.66,
      attack: 5e-3,
      release: 0.01,
    },
  },
  {
    id: 'Lamp + LDR',
    params: {
      source: 1,
      ron: 2000,
      iref: 0.04,
      rdark: 1e6,
      slope: 0.8,
      attack: 0.02,
      release: 0.1,
    },
  },
];

export const VACTROL_DEFAULT = 'VTL5C3';
const CUSTOM = 'Custom';

/** Sense resistor in series with the light source, and the "light" capacitor. */
const R_SENSE = 10;
const C_LIGHT = 1e-6;
/** The release time is how long the resistance takes to climb back to this. */
const RELEASE_TARGET = 100e3;

/** A number for an expression: short, and never with an exponent sign the parser can't read. */
function num(v: number): string {
  return String(Number(v.toPrecision(6)));
}

/** The lag time constants behind the datasheet attack and release times. */
export function vactrolTimeConstants(p: VactrolParams): { attack: number; release: number } {
  const g = p.slope;
  // conductance follows light^g, and light rises as 1 - e^(-t/tau): 63 % conductance when
  // 1 - e^(-t/tau) = 0.632^(1/g)
  const attack = p.attack / Math.max(-Math.log(1 - Math.pow(1 - Math.exp(-1), 1 / g)), 1e-3);
  // light falls as e^(-t/tau), so conductance as e^(-g t/tau), until it reaches the target's
  const gd = 1 / p.rdark;
  const target = Math.max(1 / Math.min(RELEASE_TARGET, p.rdark / 2) - gd, 1e-12);
  const release = (p.release * g) / Math.max(Math.log(1 / p.ron / target), 1);
  return { attack, release };
}

/** The resistance at a light level (1 = lit by the reference current). */
export function vactrolResistance(p: VactrolParams, light: number): number {
  return 1 / (1 / p.rdark + Math.pow(Math.max(light, 0), p.slope) / p.ron);
}

/**
 * The subcircuit's two expressions. The first charges the light capacitor towards the light
 * level (the source current over the reference current; for a lamp, its square), quickly going
 * up and slowly coming down. The second, wired across its own output, is the light-dependent
 * resistor.
 */
export function vactrolExpressions(p: VactrolParams): { light: string; cell: string } {
  const tc = vactrolTimeConstants(p);
  const scale = num(1 / (R_SENSE * p.iref));
  const x = p.source === VACTROL_LAMP ? `((a-b)*${scale})^2` : `max(a-b,0)*${scale}`;
  const ka = num(C_LIGHT / tc.attack);
  const kr = num(C_LIGHT / tc.release);
  return {
    light: `(${x}>c)?(${x}-c)*${ka}:(${x}-c)*${kr}`,
    cell: `-(a-c)*(${num(1 / p.rdark)}+${num(1 / p.ron)}*max(b,0)^${num(p.slope)})`,
  };
}

function presetParams(id: string): VactrolParams {
  const p = VACTROL_PRESETS.find((x) => x.id === id) ?? VACTROL_PRESETS[2];
  return { ...p.params };
}

function sameParams(a: VactrolParams, b: VactrolParams): boolean {
  return (
    a.source === b.source &&
    a.ron === b.ron &&
    a.iref === b.iref &&
    a.rdark === b.rdark &&
    a.slope === b.slope &&
    a.attack === b.attack &&
    a.release === b.release
  );
}

/** A short stable tag for a set of values, so differently set vactrols get their own model. */
function paramsTag(p: VactrolParams): string {
  const s = [p.source, p.ron, p.iref, p.rdark, p.slope, p.attack, p.release].join(' ');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0').substring(0, 6);
}

// node numbers in the model: the pins, the source's other end, and the light
const N_LEDP = 1;
const N_SENSE = 2;
const N_LEDN = 4;
const N_LIGHT = 5;
const N_R1 = 6;
const N_R2 = 7;

/**
 * Wires, labels and grounds of the model's own circuit, only for View Components (here and in
 * CircuitJS1): tag, nodes, position, flags, label.
 */
// prettier-ignore
const DRAWING: [string, string, string, number, string?][] = [
  ['ln', `${N_LEDP}`, '48 96 0 96', 4, 'LED+'],
  ['w', `${N_LEDN} ${N_LEDN}`, '112 160 48 160', 0],
  ['ln', `${N_LEDN}`, '48 160 0 160', 4, 'LED-'],
  ['w', `${N_SENSE} ${N_SENSE}`, '112 96 192 96', 0],
  ['w', `${N_LEDN} ${N_LEDN}`, '112 160 144 160', 0],
  ['w', `${N_LEDN} ${N_LEDN}`, '144 160 144 128', 0],
  ['w', `${N_LEDN} ${N_LEDN}`, '144 128 192 128', 0],
  ['w', `${N_LIGHT} ${N_LIGHT}`, '192 160 176 160', 0],
  ['w', `${N_LIGHT} ${N_LIGHT}`, '176 160 176 224', 0],
  ['w', `${N_LIGHT} ${N_LIGHT}`, '176 224 320 224', 0],
  ['w', `${N_LIGHT} ${N_LIGHT}`, '320 224 320 96', 0],
  ['w', `${N_LIGHT} ${N_LIGHT}`, '288 96 320 96', 0],
  ['w', `${N_LIGHT} ${N_LIGHT}`, '320 96 352 96', 0],
  ['g', '0', '352 160 352 192', 0],
  ['g', '0', '288 128 288 160', 0],
  ['w', `${N_R1} ${N_R1}`, '192 288 160 288', 0],
  ['w', `${N_R1} ${N_R1}`, '160 288 160 256', 0],
  ['w', `${N_R1} ${N_R1}`, '160 256 352 256', 0],
  ['w', `${N_R1} ${N_R1}`, '352 256 352 288', 0],
  ['w', `${N_R1} ${N_R1}`, '288 288 352 288', 0],
  ['w', `${N_R1} ${N_R1}`, '352 288 384 288', 0],
  ['ln', `${N_R1}`, '384 288 432 288', 4, 'R1'],
  ['w', `${N_LIGHT} ${N_LIGHT}`, '192 320 144 320', 0],
  ['w', `${N_LIGHT} ${N_LIGHT}`, '144 320 144 224', 0],
  ['w', `${N_LIGHT} ${N_LIGHT}`, '144 224 176 224', 0],
  ['w', `${N_R2} ${N_R2}`, '192 352 160 352', 0],
  ['w', `${N_R2} ${N_R2}`, '160 352 160 384', 0],
  ['w', `${N_R2} ${N_R2}`, '160 384 336 384', 0],
  ['w', `${N_R2} ${N_R2}`, '336 384 336 320', 0],
  ['w', `${N_R2} ${N_R2}`, '288 320 336 320', 0],
  ['w', `${N_R2} ${N_R2}`, '336 320 384 320', 0],
  ['ln', `${N_R2}`, '384 320 432 320', 4, 'R2'],
];

/**
 * A vactrol (resistive opto-isolator): a light source and a light-dependent resistor in one
 * light-tight package. The resistor follows the light with a quick attack and a slow release.
 * Inside it is a subcircuit of upstream parts; this class picks its values from a datasheet
 * preset, draws it as a vactrol and remembers the values as extra XML attributes.
 */
export class VactrolElm extends CustomCompositeElm {
  presetId = VACTROL_DEFAULT;
  params: VactrolParams = presetParams(VACTROL_DEFAULT);

  // drawing geometry, set in setPoints
  /** Where the source's leads end and the resistor's leads end, inside the box. */
  sourceEnds: Point[] = [];
  cellEnds: Point[] = [];
  /** Direction from the source side to the resistor side. */
  ux = 1;
  uy = 0;

  override getClassName(): string {
    return 'VactrolElm';
  }

  override initNew(): void {
    this.modelName = this.modelNameFor();
    this.updateModels();
  }

  /** The source part (LED or lamp). */
  get source(): LEDElm | LampElm | undefined {
    return this.compElmList[0] as LEDElm | LampElm | undefined;
  }
  get lightCap(): CapacitorElm | undefined {
    return this.compElmList[3] as CapacitorElm | undefined;
  }

  /** The light level: 1 when lit by the reference current. */
  light(): number {
    const c = this.lightCap;
    return c === undefined ? 0 : c.volts[0] - c.volts[1];
  }

  /** The resistance between R1 and R2 now. */
  resistance(): number {
    return vactrolResistance(this.params, this.light());
  }

  modelNameFor(): string {
    const preset = VACTROL_PRESETS.find((p) => sameParams(p.params, this.params));
    return 'Vactrol ' + (preset !== undefined ? preset.id : paramsTag(this.params));
  }

  /** The model for the current values: an upstream subcircuit, hidden from the model list. */
  buildModel(): CustomCompositeModel {
    const sim = this.sim;
    const p = this.params;
    const m = new CustomCompositeModel();
    m.name = this.modelNameFor();
    m.sizeX = 3;
    m.sizeY = 2;
    m.setShowLabel(true);
    m.extList = [
      new ExtListEntry('LED+', N_LEDP, 0, SIDE_W),
      new ExtListEntry('LED-', N_LEDN, 1, SIDE_W),
      new ExtListEntry('R1', N_R1, 0, SIDE_E),
      new ExtListEntry('R2', N_R2, 1, SIDE_E),
    ];
    const doc = m.elmDoc;
    const add = (className: string, nn: string, pos: number[], set: (ce: never) => void) => {
      const ce = elementFactory.construct(className, 0, 0, sim);
      if (ce === null) throw new Error('no ' + className);
      set(ce as never);
      ce.x = pos[0];
      ce.y = pos[1];
      ce.x2 = pos[2];
      ce.y2 = pos[3];
      const e = new XmlElement(ce.getXmlDumpType());
      e.setAttribute('nn', nn);
      ce.dumpXml(new AttrWriter(e));
      doc.appendChild(e);
    };
    const ex = vactrolExpressions(p);
    if (p.source === VACTROL_LAMP)
      add('LampElm', `${N_LEDP} ${N_SENSE}`, [48, 96, 112, 96], (l: LampElm) => {
        l.nom_pow = 0.5;
        l.nom_v = 12;
        l.warmTime = 0.05;
        l.coolTime = 0.1;
      });
    else add('LEDElm', `${N_LEDP} ${N_SENSE}`, [48, 96, 112, 96], () => {});
    add('ResistorElm', `${N_SENSE} ${N_LEDN}`, [112, 96, 112, 160], (r: ResistorElm) => {
      r.resistance = R_SENSE;
    });
    add(
      'VCCSElm',
      `${N_SENSE} ${N_LEDN} ${N_LIGHT} ${N_LIGHT} 0`,
      [192, 96, 224, 96],
      (v: VCCSElm) => {
        v.inputCount = 3;
        v.exprString = ex.light;
      },
    );
    add('CapacitorElm', `${N_LIGHT} 0`, [352, 96, 352, 160], (c: CapacitorElm) => {
      c.capacitance = C_LIGHT;
    });
    add(
      'VCCSElm',
      `${N_R1} ${N_LIGHT} ${N_R2} ${N_R1} ${N_R2}`,
      [192, 288, 224, 288],
      (v: VCCSElm) => {
        v.inputCount = 3;
        v.exprString = ex.cell;
      },
    );
    for (const [tag, nn, x, f, te] of DRAWING) {
      const e = new XmlElement(tag);
      e.setAttribute('nn', nn);
      e.setAttribute('x', x);
      e.setAttribute('f', String(f));
      if (te !== undefined) e.setAttribute('te', te);
      doc.appendChild(e);
    }
    return m;
  }

  /** Build the parts from the values (the model in the file is only for CircuitJS1). */
  override updateModelsFrom(): void {
    const model = this.sharedModel(this.modelNameFor());
    this.modelName = model.name;
    this.model = model;
    this.postCount = model.extList.length;
    this.loadCompositeXml(
      model.getElmEntries(),
      model.extList.map((e) => e.node),
    );
    this.allocNodes();
    this.setPoints();
  }

  /**
   * The circuit's model with this name. Vactrols with the same values share one, so it is saved
   * once; it is internal, so it stays out of the Subcircuits list. A copy read from a file is
   * replaced: the values on the vactrol decide.
   */
  private sharedModel(name: string): CustomCompositeModel {
    const lib = modelsFor(this.sim).composite;
    const old = lib.localModelMap.get(name);
    if (old !== undefined && old.internal) return old;
    const model = this.model?.name === name ? this.model : this.buildModel();
    model.internal = true;
    model.dumped = false;
    lib.localModelMap.set(name, model);
    lib.sequenceNumber++;
    return model;
  }

  override dumpXmlModels(doc: XmlDocWriter): void {
    if (this.model === null) return;
    // the circuit's models may have been cleared since (a new circuit, a paste elsewhere)
    const m = this.sharedModel(this.model.name);
    if (m.dumped) return;
    for (const ce of this.compElmList) ce.dumpXmlModels(doc);
    m.dumped = true;
    m.buildXmlElement(doc.addElement('ccm'));
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    const p = this.params;
    w.dumpAttr('vac', this.presetId);
    w.dumpAttr('vs', p.source);
    w.dumpAttr('von', p.ron);
    w.dumpAttr('vi', p.iref);
    w.dumpAttr('vdk', p.rdark);
    w.dumpAttr('vsl', p.slope);
    w.dumpAttr('vat', p.attack);
    w.dumpAttr('vre', p.release);
  }

  override undumpXml(r: XmlAttrReader): void {
    const id = r.parseStringAttr('vac', VACTROL_DEFAULT) ?? VACTROL_DEFAULT;
    const base = VACTROL_PRESETS.find((p) => p.id === id)?.params ?? this.params;
    this.presetId = id;
    this.params = {
      source: r.parseIntAttr('vs', base.source) === VACTROL_LAMP ? VACTROL_LAMP : VACTROL_LED,
      ron: r.parseDoubleAttr('von', base.ron),
      iref: r.parseDoubleAttr('vi', base.iref),
      rdark: r.parseDoubleAttr('vdk', base.rdark),
      slope: r.parseDoubleAttr('vsl', base.slope),
      attack: r.parseDoubleAttr('vat', base.attack),
      release: r.parseDoubleAttr('vre', base.release),
    };
    super.undumpXml(r);
  }

  override setPoints(): void {
    super.setPoints();
    if (this.postCount !== 4) return;
    const [p0, p1, p2, p3] = this.posts;
    const dx = (p2.x + p3.x - p0.x - p1.x) / 2;
    const dy = (p2.y + p3.y - p0.y - p1.y) / 2;
    const len = Math.hypot(dx, dy) || 1;
    this.ux = dx / len;
    this.uy = dy / len;
    const at = (p: Point, d: number): Point =>
      new Point(Math.round(p.x + this.ux * d), Math.round(p.y + this.uy * d));
    const inset = 40;
    this.sourceEnds = [at(p0, inset), at(p1, inset)];
    this.cellEnds = [at(p2, -inset), at(p3, -inset)];
    this.placeSource();
  }

  /**
   * Put the source part where the symbol goes; it draws itself there. View Components moves it
   * to its place in the model's circuit, so the view calls this again before drawing.
   */
  placeSource(): void {
    const s = this.source;
    const [a, b] = this.sourceEnds;
    if (s === undefined || a === undefined || b === undefined) return;
    if (s.x !== a.x || s.y !== a.y || s.x2 !== b.x || s.y2 !== b.y)
      s.setPosition(a.x, a.y, b.x, b.y);
  }

  /** Double click opens the settings; the inside is one button away. */
  override canViewComponents(): boolean {
    return false;
  }

  override getEditInfo(n: number): EditInfo | null {
    const p = this.params;
    if (n === 0) {
      const items = [...VACTROL_PRESETS.map((x) => x.id), CUSTOM];
      const sel = VACTROL_PRESETS.findIndex((x) => x.id === this.presetId);
      const ei = EditInfo.createChoice('Model', items, sel < 0 ? items.length - 1 : sel);
      ei.newDialog = true;
      return ei;
    }
    if (n === 1) {
      const ei = EditInfo.createChoice('Light source', ['LED', 'Lamp'], p.source);
      ei.newDialog = true;
      return ei;
    }
    const field = (name: string, v: number): EditInfo => {
      const ei = new EditInfo(name, v, -1, -1).disallowSliders();
      ei.positive = true;
      return ei;
    };
    if (n === 2) return field('Lit resistance (Ω)', p.ron);
    if (n === 3)
      return field(
        p.source === VACTROL_LAMP ? 'Lit at lamp current (A)' : 'Lit at LED current (A)',
        p.iref,
      );
    if (n === 4) return field('Dark resistance (Ω)', p.rdark);
    if (n === 5) return field('Slope', p.slope).setDimensionless();
    if (n === 6) return field('Attack time (s)', p.attack);
    if (n === 7) return field('Release time to 100 kΩ (s)', p.release);
    if (n === 8 && CustomCompositeElm.hooks !== null)
      return EditInfo.createButton('View Components', () =>
        CustomCompositeElm.hooks?.viewComponents(this),
      );
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    const p = { ...this.params };
    if (n === 0) {
      const preset = VACTROL_PRESETS[ei.choice?.selected ?? -1];
      // "Custom" keeps the values
      if (preset === undefined) return;
      this.presetId = preset.id;
      this.params = { ...preset.params };
      this.updateModels();
      return;
    }
    if (n === 1) p.source = ei.choice?.selected === VACTROL_LAMP ? VACTROL_LAMP : VACTROL_LED;
    else if (!(ei.value > 0)) return;
    else if (n === 2) p.ron = ei.value;
    else if (n === 3) p.iref = ei.value;
    else if (n === 4) p.rdark = ei.value;
    else if (n === 5) p.slope = ei.value;
    else if (n === 6) p.attack = ei.value;
    else if (n === 7) p.release = ei.value;
    else return;
    this.params = p;
    this.presetId = VACTROL_PRESETS.find((x) => sameParams(x.params, p))?.id ?? CUSTOM;
    this.updateModels();
  }

  override getInfo(arr: string[]): void {
    const p = this.params;
    arr[0] = 'vactrol (' + this.presetId + ')';
    arr[1] = 'R = ' + getUnitText(this.resistance(), OHM);
    arr[2] = 'Vd = ' + getVoltageText(this.volts[2] - this.volts[3]);
    arr[3] =
      (p.source === VACTROL_LAMP ? 'I lamp = ' : 'I LED = ') +
      getCurrentText(-this.getCurrentIntoNode(0));
    arr[4] = 'light = ' + (Math.max(this.light(), 0) * 100).toFixed(1).padStart(6) + ' %';
  }
}

export const VactrolElmType = elementType('VactrolElm', VactrolElm);
