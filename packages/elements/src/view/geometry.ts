// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CircuitElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: interpPoint, interpPoint2, calcLeads, calcArrow
// (the rounding matters: views land on the same pixels as upstream).
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Pt } from './Painter.ts';

export const pt = (x: number, y: number): Pt => ({ x, y });

/** Point a fraction f from a to b, offset g perpendicular (positive: to the right of a->b). */
export function interp(a: Pt, b: Pt, f: number, g = 0): Pt {
  if (g === 0) {
    return pt(
      Math.floor(a.x * (1 - f) + b.x * f + 0.48),
      Math.floor(a.y * (1 - f) + b.y * f + 0.48),
    );
  }
  const gx = b.y - a.y;
  const gy = a.x - b.x;
  g /= Math.sqrt(gx * gx + gy * gy);
  return pt(
    Math.floor(a.x * (1 - f) + b.x * f + g * gx + 0.48),
    Math.floor(a.y * (1 - f) + b.y * f + g * gy + 0.48),
  );
}

/** The two points fraction f from a to b, offset +g and -g across the line. */
export function interp2(a: Pt, b: Pt, f: number, g: number): [Pt, Pt] {
  return [interp(a, b, f, g), interp(a, b, f, -g)];
}

export function distance(a: Pt, b: Pt): number {
  const x = a.x - b.x;
  const y = a.y - b.y;
  return Math.sqrt(x * x + y * y);
}

/** Lead ends for a body `len` long centred between p1 and p2 (upstream `calcLeads`). */
export function calcLeads(p1: Pt, p2: Pt, dn: number, len: number): [Pt, Pt] {
  if (dn < len || len === 0) return [p1, p2];
  return [interp(p1, p2, (dn - len) / (2 * dn)), interp(p1, p2, (dn + len) / (2 * dn))];
}

/** Arrow head at b pointing away from a, `al` long and `aw` half wide. */
export function calcArrow(a: Pt, b: Pt, al: number, aw: number): Pt[] {
  const adx = b.x - a.x;
  const ady = b.y - a.y;
  const l = Math.sqrt(adx * adx + ady * ady);
  const [p1, p2] = interp2(a, b, 1 - al / l, aw);
  return [b, p1, p2];
}

/** Java int sign. */
export const sign = (x: number): number => (x < 0 ? -1 : x === 0 ? 0 : 1);

/** Axis-aligned box in circuit coordinates. */
export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function rectOf(points: readonly Pt[]): Rect {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const p of points) {
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x);
    y2 = Math.max(y2, p.y);
  }
  return { x1, y1, x2, y2 };
}

/** Box around the segment p1-p2 widened by w on both sides (upstream `setBbox(p1, p2, w)`). */
export function boxAround(p1: Pt, p2: Pt, w: number): Rect {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dn = Math.sqrt(dx * dx + dy * dy) || 1;
  const ox = (dy / dn) * w;
  const oy = (-dx / dn) * w;
  return rectOf([
    pt(p1.x + ox, p1.y + oy),
    pt(p1.x - ox, p1.y - oy),
    pt(p2.x + ox, p2.y + oy),
    pt(p2.x - ox, p2.y - oy),
  ]);
}

export function unionRect(a: Rect, b: Rect): Rect {
  return {
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
    x2: Math.max(a.x2, b.x2),
    y2: Math.max(a.y2, b.y2),
  };
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
}
