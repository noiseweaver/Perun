// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

/**
 * What an element sees of the XML format: attributes in, attributes out. The XML parser and
 * printer live in @circuitjs-next/format; these mirror upstream's `XMLSerializer.dumpAttr` and the
 * `XMLDeserializer.parse*Attr` helpers so element code ports line by line.
 */
export interface XmlAttrWriter {
  /** Add an attribute. Throws on a duplicate name, as upstream's `checkAttr` does. */
  dumpAttr(name: string, value: string | number | boolean): void;
}

export interface XmlAttrReader {
  parseIntAttr(name: string, def: number): number;
  parseDoubleAttr(name: string, def: number): number;
  parseBooleanAttr(name: string, def: boolean): boolean;
  parseStringAttr(name: string, def: string): string;
  parseStringAttr(name: string, def: string | null): string | null;
}

/** Adds top-level records (model definitions) to the document being saved. */
export interface XmlDocWriter {
  /** Append a new child of the root with this tag and return a writer for its attributes. */
  addElement(tag: string): XmlAttrWriter;
}
