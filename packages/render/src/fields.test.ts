// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import {
  CustomTransformerElm,
  LEDElm,
  PolarCapacitorElm,
  Simulation,
  TappedTransformerElm,
  VaractorElm,
  constructElement,
  type CircuitElm,
} from '@circuitjs-next/elements';
import { BUILTIN_THEMES } from '@circuitjs-next/theme';
import { describe, expect, it } from 'vitest';
import { ALL_FIELDS, FieldOverlay, fadeIn, polarPlateBow } from './fields.ts';
import { Palette } from './palette.ts';

describe('fadeIn', () => {
  it('fades each mark in over its own share of the level, without steps', () => {
    expect(fadeIn(0, 0, 3)).toBe(0);
    expect(fadeIn(1 / 3, 0, 3)).toBeCloseTo(1);
    expect(fadeIn(1 / 3, 1, 3)).toBeCloseTo(0);
    expect(fadeIn(1, 2, 3)).toBe(1);
    // continuous: small level changes give small opacity changes
    for (let l = 0; l < 1; l += 0.001)
      for (let k = 0; k !== 3; k++)
        expect(Math.abs(fadeIn(l + 0.001, k, 3) - fadeIn(l, k, 3))).toBeLessThan(0.01);
  });
});

/** A 2D context that only records the colors of what it strokes and fills. */
function recorder(): { c: CanvasRenderingContext2D; drawn: Set<string> } {
  const drawn = new Set<string>();
  const state: Record<string | symbol, unknown> = { strokeStyle: '', fillStyle: '' };
  const c = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'stroke') return () => drawn.add(String(t['strokeStyle']));
      if (k === 'fill') return () => drawn.add(String(t['fillStyle']));
      return () => undefined;
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { c, drawn };
}

function part<T extends CircuitElm>(cls: string, x2: number, y2: number): T {
  const e = constructElement(cls, 96, 96, new Simulation()) as T;
  e.x2 = x2;
  e.y2 = y2;
  e.setPoints();
  e.allocNodes();
  return e;
}

describe('field overlay', () => {
  const theme = BUILTIN_THEMES.dark;
  const palette = new Palette(theme);
  const show = { ...ALL_FIELDS, energy: false, energyFlow: false, heat: false };
  const draw = (e: CircuitElm): Set<string> => {
    const { c, drawn } = recorder();
    new FieldOverlay().draw(c, [e], palette, { show, running: true, voltageRange: 5, scale: 1 });
    return drawn;
  };

  it('draws the flux of tapped and custom transformers, and nothing with no current', () => {
    const t = part<TappedTransformerElm>('TappedTransformerElm', 224, 96);
    expect(draw(t).has(theme.circuit.magneticField)).toBe(false);
    t.currents[0] = 0.5;
    t.currents[1] = -0.2;
    expect(draw(t).has(theme.circuit.magneticField)).toBe(true);
    const x = part<CustomTransformerElm>('CustomTransformerElm', 224, 96);
    expect(draw(x).has(theme.circuit.magneticField)).toBe(false);
    x.coilCurrents[0] = 0.5;
    expect(draw(x).has(theme.circuit.magneticField)).toBe(true);
  });

  it("widens a varactor's depletion region as its capacitance falls", () => {
    const v = part<VaractorElm>('VaractorElm', 96, 224);
    v.baseCapacitance = 1e-9;
    v.capacitance = 1e-9;
    expect(draw(v).has(theme.circuit.electricField)).toBe(false);
    v.capacitance = 0.4e-9;
    expect(draw(v).has(theme.circuit.electricField)).toBe(true);
  });

  it('shows an LED giving off light when lit, and its depletion region when reversed', () => {
    const led = part<LEDElm>('LEDElm', 96, 224);
    expect(draw(led).size).toBe(0);
    led.current = 0.02;
    expect(draw(led).has(theme.circuit.energy)).toBe(true);
    led.current = 0;
    led.setNodeVoltage(1, 5);
    expect(draw(led).has(theme.circuit.electricField)).toBe(true);
  });

  it("follows a polarized capacitor's curved plate", () => {
    const cap = part<PolarCapacitorElm>('PolarCapacitorElm', 96, 224);
    cap.voltdiff = 5;
    expect(draw(cap).has(theme.circuit.electricField)).toBe(true);
    expect(polarPlateBow(0)).toBe(0);
    // the arc is 5 deep, reached 0.9 of the way to its ends (polarCapacitorView)
    expect(polarPlateBow(12)).toBeCloseTo(5 * (1 - Math.sqrt(1 - 0.81)));
    expect(polarPlateBow(-6)).toBe(polarPlateBow(6));
  });
});
