// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/GraphicElm.java, BoxElm.java
// and LineElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, elementType, lineDistanceSq } from '../CircuitElm.ts';
import type { EditInfo } from '../edit/EditInfo.ts';

/** A drawing-only element with no posts. */
export abstract class GraphicElm extends CircuitElm {
  override getPostCount(): number {
    return 0;
  }
  override getEditInfo(_n: number): EditInfo | null {
    return null;
  }
  override setEditValue(_n: number, _ei: EditInfo): void {}
  override getInfo(_arr: string[]): void {}
  override getShortcut(): number {
    return 0;
  }
  /** Both corners follow the mouse exactly. */
  override drag(xx: number, yy: number): void {
    this.x2 = xx;
    this.y2 = yy;
    this.setPoints();
  }
}

/** A dashed rectangle for grouping parts of a drawing. */
export class BoxElm extends GraphicElm {
  override getClassName(): string {
    return 'BoxElm';
  }
  override getDumpType(): number {
    return 'b'.charCodeAt(0);
  }
  override creationFailed(): boolean {
    return Math.abs(this.x2 - this.x) < 32 || Math.abs(this.y2 - this.y) < 32;
  }
  /** Near one of the four edges. */
  override getMouseDistance(gx: number, gy: number): number {
    const thresh = 10;
    const dx1 = Math.abs(gx - this.x);
    const dy1 = Math.abs(gy - this.y);
    const dx2 = Math.abs(gx - this.x2);
    const dy2 = Math.abs(gy - this.y2);
    if (dx1 < thresh) return dx1 * dx1;
    if (dx2 < thresh) return dx2 * dx2;
    if (dy1 < thresh) return dy1 * dy1;
    if (dy2 < thresh) return dy2 * dy2;
    return -1;
  }
}

/** A plain line. */
export class LineElm extends GraphicElm {
  override getClassName(): string {
    return 'LineElm';
  }
  override getDumpType(): number {
    return 423;
  }
  override creationFailed(): boolean {
    return Math.hypot(this.x - this.x2, this.y - this.y2) < 16;
  }
  override getMouseDistance(gx: number, gy: number): number {
    const thresh = 10;
    const d2 = lineDistanceSq(this.x, this.y, this.x2, this.y2, gx, gy);
    return d2 <= thresh * thresh ? d2 : -1;
  }
}

export const BoxElmType = elementType('BoxElm', BoxElm);
export const LineElmType = elementType('LineElm', LineElm);
