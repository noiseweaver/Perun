// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

/*
 * Fuzz test of the theme decoders (PLAN.md Phase 7 acceptance): malformed input of every kind
 * must come back as an error or as a valid theme, never as an exception, and nothing that gets
 * through may carry CSS, markup or a URL into the page.
 */

import { describe, expect, it } from 'vitest';
import {
  BUILTIN_THEMES,
  decodeThemeParam,
  encodeThemeParam,
  parseColor,
  parseTheme,
  parseThemeJson,
  themeCssVariables,
  themeToJson,
  type Theme,
  type ThemeParseResult,
} from './index.ts';
import { base64UrlEncode, deflateRaw, utf8Encode } from './streams.ts';

/** Deterministic PRNG (mulberry32) so failures reproduce. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NASTY = [
  '',
  ' ',
  'red',
  'url(javascript:alert(1))',
  'expression(alert(1))',
  '#fff; background: url(x)',
  '#fff}body{display:none',
  '</style><script>alert(1)</script>',
  'var(--x)',
  'calc(1px)',
  '\\61 lert',
  'rgb(1,2,3);x:y',
  '#ffffff\n',
  'hsl(1e999, 1e999%, -1e999%)',
  'rgba(NaN, 0, 0)',
  '"Roboto", url(x)',
  "Roboto'; } * { color: red",
  '@import "x"',
  '/*',
  '\u0000',
  '\ud800',
  'a'.repeat(5000),
  '__proto__',
  'constructor',
  'toString',
];

const KEYS = [
  'schemaVersion',
  'meta',
  'canvas',
  'circuit',
  'voltage',
  'scope',
  'traces',
  'ui',
  'style',
  'name',
  'base',
  'background',
  'grid',
  'font',
  'monoFont',
  'strokeWidth',
  'scopeLook',
  '__proto__',
  'constructor',
  'prototype',
];

/** A random JSON value, biased toward theme-shaped objects. */
function randomValue(r: () => number, depth: number): unknown {
  const k = Math.floor(r() * 9);
  if (depth > 4 || k === 0) {
    const leaves: unknown[] = [
      null,
      true,
      0,
      -1,
      1e308,
      -0,
      2.5,
      NASTY[Math.floor(r() * NASTY.length)],
      '#' + Math.floor(r() * 0xffffff).toString(16),
    ];
    return leaves[Math.floor(r() * leaves.length)];
  }
  if (k <= 2) return Array.from({ length: Math.floor(r() * 20) }, () => randomValue(r, depth + 1));
  const o: Record<string, unknown> = {};
  const n = Math.floor(r() * 6);
  for (let i = 0; i < n; i++)
    Object.defineProperty(o, KEYS[Math.floor(r() * KEYS.length)] as string, {
      value: randomValue(r, depth + 1),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  return o;
}

/** Mutate a valid theme: replace, delete or retype one value somewhere in it. */
function mutate(r: () => number, theme: Theme): unknown {
  const t = JSON.parse(JSON.stringify(theme)) as Record<string, unknown>;
  const edits = 1 + Math.floor(r() * 4);
  for (let e = 0; e < edits; e++) {
    let node: Record<string, unknown> = t;
    for (;;) {
      const keys = Object.keys(node);
      if (keys.length === 0) break;
      const key = keys[Math.floor(r() * keys.length)] as string;
      const child = node[key];
      if (typeof child === 'object' && child !== null && r() < 0.6) {
        node = child as Record<string, unknown>;
        continue;
      }
      const roll = r();
      if (roll < 0.2) Reflect.deleteProperty(node, key);
      else if (roll < 0.9) node[key] = randomValue(r, 3);
      else node[key] = NASTY[Math.floor(r() * NASTY.length)];
      break;
    }
  }
  return t;
}

/** Corrupt JSON text: flip, drop or insert characters. */
function corruptText(r: () => number, text: string): string {
  const chars = [...text];
  const n = 1 + Math.floor(r() * 8);
  for (let i = 0; i < n; i++) {
    const at = Math.floor(r() * (chars.length + 1));
    const roll = r();
    const junk = '{}[]",:\\0\u0000\ud800e-.#'[Math.floor(r() * 18)] ?? '';
    if (roll < 0.33) chars.splice(at, 1);
    else if (roll < 0.66) chars.splice(at, 0, junk);
    else chars[at] = junk;
  }
  return chars.join('');
}

const UNSAFE_CSS = new RegExp(
  String.raw`[;{}<>\\@]|/\*|url\s*\(|expression|var\s*\(|javascript:|[\u0000-\u001f]`,
  'i',
);

/** What every accepted theme must satisfy before it reaches the page. */
function expectSafe(r: ThemeParseResult): void {
  if (!r.ok) {
    expect(r.errors.length).toBeGreaterThan(0);
    for (const e of r.errors) expect(typeof e).toBe('string');
    return;
  }
  const t = r.theme;
  expect(t.schemaVersion).toBe(1);
  // complete: every key of the base is present, with a value of the same kind
  const dark = BUILTIN_THEMES['dark'] as Theme;
  for (const group of ['canvas', 'circuit', 'scope', 'ui', 'style'] as const)
    expect(Object.keys(t[group]).sort()).toEqual(Object.keys(dark[group]).sort());
  expect(Object.getPrototypeOf(t.meta)).toBe(Object.prototype);
  const colors = [
    ...Object.values(t.canvas),
    ...Object.values(t.ui),
    ...Object.values(t.circuit.voltage),
    ...Object.entries(t.circuit)
      .filter(([k]) => k !== 'voltage')
      .map(([, v]) => v as string),
    ...Object.entries(t.scope).flatMap(([, v]) => (Array.isArray(v) ? v : [v])),
  ];
  for (const c of colors) {
    expect(typeof c).toBe('string');
    expect(parseColor(c)).not.toBeNull();
  }
  for (const n of [t.style.strokeWidth, t.style.dotRadius]) expect(Number.isFinite(n)).toBe(true);
  for (const v of Object.values(themeCssVariables(t))) expect(v).not.toMatch(UNSAFE_CSS);
  for (const s of Object.values(t.meta)) expect(s.length).toBeLessThanOrEqual(200);
  // and it serializes back to a file that reads the same
  const again = parseThemeJson(themeToJson(t));
  expect(again.ok && again.theme).toEqual(t);
}

const N = 1500;

describe('theme decoder fuzz', () => {
  const themes = Object.values(BUILTIN_THEMES);

  it('random JSON values', () => {
    const r = rng(1);
    for (let i = 0; i < N; i++) {
      const v = randomValue(r, 0);
      expectSafe(parseTheme(v));
      expectSafe(parseTheme({ schemaVersion: 1, ...(v as object) }));
    }
  });

  it('mutated built-ins', () => {
    const r = rng(2);
    for (let i = 0; i < N; i++) {
      const v = mutate(r, themes[i % themes.length] as Theme);
      expectSafe(parseTheme(v));
      expectSafe(parseThemeJson(JSON.stringify(v)));
    }
  });

  it('corrupted JSON text', () => {
    const r = rng(3);
    for (let i = 0; i < N; i++)
      expectSafe(parseThemeJson(corruptText(r, themeToJson(themes[i % themes.length] as Theme))));
  });

  it('hostile JSON text', () => {
    const deep = '['.repeat(5000) + ']'.repeat(5000);
    for (const s of [
      deep,
      '{"schemaVersion":1,"__proto__":{"polluted":true}}',
      '{"schemaVersion":1,"meta":{"__proto__":{"base":"classic"}}}',
      '{"schemaVersion":1,"meta":{"base":"__proto__"}}',
      '{"schemaVersion":1,"scope":{"traces":[]}}',
      '{"schemaVersion":1,"scope":{"traces":' + JSON.stringify(Array(17).fill('#fff')) + '}}',
      '{"schemaVersion":1,"style":{"strokeWidth":1e309}}',
      '{"schemaVersion":"1"}',
      'null',
      '1',
      '"x"',
      '[]',
      '﻿{}',
      ...NASTY,
    ]) {
      expectSafe(parseThemeJson(s));
    }
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('random and damaged links', async () => {
    const r = rng(4);
    const valid = await Promise.all(themes.map((t) => encodeThemeParam(t)));
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < 600; i++) {
      let s: string;
      const roll = r();
      if (roll < 0.3) {
        // random base64url
        s = base64UrlEncode(Uint8Array.from({ length: Math.floor(r() * 300) }, () => r() * 256));
      } else if (roll < 0.7) {
        // a valid link with characters changed
        s = corruptText(r, valid[i % valid.length] as string).replace(/[^A-Za-z0-9_-]/g, 'A');
      } else {
        // valid compression around bad JSON
        const text = corruptText(r, JSON.stringify(mutate(r, themes[i % themes.length] as Theme)));
        jobs.push(
          deflateRaw(utf8Encode(text)).then(async (b) =>
            expectSafe(await decodeThemeParam(base64UrlEncode(b))),
          ),
        );
        continue;
      }
      jobs.push(decodeThemeParam(s).then(expectSafe));
    }
    await Promise.all(jobs);
  });

  it('a compression bomb stops at the size cap', async () => {
    const bomb = base64UrlEncode(await deflateRaw(new Uint8Array(50 * 1024 * 1024).fill(32)));
    expect(bomb.length).toBeLessThan(80_000);
    // past the link length cap already; a smaller bomb gets through to the inflate cap
    expect((await decodeThemeParam(bomb)).ok).toBe(false);
    const small = base64UrlEncode(await deflateRaw(new Uint8Array(4 * 1024 * 1024).fill(32)));
    expect(small.length).toBeLessThan(24 * 1024);
    const r = await decodeThemeParam(small);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/larger than/);
  });

  it('invalid UTF-8 in a link', async () => {
    const b = base64UrlEncode(await deflateRaw(Uint8Array.from([0x7b, 0xff, 0xfe, 0x7d])));
    expect((await decodeThemeParam(b)).ok).toBe(false);
  });
});
