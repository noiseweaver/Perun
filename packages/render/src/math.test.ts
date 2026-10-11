// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { fixedTex } from '@perun/elements';
import { beforeAll, describe, expect, it } from 'vitest';
import { layoutMath, loadMath, parseTransform } from './math.ts';

describe('formula layout', () => {
  beforeAll(async () => {
    await loadMath();
  });

  it('turns MathJax output into draw operations', () => {
    const l = layoutMath('I = \\frac{V}{R}');
    if (l === null) throw new Error('MathJax not loaded');
    expect(l.error).toBeNull();
    expect(l.width).toBeGreaterThan(2000);
    expect(l.height).toBeGreaterThan(500);
    expect(l.depth).toBeGreaterThan(0);
    // four glyphs and the fraction bar
    expect(l.ops.filter((o) => o.kind === 'path').length).toBe(4);
    expect(l.ops.filter((o) => o.kind === 'rect').length).toBe(1);
  });

  it('reports TeX that does not parse', () => {
    expect(layoutMath('\\frac{a')?.error).toMatch(/brace/i);
    expect(layoutMath('\\nosuchmacro')?.error).toMatch(/undefined/i);
  });

  it('typesets every live value at the same width', () => {
    const widths = [1.5, -1.5, 123.456, -0.0123, 4.7e-6, 0, 2.2e3].map(
      (v) => layoutMath(`x = ${fixedTex(v, 'V')}`)?.width,
    );
    expect(new Set(widths).size).toBe(1);
  });

  it('parses SVG transforms', () => {
    expect(parseTransform('translate(10,5) scale(2)')).toEqual([2, 0, 0, 2, 10, 5]);
    expect(parseTransform('scale(1,-1)')).toEqual([1, 0, 0, -1, 0, 0]);
  });
});
