// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/TimeDelayRelayElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { ChipElm, SIDE_E, SIDE_W } from './ChipElm.ts';

const VIN_RESISTANCE = 10e3;

/** A relay that connects in to out a set time after Vin is powered (and opens after another). */
export class TimeDelayRelayElm extends ChipElm {
  lastTransition = 0;
  poweredState = false;
  onState = false;
  resistance = 10e6;
  onDelay = 1;
  offDelay = 0;
  onResistance = 1;
  offResistance = 10e6;

  override getClassName(): string {
    return 'TimeDelayRelayElm';
  }
  override getDumpType(): number {
    return 414;
  }
  override getChipName(): string {
    return 'time delay relay';
  }

  override initNew(): void {
    super.initNew();
    this.onDelay = 1;
    this.offDelay = 0;
    this.onResistance = 1;
    this.offResistance = this.resistance = 10e6;
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.onDelay = parseJavaDouble(st.nextToken());
    this.offDelay = parseJavaDouble(st.nextToken());
    this.onResistance = parseJavaDouble(st.nextToken());
    this.offResistance = this.resistance = parseJavaDouble(st.nextToken());
  }

  // upstream's reset doesn't call ChipElm's
  override reset(): void {
    this.lastTransition = 0;
    this.poweredState = this.onState = false;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('ond', this.onDelay);
    w.dumpAttr('ofd', this.offDelay);
    w.dumpAttr('onr', this.onResistance);
    w.dumpAttr('ofr', this.offResistance);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.onDelay = r.parseDoubleAttr('ond', this.onDelay);
    this.offDelay = r.parseDoubleAttr('ofd', this.offDelay);
    this.onResistance = r.parseDoubleAttr('onr', this.onResistance);
    this.offResistance = r.parseDoubleAttr('ofr', this.offResistance);
    this.resistance = this.offResistance;
  }

  setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 2;
    this.pins = new Array(4);
    this.pins[0] = this.newPin(1, SIDE_W, 'Vin');
    this.pins[1] = this.newPin(1, SIDE_E, 'gnd');
    this.pins[2] = this.newPin(0, SIDE_W, 'in');
    this.pins[3] = this.newPin(0, SIDE_E, 'out');
  }

  override nonLinear(): boolean {
    return true;
  }

  override stamp(): void {
    this.resistance = this.onState ? this.onResistance : this.offResistance;
    this.sim.stampResistor(this.nodes[0], this.nodes[1], VIN_RESISTANCE);
    this.sim.stampNonLinear(this.nodes[2]);
    this.sim.stampNonLinear(this.nodes[3]);
  }

  override doStep(): void {
    this.resistance = this.onState ? this.onResistance : this.offResistance;
    this.sim.stampResistor(this.nodes[2], this.nodes[3], this.resistance);
  }

  override stepFinished(): void {
    // power applied, then delay, then in and out are connected
    const oldState = this.poweredState;
    this.poweredState = this.volts[0] - this.volts[1] > 2.5;
    if (oldState !== this.poweredState) this.lastTransition = this.sim.t;
    if (this.sim.t > this.lastTransition + (this.poweredState ? this.onDelay : this.offDelay))
      this.onState = this.poweredState;
  }

  /** Pin currents for the current dots (upstream sets them while drawing). */
  computeCurrent(): void {
    const v = this.volts;
    this.pins[0].current = -(v[0] - v[1]) / VIN_RESISTANCE;
    this.pins[2].current = -(v[2] - v[3]) / this.resistance;
    this.pins[1].current = -this.pins[0].current;
    this.pins[3].current = -this.pins[2].current;
  }

  override isDigitalChip(): boolean {
    return false;
  }
  override getPostCount(): number {
    return 4;
  }
  override getVoltageSourceCount(): number {
    return 0;
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('On Delay (s)', this.onDelay, 0, 0);
    if (n === 1) return new EditInfo('Off Delay (s)', this.offDelay, 0, 0);
    if (n === 2) return new EditInfo('On Resistance (ohms)', this.onResistance, 0, 0).setPositive();
    if (n === 3)
      return new EditInfo('Off Resistance (ohms)', this.offResistance, 0, 0).setPositive();
    return null;
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.onDelay = ei.value;
    if (n === 1) this.offDelay = ei.value;
    if (n === 2) this.onResistance = ei.value;
    if (n === 3) this.offResistance = ei.value;
  }
}

export const TimeDelayRelayElmType = elementType('TimeDelayRelayElm', TimeDelayRelayElm);
