// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ChipElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Point, type VoltageSource } from '@perun/engine';
import { CircuitElm } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import type { WireRouter } from '../WireRouter.ts';

export const SIDE_N = 0;
export const SIDE_S = 1;
export const SIDE_W = 2;
export const SIDE_E = 3;
const sideFlipXY = [SIDE_W, SIDE_E, SIDE_N, SIDE_S];

/** One pin of a chip: its place on the outline and its logic state. */
export class Pin {
  readonly chip: ChipElm;
  post: Point = new Point();
  stub: Point = new Point();
  textloc: Point = new Point();
  pos: number;
  side: number;
  side0: number;
  bubbleX = 0;
  bubbleY = 0;
  voltSource: VoltageSource | null = null;
  text: string;
  lineOver = false;
  bubble = false;
  clock = false;
  output = false;
  value = false;
  state = false;
  selected = false;
  current = 0;
  busWidth = 1;
  busZ = 0;
  /** Clock wedge (x, y pairs), or null. */
  clockPoints: Point[] | null = null;

  constructor(chip: ChipElm, p: number, s: number, t: string) {
    this.chip = chip;
    this.pos = p;
    this.side0 = this.side = s;
    this.text = t;
  }

  setPoint(
    px: number,
    py: number,
    dx: number,
    dy: number,
    dax: number,
    day: number,
    sx: number,
    sy: number,
  ): void {
    const c = this.chip;
    const cspc = c.cspc;
    const cspc2 = c.cspc2;
    if (c.isFlippedX()) {
      dx = -dx;
      dax = -dax;
      px += cspc2 * (c.flippedSizeX - 1);
      sx = -sx;
    }
    if (c.isFlippedY()) {
      dy = -dy;
      day = -day;
      py += cspc2 * (c.flippedSizeY - 1);
      sy = -sy;
    }
    const xa = px + cspc2 * dx * this.pos + sx;
    const ya = py + cspc2 * dy * this.pos + sy;
    this.post = new Point(xa + dax * cspc2, ya + day * cspc2, this.busZ);
    // need this because the thicker lines are visible inside the box otherwise
    const busExtra = this.busWidth > 1 ? 2 : 0;
    this.stub = new Point(xa + dax * (cspc + busExtra), ya + day * (cspc + busExtra));
    this.textloc = new Point(xa, ya);
    if (this.bubble) {
      this.bubbleX = xa + dax * 10 * c.csize;
      this.bubbleY = ya + day * 10 * c.csize;
    }
    if (this.clock) {
      const pts = [
        new Point(
          xa + dax * cspc - Math.trunc((dx * cspc) / 2),
          ya + day * cspc - Math.trunc((dy * cspc) / 2),
        ),
        new Point(xa, ya),
        new Point(
          xa + dax * cspc + Math.trunc((dx * cspc) / 2),
          ya + day * cspc + Math.trunc((dy * cspc) / 2),
        ),
      ];
      if (this.text.length > 0) {
        pts[1].x += Math.trunc((dax * cspc) / 2);
        pts[1].y += Math.trunc((day * cspc) / 2);
        this.textloc.x -= Math.trunc((dax * cspc) / 2);
        this.textloc.y -= Math.trunc((day * cspc) / 4);
      }
      this.clockPoints = pts;
    } else this.clockPoints = null;
  }

  /** Position and side as a grid position (0 is top left), to detect overlaps. */
  toGrid(p: number, s: number): number {
    const c = this.chip;
    if (s === SIDE_N) return p;
    if (s === SIDE_S) return p + c.sizeX * (c.sizeY - 1);
    if (s === SIDE_W) return p * c.sizeX;
    if (s === SIDE_E) return p * c.sizeX + c.sizeX - 1;
    return -1;
  }

  overlaps(p: number, s: number): boolean {
    const g = this.toGrid(p, s);
    if (g === -1) return true;
    return this.toGrid(this.pos, this.side) === g;
  }

  /** Read the name's markers: "/" for an overline, "#" or "INV:" for a bubble, "CLK:". */
  fixName(): void {
    if (this.text.startsWith('/')) {
      this.text = this.text.substring(1);
      this.lineOver = true;
    } else if (this.text.startsWith('#')) {
      this.text = this.text.substring(1);
      this.bubble = true;
    }
    let result = this.text.replaceAll('CLK:', '');
    if (result.length !== this.text.length) {
      this.clock = true;
      this.text = result;
    }
    result = this.text.replaceAll('INV:', '');
    if (result.length !== this.text.length) {
      this.bubble = true;
      this.text = result;
    }
    if (this.text.toLowerCase() === 'clk') {
      this.text = '';
      this.clock = true;
    }
  }
}

/** A rectangular chip with pins on its sides. Outputs are voltage sources to ground. */
export abstract class ChipElm extends CircuitElm {
  override addRoutingObstacle(router: WireRouter): void {
    const r = this.rectPoints;
    router.addObstacle(r[0].x, r[0].y, r[2].x, r[2].y);
  }

  static readonly FLAG_SMALL = 1;
  static readonly FLAG_FLIP_X = 1 << 10;
  static readonly FLAG_FLIP_Y = 1 << 11;
  static readonly FLAG_FLIP_XY = 1 << 12;
  static readonly FLAG_CUSTOM_VOLTAGE = 1 << 13;
  static readonly BIT_ORDER_MSB_FIRST = 0;
  static readonly BIT_ORDER_LSB_FIRST = 1;
  static readonly BIT_ORDER_BUS = 2;

  csize = 2;
  cspc = 16;
  cspc2 = 32;
  bits = 0;
  highVoltage = 5;
  bitOrder = 0;
  pins: Pin[] = [];
  sizeX = 0;
  sizeY = 0;
  flippedSizeX = 0;
  flippedSizeY = 0;
  lastClock = false;
  rectPoints: Point[] = [];
  labelX = 0;
  labelY = 0;

  override initNew(): void {
    if (this.needsBits()) this.bits = this.defaultBitCount();
    this.highVoltage = 5;
    this.noDiagonal = true;
    this.setupPins();
    this.setSize(this.useSmallGrid() ? 1 : 2);
    this.allocNodes();
  }

  override undump(st: StringTokenizer): void {
    if (this.needsBits())
      this.bits = st.hasMoreTokens() ? parseJavaInt(st.nextToken()) : this.defaultBitCount();
    this.highVoltage = this.hasCustomVoltage() ? parseJavaDouble(st.nextToken()) : 5;
    this.noDiagonal = true;
    this.setupPins();
    this.setSize((this.flags & ChipElm.FLAG_SMALL) !== 0 ? 1 : 2);
    this.allocNodes();
    for (let i = 0; i !== this.getPostCount(); i++) {
      if (this.pins[i].state) {
        this.volts[i] = parseJavaDouble(st.nextToken());
        this.pins[i].value = this.volts[i] > this.getThreshold();
      }
    }
  }

  needsBits(): boolean {
    return false;
  }
  hasCustomVoltage(): boolean {
    return (this.flags & ChipElm.FLAG_CUSTOM_VOLTAGE) !== 0;
  }
  useBus(): boolean {
    return this.bitOrder === ChipElm.BIT_ORDER_BUS;
  }
  isDigitalChip(): boolean {
    return true;
  }
  getThreshold(): number {
    return this.highVoltage / 2;
  }
  defaultBitCount(): number {
    return 4;
  }

  setSize(s: number): void {
    this.csize = s;
    this.cspc = 8 * s;
    this.cspc2 = this.cspc * 2;
    this.flags &= ~ChipElm.FLAG_SMALL;
    this.flags |= s === 1 ? ChipElm.FLAG_SMALL : 0;
  }

  abstract setupPins(): void;

  /** A new pin; subclasses fill `pins` with these in setupPins. */
  newPin(p: number, s: number, t: string): Pin {
    return new Pin(this, p, s, t);
  }

  override drag(xx: number, yy: number): void {
    yy = this.snapGrid(yy);
    // dragging left of the start point leaves the chip as it is (upstream resets xx and yy,
    // then never reads them)
    if (xx >= this.x) {
      this.y = this.y2 = yy;
      this.x2 = Math.min(this.snapGrid(xx), this.x + (this.sizeX + 1) * this.cspc2);
    }
    this.setPoints();
  }

  override setPoints(): void {
    super.setPoints();
    if (this.x2 - this.x > this.sizeX * this.cspc2 && this.isCreating()) this.setSize(2);
    const cspc = this.cspc;
    const cspc2 = this.cspc2;
    const x0 = this.x + cspc2;
    const y0 = this.y;
    const xr = x0 - cspc;
    const yr = y0 - cspc;
    this.flippedSizeX = this.sizeX;
    this.flippedSizeY = this.sizeY;
    if (this.isFlippedXY()) {
      this.flippedSizeX = this.sizeY;
      this.flippedSizeY = this.sizeX;
    }
    const xs = this.flippedSizeX * cspc2;
    const ys = this.flippedSizeY * cspc2;
    for (let i = 0; i !== this.getPostCount(); i++) {
      const p = this.pins[i];
      p.side = p.side0;
      if ((this.flags & ChipElm.FLAG_FLIP_XY) !== 0) p.side = sideFlipXY[p.side];
      switch (p.side) {
        case SIDE_N:
          p.setPoint(x0, y0, 1, 0, 0, -1, 0, 0);
          break;
        case SIDE_S:
          p.setPoint(x0, y0, 1, 0, 0, 1, 0, ys - cspc2);
          break;
        case SIDE_W:
          p.setPoint(x0, y0, 0, 1, -1, 0, 0, 0);
          break;
        case SIDE_E:
          p.setPoint(x0, y0, 0, 1, 1, 0, xs - cspc2, 0);
          break;
      }
    }
    this.rectPoints = [
      new Point(xr, yr),
      new Point(xr + xs, yr),
      new Point(xr + xs, yr + ys),
      new Point(xr, yr + ys),
    ];
    this.labelX = xr + Math.trunc(xs / 2);
    this.labelY = yr + Math.trunc(ys / 2);
  }

  /**
   * Can the pin move to (xp, yp)? Returns [position, side]. Inside the body a pin keeps its side
   * until another edge is more than one slot closer; outside, it takes the side it crossed.
   */
  getPinPos(xp: number, yp: number, currentSide: number): [number, number] {
    const x0 = this.x + this.cspc2;
    const y0 = this.y;
    const xr = x0 - this.cspc;
    const yr = y0 - this.cspc;
    const xd = (xp - xr) / this.cspc2 - 0.5;
    const yd = (yp - yr) / this.cspc2 - 0.5;
    const sx = this.sizeX;
    const sy = this.sizeY;
    const clampX = (): number => Math.max(0, Math.min(Math.round(xd), sx - 1));
    const clampY = (): number => Math.max(0, Math.min(Math.round(yd), sy - 1));
    if (xd >= 0 && xd <= sx && yd >= 0 && yd <= sy) {
      const dW = xd;
      const dE = sx - xd;
      const dN = yd;
      const dS = sy - yd;
      const curDist =
        currentSide === SIDE_N
          ? dN
          : currentSide === SIDE_S
            ? dS
            : currentSide === SIDE_W
              ? dW
              : dE;
      const minDist = Math.min(Math.min(dW, dE), Math.min(dN, dS));
      let side: number;
      if (curDist <= minDist + 1.0) side = currentSide;
      else
        side = minDist === dN ? SIDE_N : minDist === dS ? SIDE_S : minDist === dW ? SIDE_W : SIDE_E;
      return [side === SIDE_N || side === SIDE_S ? clampX() : clampY(), side];
    }
    const big = Number.MAX_VALUE;
    const distW = xd < 0 ? -xd : big;
    const distE = xd > sx ? xd - sx : big;
    const distN = yd < 0 ? -yd : big;
    const distS = yd > sy ? yd - sy : big;
    const minDist = Math.min(Math.min(distW, distE), Math.min(distN, distS));
    if (minDist === distN) return [clampX(), SIDE_N];
    if (minDist === distS) return [clampX(), SIDE_S];
    if (minDist === distW) return [clampY(), SIDE_W];
    return [clampY(), SIDE_E];
  }

  getOverlappingPin(p1: number, p2: number, pin: number): number {
    for (let i = 0; i !== this.getPostCount(); i++) {
      if (pin === i || this.pins[i].busZ > 0) continue;
      if (this.pins[i].overlaps(p1, p2)) return i;
    }
    return -1;
  }

  override getPost(n: number): Point {
    return this.pins[n].post;
  }
  override getPostWidth(n: number): number {
    return this.pins[n].busWidth;
  }

  /** The number of outputs. */
  abstract override getVoltageSourceCount(): number;

  override setVoltageSource(j: number, vs: VoltageSource): void {
    for (let i = 0; i !== this.getPostCount(); i++) {
      const p = this.pins[i];
      if (p.output && j-- === 0) {
        p.voltSource = vs;
        vs.setNodes(this.sim.ground, this.nodes[i]);
        return;
      }
    }
  }

  override setHighVoltage(hv: number): void {
    this.highVoltage = hv;
  }

  override stamp(): void {
    for (let i = 0; i !== this.getPostCount(); i++) {
      const p = this.pins[i];
      if (p.output) this.sim.stampVoltageSource(this.sim.ground, this.nodes[i], p.voltSource);
    }
  }

  execute(): void {}

  override startIteration(): void {
    for (let i = 0; i !== this.getPostCount(); i++) {
      const p = this.pins[i];
      if (!p.output) p.value = this.volts[i] > this.getThreshold();
    }
    this.execute();
  }

  override doStep(): void {
    for (let i = 0; i !== this.getPostCount(); i++) {
      const p = this.pins[i];
      if (p.output)
        this.sim.updateVoltageSource(
          this.sim.ground,
          this.nodes[i],
          p.voltSource,
          p.value ? this.highVoltage : 0,
        );
    }
  }

  override reset(): void {
    for (let i = 0; i !== this.getPostCount(); i++) {
      this.pins[i].value = false;
      this.volts[i] = 0;
    }
    this.lastClock = false;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    if (this.bits > 0) w.dumpAttr('bi', this.bits);
    if (this.highVoltage !== 5) w.dumpAttr('hv', this.highVoltage);
    if (this.bitOrder !== 0) w.dumpAttr('bo', this.bitOrder);
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    for (let i = 0; i !== this.getPostCount(); i++)
      if (this.pins[i].state && this.volts[i] > 0) w.dumpAttr('v' + i, this.volts[i]);
  }

  override undumpXml(r: XmlAttrReader): void {
    // "ix" marks a state restore inside a subcircuit: flags and pins are already right and the
    // state record has no "f", so zeroing flags would lose the flips and subclass flags
    const stateRestore = r.parseStringAttr('ix', null) !== null;
    if (!stateRestore) this.flags = 0; // might get set by setSize() in constructor
    super.undumpXml(r);
    this.bits = r.parseIntAttr('bi', this.bits);
    this.highVoltage = r.parseDoubleAttr('hv', this.highVoltage);
    this.bitOrder = r.parseIntAttr('bo', this.bitOrder);
    if (!stateRestore) {
      this.setupPins();
      this.setSize((this.flags & ChipElm.FLAG_SMALL) !== 0 ? 1 : 2);
    }
    this.allocNodes();
    for (let i = 0; i !== this.getPostCount(); i++) {
      this.volts[i] = r.parseDoubleAttr('v' + i, 0);
      this.pins[i].value = this.volts[i] > this.getThreshold();
    }
  }

  /** The voltage source of output pin `n`; assigned before the circuit is stamped. */
  pinVoltSource(n: number): VoltageSource {
    const vs = this.pins[n].voltSource;
    if (vs === null) throw new Error('pin ' + n + ' has no voltage source');
    return vs;
  }

  writeOutput(n: number, value: boolean): void {
    this.pins[n].value = value;
  }

  override getInfo(arr: string[]): void {
    arr[0] = this.getChipName();
    let a = 1;
    let shown = 0;
    for (let i = 0; i !== this.getPostCount(); i++) {
      const p = this.pins[i];
      if (arr[a] !== undefined) arr[a] += '; ';
      else arr[a] = '';
      let t = p.text;
      if (p.lineOver) t += "'";
      if (p.clock) t = 'Clk';
      if (p.busWidth > 1) {
        let value = 0;
        for (let j = 0; j < p.busWidth; j++)
          if (this.volts[i + j] > this.getThreshold()) value |= 1 << this.pins[i + j].busZ;
        arr[a] += t + ' = ' + value + ' / 0x' + (value >>> 0).toString(16).toUpperCase();
        i += p.busWidth - 1;
      } else arr[a] += t + ' = ' + getVoltageText(this.volts[i]);
      if (++shown % 2 === 0) a++;
    }
  }

  override setCurrent(vs: VoltageSource, c: number): void {
    for (let i = 0; i !== this.getPostCount(); i++)
      if (this.pins[i].output && this.pins[i].voltSource === vs) this.pins[i].current = c;
  }

  override validate(): boolean {
    for (let i = 0; i !== this.getPostCount(); i++)
      if (this.pins[i].output && !this.validateRailNode(i)) return false;
    return true;
  }

  getChipName(): string {
    return 'chip';
  }
  override getConnection(_n1: number, _n2: number): boolean {
    return false;
  }
  override hasGroundConnection(n1: number): boolean {
    return this.pins[n1].output;
  }
  override getCurrentIntoNode(n: number): number {
    // n may be out of range if the pin count changed after a subcircuit recorded its nodes
    if (n < 0 || n >= this.pins.length) return 0;
    return this.pins[n].current;
  }

  isFlippedX(): boolean {
    return this.hasFlag(ChipElm.FLAG_FLIP_X);
  }
  isFlippedY(): boolean {
    return this.hasFlag(ChipElm.FLAG_FLIP_Y);
  }
  isFlippedXY(): boolean {
    return this.hasFlag(ChipElm.FLAG_FLIP_XY);
  }
  allowBus(): boolean {
    return false;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (this.isDigitalChip()) {
      if (n === 0) return new EditInfo('High Logic Voltage', this.highVoltage).setUnitStep();
      n--;
    }
    if (this.allowBus()) {
      if (n === 0)
        return EditInfo.createChoice('Bit Order', ['MSB First', 'LSB First', 'Bus'], this.bitOrder);
      n--;
    }
    return this.getChipEditInfo(n);
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (this.isDigitalChip()) {
      if (n === 0) {
        this.highVoltage = ei.value;
        return;
      }
      n--;
    }
    if (this.allowBus()) {
      if (n === 0) {
        this.bitOrder = ei.choice?.selected ?? 0;
        this.setupPins();
        this.allocNodes();
        this.setPoints();
        return;
      }
      n--;
    }
    this.setChipEditValue(n, ei);
  }

  getChipEditInfo(_n: number): EditInfo | null {
    return null;
  }
  setChipEditValue(_n: number, _ei: EditInfo): void {}

  /** Upstream `flippedXSide`: a W/E side as drawn when the chip is mirrored. */
  flippedXSide(s: number): number {
    if (!this.isFlippedX()) return s;
    if (s === SIDE_W) return SIDE_E;
    if (s === SIDE_E) return SIDE_W;
    return s;
  }

  override flipX(center2: number, count: number): void {
    this.flags ^= ChipElm.FLAG_FLIP_X;
    if (count !== 1) {
      const xs = (this.flippedSizeX + 1) * this.cspc2;
      this.x = center2 - this.x - xs;
      this.x2 = center2 - this.x2;
    }
    this.setPoints();
  }

  override flipY(center2: number, count: number): void {
    this.flags ^= ChipElm.FLAG_FLIP_Y;
    if (count !== 1) {
      const ys = (this.flippedSizeY - 1) * this.cspc2;
      this.y = center2 - this.y - ys;
      this.y2 = center2 - this.y2;
    }
    this.setPoints();
  }

  override flipXY(xmy: number, count: number): void {
    this.flags ^= ChipElm.FLAG_FLIP_XY;
    // FLAG_FLIP_XY is applied first, so X and Y swap
    if (this.isFlippedX() !== this.isFlippedY())
      this.flags ^= ChipElm.FLAG_FLIP_X | ChipElm.FLAG_FLIP_Y;
    if (count !== 1) {
      this.x += this.cspc2;
      super.flipXY(xmy, count);
      this.x -= this.cspc2;
    }
    this.setPoints();
  }

  override getNumHandles(): number {
    return 0;
  }

  makeBitPins(
    count: number,
    pos: number,
    side: number,
    offset: number,
    name: string,
    output: boolean,
    state: boolean,
    reversed: boolean,
  ): void {
    for (let i = 0; i !== count; i++) {
      const ii = reversed ? offset + count - 1 - i : offset + i;
      let p: Pin;
      if (this.useBus()) {
        p = this.newPin(pos, side, name);
        p.busWidth = count;
        p.busZ = i;
      } else if (this.bitOrder === ChipElm.BIT_ORDER_LSB_FIRST)
        p = this.newPin(pos + i, side, name + i);
      else p = this.newPin(pos + (count - 1 - i), side, name + i);
      p.output = output;
      p.state = state;
      this.pins[ii] = p;
    }
  }
}

/** Upstream `ChipElm.writeBits`: bits packed into 32-bit ints, each preceded by a space. */
export function writeBits(data: readonly boolean[]): string {
  let sb = '';
  let integer = 0;
  let bitIndex = 0;
  for (const bit of data) {
    if (bitIndex >= 32) {
      sb += ' ' + integer;
      integer = 0;
      bitIndex = 0;
    }
    if (bit) integer |= 1 << bitIndex;
    bitIndex++;
  }
  if (bitIndex > 0) sb += ' ' + integer;
  return sb;
}

/** Upstream `ChipElm.readBits`. */
export function readBits(st: StringTokenizer, output: boolean[]): void {
  let integer = 0;
  let bitIndex = Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < output.length; i++) {
    if (bitIndex >= 32) {
      if (!st.hasMoreTokens()) break; // data is absent
      integer = parseJavaInt(st.nextToken());
      bitIndex = 0;
    }
    output[i] = (integer & (1 << bitIndex)) !== 0;
    bitIndex++;
  }
}

/** Upstream `ChipElm.writeBitsToString`: like writeBits, without the leading space. */
export function writeBitsToString(data: readonly boolean[]): string {
  const parts: number[] = [];
  let integer = 0;
  let bitIndex = 0;
  for (const bit of data) {
    if (bitIndex >= 32) {
      parts.push(integer);
      integer = 0;
      bitIndex = 0;
    }
    if (bit) integer |= 1 << bitIndex;
    bitIndex++;
  }
  parts.push(integer);
  return parts.join(' ');
}

/** Upstream `ChipElm.readBitsFromString`. */
export function readBitsFromString(s: string, output: boolean[]): void {
  const tokens = s.split(' ').filter((t) => t.length > 0);
  let k = 0;
  let integer = 0;
  let bitIndex = Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < output.length; i++) {
    if (bitIndex >= 32) {
      if (k >= tokens.length) break;
      integer = parseJavaInt(tokens[k++]);
      bitIndex = 0;
    }
    output[i] = (integer & (1 << bitIndex)) !== 0;
    bitIndex++;
  }
}
