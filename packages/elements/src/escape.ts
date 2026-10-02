// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CustomLogicModel.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: escape() and unescape().
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

/** Escape a string for one token of the text format. */
export function escapeToken(s: string): string {
  if (s.length === 0) return '\\0';
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/ /g, '\\s')
    .replace(/\+/g, '\\p')
    .replace(/=/g, '\\q')
    .replace(/#/g, '\\h')
    .replace(/&/g, '\\a')
    .replace(/\r/g, '\\r');
}

const UNESCAPES: Partial<Record<string, string>> = {
  n: '\n',
  r: '\r',
  s: ' ',
  p: '+',
  q: '=',
  h: '#',
  a: '&',
};

/** Undo escapeToken. Any other escaped character stands for itself (so `\\` is a backslash). */
export function unescapeToken(s: string): string {
  if (s === '\\0') return '';
  for (let i = 0; i < s.length; i++) {
    if (s.charAt(i) !== '\\') continue;
    if (i + 1 >= s.length) throw new Error('StringIndexOutOfBoundsException');
    const rep = UNESCAPES[s.charAt(i + 1)];
    s =
      rep === undefined
        ? s.substring(0, i) + s.substring(i + 1)
        : s.substring(0, i) + rep + s.substring(i + 2);
  }
  return s;
}
