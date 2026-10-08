// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import { arrangeCards, type Box } from './scopeLayout.ts';

const O = { width: 224, height: 144, margin: 48, gap: 32, grid: 16 };
const B: Box = { x1: 0, y1: 0, x2: 800, y2: 480 };

const overlap = (a: Box, b: Box): boolean =>
  a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

describe('arrangeCards', () => {
  it('puts a card on the side nearest its target, level with it', () => {
    const [top, right] = arrangeCards(
      B,
      [
        { x: 400, y: 16 },
        { x: 784, y: 240 },
      ],
      O,
    );
    expect(top).toEqual({ x1: 288, y1: -192, x2: 512, y2: -48 });
    expect(right?.x1).toBe(848);
    // level with the target, to the grid
    expect(Math.abs(((right?.y1 ?? 0) + (right?.y2 ?? 0)) / 2 - 240)).toBeLessThanOrEqual(8);
  });

  it('packs crowded cards an even gap apart, in target order, inside the side', () => {
    const t = [500, 380, 400, 420].map((x) => ({ x, y: 0 }));
    const boxes = arrangeCards(B, t, O);
    const tops = boxes.filter((b) => b.y2 === -48).sort((a, b) => a.x1 - b.x1);
    expect(tops.length).toBe(3);
    for (let k = 1; k < tops.length; k++)
      expect((tops[k]?.x1 ?? 0) - (tops[k - 1]?.x2 ?? 0)).toBe(32);
    expect(tops[0]?.x1).toBeGreaterThanOrEqual(0);
    expect(tops[2]?.x2).toBeLessThanOrEqual(800);
    // left to right in the order of their targets, so the leaders don't cross
    const order = tops.map((b) => boxes.indexOf(b));
    expect(order).toEqual([1, 2, 3]);
  });

  it('never overlaps the circuit or another card, however many there are', () => {
    const t = Array.from({ length: 14 }, (_, i) => ({ x: (i * 97) % 800, y: (i * 61) % 480 }));
    const boxes = arrangeCards(B, t, O);
    boxes.forEach((a, i) => {
      expect(overlap(a, B)).toBe(false);
      boxes.forEach((b, j) => {
        if (i < j) expect(overlap(a, b)).toBe(false);
      });
    });
  });
});
