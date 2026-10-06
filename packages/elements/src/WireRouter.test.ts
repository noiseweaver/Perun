// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { Simulation } from '@circuitjs-next/engine';
import { describe, expect, it } from 'vitest';
import type { CircuitElm } from './CircuitElm.ts';
import { ResistorElm } from './elm/ResistorElm.ts';
import { RoutedWireElm } from './elm/RoutedWireElm.ts';
import './view/index.ts';

function circuit(...elms: CircuitElm[]): { sim: Simulation; elms: CircuitElm[] } {
  const sim = new Simulation();
  const list = [...elms];
  sim.currentElements = () => list;
  for (const e of elms) {
    e.sim = sim;
    e.setPoints();
  }
  return { sim, elms: list };
}

function wire(sim: Simulation, x1: number, y1: number, x2: number, y2: number): RoutedWireElm {
  const w = new RoutedWireElm(x1, y1, x2, y2, 0);
  w.sim = sim;
  w.setPoints();
  return w;
}

const pts2 = (rp: { x: number; y: number }[]): string => rp.map((p) => `${p.x},${p.y}`).join(' ');
const pts = (w: RoutedWireElm): string =>
  w
    .route()
    .map((p) => `${p.x},${p.y}`)
    .join(' ');

describe('WireRouter', () => {
  it('runs straight, or with one bend, when nothing is in the way', () => {
    const { sim } = circuit();
    expect(pts(wire(sim, 0, 0, 160, 0))).toBe('0,0 160,0');
    const l = wire(sim, 0, 0, 64, 96).route();
    expect(l).toHaveLength(3);
    expect(l[0]).toMatchObject({ x: 0, y: 0 });
    expect(l[2]).toMatchObject({ x: 64, y: 96 });
  });

  it('goes around a resistor in its path, never through its body', () => {
    const r = new ResistorElm(80, 16, 80, 112, 0);
    const { sim } = circuit(r);
    const rp = wire(sim, 0, 64, 160, 64).route();
    expect(rp.length, pts2(rp)).toBeGreaterThan(2);
    for (let i = 0; i < rp.length - 1; i++) {
      const a = rp[i];
      const b = rp[i + 1];
      // no segment crosses the resistor's body (between its leads, y 48 to 80)
      if (a.y === b.y && Math.min(a.x, b.x) <= 80 && Math.max(a.x, b.x) >= 80)
        expect(a.y < 48 || a.y > 80, pts2(rp)).toBe(true);
    }
    expect(rp[0]).toMatchObject({ x: 0, y: 64 });
    expect(rp[rp.length - 1]).toMatchObject({ x: 160, y: 64 });
  });

  it('keeps a route while the ends stay, and reroutes through a dragged point', () => {
    const { sim } = circuit();
    const w = wire(sim, 0, 0, 160, 0);
    w.rerouteVia(80, 64);
    const via = w.route();
    expect(via.some((p) => p.y === 64)).toBe(true);
    w.setPoints();
    expect(w.route()).toBe(via);
  });
});
