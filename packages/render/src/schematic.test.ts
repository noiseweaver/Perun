// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { Simulation, constructElement, type CircuitElm } from '@perun/elements';
import { BUILTIN_THEMES } from '@perun/theme';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEMATIC, schematicBounds, schematicSvg } from './schematic.ts';

function parts(): CircuitElm[] {
  const sim = new Simulation();
  const r = constructElement('ResistorElm', 96, 96, sim) as CircuitElm;
  r.x2 = 192;
  r.y2 = 96;
  r.setPoints();
  const w = constructElement('WireElm', 192, 96, sim) as CircuitElm;
  w.x2 = 192;
  w.y2 = 192;
  w.setPoints();
  for (const e of [r, w]) e.allocNodes();
  return [r, w];
}

describe('schematic export', () => {
  it('covers every element with a margin', () => {
    const b = schematicBounds(parts()) ?? { x1: 0, y1: 0, x2: 0, y2: 0 };
    expect(b.x1).toBeLessThan(96);
    expect(b.x2).toBeGreaterThan(192);
    expect(b.y2).toBeGreaterThan(192);
    expect(schematicBounds([])).toBeNull();
  });

  it('writes an SVG in the theme colors, with values and no current dots', () => {
    const theme = BUILTIN_THEMES.light;
    const svg = schematicSvg(parts(), theme, DEFAULT_SCHEMATIC);
    expect(svg).not.toBeNull();
    expect(svg).toMatch(/^<\?xml[^]*<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain(`fill="${theme.canvas.background}"`);
    expect(svg).toContain(`stroke="${theme.circuit.component}"`);
    // the resistor's value
    expect(svg).toMatch(/<text[^>]*>1k/);
    // the wire's open end is a post
    expect(svg).toContain(`fill="${theme.circuit.post}"`);
    const bare = schematicSvg(parts(), theme, {
      ...DEFAULT_SCHEMATIC,
      transparent: true,
      showValues: false,
    });
    expect(bare).not.toContain(`fill="${theme.canvas.background}"`);
    expect(bare).not.toMatch(/<text[^>]*>1k/);
  });

  it('colors by voltage with gradients when asked', () => {
    const svg = schematicSvg(parts(), BUILTIN_THEMES.dark, {
      ...DEFAULT_SCHEMATIC,
      voltageColors: true,
    });
    expect(svg).toContain('<linearGradient');
  });
});
