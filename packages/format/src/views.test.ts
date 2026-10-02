// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import {
  viewFor,
  type DrawContext,
  type Ink,
  type Painter,
  type Pt,
} from '@circuitjs-next/elements';
import { describe, expect, it } from 'vitest';
import { readCircuit } from './circuit.ts';
import { GALLERIES } from './testdata/galleries.ts';

/** Records every coordinate and ink a view draws with. */
class RecordingPainter implements Painter {
  points: Pt[] = [];
  inks: Ink[] = [];
  texts: string[] = [];
  private use(pts: readonly Pt[], ink?: Ink): void {
    this.points.push(...pts);
    if (ink) this.inks.push(ink);
  }
  line(a: Pt, b: Pt, ink: Ink): void {
    this.use([a, b], ink);
  }
  polyline(points: readonly Pt[], ink: Ink): void {
    this.use(points, ink);
  }
  fillPolygon(points: readonly Pt[], ink: Ink): void {
    this.use(points, ink);
  }
  circle(c: Pt, r: number, ink: Ink): void {
    this.use([c, { x: c.x + r, y: c.y }], ink);
  }
  fillCircle(c: Pt, r: number, ink: Ink): void {
    this.circle(c, r, ink);
  }
  text(s: string, at: Pt, ink: Ink): void {
    this.texts.push(s);
    this.use([at], ink);
  }
  measureText(s: string): number {
    return s.length * 7;
  }
  fontSize(): number {
    return 12;
  }
  dots(a: Pt, b: Pt): void {
    this.use([a, b]);
  }
}

describe('element views', () => {
  it.each(GALLERIES.map((g, i) => [i + 1, g] as const))(
    'draw every tier-1 element in gallery %i with finite geometry',
    (_n, text) => {
      const c = readCircuit(text);
      expect(c.warnings).toEqual([]);
      c.sim.step(0); // analyze and stamp, as the app does when paused
      for (const highlighted of [false, true]) {
        for (const e of c.elements) {
          const view = viewFor(e);
          if (view === null) throw new Error(`no view for ${e.constructor.name}`);
          const painter = new RecordingPainter();
          const ctx: DrawContext = {
            painter,
            highlighted,
            showValues: true,
            euroResistors: highlighted,
            showOhm: false,
            dotCount: () => 0,
          };
          view.draw(e as never, ctx);
          expect(painter.points.length, e.constructor.name).toBeGreaterThan(0);
          for (const p of painter.points) {
            expect(Number.isFinite(p.x) && Number.isFinite(p.y), e.constructor.name).toBe(true);
          }
          const box = view.bbox(e as never);
          for (const v of [box.x1, box.y1, box.x2, box.y2]) expect(Number.isFinite(v)).toBe(true);
          expect(box.x2).toBeGreaterThanOrEqual(box.x1);
          expect(box.y2).toBeGreaterThanOrEqual(box.y1);
        }
      }
    },
  );

  it('label resistors with their value like upstream', () => {
    const c = readCircuit('$ 1 0.000005 10 50 5 50 5e-11\nr 48 96 48 192 0 1500\n');
    const painter = new RecordingPainter();
    const e = c.elements[0];
    const view = e && viewFor(e);
    if (!e || !view) throw new Error('no resistor view');
    view.draw(e as never, {
      painter,
      highlighted: false,
      showValues: true,
      euroResistors: false,
      showOhm: false,
      dotCount: () => 0,
    });
    expect(painter.texts).toEqual(['1.5k']);
  });
});
