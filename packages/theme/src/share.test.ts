// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import {
  BUILTIN_THEMES,
  contrastWarnings,
  decodeThemeParam,
  encodeThemeParam,
  minimizeTheme,
  parseTheme,
  resolveTheme,
  themeFileName,
  themeJsonSchema,
  themeToJson,
  type Theme,
} from './index.ts';
import { base64UrlDecode, base64UrlEncode } from './streams.ts';

const dark = BUILTIN_THEMES['dark'] as Theme;

describe('theme links', () => {
  it('round trip every built-in and a customized theme', async () => {
    const custom: Theme = {
      ...dark,
      meta: { ...dark.meta, name: 'Night Bench ⚡', author: 'gady' },
      canvas: { ...dark.canvas, background: 'rgb(10, 12, 14)' },
      scope: { ...dark.scope, traces: ['#ff0', 'hsl(200, 50%, 50%)'] },
    };
    for (const t of [...Object.values(BUILTIN_THEMES), custom]) {
      const r = await decodeThemeParam(await encodeThemeParam(t));
      expect(r.ok && r.theme).toEqual(t);
    }
  });

  it('carry only what differs from the base', async () => {
    const t = resolveTheme({ schemaVersion: 1, meta: { name: 'Mine' }, canvas: { grid: '#123' } });
    expect(minimizeTheme(t)).toEqual({
      schemaVersion: 1,
      meta: { name: 'Mine', base: 'dark' },
      canvas: { grid: '#123' },
    });
    expect((await encodeThemeParam(t)).length).toBeLessThan(120);
  });

  it('keep a theme based on another built-in on that base', () => {
    const t = resolveTheme({ schemaVersion: 1, meta: { base: 'light' }, ui: { accent: '#00f' } });
    expect(t.canvas).toEqual(BUILTIN_THEMES['light']?.canvas);
    expect(minimizeTheme(t)).toEqual({
      schemaVersion: 1,
      meta: { base: 'light' },
      ui: { accent: '#00f' },
    });
  });

  it('reject damaged links', async () => {
    for (const s of ['', '!!!', 'abc', 'AAAA', 'eJzLSM3JyQcABiwCFQ', 'a'.repeat(30000)]) {
      const r = await decodeThemeParam(s);
      expect(r.ok).toBe(false);
    }
  });

  it('base64url', () => {
    for (let n = 0; n < 40; n++) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
      expect(base64UrlDecode(base64UrlEncode(b))).toEqual(b);
    }
    expect(base64UrlEncode(Uint8Array.from([251, 255]))).toBe('-_8');
    expect(base64UrlDecode('a+b')).toBeNull();
  });
});

describe('theme files', () => {
  it('are the full theme and read back', () => {
    const r = parseTheme(JSON.parse(themeToJson(dark)));
    expect(r.ok && r.theme).toEqual(dark);
  });

  it('are named after the theme', () => {
    expect(themeFileName({ ...dark, meta: { ...dark.meta, name: 'Night Bench!' } })).toBe(
      'night-bench.theme.json',
    );
    expect(themeFileName({ ...dark, meta: { ...dark.meta, name: '../../x' } })).toBe(
      'x.theme.json',
    );
    expect(themeFileName({ ...dark, meta: { ...dark.meta, name: '' } })).toBe('theme.theme.json');
  });
});

describe('bases', () => {
  it('only built-ins: prototype names fall back to Dark', () => {
    for (const base of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'nope']) {
      const r = parseTheme({ schemaVersion: 1, meta: { base } });
      expect(r.ok && r.theme.canvas).toEqual(dark.canvas);
    }
  });
});

describe('contrast', () => {
  it('built-ins pass', () => {
    for (const [id, t] of Object.entries(BUILTIN_THEMES))
      expect([id, contrastWarnings(t)]).toEqual([id, []]);
  });

  it('flags text and voltage colors close to their background', () => {
    const t = resolveTheme({
      schemaVersion: 1,
      canvas: { background: '#808080' },
      circuit: { text: '#8a8a8a', voltage: { positive: '#00ff0010' } },
    });
    const keys = contrastWarnings(t).map((w) => w.key);
    expect(keys).toContain('circuit.text');
    expect(keys).toContain('circuit.voltage.positive');
    const w = contrastWarnings(t).find((x) => x.key === 'circuit.text');
    expect(w?.min).toBe(4.5);
    expect(w?.ratio).toBeLessThan(1.2);
  });
});

describe('JSON Schema', () => {
  it('describes every key', () => {
    const s = themeJsonSchema() as {
      properties: Record<string, { properties?: Record<string, { description?: string }> }>;
    };
    for (const group of ['canvas', 'circuit', 'scope', 'ui', 'style'] as const) {
      const props = s.properties[group]?.properties ?? {};
      expect(Object.keys(props)).toEqual(Object.keys(dark[group]));
      for (const v of Object.values(props)) expect(v.description).toBeTruthy();
    }
  });
});
