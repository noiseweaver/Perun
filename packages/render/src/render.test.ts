// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { CURRENT_TOO_FAST } from '@circuitjs-next/elements';
import { BUILTIN_THEMES } from '@circuitjs-next/theme';
import { describe, expect, it } from 'vitest';
import { DotCounters, currentMultiplier, updateDotCount } from './dots.ts';
import { COLOR_SCALE_COUNT, Palette } from './palette.ts';
import { Viewport } from './Viewport.ts';

describe('palette', () => {
  const theme = BUILTIN_THEMES.classic;
  const p = new Palette(theme);

  it('maps voltages onto the theme scale like getVoltageColor', () => {
    expect(p.scale).toHaveLength(COLOR_SCALE_COUNT);
    expect(p.voltage(0, 5)).toBe(p.scale[100]);
    expect(p.voltage(-5, 5)).toBe(p.scale[0]);
    expect(p.voltage(5, 5)).toBe(p.scale[200]);
    expect(p.voltage(1e9, 5)).toBe(p.scale[200]);
    expect(p.voltage(NaN, 5)).toBe(p.scale[100]);
    expect(p.voltage(2.5, 5)).toBe(p.scale[150]);
  });

  it('takes roles from the theme', () => {
    expect(p.roles.component).toBe(theme.circuit.component);
    expect(new Palette(BUILTIN_THEMES.dark).roles.component).toBe(
      BUILTIN_THEMES.dark.circuit.component,
    );
  });
});

describe('current dots', () => {
  it('scales with elapsed time and the current slider', () => {
    const m = currentMultiplier(16, 50, true);
    expect(m).toBeCloseTo(1.7 * 16 * Math.exp(50 / 3.5 - 14.2));
    expect(currentMultiplier(16, 50, false)).toBe(-m);
  });

  it('advances like updateDotCount', () => {
    expect(updateDotCount(1, 0, 3)).toBe(3);
    expect(updateDotCount(1, 4, 5)).toBe(9); // wraps cadd, not the total
    expect(updateDotCount(1, 0, 7)).toBe(CURRENT_TOO_FAST);
    expect(updateDotCount(1, CURRENT_TOO_FAST, 2)).toBe(2);
    const d = new DotCounters();
    const elm = {};
    expect(d.advance(elm, 0, 1, 2, true)).toBe(2);
    expect(d.advance(elm, 0, 1, 2, false)).toBe(2);
    expect(d.advance(elm, 0, NaN, 2, true)).toBe(2);
    expect(d.get(elm, 1)).toBe(0);
  });
});

describe('viewport', () => {
  it('fits like centerCircuit', () => {
    const v = new Viewport();
    v.fit({ x1: 0, y1: 0, x2: 360, y2: 200 }, 1000, 600);
    expect(v.scale).toBeCloseTo(Math.min(1000 / 500, 600 / 300, 1.5));
    const c = v.toScreen(180, 100);
    expect(c.x).toBeCloseTo(500);
    expect(c.y).toBeCloseTo(300);
  });

  it('zooms around the cursor within limits', () => {
    const v = new Viewport();
    v.zoomAt(2, 100, 50);
    expect(v.toScreen(100, 50)).toEqual({ x: 100, y: 50 });
    v.zoomAt(100, 0, 0);
    expect(v.scale).toBe(2.5);
    v.zoomAt(1e-3, 0, 0);
    expect(v.scale).toBe(0.2);
    const back = v.toCircuit(...(Object.values(v.toScreen(7, 9)) as [number, number]));
    expect(back.x).toBeCloseTo(7);
    expect(back.y).toBeCloseTo(9);
  });
});
