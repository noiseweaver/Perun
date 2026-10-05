// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import { AnnotationLayer, PENCIL_WIDTH } from './Annotations.ts';

function line(a: AnnotationLayer, y: number, scale = 1): void {
  a.beginStroke({ x: 0, y }, 0, scale);
  for (let x = 10; x <= 100; x += 10) a.extendStroke({ x, y });
  a.endStroke();
}

describe('AnnotationLayer', () => {
  it('keeps strokes in circuit units, with a fixed screen width', () => {
    const a = new AnnotationLayer();
    line(a, 0, 2);
    expect(a.strokes).toHaveLength(1);
    expect(a.strokes[0]?.width).toBe(PENCIL_WIDTH / 2);
    expect(a.strokes[0]?.points).toHaveLength(11);
  });

  it('undoes strokes, clears, and undoes the clear', () => {
    const a = new AnnotationLayer();
    let changes = 0;
    a.onChange = () => changes++;
    line(a, 0);
    line(a, 50);
    a.undo();
    expect(a.strokes).toHaveLength(1);
    a.clear();
    expect(a.strokes).toHaveLength(0);
    a.undo();
    expect(a.strokes).toHaveLength(1);
    expect(changes).toBe(5);
  });

  it('erases whole strokes it passes near, as one undo step per gesture', () => {
    const a = new AnnotationLayer();
    line(a, 0);
    line(a, 50);
    line(a, 200);
    expect(a.eraseAt({ x: 40, y: 25 }, 1)).toBe(false);
    expect(a.eraseAt({ x: 40, y: 4 }, 1)).toBe(true);
    expect(a.eraseAt({ x: 60, y: 52 }, 1)).toBe(true);
    a.endErase();
    expect(a.strokes).toHaveLength(1);
    a.undo();
    expect(a.strokes).toHaveLength(3);
  });

  it('drops a stroke cancelled by a pinch', () => {
    const a = new AnnotationLayer();
    line(a, 0);
    a.beginStroke({ x: 0, y: 9 }, 1, 1);
    a.cancelStroke();
    expect(a.strokes).toHaveLength(1);
    a.undo();
    expect(a.strokes).toHaveLength(0);
  });

  it('is active while the laser points', () => {
    const a = new AnnotationLayer();
    expect(a.active).toBe(false);
    a.laserTo({ x: 1, y: 1 }, 0);
    expect(a.active).toBe(true);
    a.laserUp();
    expect(a.strokes).toHaveLength(0);
  });
});
