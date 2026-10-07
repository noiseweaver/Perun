// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// The heat visualization (Options > Visualizations > Heat): which parts it labels, and with what.

import { readCircuit } from '@circuitjs-next/format';
import { FieldOverlay, NO_FIELDS, Palette } from '@circuitjs-next/render';
import { BUILTIN_THEMES } from '@circuitjs-next/theme';
import { describe, expect, it } from 'vitest';

/** 10 V across 100 Ω (1 W) and 10 V across 10 kΩ (10 mW). */
const TWO =
  '$ 1 0.000005 10.2 50 5 50 5e-11\n' +
  'v 96 320 96 96 0 0 40.0 10.0 0.0 0.0 0.5\n' +
  'r 96 96 256 96 0 100\n' +
  'w 256 96 256 320 0\n' +
  'w 256 320 96 320 0\n' +
  'r 96 96 96 0 0 10000\n' +
  'w 96 0 256 0 0\n' +
  'w 256 0 256 96 0\n' +
  'g 96 320 96 352 0\n';

/** A canvas context that accepts every call and draws nothing. */
function nullContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, k) =>
      k === 'createRadialGradient' || k === 'createLinearGradient'
        ? () => gradient
        : k === 'measureText'
          ? (s: string) => ({ width: s.length * 5 })
          : () => undefined,
    set: () => true,
  });
}

function labels(selfHeating: boolean): string[] {
  const c = readCircuit(TWO);
  c.sim.selfHeating = selfHeating;
  c.sim.setElements(c.elements);
  c.sim.step(4000);
  const overlay = new FieldOverlay();
  overlay.draw(nullContext(), c.elements, new Palette(BUILTIN_THEMES.dark), {
    show: { ...NO_FIELDS, heat: true },
    running: true,
    voltageRange: 5,
    scale: 1,
  });
  return overlay.heat.map((h) => h.text);
}

describe('heat visualization', () => {
  it('labels where each part would settle while self-heating is off', () => {
    // 27 °C + 1 W × 250 °C/W; the 10 mW resistor is 2.5 °C up: a glow but no label
    expect(labels(false)).toEqual(['  277 °C', '']);
  });

  it('labels the simulated temperature with self-heating on', () => {
    // 20 ms is two time constants: 27 + 250 (1 - e^-2) = 243
    const [hot] = labels(true);
    expect(hot).toBe('  243 °C');
    // every label has the same width
    expect(hot).toHaveLength('  277 °C'.length);
  });
});
