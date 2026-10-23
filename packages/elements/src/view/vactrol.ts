// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Not in upstream (docs/deviations/vactrol.md): the vactrol symbol, a light source and a
// light-dependent resistor facing each other in one box.

import { LampElm } from '../elm/LampElm.ts';
import { LEDElm } from '../elm/LEDElm.ts';
import type { VactrolElm } from '../elm/VactrolElm.ts';
import { MUTED, TEXT, UNITS_FONT, VALUE_FONT, vInk, type ElementView } from './common.ts';
import { calcArrow, distance, rectOf, type Rect } from './geometry.ts';
import type { DrawContext, Ink, Pt } from './Painter.ts';
import { ledView } from './semis.ts';
import { getFixedUnitText, OHM } from './units.ts';

/** Radius of the circle round the light-dependent resistor. */
const CELL_R = 18;

/** A part's own dot counters, kept apart from the parent's (slots from `base` up). */
function partContext(ctx: DrawContext, base: number): DrawContext {
  return { ...ctx, dotCount: (slot, current) => ctx.dotCount(base + slot, current) };
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** The box, with room for the model name above and the resistance below. */
function vactrolRect(e: VactrolElm): Rect {
  const r = rectOf([...(e.chip?.rectPoints ?? []), ...e.posts.filter((p) => p !== undefined)]);
  return { x1: r.x1, y1: r.y1 - 16, x2: r.x2, y2: r.y2 + 16 };
}

export const vactrolView: ElementView<VactrolElm> = {
  draw(e, ctx) {
    const chip = e.chip;
    if (chip === null || e.postCount !== 4 || e.sourceEnds.length !== 2) return;
    const p = ctx.painter;
    const box = chip.rectPoints;
    p.polyline(box, MUTED, { closed: true });
    const ends = [...e.sourceEnds, ...e.cellEnds];
    for (let i = 0; i !== 4; i++) {
      const a = e.posts[i];
      const b = ends[i];
      p.line(a, b, vInk(e.volts[i] ?? 0));
      p.dots(a, b, ctx.dotCount(i, -e.getCurrentIntoNode(i)));
    }

    // the light source draws itself, glowing with its current or filament temperature
    e.placeSource();
    const s = e.source;
    if (s instanceof LEDElm) ledView.draw(s, partContext(ctx, 10));
    else if (s instanceof LampElm) drawLamp(s, ctx);

    // the light-dependent resistor: a resistor in a circle, lit by the light level
    const [c1, c2] = e.cellEnds;
    const center = mid(c1, c2);
    const light = Math.min(Math.max(e.light(), 0), 1);
    if (light > 0.01) {
      const ring: Pt[] = [];
      for (let i = 0; i !== 24; i++) {
        const a = (i * Math.PI) / 12;
        ring.push({ x: center.x + CELL_R * Math.cos(a), y: center.y + CELL_R * Math.sin(a) });
      }
      // circuit data like the LED's own glow: its color, as bright as the light level
      const led = s instanceof LEDElm ? s : null;
      const rgb: [number, number, number] =
        led !== null
          ? [
              Math.trunc(led.colorR * 255),
              Math.trunc(led.colorG * 255),
              Math.trunc(led.colorB * 255),
            ]
          : [255, 220, 120];
      p.fillPolygon(ring, { rgb }, 0.15 + 0.35 * light);
    }
    p.circle(center, CELL_R, MUTED);
    cellBody(e, ctx, c1, c2);

    // two arrows: light from the source onto the resistor
    const ux = e.ux;
    const uy = e.uy;
    const from = mid(e.sourceEnds[0], e.sourceEnds[1]);
    const gap = distance(from, center);
    for (const off of [-5, 5]) {
      const a = { x: from.x + ux * 14 - uy * off, y: from.y + uy * 14 + ux * off };
      const b = {
        x: from.x + ux * (gap - CELL_R - 2) - uy * off,
        y: from.y + uy * (gap - CELL_R - 2) + ux * off,
      };
      p.line(a, b, MUTED, { width: 1 });
      p.fillPolygon(calcArrow(a, b, 5, 2), MUTED);
    }

    const r = rectOf(box);
    const cx = (r.x1 + r.x2) / 2;
    p.text(e.presetId, { x: cx, y: r.y1 - 4 }, TEXT, { ...UNITS_FONT, size: 11, align: 'center' });
    if (ctx.showValues)
      // fixed width, so the text stays still as the resistance changes
      p.text(getFixedUnitText(e.resistance(), OHM), { x: cx, y: r.y2 + 13 }, TEXT, {
        ...VALUE_FONT,
        align: 'center',
      });
  },
  bbox: vactrolRect,
};

/** The resistor between the two inner ends: a zigzag, or a box for IEC resistors. */
function cellBody(e: VactrolElm, ctx: DrawContext, a: Pt, b: Pt): void {
  const len = distance(a, b);
  const ux = (b.x - a.x) / (len || 1);
  const uy = (b.y - a.y) / (len || 1);
  const at = (x: number, y: number): Pt => ({ x: a.x + ux * x - uy * y, y: a.y + uy * x + ux * y });
  const ink: Ink = { gradient: { from: a, to: b, v1: e.volts[2] ?? 0, v2: e.volts[3] ?? 0 } };
  const hs = 5;
  if (!ctx.euroResistors) {
    const zig: Pt[] = [at(0, 0)];
    for (let i = 0; i < 4; i++)
      zig.push(at(((1 + 4 * i) * len) / 16, hs), at(((3 + 4 * i) * len) / 16, -hs));
    zig.push(at(len, 0));
    ctx.painter.polyline(zig, ink);
  } else {
    ctx.painter.polyline([at(0, -hs), at(len, -hs), at(len, hs), at(0, hs)], ink, {
      closed: true,
    });
  }
}

/**
 * A small lamp (a circle with a cross, which fits the box better than the full bulb), filled
 * with the filament's color at its temperature.
 */
function drawLamp(s: LampElm, ctx: DrawContext): void {
  const p = ctx.painter;
  const a = s.point1;
  const b = s.point2;
  const len = distance(a, b) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const center = mid(a, b);
  const r = 11;
  const e1 = { x: center.x - ux * r, y: center.y - uy * r };
  const e2 = { x: center.x + ux * r, y: center.y + uy * r };
  p.line(a, e1, vInk(s.volts[0] ?? 0));
  p.line(e2, b, vInk(s.volts[1] ?? 0));
  p.fillCircle(center, r, { rgb: s.getTempColor() });
  p.circle(center, r, MUTED);
  const d = r * Math.SQRT1_2;
  const ink = vInk(((s.volts[0] ?? 0) + (s.volts[1] ?? 0)) / 2);
  p.line({ x: center.x - d, y: center.y - d }, { x: center.x + d, y: center.y + d }, ink);
  p.line({ x: center.x - d, y: center.y + d }, { x: center.x + d, y: center.y - d }, ink);
  const c = ctx.dotCount(10, s.current);
  p.dots(a, e1, c);
  p.dots(b, e2, -c);
}
