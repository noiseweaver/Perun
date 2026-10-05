// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/StopTriggerElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

/**
 * Pauses the simulation once its node passes a voltage (>= or <=), held for a required duration
 * and seen a required number of times, after an optional delay.
 */
export class StopTriggerElm extends CircuitElm {
  triggerVoltage = 0;
  triggered = false;
  stopped = false;
  conditionActive = false;
  durationMet = false;
  delay = 0;
  triggerTime = 0;
  requiredDuration = 0;
  conditionStartTime = 0;
  /** 0: trigger at >=, 1: at <=. */
  type = 0;
  count = 1;
  triggerCount = 0;

  override getClassName(): string {
    return 'StopTriggerElm';
  }
  override getDumpType(): number {
    return 408;
  }
  override getPostCount(): number {
    return 1;
  }

  override initNew(): void {
    this.triggerVoltage = 1;
    this.count = 1;
  }

  override undump(st: StringTokenizer): void {
    this.triggerVoltage = parseJavaDouble(st.nextToken());
    this.type = parseJavaInt(st.nextToken());
    this.delay = parseJavaDouble(st.nextToken());
    this.count = 1;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('tv', this.triggerVoltage);
    w.dumpAttr('tp', this.type);
    w.dumpAttr('dl', this.delay);
    w.dumpAttr('ct', this.count);
    w.dumpAttr('rd', this.requiredDuration);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.triggerVoltage = r.parseDoubleAttr('tv', this.triggerVoltage);
    this.type = r.parseIntAttr('tp', this.type);
    this.delay = r.parseDoubleAttr('dl', this.delay);
    this.count = r.parseIntAttr('ct', 1);
    if (this.count < 1) this.count = 1;
    this.requiredDuration = r.parseDoubleAttr('rd', 0);
  }

  // upstream's reset doesn't call super.reset() or clear `stopped`
  override reset(): void {
    this.triggered = false;
    this.conditionActive = false;
    this.durationMet = false;
    this.triggerCount = 0;
  }

  override setPoints(): void {
    super.setPoints();
    this.lead1 = this.interpPoint(this.point1, this.point2, 1 - 8 / this.dn);
  }

  override stepFinished(): void {
    const sim = this.sim;
    const v = this.volts[0];
    this.stopped = false;
    const condition =
      (this.type === 0 && v >= this.triggerVoltage) ||
      (this.type === 1 && v <= this.triggerVoltage);
    if (!this.conditionActive && condition) {
      this.conditionActive = true;
      this.conditionStartTime = sim.t;
      this.durationMet = false;
    }
    if (
      this.conditionActive &&
      condition &&
      !this.durationMet &&
      sim.t - this.conditionStartTime >= this.requiredDuration
    ) {
      this.durationMet = true;
      this.triggerCount++;
      if (!this.triggered && this.triggerCount >= this.count) {
        this.triggered = true;
        this.triggerTime = sim.t;
      }
    }
    if (this.conditionActive && !condition) this.conditionActive = false;
    if (this.triggered && sim.t >= this.triggerTime + this.delay) {
      this.triggered = false;
      this.triggerCount = 0;
      this.stopped = true;
      sim.requestPause();
    }
  }

  override getVoltageDiff(): number {
    return this.volts[0];
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'stop trigger';
    arr[1] = 'V = ' + getVoltageText(this.volts[0]);
    arr[2] = 'Vtrigger = ' + getVoltageText(this.triggerVoltage);
    arr[3] = this.triggered
      ? 'stopping in ' + getUnitText(this.triggerTime + this.delay - this.sim.t, 's')
      : this.stopped
        ? 'stopped'
        : 'waiting';
    if (!this.stopped && this.count > 1)
      arr[3] += ' (' + Math.min(this.triggerCount, this.count) + '/' + this.count + ')';
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Voltage', this.triggerVoltage).setUnitStep();
    if (n === 1) {
      const ei = EditInfo.createChoice('Trigger Type', ['>=', '<='], this.type);
      ei.value = this.type;
      return ei;
    }
    if (n === 2) return new EditInfo('Delay (s)', this.delay);
    if (n === 3) return new EditInfo('Required Duration (s)', this.requiredDuration);
    if (n === 4)
      return new EditInfo('Required Count', this.count, -1, -1).setDimensionless().setPositive();
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.triggerVoltage = ei.value;
    if (n === 1 && ei.choice !== null) this.type = ei.choice.selected;
    if (n === 2) this.delay = ei.value;
    if (n === 3) {
      this.requiredDuration = ei.value;
      if (this.requiredDuration < 0) this.requiredDuration = 0;
    }
    if (n === 4) {
      this.count = Math.trunc(ei.value);
      if (this.count < 1) this.count = 1;
    }
  }
}

export const StopTriggerElmType = elementType('StopTriggerElm', StopTriggerElm);
