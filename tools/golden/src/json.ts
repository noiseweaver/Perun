// SPDX-License-Identifier: GPL-2.0-or-later
// Fixture JSON encoding. JSON has no NaN or Infinity, so non-finite numbers are stored as the
// strings "NaN", "Infinity" and "-Infinity". Finite doubles round-trip exactly through
// JSON.stringify/JSON.parse. Each sample goes on one line to keep fixtures diffable.

import type { GoldenFixture } from './types.ts';

const NON_FINITE = new Set(['NaN', 'Infinity', '-Infinity']);

function encodeValue(_key: string, value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return value;
}

function decodeValue(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && NON_FINITE.has(value)) return Number(value);
  return value;
}

/** Serialize a fixture deterministically: fixed key order from the object, one sample per line. */
export function formatFixture(fixture: GoldenFixture): string {
  const { samples, ...rest } = fixture;
  // Arrays of numbers and strings go on one line.
  const head = JSON.stringify({ ...rest, samples: [] }, encodeValue, 2).replace(
    /\[\n\s*([^[\]{}]*?)\n\s*\]/g,
    (_m, items: string) => `[${items.split(/,\n\s*/).join(', ')}]`,
  );
  if (samples.length === 0) return head + '\n';
  const lines = samples.map((s) => '    ' + JSON.stringify(s, encodeValue));
  return head.replace(/"samples": \[\]\n\}$/, `"samples": [\n${lines.join(',\n')}\n  ]\n}`) + '\n';
}

export function parseFixture(text: string): GoldenFixture {
  return JSON.parse(text, decodeValue) as GoldenFixture;
}
