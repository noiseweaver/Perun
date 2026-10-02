// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/TextElm.java and GraphicElm.java
// (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: loading and saving only. The text is
// drawn by the renderer (Phase 4).
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { unescapeToken } from '../escape.ts';
import { parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

/** A text label on the canvas. No posts; not simulated. */
export class TextElm extends CircuitElm {
  static readonly FLAG_BAR = 2;
  static readonly FLAG_ESCAPE = 4;

  text = '';
  lines: string[] = [];
  size = 0;
  color: string | null = null;

  override getClassName(): string {
    return 'TextElm';
  }
  override getDumpType(): number {
    return 'x'.charCodeAt(0);
  }

  override initNew(): void {
    this.text = 'hello';
    this.lines = [this.text];
    this.size = 24;
  }

  override undump(st: StringTokenizer): void {
    this.size = parseJavaInt(st.nextToken());
    this.text = st.nextToken();
    if ((this.flags & TextElm.FLAG_ESCAPE) === 0) {
      // old-style dump before escape/unescape
      while (st.hasMoreTokens()) this.text += ' ' + st.nextToken();
      this.text = this.text.replace(/%2[bB]/g, '+');
    } else {
      // new-style dump
      this.text = unescapeToken(this.text);
    }
    this.split();
  }

  /** Split at `\n` escapes into lines; any other backslash escapes the next character. */
  split(): void {
    this.lines = [];
    let sb = this.text;
    for (let i = 0; i < sb.length; i++) {
      let c = sb.charAt(i);
      if (c === '\\') {
        sb = sb.substring(0, i) + sb.substring(i + 1);
        c = sb.charAt(i);
        if (c === 'n') {
          this.lines.push(sb.substring(0, i));
          sb = sb.substring(i + 1);
          i = -1;
          continue;
        }
      }
    }
    this.lines.push(sb);
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('si', this.size);
    w.dumpAttr('te', this.text);
    if (this.color !== null) w.dumpAttr('co', this.color);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.size = r.parseIntAttr('si', this.size);
    this.text = r.parseStringAttr('te', this.text);
    this.color = r.parseStringAttr('co', this.color);
    this.split();
  }

  override getPostCount(): number {
    return 0;
  }
}

export const TextElmType = elementType('TextElm', TextElm);
