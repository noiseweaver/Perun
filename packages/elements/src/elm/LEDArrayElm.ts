// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/LEDArrayElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt, parseJavaInt } from '../java.ts';
import { modelsFor } from '../models/ModelLibrary.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { ChipElm, SIDE_S, SIDE_W } from './ChipElm.ts';
import { Diode } from './Diode.ts';

/** A grid of LEDs: anodes on the rows (left pins), cathodes on the columns (bottom pins). */
export class LEDArrayElm extends ChipElm {
  /** Time constant of the brightness decay (30 ms persistence of vision). */
  static readonly brightnessTau = 0.03;

  diodes: Diode[] | null = null;
  currents: number[] | null = null;
  brightness: number[] = [];
  lastDrawTime = 0;
  decayMultiplier = 1;

  override getClassName(): string {
    return 'LEDArrayElm';
  }
  override getDumpType(): number {
    return 405;
  }
  override getChipName(): string {
    return 'LED array';
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    try {
      this.sizeX = parseJavaInt(st.nextToken());
      this.sizeY = parseJavaInt(st.nextToken());
    } catch {
      // older files keep the default size
    }
    this.allocNodes();
    this.setupPins();
    this.setPoints();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('sx', this.sizeX);
    w.dumpAttr('sy', this.sizeY);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.sizeX = r.parseIntAttr('sx', this.sizeX);
    this.sizeY = r.parseIntAttr('sy', this.sizeY);
    this.allocNodes();
    this.setupPins();
    this.setPoints();
  }

  override setupPins(): void {
    if (this.sizeX === 0 || this.sizeY === 0) {
      this.sizeX = this.sizeY = 8;
      this.allocNodes();
    }
    this.pins = new Array(this.sizeX + this.sizeY);
    for (let i = 0; i !== this.sizeX; i++) this.pins[i] = this.newPin(i, SIDE_S, '');
    for (let i = 0; i !== this.sizeY; i++) this.pins[i + this.sizeX] = this.newPin(i, SIDE_W, '');
    this.brightness = new Array<number>(this.sizeX * this.sizeY).fill(0);
  }

  override reset(): void {
    this.brightness = new Array<number>(this.sizeX * this.sizeY).fill(0);
  }

  override stamp(): void {
    super.stamp();
    // a diode for each grid point
    const n = this.sizeX * this.sizeY;
    const model = modelsFor(this.sim).diode.getModelWithName('default-led');
    const diodes: Diode[] = [];
    for (let i = 0; i !== n; i++) {
      const d = new Diode(this);
      d.setup(model);
      d.stamp(this.nodes[this.sizeX + Math.trunc(i / this.sizeX)], this.nodes[i % this.sizeX]);
      diodes.push(d);
    }
    this.diodes = diodes;
    this.currents = new Array<number>(n).fill(0);
  }

  override doStep(): void {
    super.doStep();
    const diodes = this.diodes;
    if (diodes === null) return;
    let i = 0;
    for (let iy = 0; iy !== this.sizeY; iy++)
      for (let ix = 0; ix !== this.sizeX; ix++, i++)
        diodes[i].doStep(this.volts[this.sizeX + iy] - this.volts[ix]);
  }

  override nonLinear(): boolean {
    return true;
  }
  override isDigitalChip(): boolean {
    return false;
  }

  override calculateCurrent(): void {
    for (let ix = 0; ix !== this.sizeX; ix++) this.pins[ix].current = 0;
    // called before stamp() on a new element
    const diodes = this.diodes;
    const currents = this.currents;
    if (diodes === null || currents === null) return;
    let i = 0;
    for (let iy = 0; iy !== this.sizeY; iy++) {
      let cur = 0;
      for (let ix = 0; ix !== this.sizeX; ix++, i++) {
        currents[i] = diodes[i].calculateCurrent(this.volts[this.sizeX + iy] - this.volts[ix]);
        cur += currents[i];
        this.pins[ix].current += currents[i];
      }
      this.pins[iy + this.sizeX].current = -cur;
    }
  }

  override stepFinished(): void {
    // stop for huge currents that make the simulator act weird
    const currents = this.currents;
    if (currents === null) return;
    for (const c of currents) if (Math.abs(c) > 1e12) this.sim.stop('max current exceeded', this);
  }

  /** Start a frame: how much the glow has faded since the last one (upstream draw()). */
  beginFrame(): void {
    const elapsed = this.sim.t - this.lastDrawTime;
    this.lastDrawTime = this.sim.t;
    this.decayMultiplier = elapsed > 0 ? Math.exp(-elapsed / LEDArrayElm.brightnessTau) : 1;
  }

  /** Red level 20..255 of LED p: 10 mA is full brightness, fading slowly when it turns off. */
  ledLevel(p: number): number {
    const currents = this.currents;
    if (currents === null) return 20;
    let w = currents[p] / 0.01;
    if (w > 0) w = 255 * (1 + 0.2 * Math.log(w));
    if (w > 255) w = 255;
    if (w < 20) w = 20;
    w = Math.max(w, this.brightness[p]);
    this.brightness[p] = w * this.decayMultiplier;
    return javaDoubleToInt(w);
  }

  override getPostCount(): number {
    return this.sizeX + this.sizeY;
  }
  override getVoltageSourceCount(): number {
    return 0;
  }

  // getConnection is true too, but upstream leaves it false: it misbehaves with unconnected pins
  override getMatrixConnection(_n1: number, _n2: number): boolean {
    return true;
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Grid Width', this.sizeX).setDimensionless();
    if (n === 1) return new EditInfo('Grid Height', this.sizeY).setDimensionless();
    return null;
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n !== 0 && n !== 1) return;
    if (ei.value >= 2 && ei.value <= 16) {
      if (n === 0) this.sizeX = javaDoubleToInt(ei.value);
      else this.sizeY = javaDoubleToInt(ei.value);
      this.allocNodes();
      this.setupPins();
      this.setPoints();
    } else ei.setError('must be between 2 and 16');
  }

  // the pins have no names, so the default info doesn't work
  override getInfo(arr: string[]): void {
    arr[0] = this.getChipName();
  }
}

export const LEDArrayElmType = elementType('LEDArrayElm', LEDArrayElm);
