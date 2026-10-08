// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/InstructionDisplayElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Point } from '@perun/engine';
import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { ExprParser, ExprState } from '../Expr.ts';
import { javaDoubleToInt, parseJavaInt, parseJavaIntRadix } from '../java.ts';

import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import type { WireRouter } from '../WireRouter.ts';

/** One row of the lookup table: values lo..hi show the template. */
class LookupEntry {
  readonly lo: number;
  readonly hi: number;
  readonly template: string;

  constructor(lo: number, hi: number, template: string) {
    this.lo = lo;
    this.hi = hi;
    this.template = template;
  }

  /** The template with each `{expr}` replaced by its value, where `a` is the input. */
  getText(value: number): string {
    const template = this.template;
    let sb = '';
    let pos = 0;
    while (pos < template.length) {
      const open = template.indexOf('{', pos);
      if (open < 0) {
        sb += template.substring(pos);
        break;
      }
      sb += template.substring(pos, open);
      const close = template.indexOf('}', open);
      if (close < 0) {
        sb += template.substring(open);
        break;
      }
      const exprStr = template.substring(open + 1, close);
      try {
        const ep = new ExprParser(exprStr);
        const expr = ep.parseExpression();
        if (ep.gotError() === null) {
          const es = new ExprState(1);
          es.values[0] = value; // a = input value
          const result = expr.eval(es);
          const intResult = javaDoubleToInt(result);
          sb += result === intResult ? String(intResult) : String(result);
        } else sb += '{' + exprStr + '}';
      } catch {
        sb += '{' + exprStr + '}';
      }
      pos = close + 1;
    }
    return sb;
  }
}

/** Shows text chosen by the value on a bus (for example an instruction's mnemonic). */
export class InstructionDisplayElm extends CircuitElm {
  override addRoutingObstacle(router: WireRouter): void {
    router.addWire(this.point1.x, this.point1.y, this.x2, this.y2);
    router.addObstacle(this.x2 - 10, this.y2 - 10, this.x2 + 10, this.y2 + 10);
  }

  busWidth = 4;
  threshold = 2.5;
  lookupText = '0=text0\n1=text1\n0x2-0xF=other ({a})\n';
  entries: LookupEntry[] = [];

  override getClassName(): string {
    return 'InstructionDisplayElm';
  }
  override getXmlDumpType(): string {
    return 'ins';
  }

  override initNew(): void {
    this.parseEntries(null);
  }

  override getPostCount(): number {
    return this.busWidth;
  }
  override getBusWidth(): number {
    return this.busWidth;
  }
  override getPostWidth(_n: number): number {
    return this.busWidth;
  }
  override getNumHandles(): number {
    return 1;
  }
  override getVoltageSourceCount(): number {
    return 0;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('bw', this.busWidth);
    if (this.threshold !== 2.5) w.dumpAttr('th', this.threshold);
    if (this.lookupText.length > 0) w.appendText(this.lookupText);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.busWidth = r.parseIntAttr('bw', this.busWidth);
    this.threshold = r.parseDoubleAttr('th', this.threshold);
    this.lookupText = r.parseContents() ?? '';
    this.parseEntries(null);
  }

  override getPost(n: number): Point {
    return new Point(this.x, this.y, n);
  }

  /** The bus value, bit i from post i. */
  readInputValue(): number {
    let value = 0;
    for (let i = 0; i !== this.busWidth; i++) if (this.volts[i] > this.threshold) value |= 1 << i;
    return value;
  }

  getDisplayText(): string {
    const value = this.readInputValue();
    for (const entry of this.entries)
      if (value >= entry.lo && value <= entry.hi) return entry.getText(value);
    return String(value);
  }

  override getVoltageDiff(): number {
    return this.volts[0];
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'instruction display';
    const value = this.readInputValue();
    arr[1] = 'in = ' + value + ' (0x' + (value >>> 0).toString(16).toUpperCase() + ')';
    arr[2] = 'text = ' + this.getDisplayText();
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('Bus Width', this.busWidth, 2, 32).setDimensionless();
    if (n === 1) return new EditInfo('Threshold Voltage', this.threshold);
    if (n === 2) {
      const ei = EditInfo.text('Lookup Table', this.lookupText);
      ei.multiline = true;
      return ei;
    }
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      if (ei.value >= 1 && ei.value <= 32) {
        this.busWidth = javaDoubleToInt(ei.value);
        this.allocNodes();
      } else ei.setError('must be between 1 and 32');
    }
    if (n === 1) this.threshold = ei.value;
    if (n === 2) {
      this.lookupText = ei.text ?? '';
      this.parseEntries(ei);
    }
  }

  parseEntries(ei: EditInfo | null): void {
    this.entries = [];
    if (this.lookupText.length === 0) return;
    for (const raw of this.lookupText.split('\n')) {
      const line = raw.trim();
      if (line.length === 0) continue;
      const eq = line.indexOf('=');
      if (eq < 0) {
        ei?.setError('missing =: ' + line);
        continue;
      }
      const key = line.substring(0, eq).trim();
      const val = line.substring(eq + 1);
      try {
        const dash = findDash(key);
        if (dash >= 0) {
          const lo = parseNumber(key.substring(0, dash));
          const hi = parseNumber(key.substring(dash + 1));
          this.entries.push(new LookupEntry(lo, hi, val));
        } else {
          const k = parseNumber(key);
          this.entries.push(new LookupEntry(k, k, val));
        }
      } catch {
        // upstream skips a line it can't read
      }
    }
  }

  override getConnection(_n1: number, _n2: number): boolean {
    return false;
  }
}

function findDash(s: string): number {
  const start = /^0[xXbB]/.test(s) ? 2 : 0;
  return s.indexOf('-', start);
}

function parseNumber(str: string): number {
  const s = str.trim();
  if (s.startsWith('0x') || s.startsWith('0X')) return parseJavaIntRadix(s.substring(2), 16);
  if (s.startsWith('0b') || s.startsWith('0B')) return parseJavaIntRadix(s.substring(2), 2);
  return parseJavaInt(s);
}

export const InstructionDisplayElmType = elementType(
  'InstructionDisplayElm',
  InstructionDisplayElm,
);
