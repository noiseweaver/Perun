// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/StringTokenizer.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032 (itself from GNU Classpath java.util.StringTokenizer).
// Copyright (C) Paul Falstad and Iain Sharp, Free Software Foundation; port Copyright (C)
// Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

/** `java.util.StringTokenizer` without returned delimiters. */
export class StringTokenizer {
  private pos = 0;
  private readonly str: string;
  private delim: string;

  constructor(str: string, delim = ' \t\n\r\f') {
    this.str = str;
    this.delim = delim;
  }

  hasMoreTokens(): boolean {
    while (this.pos < this.str.length && this.delim.includes(this.str.charAt(this.pos))) this.pos++;
    return this.pos < this.str.length;
  }

  /** The next token; throws (Java's NoSuchElementException) when there is none. */
  nextToken(delim?: string): string {
    if (delim !== undefined) this.delim = delim;
    const len = this.str.length;
    while (this.pos < len && this.delim.includes(this.str.charAt(this.pos))) this.pos++;
    if (this.pos < len) {
      const start = this.pos;
      while (++this.pos < len && !this.delim.includes(this.str.charAt(this.pos)));
      return this.str.substring(start, this.pos);
    }
    throw new Error('NoSuchElementException');
  }
}
