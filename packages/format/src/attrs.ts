// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/XMLSerializer.java and
// XMLDeserializer.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: dumpAttr and the
// parse*Attr helpers.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import {
  parseJavaBoolean,
  parseJavaDouble,
  parseJavaInt,
  type XmlAttrReader,
  type XmlAttrWriter,
} from '@circuitjs-next/elements';
import { XmlElement } from './xml.ts';

/** Writes attributes onto one element, as upstream `XMLSerializer.dumpAttr`. */
export class AttrWriter implements XmlAttrWriter {
  readonly elem: XmlElement;

  constructor(elem: XmlElement) {
    this.elem = elem;
  }

  dumpAttr(name: string, value: string | number | boolean): void {
    if (this.elem.getAttribute(name) !== null) throw new Error('naming conflict: ' + name);
    if (typeof value === 'string') {
      // `>` doesn't need escaping
      value = value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        .replace(/</g, '&lt;');
      this.elem.setAttribute(name, value);
    } else {
      // String.valueOf(int/double/boolean) in the GWT build is the JS conversion
      this.elem.setAttribute(name, String(value));
    }
  }

  setAttribute(name: string, value: string): void {
    this.elem.setAttribute(name, value);
  }

  appendText(text: string): void {
    this.elem.appendChild({ text });
  }

  addChild(tag: string): AttrWriter {
    const e = new XmlElement(tag);
    this.elem.appendChild(e);
    return new AttrWriter(e);
  }
}

/** Reads attributes of one element, as upstream `XMLDeserializer.parse*Attr`. */
export class AttrReader implements XmlAttrReader {
  elem: XmlElement;

  constructor(elem: XmlElement) {
    this.elem = elem;
  }

  getTagName(): string {
    return this.elem.name;
  }

  parseContents(): string | null {
    return this.elem.firstText();
  }

  getChildElements(): AttrReader[] {
    return this.elem.elements().map((e) => new AttrReader(e));
  }

  parseDoubleAttr(name: string, def: number): number {
    const v = this.elem.getAttribute(name);
    return v === null ? def : parseJavaDouble(v);
  }

  parseIntAttr(name: string, def: number): number {
    const v = this.elem.getAttribute(name);
    return v === null ? def : parseJavaInt(v);
  }

  parseBooleanAttr(name: string, def: boolean): boolean {
    const v = this.elem.getAttribute(name);
    return v === null ? def : parseJavaBoolean(v);
  }

  parseStringAttr(name: string, def: string): string;
  parseStringAttr(name: string, def: string | null): string | null;
  parseStringAttr(name: string, def: string | null): string | null {
    const s = this.elem.getAttribute(name);
    if (s === null) return def;
    // undo dumpAttr's escaping (the XML parser already undid prettyPrint's)
    return s
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }
}
