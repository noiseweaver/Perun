// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/TimerElm.java, MonostableElm.java,
// PhaseCompElm.java, VCOElm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, checked
// against the ts/ translations (dev-ts) at 7ec858d662d8be1d76d54241ba3a5c1d1c524f51.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { type CircuitNode } from '@circuitjs-next/engine';
import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaBoolean, parseJavaDouble } from '../java.ts';
import { type StringTokenizer } from '../StringTokenizer.ts';
import { type XmlAttrReader, type XmlAttrWriter } from '../xml.ts';
import { ChipElm, SIDE_N, SIDE_S, SIDE_W, SIDE_E } from './ChipElm.ts';

export class TimerElm extends ChipElm {
  override getClassName(): string {
    return 'TimerElm';
  }
  static readonly FLAG_RESET = 2;
  static readonly FLAG_GROUND = 4;
  static readonly FLAG_NUMBERS = 8;

  static readonly N_DIS = 0;
  static readonly N_TRIG = 1;
  static readonly N_THRES = 2;
  static readonly N_VCC = 3;
  static readonly N_CTL = 4;
  static readonly N_OUT = 5;
  static readonly N_RST = 6;
  static readonly N_GND = 7;

  override getDefaultFlags(): number {
    return TimerElm.FLAG_RESET | TimerElm.FLAG_GROUND;
  }

  out: boolean = false;
  triggerSuppressed: boolean = false;
  override getChipName(): string {
    return '555 Timer';
  }

  setupPins(): void {
    this.sizeX = 3;
    this.sizeY = 5;
    this.pins = new Array(8);
    const N = TimerElm;
    this.pins[N.N_DIS] = this.newPin(1, SIDE_W, this.usePinNames() ? 'dis' : '7');
    this.pins[N.N_TRIG] = this.newPin(3, SIDE_W, this.usePinNames() ? 'tr' : '2');
    if (this.usePinNames()) this.pins[N.N_TRIG].lineOver = true;
    this.pins[N.N_THRES] = this.newPin(4, SIDE_W, this.usePinNames() ? 'th' : '6');
    this.pins[N.N_VCC] = this.newPin(1, SIDE_N, this.usePinNames() ? 'Vcc' : '8');
    this.pins[N.N_CTL] = this.newPin(1, SIDE_S, this.usePinNames() ? 'ctl' : '5');
    this.pins[N.N_OUT] = this.newPin(2, SIDE_E, this.usePinNames() ? 'out' : '3');
    this.pins[N.N_OUT].state = true;
    this.pins[N.N_RST] = this.newPin(1, SIDE_E, this.usePinNames() ? 'rst' : '4');
    if (this.usePinNames()) this.pins[N.N_RST].lineOver = true;
    this.pins[N.N_GND] = this.newPin(2, SIDE_S, this.usePinNames() ? 'gnd' : '1');
  }

  override nonLinear(): boolean {
    return true;
  }
  hasReset(): boolean {
    return (this.flags & TimerElm.FLAG_RESET) !== 0 || this.hasGroundPin();
  }
  hasGroundPin(): boolean {
    return (this.flags & TimerElm.FLAG_GROUND) !== 0;
  }
  usePinNumbers(): boolean {
    return (this.flags & TimerElm.FLAG_NUMBERS) !== 0;
  }
  usePinNames(): boolean {
    return (this.flags & TimerElm.FLAG_NUMBERS) === 0;
  }
  override isDigitalChip(): boolean {
    return false;
  }

  override stamp(): void {
    const N = TimerElm;
    const ground = this.groundNode();
    // stamp voltage divider to put ctl pin at 2/3 V
    this.sim.stampResistor(this.nodes[N.N_VCC], this.nodes[N.N_CTL], 5000);
    this.sim.stampResistor(this.nodes[N.N_CTL], ground, 10000);
    // discharge, output, and Vcc pins change in doStep()
    this.sim.stampNonLinear(this.nodes[N.N_DIS]);
    this.sim.stampNonLinear(this.nodes[N.N_OUT]);
    this.sim.stampNonLinear(this.nodes[N.N_VCC]);
    if (this.hasGroundPin()) this.sim.stampNonLinear(this.nodes[N.N_GND]);
  }

  override calculateCurrent(): void {
    // need current for V, discharge, control, ground; output current is
    // calculated for us, and other pins have no current.
    const N = TimerElm;
    this.pins[N.N_VCC].current = (this.volts[N.N_CTL] - this.volts[N.N_VCC]) / 5000;
    const groundVolts = this.hasGroundPin() ? this.volts[N.N_GND] : 0;
    this.pins[N.N_CTL].current =
      -(this.volts[N.N_CTL] - groundVolts) / 10000 - this.pins[N.N_VCC].current;
    this.pins[N.N_DIS].current = !this.out ? -(this.volts[N.N_DIS] - groundVolts) / 10 : 0;
    this.pins[N.N_OUT].current = -(
      this.volts[N.N_OUT] - (this.out ? this.volts[N.N_VCC] : groundVolts)
    );
    if (this.out) this.pins[N.N_VCC].current -= this.pins[N.N_OUT].current;
    if (this.hasGroundPin()) {
      this.pins[N.N_GND].current = (this.volts[N.N_CTL] - groundVolts) / 10000;
      if (!this.out)
        this.pins[N.N_GND].current +=
          (this.volts[N.N_DIS] - groundVolts) / 10 + (this.volts[N.N_OUT] - groundVolts);
    }
  }

  override startIteration(): void {
    const N = TimerElm;
    const groundVolts = this.hasGroundPin() ? this.volts[N.N_GND] : 0;
    this.out = this.volts[N.N_OUT] > (this.volts[N.N_VCC] + groundVolts) / 2;
    // check comparators
    if (this.volts[N.N_THRES] > this.volts[N.N_CTL]) this.out = false;

    // trigger overrides threshold
    // (save triggered flag in case reset and trigger pins are tied together)
    const triggered = (this.volts[N.N_CTL] + groundVolts) / 2 > this.volts[N.N_TRIG];
    if (triggered || this.triggerSuppressed) this.out = true;

    // reset overrides trigger
    if (this.hasReset() && this.volts[N.N_RST] < 0.7 + groundVolts) {
      this.out = false;
      // if trigger is overriden, save it
      this.triggerSuppressed = triggered;
    } else this.triggerSuppressed = false;
  }

  /** Upstream sets a `ground` field in stamp(); the flags cannot change before doStep(). */
  groundNode(): CircuitNode {
    return this.hasGroundPin() ? this.nodes[TimerElm.N_GND] : this.sim.ground;
  }

  override doStep(): void {
    const N = TimerElm;
    const ground = this.groundNode();
    // if output is low, discharge pin 0.  we use a small
    // resistor because it's easier, and sometimes people tie
    // the discharge pin to the trigger and threshold pins.
    if (!this.out) this.sim.stampResistor(this.nodes[N.N_DIS], ground, 10);

    // if output is high, connect Vcc to output with a small resistor.  Otherwise connect output to ground.
    this.sim.stampResistor(this.out ? this.nodes[N.N_VCC] : ground, this.nodes[N.N_OUT], 1);
  }

  override getPostCount(): number {
    return this.hasGroundPin() ? 8 : this.hasReset() ? 7 : 6;
  }
  getVoltageSourceCount(): number {
    return 0;
  }
  override getMatrixConnection(_n1: number, _n2: number): boolean {
    return true;
  }
  override getDumpType(): number {
    return 165;
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      const ei = new EditInfo('', 0, 0, 0);
      ei.checkbox = { label: 'Ground Pin', state: this.hasGroundPin() };
      return ei;
    }
    if (n === 1) return EditInfo.createCheckbox('Show Pin Numbers', this.usePinNumbers());
    return super.getChipEditInfo(n);
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      this.flags = ei.changeFlag(this.flags, TimerElm.FLAG_GROUND);
      this.allocNodes();
      this.setPoints();
      return;
    }
    if (n === 1) {
      this.flags = ei.changeFlag(this.flags, TimerElm.FLAG_NUMBERS);
      this.setupPins();
      this.setPoints();
      return;
    }
    super.setChipEditValue(n, ei);
  }
}

export class MonostableElm extends ChipElm {
  override getClassName(): string {
    return 'MonostableElm';
  }
  private prevInputValue: boolean = false;
  private retriggerable: boolean = false;
  private triggered: boolean = false;
  private lastRisingEdge: number = 0;
  private delay: number = 0.01;

  override initNew(): void {
    super.initNew();
    this.reset();
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.retriggerable = parseJavaBoolean(st.nextToken());
    this.delay = parseJavaDouble(st.nextToken());
    this.reset();
  }
  override getChipName(): string {
    return 'Monostable';
  }

  setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 2;
    this.pins = new Array(this.getPostCount());
    this.pins[0] = this.newPin(0, SIDE_W, '');
    this.pins[0].clock = true;
    this.pins[1] = this.newPin(0, SIDE_E, 'Q');
    this.pins[1].output = true;
    this.pins[2] = this.newPin(1, SIDE_E, 'Q');
    this.pins[2].output = true;
    this.pins[2].lineOver = true;
  }

  override reset(): void {
    super.reset();
    this.pins[2].value = true;
    this.triggered = this.prevInputValue = false;
  }

  override getPostCount(): number {
    return 3;
  }
  getVoltageSourceCount(): number {
    return 2;
  }

  override execute(): void {
    if (
      this.pins[0].value &&
      this.prevInputValue !== this.pins[0].value &&
      (this.retriggerable || !this.triggered)
    ) {
      this.lastRisingEdge = this.sim.t;
      this.pins[1].value = true;
      this.pins[2].value = false;
      this.triggered = true;
    }
    if (this.triggered && this.sim.t > this.lastRisingEdge + this.delay) {
      this.pins[1].value = false;
      this.pins[2].value = true;
      this.triggered = false;
    }
    this.prevInputValue = this.pins[0].value;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('rt', this.retriggerable);
    w.dumpAttr('dl', this.delay);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.retriggerable = r.parseBooleanAttr('rt', this.retriggerable);
    this.delay = r.parseDoubleAttr('dl', this.delay);
    this.reset();
  }

  override getDumpType(): number {
    return 194;
  }

  override getChipEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      return EditInfo.createCheckbox('Retriggerable', this.retriggerable);
    }
    if (n === 1) return new EditInfo('Period (s)', this.delay, 0.001, 0.1);
    return super.getChipEditInfo(n);
  }

  override setChipEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.retriggerable = ei.checkbox?.state === true;
    if (n === 1) this.delay = ei.value;
    super.setChipEditValue(n, ei);
  }
}

export class PhaseCompElm extends ChipElm {
  override getClassName(): string {
    return 'PhaseCompElm';
  }
  override getChipName(): string {
    return 'phase comparator';
  }

  setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 2;
    this.pins = new Array(3);
    this.pins[0] = this.newPin(0, SIDE_W, 'I1');
    this.pins[1] = this.newPin(1, SIDE_W, 'I2');
    this.pins[2] = this.newPin(0, SIDE_E, 'O');
    this.pins[2].output = true;
  }

  override nonLinear(): boolean {
    return true;
  }

  override stamp(): void {
    // upstream also marks the output's voltage source row nonlinear
    this.sim.stampNonLinear(this.sim.ground);
    this.sim.stampNonLinear(this.nodes[2]);
  }

  ff1: boolean = false;
  ff2: boolean = false;

  override startIteration(): void {
    const v1 = this.volts[0] > this.getThreshold();
    const v2 = this.volts[1] > this.getThreshold();
    if (v1 && !this.pins[0].value) this.ff1 = true;
    if (v2 && !this.pins[1].value) this.ff2 = true;
    if (this.ff1 && this.ff2) this.ff1 = this.ff2 = false;
    this.pins[0].value = v1;
    this.pins[1].value = v2;
  }

  override doStep(): void {
    const out = this.ff1 ? this.highVoltage : this.ff2 ? 0 : -1;
    if (out !== -1)
      this.sim.stampVoltageSource(this.sim.ground, this.nodes[2], this.pins[2].voltSource, out);
    else {
      // tie current through output pin to 0
      this.sim.stampMatrixVV(this.pinVoltSource(2), this.pinVoltSource(2), 1);
    }
  }

  override getPostCount(): number {
    return 3;
  }
  getVoltageSourceCount(): number {
    return 1;
  }
  override getDumpType(): number {
    return 161;
  }
  override getMatrixConnection(_n1: number, _n2: number): boolean {
    return true;
  }
}

export class VCOElm extends ChipElm {
  override getClassName(): string {
    return 'VCOElm';
  }
  override getChipName(): string {
    return 'VCO';
  }

  setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 4;
    this.pins = new Array(6);
    this.pins[0] = this.newPin(0, SIDE_W, 'Vi');
    this.pins[1] = this.newPin(3, SIDE_W, 'Vo');
    this.pins[1].output = true;
    this.pins[2] = this.newPin(0, SIDE_E, 'C');
    this.pins[3] = this.newPin(1, SIDE_E, 'C');
    this.pins[4] = this.newPin(2, SIDE_E, 'R1');
    this.pins[4].output = true;
    this.pins[5] = this.newPin(3, SIDE_E, 'R2');
    this.pins[5].output = true;
  }

  override nonLinear(): boolean {
    return true;
  }

  override stamp(): void {
    // output pin
    this.sim.stampVoltageSource(this.sim.ground, this.nodes[1], this.pins[1].voltSource);
    // attach Vi to R1 pin so its current is proportional to Vi
    this.sim.stampVoltageSource(this.nodes[0], this.nodes[4], this.pins[4].voltSource, 0);
    // attach 5V to R2 pin so we get a current going
    this.sim.stampVoltageSource(this.sim.ground, this.nodes[5], this.pins[5].voltSource, 5);
    // put resistor across cap pins to give current somewhere to go
    // in case cap is not connected
    this.sim.stampResistor(this.nodes[2], this.nodes[3], this.cResistance);
    this.sim.stampNonLinear(this.nodes[2]);
    this.sim.stampNonLinear(this.nodes[3]);
  }

  readonly cResistance: number = 1e6;
  cCurrent: number = 0;
  cDir: number = 0;

  override doStep(): void {
    const vc = this.volts[3] - this.volts[2];
    let vo = this.volts[1];
    let dir = vo < 2.5 ? 1 : -1;
    // switch direction of current through cap as we oscillate
    if (vo < 2.5 && vc > 4.5) {
      vo = 5;
      dir = -1;
    }
    if (vo > 2.5 && vc < 0.5) {
      vo = 0;
      dir = 1;
    }

    // generate output voltage
    this.sim.updateVoltageSource(this.sim.ground, this.nodes[1], this.pins[1].voltSource, vo);
    // now we set the current through the cap to be equal to the
    // current through R1 and R2, so we can measure the voltage
    // across the cap
    this.sim.stampMatrixNV(this.nodes[2], this.pinVoltSource(4), dir);
    this.sim.stampMatrixNV(this.nodes[2], this.pinVoltSource(5), dir);
    this.sim.stampMatrixNV(this.nodes[3], this.pinVoltSource(4), -dir);
    this.sim.stampMatrixNV(this.nodes[3], this.pinVoltSource(5), -dir);
    this.cDir = dir;
  }

  // can't do this in calculateCurrent() because it's called before
  // we get pins[4].current and pins[5].current, which we need
  computeCurrent(): void {
    if (this.cResistance === 0) return;
    const c =
      this.cDir * (this.pins[4].current + this.pins[5].current) +
      (this.volts[3] - this.volts[2]) / this.cResistance;
    this.pins[2].current = -c;
    this.pins[3].current = c;
    this.pins[0].current = -this.pins[4].current;
  }

  override getPostCount(): number {
    return 6;
  }
  getVoltageSourceCount(): number {
    return 3;
  }
  override getDumpType(): number {
    return 158;
  }
  override getMatrixConnection(_n1: number, _n2: number): boolean {
    return true;
  }
  override isDigitalChip(): boolean {
    return false;
  }
}

export const TimerElmType = elementType('TimerElm', TimerElm);
export const MonostableElmType = elementType('MonostableElm', MonostableElm);
export const PhaseCompElmType = elementType('PhaseCompElm', PhaseCompElm);
export const VCOElmType = elementType('VCOElm', VCOElm);
