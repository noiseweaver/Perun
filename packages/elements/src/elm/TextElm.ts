// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/TextElm.java and GraphicElm.java
// (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: loading and saving only. The text is
// drawn by the renderer (Phase 4).
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { unescapeToken } from '../escape.ts';
import { javaDoubleToInt, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

/** A text box's own font, or `options` to follow the Options › Text box font setting. */
export type TextFamily = 'options' | 'sans' | 'serif' | 'mono';
export type TextStyleChoice = 'options' | 'regular' | 'bold' | 'italic' | 'boldItalic';
const FAMILIES: readonly TextFamily[] = ['options', 'sans', 'serif', 'mono'];
const STYLES: readonly TextStyleChoice[] = ['options', 'regular', 'bold', 'italic', 'boldItalic'];

/** A text label on the canvas. No posts; not simulated. */
export class TextElm extends CircuitElm {
  static readonly FLAG_BAR = 2;
  static readonly FLAG_ESCAPE = 4;

  text = '';
  lines: string[] = [];
  size = 0;
  color: string | null = null;
  /**
   * Not in upstream (DEVIATIONS.md): font family and style, saved as the extra XML attributes
   * `ff` and `fs`, which upstream ignores. `options` follows the app's text box font setting.
   */
  family: TextFamily = 'options';
  fontStyle: TextStyleChoice = 'options';

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
    if (this.family !== 'options') w.dumpAttr('ff', this.family);
    if (this.fontStyle !== 'options') w.dumpAttr('fs', this.fontStyle);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.size = r.parseIntAttr('si', this.size);
    this.text = r.parseStringAttr('te', this.text);
    this.color = r.parseStringAttr('co', this.color);
    const ff = r.parseStringAttr('ff', null);
    this.family = FAMILIES.find((f) => f === ff) ?? 'options';
    const fs = r.parseStringAttr('fs', null);
    this.fontStyle = STYLES.find((f) => f === fs) ?? 'options';
    this.split();
  }

  override getPostCount(): number {
    return 0;
  }

  /** Text is placed, not dragged out: a click puts it at (xx, yy) with a token length. */
  override drag(xx: number, yy: number): void {
    this.x = xx;
    this.y = yy;
    this.x2 = xx + 16;
    this.y2 = yy;
  }

  override getInfo(arr: string[]): void {
    arr[0] = this.text;
  }

  override canViewInScope(): boolean {
    return false;
  }

  override getElmType(): string {
    return 'text';
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) {
      // upstream: a five-line TextArea showing the text with \n escapes as line breaks
      const ei = EditInfo.text('Text', this.text.replaceAll('\\n', '\n'));
      ei.multiline = true;
      return ei;
    }
    if (n === 1) return new EditInfo('Size', this.size, 5, 100);
    if (n === 2)
      return EditInfo.createCheckbox('Draw Bar On Top', (this.flags & TextElm.FLAG_BAR) !== 0);
    // Upstream shows lightGrayColor (the theme's text color) when no color is set, and stores
    // null when that value comes back. Theme colors live in the renderer here, so the field is
    // empty for the default and empty text means the default.
    if (n === 3) return EditInfo.text('Color', this.color ?? '').setIsColor();
    // fonts are not in upstream (DEVIATIONS.md)
    if (n === 4)
      return EditInfo.createChoice(
        'Font',
        ['Options default', 'Sans serif', 'Serif', 'Monospace'],
        FAMILIES.indexOf(this.family),
      );
    if (n === 5)
      return EditInfo.createChoice(
        'Style',
        ['Options default', 'Regular', 'Bold', 'Italic', 'Bold italic'],
        STYLES.indexOf(this.fontStyle),
      );
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) {
      this.text = (ei.text ?? '').replaceAll('\n', '\\n');
      this.split();
    }
    if (n === 1) this.size = javaDoubleToInt(ei.value);
    if (n === 2) {
      if (ei.checkbox?.state === true) this.flags |= TextElm.FLAG_BAR;
      else this.flags &= ~TextElm.FLAG_BAR;
    }
    if (n === 3) {
      const c = ei.text ?? '';
      this.color = c === '' ? null : c;
    }
    if (n === 4) this.family = FAMILIES[ei.choice?.selected ?? 0] ?? 'options';
    if (n === 5) this.fontStyle = STYLES[ei.choice?.selected ?? 0] ?? 'options';
  }

  override getShortcut(): number {
    return 't'.charCodeAt(0);
  }
}

export const TextElmType = elementType('TextElm', TextElm);
