// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/DataRecorderElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getVoltageText, javaDoubleToString } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Records its node's voltage every time step into a ring buffer, for download as text. */
export class DataRecorderElm extends CircuitElm {
  /** Saves a text file for the user (set by the app; the element has no DOM). */
  static download: ((fileName: string, text: string) => void) | null = null;

  dataCount = 0;
  dataPtr = 0;
  lastTimeStepCount = 0;
  data: number[] = [];
  dataFull = false;

  override getClassName(): string {
    return 'DataRecorderElm';
  }
  override getDumpType(): number {
    return 210;
  }
  override getPostCount(): number {
    return 1;
  }

  override initNew(): void {
    this.setDataCount(10240);
  }

  override undump(st: StringTokenizer): void {
    this.setDataCount(parseJavaInt(st.nextToken()));
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('dc', this.dataCount);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.setDataCount(r.parseIntAttr('dc', this.dataCount));
  }

  // upstream's reset doesn't call super.reset()
  override reset(): void {
    this.dataPtr = 0;
    this.dataFull = false;
    this.lastTimeStepCount = 0;
  }

  override setPoints(): void {
    super.setPoints();
    this.lead1 = this.interpPoint(this.point1, this.point2, 1 - 8 / this.dn);
  }

  override getVoltageDiff(): number {
    return this.volts[0];
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'data export';
    arr[1] = 'V = ' + getVoltageText(this.volts[0]);
    arr[2] = (this.dataFull ? this.dataCount : this.dataPtr) + '/' + this.dataCount;
  }

  override stepFinished(): void {
    if (this.lastTimeStepCount === this.sim.timeStepCount) return;
    this.data[this.dataPtr++] = this.volts[0];
    this.lastTimeStepCount = this.sim.timeStepCount;
    if (this.dataPtr >= this.dataCount) {
      this.dataPtr = 0;
      this.dataFull = true;
    }
  }

  setDataCount(ct: number): void {
    this.dataCount = ct;
    this.data = new Array<number>(Math.max(ct, 0)).fill(0);
    this.dataPtr = 0;
    this.dataFull = false;
  }

  /** The recording as upstream's download: a header line, then one voltage per line. */
  dataText(): string {
    let s = '# time step = ' + javaDoubleToString(this.sim.timeStep) + ' sec\n';
    if (this.dataFull) {
      for (let i = 0; i !== this.dataCount; i++)
        s += javaDoubleToString(this.data[(i + this.dataPtr) % this.dataCount]) + '\n';
    } else for (let i = 0; i !== this.dataPtr; i++) s += javaDoubleToString(this.data[i]) + '\n';
    return s;
  }

  /** Upstream names the file after the local time: data-yyyyMMdd-HHmm.circuitjs.txt. */
  static fileName(date: Date): string {
    const d = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
    return `data-${d}-${pad2(date.getHours())}${pad2(date.getMinutes())}.circuitjs.txt`;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0)
      return new EditInfo('# of Data Points', this.dataCount, -1, -1)
        .setDimensionless()
        .setPositive();
    if (n === 1) {
      // upstream shows a download link named after the file
      const ei = new EditInfo('', 0, -1, -1);
      const fname = DataRecorderElm.fileName(new Date());
      ei.button = {
        label: fname,
        onClick: () => DataRecorderElm.download?.(fname, this.dataText()),
      };
      return ei;
    }
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.value > 0) this.setDataCount(Math.trunc(ei.value));
  }
}

export const DataRecorderElmType = elementType('DataRecorderElm', DataRecorderElm);
