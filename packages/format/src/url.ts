// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/QueryParameters.java and
// CirSim.java (init: cct, ctz, startCircuit, startCircuitLink, running) (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import LZString from 'lz-string';

/**
 * Query parameters as upstream reads them: split at `&`, then at `=` keeping only the text up to
 * the next `=`, and decoded with GWT's `URL.decode` (JavaScript `decodeURI`, which leaves escapes
 * of reserved characters such as `%24` and `%2B` alone). Later duplicates win.
 */
export function parseQuery(search: string): Map<string, string> {
  const map = new Map<string, string>();
  if (search.length === 0) return map;
  for (const nv of search.substring(1).split('&')) {
    const pair = nv.split('=');
    const name = pair[0] ?? '';
    const value = pair[1];
    // upstream throws on a parameter without "=" and keeps what it read so far
    if (value === undefined) break;
    let decoded: string;
    try {
      decoded = decodeURI(value);
    } catch {
      break;
    }
    map.set(name, decoded);
  }
  return map;
}

/** Upstream `getBooleanValue`: only `1` and `true` (any case) are true. */
export function queryBoolean(q: Map<string, string>, key: string, def: boolean): boolean {
  const v = q.get(key);
  if (v === undefined) return def;
  return v === '1' || v.toLowerCase() === 'true';
}

/** `ctz=` payload: lz-string `compressToEncodedURIComponent` of the circuit. */
export function decompressCircuit(ctz: string): string | null {
  return LZString.decompressFromEncodedURIComponent(ctz) || null;
}

export function compressCircuit(text: string): string {
  return LZString.compressToEncodedURIComponent(text);
}

/** Where the start circuit comes from, in upstream's order of precedence. */
export type StartCircuit =
  | { kind: 'text'; text: string }
  | { kind: 'link'; url: string }
  | { kind: 'example'; file: string; label: string | null }
  | { kind: 'default' };

/** Upstream `CirSim.init()`: `ctz` beats `cct`; then `startCircuitLink`, then `startCircuit`. */
export function startCircuitFromQuery(q: Map<string, string>): StartCircuit {
  let text: string | null = null;
  const cct = q.get('cct');
  if (cct !== undefined) text = cct.replaceAll('%24', '$');
  const ctz = q.get('ctz');
  if (ctz !== undefined) text = decompressCircuit(ctz);
  if (text !== null) return { kind: 'text', text };
  const link = q.get('startCircuitLink');
  if (link !== undefined) return { kind: 'link', url: link };
  const file = q.get('startCircuit');
  if (file !== undefined) return { kind: 'example', file, label: q.get('startLabel') ?? null };
  return { kind: 'default' };
}
