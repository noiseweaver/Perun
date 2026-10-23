// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/GraphicElm.java, BoxElm.java
// and LineElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, distanceSq, elementType, lineDistanceSq } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { javaDoubleToInt } from '../java.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';

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
  /** Nothing to measure. */
  override canViewInScope(): boolean {
    return false;
  }
  /** Both corners follow the mouse exactly. */
  override drag(xx: number, yy: number): void {
    this.x2 = xx;
    this.y2 = yy;
    this.setPoints();
  }
}

/** Where a box's title sits. */
export type BoxTitlePlace = 'border' | 'center' | 'inside';
// the names of a box's colors (theme `circuit.boxes`), not colors
/* eslint-disable local/no-color-literals -- box color names, not colors */
/** A box's color: the theme's secondary part color, or one of the theme's box colors. */
export type BoxColor = 'default' | 'red' | 'orange' | 'green' | 'blue' | 'purple';
export type BoxBorder = 'dashed' | 'solid' | 'dotted' | 'none';
const PLACES: readonly BoxTitlePlace[] = ['border', 'center', 'inside'];
const COLORS: readonly BoxColor[] = ['default', 'red', 'orange', 'green', 'blue', 'purple'];
/* eslint-enable local/no-color-literals -- colors are banned again from here */
const BORDERS: readonly BoxBorder[] = ['dashed', 'solid', 'dotted', 'none'];
const DEFAULT_TITLE_SIZE = 16;
/** Average width of a monospace glyph, in em, where no painter can measure the title. */
const GLYPH_EM = 0.6;
/** Gap between the box's left edge and the title. */
export const BOX_TITLE_INSET = 10;
/** Space either side of a title drawn on the border. */
export const BOX_TITLE_PAD = 4;
/**
 * How close to a corner grabs it, and to an edge picks the box, in circuit units: wider than a
 * post's grab so a finger finds a corner. The box's bounds reach this far out.
 */
export const BOX_GRAB = 10;

/** A dashed rectangle for grouping parts of a drawing. */
export class BoxElm extends GraphicElm {
  /**
   * Not in upstream (docs/deviations/box-titles.md): a title, its size and place, a color, the
   * border style and shading, saved as the extra XML attributes `tt`, `tz`, `tp`, `bc`, `bs` and
   * `sh` only when they differ from upstream's plain dashed box. Upstream ignores them.
   */
  title = '';
  titleSize = DEFAULT_TITLE_SIZE;
  titlePlace: BoxTitlePlace = 'border';
  color: BoxColor = 'default';
  border: BoxBorder = 'dashed';
  shaded = false;

  override getClassName(): string {
    return 'BoxElm';
  }
  override getDumpType(): number {
    return 'b'.charCodeAt(0);
  }
  /** A new box starts with a title to type over, so the title is easy to find. */
  override initNew(): void {
    this.title = 'Label';
  }
  override creationFailed(): boolean {
    return Math.abs(this.x2 - this.x) < 32 || Math.abs(this.y2 - this.y) < 32;
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    if (this.title !== '') w.dumpAttr('tt', this.title);
    if (this.titleSize !== DEFAULT_TITLE_SIZE) w.dumpAttr('tz', this.titleSize);
    if (this.titlePlace !== 'border') w.dumpAttr('tp', this.titlePlace);
    if (this.color !== 'default') w.dumpAttr('bc', this.color);
    if (this.border !== 'dashed') w.dumpAttr('bs', this.border);
    if (this.shaded) w.dumpAttr('sh', true);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.title = r.parseStringAttr('tt', '');
    const size = r.parseIntAttr('tz', DEFAULT_TITLE_SIZE);
    this.titleSize = size >= 5 && size <= 100 ? size : DEFAULT_TITLE_SIZE;
    const tp = r.parseStringAttr('tp', null);
    this.titlePlace = PLACES.find((p) => p === tp) ?? 'border';
    const bc = r.parseStringAttr('bc', null);
    this.color = COLORS.find((c) => c === bc) ?? 'default';
    const bs = r.parseStringAttr('bs', null);
    this.border = BORDERS.find((b) => b === bs) ?? 'dashed';
    this.shaded = r.parseBooleanAttr('sh', false);
  }

  /** The box's corners: left, top, right, bottom. */
  rect(): { x1: number; y1: number; x2: number; y2: number } {
    return {
      x1: Math.min(this.x, this.x2),
      y1: Math.min(this.y, this.y2),
      x2: Math.max(this.x, this.x2),
      y2: Math.max(this.y, this.y2),
    };
  }

  /**
   * Where the title goes: its left end and vertical middle, given its width (measured by the
   * painter, or estimated). A title on the border is centered on the top edge.
   */
  titleAt(width: number): { x: number; y: number } {
    const r = this.rect();
    const h = this.titleSize;
    const x =
      this.titlePlace === 'center'
        ? Math.trunc((r.x1 + r.x2 - width) / 2)
        : r.x1 + BOX_TITLE_INSET + (this.titlePlace === 'border' ? BOX_TITLE_PAD : 0);
    const y = this.titlePlace === 'inside' ? r.y1 + 6 + Math.trunc(h / 2) : r.y1;
    return { x, y };
  }

  /** The title's box from an estimated width (hit testing and bounds, where nothing measures). */
  titleRect(): { x1: number; y1: number; x2: number; y2: number } | null {
    if (this.title === '') return null;
    const w = Math.ceil(this.title.length * this.titleSize * GLYPH_EM);
    const at = this.titleAt(w);
    const h = Math.ceil(this.titleSize / 2) + 2;
    return { x1: at.x - BOX_TITLE_PAD, y1: at.y - h, x2: at.x + w + BOX_TITLE_PAD, y2: at.y + h };
  }

  /** Near one of the four edges, or on the title. */
  override getMouseDistance(gx: number, gy: number): number {
    const thresh = BOX_GRAB;
    const dx1 = Math.abs(gx - this.x);
    const dy1 = Math.abs(gy - this.y);
    const dx2 = Math.abs(gx - this.x2);
    const dy2 = Math.abs(gy - this.y2);
    if (dx1 < thresh) return dx1 * dx1;
    if (dx2 < thresh) return dx2 * dx2;
    if (dy1 < thresh) return dy1 * dy1;
    if (dy2 < thresh) return dy2 * dy2;
    const t = this.titleRect();
    if (t !== null && gx >= t.x1 && gx <= t.x2 && gy >= t.y1 && gy <= t.y2) return 0;
    return -1;
  }

  /** Upstream selects a box by area only when the area holds all of it (`selectRect`). */
  override selectsOnlyWhenEnclosed(): boolean {
    return true;
  }

  /** All four corners resize the box: 0 and 1 are its two points, 2 and 3 the other corners. */
  override getHandleGrabbedClose(
    xtest: number,
    ytest: number,
    deltaSq: number,
    minSize: number,
  ): number {
    this.lastHandleGrabbed = -1;
    deltaSq = Math.max(deltaSq, BOX_GRAB * BOX_GRAB);
    if (distanceSq(this.x, this.y, this.x2, this.y2) >= minSize) {
      const corners = this.corners();
      for (let i = 0; i !== corners.length; i++) {
        const c = corners[i];
        if (c !== undefined && distanceSq(c.x, c.y, xtest, ytest) <= deltaSq) {
          this.lastHandleGrabbed = i;
          break;
        }
      }
    }
    return this.lastHandleGrabbed;
  }

  /** The handles' points, in handle order. */
  corners(): { x: number; y: number }[] {
    return [
      { x: this.x, y: this.y },
      { x: this.x2, y: this.y2 },
      { x: this.x2, y: this.y },
      { x: this.x, y: this.y2 },
    ];
  }

  override closestHandle(x: number, y: number): number {
    let best = 0;
    let bestD = Infinity;
    this.corners().forEach((c, i) => {
      const d = distanceSq(c.x, c.y, x, y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** Move a corner; a box never collapses to a line. */
  override movePoint(n: number, dx: number, dy: number): void {
    if (n < 2) {
      super.movePoint(n, dx, dy);
      return;
    }
    // corner 2 is (x2, y), corner 3 is (x, y2)
    const nx = n === 2 ? this.x : this.x + dx;
    const ny = n === 2 ? this.y + dy : this.y;
    const nx2 = n === 2 ? this.x2 + dx : this.x2;
    const ny2 = n === 2 ? this.y2 : this.y2 + dy;
    if (nx === nx2 || ny === ny2) return;
    this.x = nx;
    this.y = ny;
    this.x2 = nx2;
    this.y2 = ny2;
    this.setPoints();
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return EditInfo.text('Title', this.title);
    if (n === 1) return new EditInfo('Title size', this.titleSize, 5, 100);
    if (n === 2)
      return EditInfo.createChoice(
        'Title position',
        ['On the border', 'On the border, centered', 'Inside the box'],
        PLACES.indexOf(this.titlePlace),
      );
    if (n === 3)
      return EditInfo.createChoice(
        'Color',
        // eslint-disable-next-line local/no-color-literals -- the choices' names
        ['Theme default', 'Red', 'Orange', 'Green', 'Blue', 'Purple'],
        COLORS.indexOf(this.color),
      );
    if (n === 4)
      return EditInfo.createChoice(
        'Border',
        ['Dashed', 'Solid', 'Dotted', 'None'],
        BORDERS.indexOf(this.border),
      );
    if (n === 5) return EditInfo.createCheckbox('Shade inside', this.shaded);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.title = (ei.text ?? '').replace(/[\r\n]+/g, ' ');
    if (n === 1) {
      const v = javaDoubleToInt(ei.value);
      if (v >= 5 && v <= 100) this.titleSize = v;
    }
    if (n === 2) this.titlePlace = PLACES[ei.choice?.selected ?? 0] ?? 'border';
    if (n === 3) this.color = COLORS[ei.choice?.selected ?? 0] ?? 'default';
    if (n === 4) this.border = BORDERS[ei.choice?.selected ?? 0] ?? 'dashed';
    if (n === 5) this.shaded = ei.checkbox?.state === true;
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
