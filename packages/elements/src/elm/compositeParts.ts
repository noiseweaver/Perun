// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/OTAElm.java, NortonAmpElm.java,
// DarlingtonElm.java, NDarlingtonElm.java, PDarlingtonElm.java and CrystalElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Point } from '@circuitjs-next/engine';
import { elementType, type ElementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentText, getUnitText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { parseXml, type XmlElement } from '../xmldoc.ts';
import { CapacitorElm } from './CapacitorElm.ts';
import { CompositeElm } from './CompositeElm.ts';
import { InductorElm } from './InductorElm.ts';
import { RailElm } from './RailElm.ts';
import { ResistorElm } from './ResistorElm.ts';
import { TransistorElm } from './TransistorElm.ts';

/** An LM13700-style operational transconductance amplifier, built from 16 transistors. */
export class OTAElm extends CompositeElm {
  static readonly modelString =
    'RailElm 4\rRailElm 10\rNTransistorElm 1 2 3\rNTransistorElm 3 1 4\rNTransistorElm 3 3 4\r' +
    'NTransistorElm 5 6 2\rNTransistorElm 7 8 2\rPTransistorElm 9 6 10\rPTransistorElm 9 9 10\r' +
    'PTransistorElm 6 12 9\rPTransistorElm 11 8 10\rPTransistorElm 11 11 10\r' +
    'PTransistorElm 8 13 11\rNTransistorElm 14 14 4\rNTransistorElm 14 12 4\r' +
    'NTransistorElm 12 13 14\rNTransistorElm 15 15 5\rNTransistorElm 15 15 7';
  static readonly modelExternalNodes = [7, 5, 15, 1, 13];

  static readonly opheight = 32;
  static readonly opwidth = 32;
  static readonly circDiam = 19;
  static readonly circOverlap = 8;

  posVolt = 9.0;
  negVolt = -9.0;
  // geometry, from setPoints
  in1p: Point[] = [];
  in2p: Point[] = [];
  in3p: Point[] = [];
  in4p: Point[] = [];
  textp: Point[] = [];
  bar1: Point[] = [];
  bar2: Point[] = [];
  circCent: Point[] = [];
  triangle: Point[] = [];
  /** Ends of the two input arrows (upstream draws calcArrow(d1, d2) on each). */
  arrows: [Point, Point][] = [];
  point2bis = new Point();

  override getClassName(): string {
    return 'OTAElm';
  }
  override getDumpType(): number {
    return 402;
  }

  override initNew(): void {
    this.initComposite(OTAElm.modelString, OTAElm.modelExternalNodes);
    this.noDiagonal = true;
    this.initOTA();
  }

  override undump(st: StringTokenizer): void {
    this.undumpComposite(st, OTAElm.modelString, OTAElm.modelExternalNodes);
    this.noDiagonal = true;
    this.negVolt = (this.compElmList[0] as RailElm).maxVoltage;
    this.posVolt = (this.compElmList[1] as RailElm).maxVoltage;
  }

  private initOTA(): void {
    (this.compElmList[0] as RailElm).maxVoltage = this.negVolt;
    (this.compElmList[1] as RailElm).maxVoltage = this.posVolt;
  }

  override getConnection(_n1: number, _n2: number): boolean {
    return false;
  }

  override setPoints(): void {
    super.setPoints();
    const ww = OTAElm.opwidth;
    const circDiam = OTAElm.circDiam;
    const wtot = ww * 2 + 2 * circDiam - OTAElm.circOverlap;
    const p1 = this.point1;
    const p2 = this.point2;
    if (this.dn > wtot) {
      this.lead1 = this.interpPointPerp(p1, p2, 1.0 - wtot / this.dn, 0);
      this.lead2 = p2;
      this.point2bis = p2;
    } else {
      this.lead1 = p1;
      this.lead2 = this.interpPointPerp(p1, p2, wtot / this.dn, 0);
      this.point2bis = this.lead2;
    }
    const hs = OTAElm.opheight * this.dsign;
    const l1 = this.lead1;
    const l2 = this.lead2;
    const [i10, i20] = this.interpPoint2(p1, this.point2bis, 0, hs);
    const [i11, i21] = this.interpPoint2(l1, l2, 0, hs);
    this.in1p = [i10, i11];
    this.in2p = [i20, i21];
    this.textp = this.interpPoint2(l1, l2, 0.1, hs);
    this.in3p = [p1, l1];
    this.in4p = [
      this.interpPointPerp(l1, l2, 1.0 - 16.0 / wtot, 32),
      this.interpPointPerp(l1, l2, 1.0 - 16.0 / wtot, 8),
    ];
    const [t0, t1] = this.interpPoint2(l1, l2, 0, (3 * hs) / 2);
    this.triangle = [t0, t1, this.interpPoint(l1, l2, (2.0 * ww) / wtot)];
    this.circCent = [
      this.interpPointPerp(l1, l2, 1.0 - circDiam / (2.0 * wtot), 0),
      this.interpPointPerp(l1, l2, 1.0 - ((3 * circDiam) / 2.0 - OTAElm.circOverlap) / wtot, 0),
    ];
    this.arrows = [];
    const bars: Point[][] = [];
    for (const inp of [this.in1p, this.in2p]) {
      const d1 = this.interpPoint(this.in3p[1], inp[1], 0.3333);
      const d2 = this.interpPoint(this.in3p[1], inp[1], 0.6666);
      this.arrows.push([d1, d2]);
      bars.push(this.interpPoint2(d1, d2, 1.0, 4));
    }
    this.bar1 = bars[0];
    this.bar2 = bars[1];
    this.setPost(0, this.in1p[0]);
    this.setPost(1, this.in2p[0]);
    this.setPost(2, this.in3p[0]);
    this.setPost(3, this.in4p[0]);
    this.setPost(4, this.point2bis);
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('pv', this.posVolt);
    w.dumpAttr('nv', this.negVolt);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.posVolt = r.parseDoubleAttr('pv', this.posVolt);
    this.negVolt = r.parseDoubleAttr('nv', this.negVolt);
    this.initOTA();
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'OTA (LM13700 style)';
    arr[1] = 'Iabc = ' + getCurrentText(-this.getCurrentIntoNode(3));
    arr[2] = 'V+ - V- = ' + getVoltageText(this.volts[0] - this.volts[1]);
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0)
      return new EditInfo('Positive Supply Voltage (5-20V)', this.posVolt, 5, 20).setUnitStep();
    if (n === 1)
      return new EditInfo('Negative Supply Voltage (V)', this.negVolt, -20, -5).setUnitStep();
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.posVolt = ei.value;
    if (n === 1) this.negVolt = ei.value;
    this.initOTA();
  }

  override canFlipX(): boolean {
    return false;
  }
  override canFlipY(): boolean {
    return false;
  }
}

/** Parts of a model given as XML, as upstream's static `modelElements` vectors. */
function modelElements(xml: string): XmlElement[] {
  return parseXml(xml).elements();
}

/** A Norton (current-differencing) amplifier such as the LM3900. */
export class NortonAmpElm extends CompositeElm {
  static readonly FLAG_SWAP = 1;
  static readonly FLAG_SMALL = 2;
  static readonly modelExternalNodes = [3, 1, 4];
  static readonly modelXmlStr =
    '<elms>' +
    '<d nn="1 0" f="2" mo="default"/>' +
    '<d nn="2 0" f="2" mo="default"/>' +
    '<CCCS nn="3 2 1 0" f="0" ic="2" ex="-a"/>' +
    '<a nn="1 0 4" f="8" ma="12" mi="0" ga="100000"/>' +
    '</elms>';
  private static elements: XmlElement[] | null = null;

  opsize = 0;
  opheight = 0;
  opwidth = 0;
  // geometry, from setPoints
  in1p: Point[] = [];
  in2p: Point[] = [];
  textp: Point[] = [];
  triangle: Point[] = [];
  nortonCenter = new Point();
  nortonRadius = 0;
  nortonTriangle: Point[] = [];

  override getClassName(): string {
    return 'NortonAmpElm';
  }
  override getXmlDumpType(): string {
    return 'nor';
  }

  override initNew(): void {
    NortonAmpElm.elements ??= modelElements(NortonAmpElm.modelXmlStr);
    this.loadCompositeXml(NortonAmpElm.elements, NortonAmpElm.modelExternalNodes);
    this.buildCompNodeList();
    this.allocNodes();
    this.noDiagonal = true;
    this.setSize(this.useSmallGrid() ? 1 : 2);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.setSize((this.flags & NortonAmpElm.FLAG_SMALL) !== 0 ? 1 : 2);
  }

  setSize(s: number): void {
    this.opsize = s;
    this.opheight = 8 * s;
    this.opwidth = 13 * s;
    this.flags = (this.flags & ~NortonAmpElm.FLAG_SMALL) | (s === 1 ? NortonAmpElm.FLAG_SMALL : 0);
  }

  override setPoints(): void {
    super.setPoints();
    if (this.dn > 150 && this.isCreating()) this.setSize(2);
    let ww = this.opwidth;
    if (ww > this.dn / 2) ww = Math.trunc(this.dn / 2);
    this.calcLeads(ww * 2);
    let hs = this.opheight * this.dsign;
    if ((this.flags & NortonAmpElm.FLAG_SWAP) !== 0) hs = -hs;
    const [i10, i20] = this.interpPoint2(this.point1, this.point2, 0, hs);
    const [i11, i21] = this.interpPoint2(this.lead1, this.lead2, 0, hs);
    this.in1p = [i10, i11];
    this.in2p = [i20, i21];
    this.textp = this.interpPoint2(this.lead1, this.lead2, 0.2, hs);
    const tris = this.interpPoint2(this.lead1, this.lead2, 0, hs * 2);
    this.triangle = [tris[0], tris[1], this.lead2];
    this.nortonCenter = new Point(this.lead1.x, this.lead1.y);
    this.nortonRadius = Math.trunc(this.opheight * 0.5);
    const innerTip = this.interpPoint(i11, i21, 1.2 / 3);
    const innerBase = this.interpPoint2(i11, i21, 1.8 / 3, this.opheight * 0.3);
    this.nortonTriangle = [innerTip, innerBase[0], innerBase[1]];
    this.setPost(0, i10); // in+
    this.setPost(1, i20); // in-
    this.setPost(2, this.point2); // out
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'norton amp';
    arr[1] = 'V+ = ' + getVoltageText(this.volts[0]);
    arr[2] = 'V- = ' + getVoltageText(this.volts[1]);
    arr[3] = 'Vout = ' + getVoltageText(this.volts[2]);
    arr[4] = 'Iout = ' + getCurrentText(-this.getCurrentIntoNode(2));
  }

  override flipX(c2: number, count: number): void {
    if (this.dx === 0) this.flags ^= NortonAmpElm.FLAG_SWAP;
    super.flipX(c2, count);
  }
  override flipY(c2: number, count: number): void {
    if (this.dy === 0) this.flags ^= NortonAmpElm.FLAG_SWAP;
    super.flipY(c2, count);
  }
  override flipXY(xmy: number, count: number): void {
    this.flags ^= NortonAmpElm.FLAG_SWAP;
    super.flipXY(xmy, count);
  }
}

/** Two transistors as one: a Darlington pair. */
export class DarlingtonElm extends CompositeElm {
  static readonly modelString = 'NTransistorElm 1 2 4\rNTransistorElm 4 2 3';
  static readonly modelExternalNodes = [1, 2, 3];
  /** +1 for NPN, -1 for PNP. */
  pnp = 1;
  // geometry, from setPoints
  coll: Point[] = [];
  coll2: Point[] = [];
  emit: Point[] = [];
  rect: Point[] = [];
  base = new Point();
  /** Arrow from, to (upstream draws calcArrow on them). */
  arrow: [Point, Point] = [new Point(), new Point()];

  override getClassName(): string {
    return 'DarlingtonElm';
  }
  override getDumpType(): number {
    return 400;
  }
  override getXmlDumpType(): string {
    return 'dar';
  }

  /** Upstream's `(xx, yy, pnpflag)` constructor. */
  initDarlington(pnpflag: boolean): void {
    this.initComposite(DarlingtonElm.modelString, DarlingtonElm.modelExternalNodes);
    this.pnp = pnpflag ? -1 : 1;
    this.setPnp();
    this.noDiagonal = true;
  }

  override initNew(): void {
    this.initDarlington(false);
  }

  override undump(st: StringTokenizer): void {
    this.undumpComposite(st, DarlingtonElm.modelString, DarlingtonElm.modelExternalNodes);
    this.pnp = parseJavaInt(st.nextToken());
    this.noDiagonal = true;
  }

  private setPnp(): void {
    (this.compElmList[0] as TransistorElm).pnp = this.pnp;
    (this.compElmList[1] as TransistorElm).pnp = this.pnp;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('pnp', this.pnp);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.pnp = r.parseIntAttr('pnp', this.pnp);
    this.setPnp();
  }

  override getElmType(): string {
    return 'darlington pair';
  }

  override setPoints(): void {
    super.setPoints();
    const p1 = this.point1;
    const p2 = this.point2;
    const dn = this.dn;
    const ds = this.dsign * this.pnp;
    const hs = 16;
    const hs2 = hs * ds;
    const [c0, e0] = this.interpPoint2(p1, p2, 1, hs2);
    const c20 = this.interpPointPerp(p1, p2, 1, hs2 - 5 * ds);
    const [r0, r1] = this.interpPoint2(p1, p2, 1 - 16 / dn, hs);
    const [r2, r3] = this.interpPoint2(p1, p2, 1 - 13 / dn, hs);
    const [c1, e1] = this.interpPoint2(p1, p2, 1 - 13 / dn, 6 * ds);
    const c21 = this.interpPointPerp(p1, p2, 1 - 13 / dn, ds);
    this.coll = [c0, c1];
    this.coll2 = [c20, c21];
    this.emit = [e0, e1];
    this.rect = [r0, r1, r2, r3];
    this.base = this.interpPoint(p1, p2, 1 - 16 / dn);
    if (this.pnp === 1) this.arrow = [e1, e0];
    else this.arrow = [e0, this.interpPointPerp(p1, p2, 1 - 11 / dn, -5 * ds)];
    this.setPost(0, p1);
    this.setPost(1, c0);
    this.setPost(2, e0);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'darlington pair (' + (this.pnp === -1 ? 'PNP)' : 'NPN)');
    const vbc = this.volts[0] - this.volts[1];
    const vbe = this.volts[0] - this.volts[2];
    const vce = this.volts[1] - this.volts[2];
    arr[1] = 'Ic = ' + getCurrentText(-this.getCurrentIntoNode(1));
    arr[2] = 'Ib = ' + getCurrentText(-this.getCurrentIntoNode(0));
    arr[3] = 'Vbe = ' + getVoltageText(vbe);
    arr[4] = 'Vbc = ' + getVoltageText(vbc);
    arr[5] = 'Vce = ' + getVoltageText(vce);
  }

  override canFlipY(): boolean {
    return false;
  }
}

export class NDarlingtonElm extends DarlingtonElm {
  override getClassName(): string {
    return 'NDarlingtonElm';
  }
  override getXmlDumpType(): string {
    return 'dar';
  }
}

export class PDarlingtonElm extends DarlingtonElm {
  override getClassName(): string {
    return 'PDarlingtonElm';
  }
  override initNew(): void {
    this.initDarlington(true);
  }
}

/** A quartz crystal: its series RLC branch in parallel with the holder capacitance. */
export class CrystalElm extends CompositeElm {
  static readonly FLAG_SHOW_FREQ = 2;
  static readonly modelString =
    'CapacitorElm 1 2\rCapacitorElm 1 3\rInductorElm 3 4\rResistorElm 4 2';
  static readonly modelExternalNodes = [1, 2];

  seriesCapacitance = 0;
  parallelCapacitance = 0;
  inductance = 0;
  resistance = 0;
  // geometry, from setPoints
  plate1: Point[] = [];
  plate2: Point[] = [];
  sandwichPoints: Point[] = [];

  override getClassName(): string {
    return 'CrystalElm';
  }
  override getDumpType(): number {
    return 412;
  }
  override getXmlDumpType(): string {
    return 'cr';
  }

  override initNew(): void {
    this.initComposite(CrystalElm.modelString, CrystalElm.modelExternalNodes);
    this.flags = CrystalElm.FLAG_SHOW_FREQ;
    this.parallelCapacitance = 28.7e-12;
    this.seriesCapacitance = 0.1e-12;
    this.inductance = 2.5e-3;
    this.resistance = 6.4;
    this.initCrystal();
  }

  override undump(st: StringTokenizer): void {
    this.undumpComposite(st, CrystalElm.modelString, CrystalElm.modelExternalNodes);
    const [c1, c2, i1, r1] = this.parts();
    this.parallelCapacitance = c1.capacitance;
    this.seriesCapacitance = c2.capacitance;
    this.inductance = i1.inductance;
    this.resistance = r1.resistance;
    this.initCrystal();
  }

  private parts(): [CapacitorElm, CapacitorElm, InductorElm, ResistorElm] {
    const l = this.compElmList;
    return [l[0] as CapacitorElm, l[1] as CapacitorElm, l[2] as InductorElm, l[3] as ResistorElm];
  }

  private initCrystal(): void {
    const [c1, c2, i1, r1] = this.parts();
    c1.capacitance = this.parallelCapacitance;
    c2.capacitance = this.seriesCapacitance;
    i1.inductance = this.inductance;
    i1.ind.setup(i1.inductance, i1.current, i1.flags, i1.saturationCurrent);
    r1.resistance = this.resistance;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('pc', this.parallelCapacitance);
    w.dumpAttr('sc', this.seriesCapacitance);
    w.dumpAttr('in', this.inductance);
    w.dumpAttr('r', this.resistance);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.resistance = r.parseDoubleAttr('r', this.resistance);
    this.inductance = r.parseDoubleAttr('in', this.inductance);
    this.parallelCapacitance = r.parseDoubleAttr('pc', this.parallelCapacitance);
    this.seriesCapacitance = r.parseDoubleAttr('sc', this.seriesCapacitance);
    this.initCrystal();
  }

  override setPoints(): void {
    super.setPoints();
    const p1 = this.point1;
    const p2 = this.point2;
    const f = (this.dn / 2 - 10) / this.dn;
    this.lead1 = this.interpPoint(p1, p2, f);
    this.lead2 = this.interpPoint(p1, p2, 1 - f);
    this.plate1 = this.interpPoint2(p1, p2, f, 8);
    this.plate2 = this.interpPoint2(p1, p2, 1 - f, 8);
    const f2 = (this.dn / 2 - 5) / this.dn;
    const [s0, s1] = this.interpPoint2(p1, p2, f2, 10);
    const [s3, s2] = this.interpPoint2(p1, p2, 1 - f2, 10);
    this.sandwichPoints = [s0, s1, s2, s3];
    this.setPost(0, p1);
    this.setPost(1, p2);
  }

  /** Series resonance. */
  seriesFrequency(): number {
    return 1 / (Math.sqrt(this.inductance * this.seriesCapacitance) * Math.PI * 2);
  }

  override stepFinished(): void {
    super.stepFinished();
    this.current = this.getCurrentIntoNode(1);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'crystal';
    this.getBasicInfo(arr);
    const fs = this.seriesFrequency();
    const cSer =
      (this.parallelCapacitance * this.seriesCapacitance) /
      (this.parallelCapacitance + this.seriesCapacitance);
    const fp = 1 / (Math.sqrt(this.inductance * cSer) * Math.PI * 2);
    const q = (2 * Math.PI * fs * this.inductance) / this.resistance;
    arr[3] = 'fs = ' + getUnitText(fs, 'Hz');
    arr[4] = 'fp = ' + getUnitText(fp, 'Hz');
    arr[5] = 'Q = ' + getUnitText(q, '');
    arr[6] = 'P = ' + getUnitText(this.getPower(), 'W');
  }

  override canViewInScope(): boolean {
    return true;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0)
      return new EditInfo(
        EditInfo.makeLink('crystal.html', 'Parallel Capacitance'),
        this.parallelCapacitance,
      ).setPositive();
    if (n === 1)
      return new EditInfo('Series Capacitance (F)', this.seriesCapacitance).setPositive();
    if (n === 2) return new EditInfo('Inductance (H)', this.inductance, 0, 0).setPositive();
    if (n === 3) return new EditInfo('Resistance (Ω)', this.resistance, 0, 0).setPositive();
    if (n === 4)
      return EditInfo.createCheckbox('Show Frequency', this.hasFlag(CrystalElm.FLAG_SHOW_FREQ));
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.value > 0) this.parallelCapacitance = ei.value;
    if (n === 1 && ei.value > 0) this.seriesCapacitance = ei.value;
    if (n === 2 && ei.value > 0) this.inductance = ei.value;
    if (n === 3 && ei.value > 0) this.resistance = ei.value;
    if (n === 4) this.flags = ei.changeFlag(this.flags, CrystalElm.FLAG_SHOW_FREQ);
    this.initCrystal();
  }
}

export const OTAElmType = elementType('OTAElm', OTAElm);
export const NortonAmpElmType = elementType('NortonAmpElm', NortonAmpElm);
export const DarlingtonElmType: ElementType = {
  ...elementType('DarlingtonElm', NDarlingtonElm),
  load(x1, y1, x2, y2, f, st, sim) {
    const e = new DarlingtonElm(x1, y1, x2, y2, f);
    e.sim = sim;
    e.undump(st);
    e.allocNodes();
    return e;
  },
};
export const NDarlingtonElmType = elementType('NDarlingtonElm', NDarlingtonElm);
export const PDarlingtonElmType = elementType('PDarlingtonElm', PDarlingtonElm);
export const CrystalElmType = elementType('CrystalElm', CrystalElm);
