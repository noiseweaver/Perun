// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Fitting follows CircuitJS1 UIManager.centerCircuit and MouseManager.zoomCircuit
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.

import type { Rect } from '@perun/elements';

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 2.5;

/** The scale `Viewport.fit` picks for `bounds` in a width x height area. */
export function fitScale(bounds: Rect | null, width: number, height: number): number {
  let scale = 1;
  if (bounds !== null) {
    const bw = bounds.x2 - bounds.x1;
    const bh = bounds.y2 - bounds.y1;
    scale = Math.min(width / (bw + 140), height / (bh + 100));
  }
  scale = Math.min(scale, 1.5);
  return scale > 0 ? scale : 1;
}

/** Circuit-to-screen transform in CSS pixels: screen = circuit * scale + offset. */
export class Viewport {
  scale = 1;
  offsetX = 0;
  offsetY = 0;

  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY };
  }

  toCircuit(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.offsetX) / this.scale, y: (sy - this.offsetY) / this.scale };
  }

  /** Centre `bounds` in a width x height area with a margin, at most 1.5x (upstream centerCircuit). */
  fit(bounds: Rect | null, width: number, height: number): void {
    const scale = fitScale(bounds, width, height);
    this.scale = scale;
    this.offsetX = 0;
    this.offsetY = 0;
    if (bounds !== null) {
      this.offsetX = (width - (bounds.x2 - bounds.x1) * scale) / 2 - bounds.x1 * scale;
      this.offsetY = (height - (bounds.y2 - bounds.y1) * scale) / 2 - bounds.y1 * scale;
    }
  }

  /** Zoom by `factor` keeping the circuit point under (sx, sy) fixed. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const newScale = Math.min(Math.max(this.scale * factor, MIN_SCALE), MAX_SCALE);
    const c = this.toCircuit(sx, sy);
    this.scale = newScale;
    this.offsetX = sx - c.x * newScale;
    this.offsetY = sy - c.y * newScale;
  }

  pan(dx: number, dy: number): void {
    this.offsetX += dx;
    this.offsetY += dy;
  }
}
