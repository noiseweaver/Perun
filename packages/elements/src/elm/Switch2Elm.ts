// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/Switch2Elm.java, DPDTSwitchElm.java,
// MBBSwitchElm.java and CrossSwitchElm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { FindPathInfo, PathType, type Point, type VoltageSource } from '@circuitjs-next/engine';
import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentDText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { SwitchElm } from './SwitchElm.ts';

const OPENHS = 16;

/** SPDT switch, or a single-pole switch with more throws. Post 0 is the pole. */
export class Switch2Elm extends SwitchElm {
  static readonly FLAG_CENTER_OFF = 1;
  /** Tracks runtime flip state for linked switches. */
  static readonly FLAG_FLIPPED = 8;

  link = 0;
  throwCount = 2;
  swposts: Point[] = [];
  swpoles: Point[] = [];

  override getClassName(): string {
    return 'Switch2Elm';
  }
  override getDumpType(): number {
    return 'S'.charCodeAt(0);
  }

  override initNew(): void {
    super.initNew();
    this.noDiagonal = true;
    this.throwCount = 2;
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.link = parseJavaInt(st.nextToken());
    this.throwCount = 2;
    try {
      this.throwCount = parseJavaInt(st.nextToken());
    } catch {
      // older files have no throw count
    }
    this.noDiagonal = true;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('li', this.link);
    w.dumpAttr('th', this.throwCount);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.link = r.parseIntAttr('li', this.link);
    this.throwCount = r.parseIntAttr('th', this.throwCount);
    this.noDiagonal = true;
  }

  override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    this.swposts = this.newPointArray(this.throwCount);
    this.swpoles = this.newPointArray(2 + this.throwCount);
    let i: number;
    for (i = 0; i !== this.throwCount; i++) {
      let hs = -OPENHS * (i - Math.trunc((this.throwCount - 1) / 2));
      if (this.throwCount === 2 && i === 0) hs = OPENHS;
      this.swpoles[i] = this.interpPointPerp(this.lead1, this.lead2, 1, hs);
      this.swposts[i] = this.interpPointPerp(this.point1, this.point2, 1, hs);
    }
    this.swpoles[i] = this.lead2; // for center off
    this.posCount = this.hasCenterOff() ? 3 : this.throwCount;
  }

  override getCurrentIntoNode(n: number): number {
    if (n === 0) return -this.current;
    if (n === this.position + 1) return this.current;
    return 0;
  }

  override getPost(n: number): Point {
    return n === 0 ? this.point1 : this.swposts[n - 1];
  }
  override getPostCount(): number {
    return 1 + this.throwCount;
  }

  private centerOff(): boolean {
    return this.position === 2 && this.hasCenterOff();
  }

  override calculateCurrent(): void {
    if (this.centerOff()) this.current = 0;
    else if (this.resistance > 0)
      this.current = (this.volts[0] - this.volts[this.position + 1]) / this.resistance;
  }

  override setVoltageSource(_n: number, v: VoltageSource): void {
    this.voltSource = v;
    v.setNodes(this.nodes[0], this.nodes[this.position + 1]);
  }

  override stamp(): void {
    if (this.centerOff()) return;
    if (this.resistance > 0)
      this.sim.stampResistor(this.nodes[0], this.nodes[this.position + 1], this.resistance);
    else
      this.sim.stampVoltageSource(this.nodes[0], this.nodes[this.position + 1], this.voltSource, 0);
  }

  override getVoltageSourceCount(): number {
    if (this.centerOff()) return 0;
    return this.resistance > 0 ? 0 : 1;
  }

  override toggle(): void {
    super.toggle();
    if (this.link === 0) return;
    for (const o of this.sim.elmList) {
      if (o instanceof Switch2Elm && o.link === this.link) {
        let pos = this.position;
        if (o.isPositionFlipped() !== this.isPositionFlipped()) pos = this.posCount - 1 - pos;
        if (pos < o.posCount) o.position = pos;
      }
    }
  }

  override getConnection(n1: number, n2: number): boolean {
    if (this.centerOff()) return false;
    return this.comparePair(n1, n2, 0, 1 + this.position);
  }

  override isWireEquivalent(): boolean {
    return this.resistance === 0;
  }
  // optimizing out this element is too complicated to be worth it (see #646)
  override isRemovableWire(): boolean {
    return false;
  }

  override getElmType(): string {
    return 'switch (SPDT)';
  }
  override getInfo(arr: string[]): void {
    arr[0] =
      'switch (' +
      (this.link === 0 ? 'S' : 'D') +
      'P' +
      (this.throwCount > 2 ? this.throwCount + 'T)' : 'DT)');
    arr[1] = 'I = ' + getCurrentDText(this.getCurrent());
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 1)
      return new EditInfo('Group Number (for linking)', this.link, 0, 100)
        .setDimensionless()
        .disallowSliders();
    if (n === 2)
      return new EditInfo('# of Throws', this.throwCount, 2, 10)
        .setDimensionless()
        .disallowSliders();
    return super.getEditInfo(n);
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 1) this.link = javaDoubleToInt(ei.value);
    else if (n === 2) {
      if (ei.value >= 2) this.throwCount = javaDoubleToInt(ei.value);
      if (this.throwCount > 2) this.momentary = false;
      this.allocNodes();
      this.setPoints();
    } else super.setEditValue(n, ei);
  }

  /** For backwards compatibility only; supported only with two throws. */
  hasCenterOff(): boolean {
    return (this.flags & Switch2Elm.FLAG_CENTER_OFF) !== 0 && this.throwCount === 2;
  }
  isPositionFlipped(): boolean {
    return (this.flags & Switch2Elm.FLAG_FLIPPED) !== 0;
  }

  override getShortcut(): number {
    return 'S'.charCodeAt(0);
  }

  override flipX(c2: number, count: number): void {
    super.flipX(c2, count);
    this.position = this.posCount - 1 - this.position;
    this.flags ^= Switch2Elm.FLAG_FLIPPED;
  }
  override flipY(c2: number, count: number): void {
    super.flipY(c2, count);
    this.position = this.posCount - 1 - this.position;
    this.flags ^= Switch2Elm.FLAG_FLIPPED;
  }
  override flipXY(c2: number, count: number): void {
    super.flipXY(c2, count);
    this.position = this.posCount - 1 - this.position;
    this.flags ^= Switch2Elm.FLAG_FLIPPED;
  }

  override validate(): boolean {
    if (this.centerOff()) return true;
    if (this.resistance > 0) return true;
    const fpi = new FindPathInfo(PathType.VOLTAGE, this, this.getNode(0), this.sim);
    if (fpi.findPath(this.getNode(1 + this.position))) {
      this.resistance = 0.001;
      return false;
    }
    return true;
  }
}

/**
 * Shared by the DPDT and cross switches: `poleCount` poles stacked OPENHS*3 apart, each with two
 * throws. Upstream duplicates this geometry in both classes.
 */
function poleGeometry(e: SwitchElm, poleCount: number, iec: boolean) {
  const throwPosts = e.newPointArray(2 * poleCount);
  const throwLeads = e.newPointArray(4 * poleCount);
  const poleLeads = e.newPointArray(poleCount);
  const polePosts = e.newPointArray(poleCount);
  const { point1, point2, lead1, lead2 } = e;
  for (let i = 0; i !== poleCount; i++) {
    const offset = -i * OPENHS * 3;
    polePosts[i] = e.interpPointPerp(point1, point2, 0, offset);
    poleLeads[i] = e.interpPointPerp(lead1, lead2, 0, offset);
    throwPosts[i * 2] = e.interpPointPerp(point1, point2, 1, offset - OPENHS);
    throwLeads[i * 4] = e.interpPointPerp(lead1, lead2, 1, offset - OPENHS);
    throwPosts[i * 2 + 1] = e.interpPointPerp(point1, point2, 1, offset + OPENHS);
    throwLeads[i * 4 + 1] = e.interpPointPerp(lead1, lead2, 1, offset + OPENHS);
    throwLeads[i * 4 + 2] = e.interpPointPerp(lead1, lead2, 1, offset + OPENHS * 0.33);
    throwLeads[i * 4 + 3] = iec
      ? e.interpPointPerp(lead1, lead2, 1.2, offset - OPENHS * 0.33)
      : e.interpPointPerp(lead1, lead2, 1, offset - OPENHS);
  }
  return { throwPosts, throwLeads, poleLeads, polePosts };
}

/** Double (or more) pole, double throw switch. Posts go pole, throw 1, throw 2 for each pole. */
export class DPDTSwitchElm extends SwitchElm {
  poleCount = 2;
  poleLeads: Point[] = [];
  throwLeads: Point[] = [];
  polePosts: Point[] = [];
  throwPosts: Point[] = [];
  voltageSources: (VoltageSource | null)[] = [];
  currents: number[] = [];

  override getClassName(): string {
    return 'DPDTSwitchElm';
  }
  override getDumpType(): number {
    return 429;
  }
  override getXmlDumpType(): string {
    return 'dpdt';
  }

  override initNew(): void {
    super.initNew();
    this.noDiagonal = true;
    this.poleCount = 2;
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    try {
      this.poleCount = parseJavaInt(st.nextToken());
    } catch {
      // keep the default
    }
    this.noDiagonal = true;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('po', this.poleCount);
  }
  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.poleCount = r.parseIntAttr('po', this.poleCount);
    this.noDiagonal = true;
  }

  /** Upstream allocates these lazily too, since elements in a subcircuit get no setPoints(). */
  ensureArrays(): void {
    if (this.voltageSources.length !== this.poleCount) {
      this.voltageSources = new Array<VoltageSource | null>(this.poleCount).fill(null);
      this.currents = new Array<number>(this.poleCount).fill(0);
    }
  }

  override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    this.ensureArrays();
    Object.assign(this, poleGeometry(this, this.poleCount, this.useIECSymbol()));
  }

  override getCurrentIntoNode(n: number): number {
    const t = Math.trunc(n / 3);
    const n3 = n % 3;
    if (n3 === 0) return -this.currents[t];
    if (n3 === this.position + 1) return this.currents[t];
    return 0;
  }

  override setCurrent(vs: VoltageSource, c: number): void {
    for (let i = 0; i !== this.poleCount; i++)
      if (vs === this.voltageSources[i]) this.currents[i] = c;
  }

  override getPost(n: number): Point {
    const t = Math.trunc(n / 3);
    const n3 = n % 3;
    if (n3 === 0) return this.polePosts[t];
    return this.throwPosts[t * 2 + n3 - 1];
  }
  override getPostCount(): number {
    return 3 * this.poleCount;
  }

  override calculateCurrent(): void {
    if (this.resistance > 0)
      for (let i = 0; i !== this.poleCount; i++)
        this.currents[i] =
          (this.volts[i * 3] - this.volts[i * 3 + 1 + this.position]) / this.resistance;
  }

  override setVoltageSource(j: number, vs: VoltageSource): void {
    this.ensureArrays();
    this.voltageSources[j] = vs;
    vs.setNodes(this.nodes[j * 3], this.nodes[this.position + 1 + j * 3]);
  }

  override stamp(): void {
    this.ensureArrays();
    for (let i = 0; i !== this.poleCount; i++) {
      const n1 = this.nodes[i * 3];
      const n2 = this.nodes[this.position + 1 + i * 3];
      if (this.resistance > 0) this.sim.stampResistor(n1, n2, this.resistance);
      else this.sim.stampVoltageSource(n1, n2, this.voltageSources[i], 0);
    }
  }

  override getVoltageSourceCount(): number {
    return this.resistance > 0 ? 0 : this.poleCount;
  }

  override getConnection(n1: number, n2: number): boolean {
    for (let i = 0; i !== this.poleCount; i++)
      if (this.comparePair(n1, n2, i * 3, i * 3 + 1 + this.position)) return true;
    return false;
  }

  override isWireEquivalent(): boolean {
    return this.resistance === 0;
  }
  // optimizing out this element is too complicated to be worth it (see #646)
  override isRemovableWire(): boolean {
    return false;
  }

  override getElmType(): string {
    return 'switch (DPDT)';
  }
  override getInfo(arr: string[]): void {
    arr[0] = this.poleCount === 2 ? 'switch (DPDT)' : 'switch (' + this.poleCount + 'PDT)';
    for (let i = 0; i !== this.poleCount; i++)
      arr[i + 1] = 'I' + (i + 1) + ' = ' + getCurrentDText(this.currents[i] ?? 0);
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('# of Poles', this.poleCount, 2, 10).setDimensionless();
    if (n === 1) return EditInfo.createCheckbox('IEC Symbol', this.useIECSymbol());
    if (n === 2) return this.getKeyShortcutEditInfo();
    if (n === 3) {
      const ei = new EditInfo('On Resistance (ohms)', this.resistance);
      ei.setNonNegative();
      return ei;
    }
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      if (ei.value >= 2) {
        this.poleCount = javaDoubleToInt(ei.value);
        this.allocNodes();
        this.setPoints();
      } else ei.setError('must be >= 2');
    }
    if (n === 1) {
      this.flags = ei.changeFlag(this.flags, SwitchElm.FLAG_IEC);
      this.setPoints();
    }
    if (n === 2) this.setKeyShortcutEditValue(ei);
    if (n === 3) this.resistance = ei.value;
  }

  override getShortcut(): number {
    return 0;
  }

  /** Keep the poles where they were: flipping moves pole 0 to the other end of the stack. */
  private flip(): void {
    if (this.dx === 0) this.x = this.x2 = this.x - javaDoubleToInt(this.dpx1 * OPENHS * 3);
    if (this.dy === 0) this.y = this.y2 = this.y - javaDoubleToInt(this.dpy1 * OPENHS * 3);
    this.position = 1 - this.position;
  }
  override flipX(c2: number, count: number): void {
    this.flip();
    super.flipX(c2, count);
  }
  override flipY(c2: number, count: number): void {
    this.flip();
    super.flipY(c2, count);
  }
  override flipXY(c2: number, count: number): void {
    this.flip();
    super.flipXY(c2, count);
  }

  override validate(): boolean {
    if (this.resistance > 0) return true;
    for (let i = 0; i !== this.poleCount; i++) {
      const fpi = new FindPathInfo(PathType.VOLTAGE, this, this.getNode(i * 3), this.sim);
      if (fpi.findPath(this.getNode(i * 3 + 1 + this.position))) {
        this.resistance = 0.001;
        return false;
      }
    }
    return true;
  }
}

/** Make-before-break SPDT switch: positions are pole 1, both, pole 2, both. */
export class MBBSwitchElm extends SwitchElm {
  link = 0;
  voltSources: (VoltageSource | null)[] = [null, null];
  currents = [0, 0];
  both = false;
  swposts: Point[] = [];
  swpoles: Point[] = [];

  override getClassName(): string {
    return 'MBBSwitchElm';
  }
  override getDumpType(): number {
    return 416;
  }

  override initNew(): void {
    super.initNew();
    this.noDiagonal = true;
  }
  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.link = parseJavaInt(st.nextToken());
    this.noDiagonal = true;
  }
  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('li', this.link);
  }
  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.link = r.parseIntAttr('li', this.link);
    this.noDiagonal = true;
  }

  override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    this.swposts = this.newPointArray(2);
    this.swpoles = this.newPointArray(4);
    for (let i = 0; i !== 2; i++) {
      const hs = i === 0 ? OPENHS : -OPENHS * i;
      this.swpoles[i] = this.interpPointPerp(this.lead1, this.lead2, 1, hs);
      this.swposts[i] = this.interpPointPerp(this.point1, this.point2, 1, hs);
    }
    // 4 positions (pole 1, both, pole 2, both)
    this.posCount = 4;
  }

  override getCurrentIntoNode(n: number): number {
    if (n === 0) return -this.currents[0] - this.currents[1];
    return this.currents[n - 1];
  }

  override getPost(n: number): Point {
    return n === 0 ? this.point1 : this.swposts[n - 1];
  }
  override getPostCount(): number {
    return 3;
  }

  override setCurrent(vs: VoltageSource, c: number): void {
    if (vs === this.voltSources[0])
      this.currents[this.both ? 0 : Math.trunc(this.position / 2)] = c;
    else if (vs === this.voltSources[1]) this.currents[1] = c;
  }

  override calculateCurrent(): void {
    if (this.resistance > 0) {
      this.currents[0] =
        this.both || this.position === 0 ? (this.volts[0] - this.volts[1]) / this.resistance : 0;
      this.currents[1] =
        this.both || this.position === 2 ? (this.volts[0] - this.volts[2]) / this.resistance : 0;
      return;
    }
    // make sure current of unconnected pole is zero
    if (!this.both) this.currents[1 - Math.trunc(this.position / 2)] = 0;
  }

  override setVoltageSource(n: number, v: VoltageSource): void {
    this.voltSources[n] = v;
    if (this.both) v.setNodes(this.nodes[0], this.nodes[n + 1]);
    else if (this.position === 0) v.setNodes(this.nodes[0], this.nodes[1]);
    else v.setNodes(this.nodes[0], this.nodes[2]);
  }

  override stamp(): void {
    if (this.resistance > 0) {
      if (this.both || this.position === 0)
        this.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
      if (this.both || this.position === 2)
        this.sim.stampResistor(this.nodes[0], this.nodes[2], this.resistance);
      return;
    }
    let vs = 0;
    if (this.both || this.position === 0) this.sim.stampVoltageSourceVS(this.voltSources[vs++], 0);
    if (this.both || this.position === 2) this.sim.stampVoltageSourceVS(this.voltSources[vs], 0);
  }

  /** A connection is a 0 V source: two with both throws connected, otherwise one. */
  override getVoltageSourceCount(): number {
    this.both = this.position === 1 || this.position === 3;
    if (this.resistance > 0) return 0;
    return this.both ? 2 : 1;
  }

  override toggle(): void {
    super.toggle();
    if (this.link === 0) return;
    for (const o of this.sim.elmList)
      if (o instanceof MBBSwitchElm && o.link === this.link) o.position = this.position;
  }

  override getConnection(n1: number, n2: number): boolean {
    if (this.both) return true;
    return this.comparePair(n1, n2, 0, 1 + Math.trunc(this.position / 2));
  }

  // do not optimize out, even though isWireEquivalent() is true (it may have 3 nodes to merge
  // and calcWireClosure() doesn't handle that case)
  override isRemovableWire(): boolean {
    return false;
  }
  override isWireEquivalent(): boolean {
    return this.resistance === 0;
  }

  override getElmType(): string {
    return 'switch (SPDT, MBB)';
  }
  override getInfo(arr: string[]): void {
    arr[0] = 'switch (' + (this.link === 0 ? 'S' : 'D') + 'PDT, MBB)';
    arr[1] = 'I = ' + getCurrentDText(this.getCurrent());
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 1) return new EditInfo('Switch Group', this.link, 0, 100).setDimensionless();
    if (n === 0) return super.getEditInfo(n);
    if (n === 2) return this.getKeyShortcutEditInfo();
    if (n === 3) {
      const ei = new EditInfo('On Resistance (ohms)', this.resistance);
      ei.setNonNegative();
      return ei;
    }
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 1) this.link = javaDoubleToInt(ei.value);
    else if (n === 2) this.setKeyShortcutEditValue(ei);
    else if (n === 3) this.resistance = ei.value;
    else super.setEditValue(n, ei);
  }

  override validate(): boolean {
    if (this.resistance > 0) return true;
    const b = this.position === 1 || this.position === 3;
    for (const [pos, node] of [
      [0, 1],
      [2, 2],
    ] as const) {
      if (!(b || this.position === pos)) continue;
      const fpi = new FindPathInfo(PathType.VOLTAGE, this, this.getNode(0), this.sim);
      if (fpi.findPath(this.getNode(node))) {
        this.resistance = 0.001;
        return false;
      }
    }
    return true;
  }

  override getShortcut(): number {
    return 0;
  }
}

/** Reversing switch: two poles whose throws cross over. Posts are pole 1, out 1, pole 2, out 2. */
export class CrossSwitchElm extends SwitchElm {
  static readonly POLE_COUNT = 2;

  poleLeads: Point[] = [];
  throwLeads: Point[] = [];
  polePosts: Point[] = [];
  throwPosts: Point[] = [];
  crossPoints: Point[] = [];
  voltageSources: (VoltageSource | null)[] = [null, null];
  currents = [0, 0];

  override getClassName(): string {
    return 'CrossSwitchElm';
  }
  override getDumpType(): number {
    return 430;
  }

  override initNew(): void {
    super.initNew();
    this.noDiagonal = true;
  }
  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.noDiagonal = true;
  }
  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.noDiagonal = true;
  }

  override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    Object.assign(this, poleGeometry(this, CrossSwitchElm.POLE_COUNT, this.useIECSymbol()));
    const dp = 16 / this.dn;
    const { point1, point2 } = this;
    this.crossPoints = [
      this.interpPointPerp(point1, point2, 1 + dp, OPENHS),
      this.interpPointPerp(point1, point2, 1 + dp * 2, OPENHS),
      this.interpPointPerp(point1, point2, 1 + dp * 3, OPENHS),
      this.interpPointPerp(point1, point2, 1 + dp * 2, -OPENHS),
      this.interpPointPerp(point1, point2, 1 + dp, -OPENHS * 4),
      this.interpPointPerp(point1, point2, 1 + dp * 3, -OPENHS * 4),
    ];
  }

  override getCurrentIntoNode(n: number): number {
    const h = Math.trunc(n / 2);
    if (n === 0 || n === 2) return -this.currents[h];
    if (this.position === 0) return this.currents[h];
    return this.currents[1 - h];
  }

  override setCurrent(vs: VoltageSource, c: number): void {
    if (vs === this.voltageSources[0]) this.currents[0] = c;
    else this.currents[1] = c;
  }

  override getPost(n: number): Point {
    if (n === 0 || n === 2) return this.polePosts[Math.trunc(n / 2)];
    if (n === 1) return this.crossPoints[2];
    return this.crossPoints[5];
  }
  override getPostCount(): number {
    return 2 * CrossSwitchElm.POLE_COUNT;
  }

  private dest(i: number): number {
    return this.position === 0 ? i * 2 + 1 : 3 - i * 2;
  }

  override calculateCurrent(): void {
    if (this.resistance > 0)
      for (let i = 0; i !== CrossSwitchElm.POLE_COUNT; i++)
        this.currents[i] = (this.volts[i * 2] - this.volts[this.dest(i)]) / this.resistance;
  }

  override setVoltageSource(j: number, vs: VoltageSource): void {
    this.voltageSources[j] = vs;
    vs.setNodes(this.nodes[j * 2], this.nodes[j * 2 + 1]);
  }

  override stamp(): void {
    for (let i = 0; i !== CrossSwitchElm.POLE_COUNT; i++) {
      const n1 = this.nodes[i * 2];
      const n2 = this.nodes[this.dest(i)];
      if (this.resistance > 0) this.sim.stampResistor(n1, n2, this.resistance);
      else this.sim.stampVoltageSource(n1, n2, this.voltageSources[i], 0);
    }
  }

  override getVoltageSourceCount(): number {
    return this.resistance > 0 ? 0 : CrossSwitchElm.POLE_COUNT;
  }

  override getConnection(n1: number, n2: number): boolean {
    if (this.position === 0)
      return this.comparePair(n1, n2, 0, 1) || this.comparePair(n1, n2, 2, 3);
    return this.comparePair(n1, n2, 0, 3) || this.comparePair(n1, n2, 2, 1);
  }

  override isWireEquivalent(): boolean {
    return this.resistance === 0;
  }
  // optimizing out this element is too complicated to be worth it (see #646)
  override isRemovableWire(): boolean {
    return false;
  }

  override getElmType(): string {
    return 'cross switch';
  }
  override getInfo(arr: string[]): void {
    arr[0] = 'cross switch';
    for (let i = 0; i !== CrossSwitchElm.POLE_COUNT; i++)
      arr[i + 1] = 'I' + (i + 1) + ' = ' + getCurrentDText(this.currents[i]);
  }

  override validate(): boolean {
    if (this.resistance > 0) return true;
    for (let i = 0; i !== CrossSwitchElm.POLE_COUNT; i++) {
      const fpi = new FindPathInfo(PathType.VOLTAGE, this, this.getNode(i * 2), this.sim);
      if (fpi.findPath(this.getNode(this.dest(i)))) {
        this.resistance = 0.001;
        return false;
      }
    }
    return true;
  }

  override getShortcut(): number {
    return 0;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return EditInfo.createCheckbox('IEC Symbol', this.useIECSymbol());
    if (n === 1) return this.getKeyShortcutEditInfo();
    if (n === 2) {
      const ei = new EditInfo('On Resistance (ohms)', this.resistance);
      ei.setNonNegative();
      return ei;
    }
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      this.flags = ei.changeFlag(this.flags, SwitchElm.FLAG_IEC);
      this.setPoints();
    }
    if (n === 1) this.setKeyShortcutEditValue(ei);
    if (n === 2) this.resistance = ei.value;
  }
}

export const Switch2ElmType = elementType('Switch2Elm', Switch2Elm);
export const DPDTSwitchElmType = elementType('DPDTSwitchElm', DPDTSwitchElm);
export const MBBSwitchElmType = elementType('MBBSwitchElm', MBBSwitchElm);
export const CrossSwitchElmType = elementType('CrossSwitchElm', CrossSwitchElm);
