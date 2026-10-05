// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Geometry learned from CircuitJS1 ChipElm.drawChip, SevenSegElm.draw, DecimalDisplayElm.draw,
// LEDArrayElm.draw and VCOElm.draw (src/com/lushprojects/circuitjs1/client/, master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032; the drawing code is new.

import { ChipElm, SIDE_E, SIDE_N, SIDE_S, SIDE_W } from '../elm/ChipElm.ts';
import type { LEDArrayElm } from '../elm/LEDArrayElm.ts';
import { DecimalDisplayElm, SevenSegElm } from '../elm/SevenSegElm.ts';
import type { VCOElm } from '../elm/TimerElm.ts';
import { LABEL, MUTED, TEXT, vInk, type ElementView } from './common.ts';
import { distance, interp, interp2, type Rect } from './geometry.ts';
import type { DrawContext, Ink, Pt, TextStyle } from './Painter.ts';

/** Pin stubs, bubbles, clock wedges, pin names and the outline (upstream `drawChip`). */
export function drawChip(e: ChipElm, ctx: DrawContext): void {
  const p = ctx.painter;
  const n = e.getPostCount();
  // without vertical pins the names may use more of the chip's width
  let hasVertical = false;
  for (let i = 0; i !== n; i++)
    if (e.pins[i].side === SIDE_N || e.pins[i].side === SIDE_S) {
      hasVertical = true;
      break;
    }
  for (let i = 0; i !== n; i++) {
    const pin = e.pins[i];
    if (pin.busZ > 0) continue;
    const bus = pin.busWidth > 1;
    const bubble: Pt = { x: pin.bubbleX, y: pin.bubbleY };
    // upstream clears the stub inside the bubble with the background color; stop it at the edge
    const end = pin.bubble
      ? interp(pin.post, bubble, 1 - 3 / distance(pin.post, bubble))
      : pin.stub;
    p.line(pin.post, end, vInk(e.volts[i]), { width: bus ? 5 : 3 });
    p.dots(pin.stub, pin.post, ctx.dotCount(i, pin.current));
    if (pin.bubble) p.circle(bubble, 3, MUTED);
    if (pin.clockPoints !== null) p.polyline(pin.clockPoints, MUTED, { width: 1 });
    drawPinName(e, ctx, i, hasVertical);
  }
  p.polyline(e.rectPoints, MUTED, { closed: true });
}

function drawPinName(e: ChipElm, ctx: DrawContext, i: number, hasVertical: boolean): void {
  const p = ctx.painter;
  const pin = e.pins[i];
  const text = pin.busWidth > 1 ? pin.text + '/' + pin.busWidth : pin.text;
  if (text.length === 0) return;
  let availSpace = e.cspc * 2 - 8;
  // a wide chip with no vertical pins leaves room for longer names
  if (!hasVertical && e.sizeX > 2) availSpace = e.cspc * 2.5 + e.cspc * (e.sizeX - 3);
  // shrink the font until the name fits
  let size = 10 * e.csize;
  let style: TextStyle = { font: 'units', size };
  let sw = Math.trunc(p.measureText(text, style));
  while (sw > availSpace && size > 1) {
    size--;
    style = { font: 'units', size };
    sw = Math.trunc(p.measureText(text, style));
  }
  const asc = size;
  let tx: number;
  // names on the left and right sit close to the edge
  if (pin.side === e.flippedXSide(SIDE_W)) tx = pin.textloc.x - (e.cspc - 5);
  else if (pin.side === e.flippedXSide(SIDE_E)) tx = pin.textloc.x + (e.cspc - 5) - sw;
  else tx = pin.textloc.x - Math.trunc(sw / 2);
  const ty = pin.textloc.y + Math.trunc(asc / 3);
  p.text(text, { x: tx, y: ty }, LABEL, style);
  if (pin.lineOver) {
    const ya = pin.textloc.y - asc + Math.trunc(asc / 3);
    p.line({ x: tx, y: ya }, { x: tx + sw, y: ya }, LABEL, { width: 1 });
  }
}

/** The outline's bounds; the renderer adds the posts. */
function chipBox(e: ChipElm): Rect {
  const r = e.rectPoints;
  if (r.length < 3) return { x1: e.x, y1: e.y, x2: e.x, y2: e.y };
  return { x1: r[0].x, y1: r[0].y, x2: r[2].x, y2: r[2].y };
}

export const chipView: ElementView<ChipElm> = {
  draw: drawChip,
  bbox: chipBox,
};

export const ledArrayView: ElementView<LEDArrayElm> = {
  draw(e, ctx) {
    e.beginFrame();
    drawChip(e, ctx);
    const r = e.cspc / 2;
    for (let ix = 0; ix !== e.sizeX; ix++)
      for (let iy = 0; iy !== e.sizeY; iy++) {
        const ink: Ink = { rgb: [e.ledLevel(ix + iy * e.sizeX), 0, 0] };
        const col = e.pins[ix].post;
        const row = e.pins[iy + e.sizeX].post;
        const c = e.isFlippedXY() ? { x: row.x, y: col.y } : { x: col.x, y: row.y };
        ctx.painter.fillCircle(c, r, ink);
      }
  },
  bbox: chipBox,
};

export const vcoView: ElementView<VCOElm> = {
  draw(e, ctx) {
    // upstream computes the capacitor pin currents while drawing
    e.computeCurrent();
    drawChip(e, ctx);
  },
  bbox: chipBox,
};

// segment ends as x1, y1, x2, y2 on a 2 by 2 grid
const DISPLAY7 = [
  0, 0, 2, 0, 2, 0, 2, 1, 2, 1, 2, 2, 0, 2, 2, 2, 0, 1, 0, 2, 0, 0, 0, 1, 0, 1, 2, 1,
];
const DISPLAY14 = [
  0, 0, 2, 0, 2, 0, 2, 1, 2, 1, 2, 2, 2, 2, 0, 2, 0, 2, 0, 1, 0, 1, 0, 0, 0, 0, 1, 1, 1, 0, 1, 1, 2,
  0, 1, 1, 1, 1, 2, 1, 1, 1, 2, 2, 1, 1, 1, 2, 1, 1, 0, 2, 0, 1, 1, 1,
];
const DISPLAY16 = [
  0, 0, 1, 0, 1, 0, 2, 0, 2, 0, 2, 1, 2, 1, 2, 2, 2, 2, 1, 2, 1, 2, 0, 2, 0, 2, 0, 1, 0, 1, 0, 0, 0,
  0, 1, 1, 1, 0, 1, 1, 2, 0, 1, 1, 1, 1, 2, 1, 1, 1, 2, 2, 1, 1, 1, 2, 1, 1, 0, 2, 0, 1, 1, 1,
];

/** Segment `n`'s light: on or off for logic inputs, else by LED current. */
function segmentInk(e: SevenSegElm, n: number): Ink {
  if (e.diodeDirection === 0) return { rgb: e.pins[n].value ? [255, 0, 0] : [30, 0, 0] };
  let w = (-e.diodeDirection * e.pins[n].current) / 0.01;
  if (w > 0) w = 255 * (1 + 0.2 * Math.log(w));
  if (w > 255) w = 255;
  if (w < 30) w = 30;
  return { rgb: [Math.trunc(w), 0, 0] };
}

function segment(ctx: DrawContext, a: Pt, b: Pt, thick: number, ink: Ink): void {
  const dn = distance(a, b);
  const [p3, p4] = interp2(a, b, thick / dn, thick);
  const [p5, p6] = interp2(a, b, 1 - thick / dn, thick);
  ctx.painter.fillPolygon([a, p3, p5, b, p6, p4], ink);
}

function decimalPoint(ctx: DrawContext, x: number, y: number, sp: number, ink: Ink): void {
  ctx.painter.fillPolygon(
    [
      { x, y: y - sp },
      { x: x - sp, y },
      { x, y: y + sp },
      { x: x + sp, y },
    ],
    ink,
  );
}

export const sevenSegView: ElementView<SevenSegElm> = {
  draw(e, ctx) {
    drawChip(e, ctx);
    const small = e.sizeY <= 4;
    let spx = e.cspc * 2;
    if (e.extraSegment !== SevenSegElm.ES_NONE) spx = Math.trunc(spx * 0.9);
    if (small || e.isFlippedXY()) spx = Math.trunc(spx / 2);
    const spy = spx * 2;
    const xl = e.x + e.cspc + e.flippedSizeX * e.cspc - spx;
    let yl = e.y - e.cspc + e.flippedSizeY * e.cspc - spy;
    if (small && (e.flags & (ChipElm.FLAG_FLIP_Y | ChipElm.FLAG_FLIP_XY)) !== 0) yl += 10;
    const disp =
      e.baseSegmentCount === 7 ? DISPLAY7 : e.baseSegmentCount === 14 ? DISPLAY14 : DISPLAY16;
    const thick = small ? 5 : Math.trunc(spx / 6);
    const dpsize = small ? 7 : e.isFlippedXY() ? 3 : 7;
    // diagonal segments first, so the straight ones draw over them
    for (let step = 0; step !== 2; step++)
      for (let i = 0; i !== e.segmentCount; i++) {
        const i4 = i * 4;
        const diag = disp[i4] !== disp[i4 + 2] && disp[i4 + 1] !== disp[i4 + 3];
        if (diag !== (step === 0)) continue;
        // the extra segment (dp or colon) has no entry in the table
        if (i4 >= disp.length) continue;
        segment(
          ctx,
          { x: xl + disp[i4] * spx, y: yl + disp[i4 + 1] * spy },
          { x: xl + disp[i4 + 2] * spx, y: yl + disp[i4 + 3] * spy },
          thick,
          segmentInk(e, i),
        );
      }
    if (e.extraSegment === SevenSegElm.ES_DP) {
      const dist = Math.trunc(Math.max(spx * 1.5, spx + 12));
      decimalPoint(ctx, xl + spx + dist, yl + spy * 2, dpsize, segmentInk(e, e.baseSegmentCount));
    }
    if (e.extraSegment === SevenSegElm.ES_COLON) {
      const ink = segmentInk(e, e.baseSegmentCount);
      const dist = Math.trunc(Math.max(spx * 1.5, spx + 14));
      decimalPoint(ctx, xl + spx + dist, yl + Math.trunc(spy * 0.5), dpsize, ink);
      decimalPoint(ctx, xl + spx + dist, yl + Math.trunc(spy * 1.5), dpsize, ink);
    }
  },
  bbox: chipBox,
};

const RADIX = [10, 16, 8];

/** The display's value, padded to the widest value its bits can show (a fixed budget). */
export function decimalDisplayText(e: DecimalDisplayElm): string {
  let value = 0;
  for (let i = 0; i !== e.bitCount; i++) if (e.pins[i].value) value |= 1 << i;
  const radix = RADIX[e.displayMode] ?? 10;
  const max = 2 ** e.bitCount - 1;
  const width = max.toString(radix).length;
  return (value >>> 0).toString(radix).toUpperCase().padStart(width, ' ');
}

export const decimalDisplayView: ElementView<DecimalDisplayElm> = {
  draw(e, ctx) {
    drawChip(e, ctx);
    const p = ctx.painter;
    const xl = e.x + e.cspc + e.flippedSizeX * e.cspc;
    let yl = e.y - e.cspc + e.flippedSizeY * e.cspc;
    if (e.isFlippedXY()) yl += (e.flags & ChipElm.FLAG_FLIP_Y) !== 0 ? -e.cspc / 2 : e.cspc / 2;
    // monospace and padded, so the digits never shift as the value changes
    const style: TextStyle = { font: 'value', size: 15 * e.csize, baseline: 'middle' };
    const str = decimalDisplayText(e);
    const w = Math.trunc(p.measureText(str, style));
    p.text(str, { x: xl + 5 * e.csize - Math.trunc(w / 2), y: yl }, TEXT, style);
  },
  bbox: chipBox,
};
