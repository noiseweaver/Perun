// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import {
  BUILTIN_THEMES,
  mixColor,
  parseColor,
  parseTheme,
  parseThemeJson,
  resolveTheme,
  themeCssVariables,
  toCss,
} from './index.ts';

describe('parseColor', () => {
  it('reads hex, rgb and hsl', () => {
    expect(parseColor('#0f0')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(parseColor('#00ff0080')?.a).toBeCloseTo(128 / 255);
    expect(parseColor('rgb(255, 0, 10)')).toEqual({ r: 255, g: 0, b: 10, a: 1 });
    expect(parseColor('rgba(255 0 10 / 50%)')?.a).toBeCloseTo(0.5);
    const h = parseColor('hsl(120, 100%, 50%)');
    expect(h && [Math.round(h.r), Math.round(h.g), Math.round(h.b)]).toEqual([0, 255, 0]);
  });

  it('rejects anything else', () => {
    for (const s of ['', 'red', '#12', '#gggggg', 'url(x)', 'rgb(1,2)', 'hsl(1%, 2, 3)', 'x#fff'])
      expect(parseColor(s)).toBeNull();
  });

  it('mixes like upstream Color(c1, c2, mix)', () => {
    const gray = { r: 128, g: 128, b: 128, a: 1 };
    const green = { r: 0, g: 255, b: 0, a: 1 };
    expect(mixColor(gray, green, 0.5)).toEqual({ r: 64, g: 191, b: 64, a: 1 });
    expect(toCss({ r: 64, g: 191, b: 64, a: 1 })).toBe('#40bf40');
  });
});

describe('themes', () => {
  it('built-ins are complete and valid', () => {
    for (const t of Object.values(BUILTIN_THEMES)) {
      const r = parseTheme(t);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.theme).toEqual(t);
    }
  });

  it('fills missing keys from the base', () => {
    const t = resolveTheme({ schemaVersion: 1, meta: { base: 'dark' }, canvas: { grid: '#123' } });
    expect(t.canvas.grid).toBe('#123');
    expect(t.canvas.background).toBe(BUILTIN_THEMES['dark']?.canvas.background);
    expect(t.circuit.voltage.zero).toBe(BUILTIN_THEMES['dark']?.circuit.voltage.zero);
  });

  it('rejects bad colors, fonts and oversized input, and drops unknown keys', () => {
    expect(parseTheme({ schemaVersion: 1, canvas: { background: 'url(evil)' } }).ok).toBe(false);
    expect(parseTheme({ schemaVersion: 1, style: { font: 'x; background: url(a)' } }).ok).toBe(
      false,
    );
    expect(parseTheme({ schemaVersion: 2 }).ok).toBe(false);
    expect(parseThemeJson('{').ok).toBe(false);
    expect(parseThemeJson(' '.repeat(20000)).ok).toBe(false);
    const r = parseTheme({ schemaVersion: 1, extra: 1, ui: { nope: '#fff' } });
    expect(r.ok && 'extra' in r.theme).toBe(false);
  });

  it('exposes UI tokens as CSS variables', () => {
    const vars = themeCssVariables(BUILTIN_THEMES['classic'] as never);
    expect(vars['--ui-surface-alt']).toBe(BUILTIN_THEMES['classic']?.ui.surfaceAlt);
    expect(vars['--canvas-background']).toBe(BUILTIN_THEMES['classic']?.canvas.background);
  });

  it('has a Classic Dots built-in: Classic colors on a dot grid', () => {
    const t = BUILTIN_THEMES['classic-dots'];
    expect(t?.style.grid).toBe('dots');
    expect(t?.circuit).toEqual(BUILTIN_THEMES['classic']?.circuit);
  });
});
