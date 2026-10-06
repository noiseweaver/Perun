// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Geometry learned from CircuitJS1 src/com/lushprojects/circuitjs1/client/CircuitElm.java (master)
// at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032 (draw2Leads, drawValues, drawLabeledNode,
// drawCenteredText); the code is not a line-by-line port.

import type { CircuitElm } from '../CircuitElm.ts';
import { boxAround, rectOf, sign, unionRect, type Rect } from './geometry.ts';
import type { DrawContext, Ink, Pt, TextStyle } from './Painter.ts';

/** How one element class is drawn. */
export interface ElementView<E extends CircuitElm = CircuitElm> {
  draw(e: E, ctx: DrawContext): void;
  /** Box for hit testing and bad-connection checks (upstream `boundingBox`). */
  bbox(e: E): Rect;
}

export const VALUE_FONT: TextStyle = { font: 'value' };
export const UNITS_FONT: TextStyle = { font: 'units' };
/**
 * Labels drawn as part of a part (rails, labeled nodes, outputs): the monospace font at 12 px,
 * where upstream uses its text font (Gady, 2026-10-06). Not scaled by the value size setting.
 */
export const LABEL_FONT: TextStyle = { font: 'value', size: 12 };

export const COMPONENT: Ink = { role: 'component' };
export const MUTED: Ink = { role: 'componentMuted' };
export const LABEL: Ink = { role: 'label' };
export const TEXT: Ink = { role: 'text' };
export const SELECTION: Ink = { role: 'selection' };

/** Voltage of node n of an element (0 before the first analysis). */
export function volt(e: CircuitElm, n: number): number {
  const v = e.volts[n];
  return v === undefined || Number.isNaN(v) ? 0 : v;
}

export const vInk = (v: number): Ink => ({ voltage: v });

/** Box around p1-p2, widened by w, including every post. */
export function elementBox(e: CircuitElm, w: number, p1: Pt = e.point1, p2: Pt = e.point2): Rect {
  const posts: Pt[] = [];
  for (let i = 0; i !== e.getPostCount(); i++) posts.push(e.getPost(i));
  return unionRect(boxAround(p1, p2, w), rectOf(posts));
}

/** The two leads of a two-terminal element, colored by their node voltages. */
export function draw2Leads(e: CircuitElm, ctx: DrawContext, lead1: Pt, lead2: Pt): void {
  ctx.painter.line(e.point1, lead1, vInk(volt(e, 0)));
  ctx.painter.line(lead2, e.point2, vInk(volt(e, 1)));
}

/** Dots for the element's own current from p1 to p2 (upstream `doDots`). */
export function doDots(e: CircuitElm, ctx: DrawContext): void {
  ctx.painter.dots(e.point1, e.point2, ctx.dotCount(0, e.current));
}

/**
 * A value next to the element (upstream `drawValues`): centred above a horizontal element, beside
 * a vertical one. `atEnd` anchors at the second point (rails); `left` puts it on the left side
 * (voltage sources).
 */
export function drawValues(
  e: CircuitElm,
  ctx: DrawContext,
  s: string | null,
  hs: number,
  opts: { atEnd?: boolean; left?: boolean } = {},
): void {
  if (s === null || s === '') return;
  const p = ctx.painter;
  const w = Math.trunc(p.measureText(s, VALUE_FONT));
  const ya = Math.trunc(p.fontSize(VALUE_FONT) / 2);
  const xc = opts.atEnd ? e.x2 : Math.trunc((e.x2 + e.x) / 2);
  const yc = opts.atEnd ? e.y2 : Math.trunc((e.y2 + e.y) / 2);
  const dpx = Math.trunc(e.dpx1 * hs);
  const dpy = Math.trunc(e.dpy1 * hs);
  if (dpx === 0) {
    p.text(s, { x: xc - Math.trunc(w / 2), y: yc - Math.abs(dpy) - 2 }, TEXT, VALUE_FONT);
  } else {
    let xx = xc + Math.abs(dpx) + 2;
    if (opts.left || (e.x < e.x2 && e.y > e.y2)) xx = xc - (w + Math.abs(dpx) + 2);
    p.text(s, { x: xx, y: yc + dpy + ya }, TEXT, VALUE_FONT);
  }
}

/**
 * Text at the free end of a labeled-node style lead from pt1 to pt2: beyond the end of a vertical
 * lead, beside a horizontal one. A leading "/" draws a bar over the text.
 */
export function drawLabeledNode(
  ctx: DrawContext,
  str: string,
  pt1: Pt,
  pt2: Pt,
  ink: Ink,
  font: TextStyle = LABEL_FONT,
): void {
  const p = ctx.painter;
  let lineOver = false;
  if (str.startsWith('/')) {
    lineOver = true;
    str = str.substring(1);
  }
  const w = Math.trunc(p.measureText(str, font));
  const h = Math.trunc(p.fontSize(font));
  let x = pt2.x;
  let y = pt2.y;
  if (pt1.y !== pt2.y) {
    x -= Math.trunc(w / 2);
    y += sign(pt2.y - pt1.y) * h;
  } else if (pt2.x > pt1.x) x += 4;
  else x -= 4 + w;
  p.text(str, { x, y }, ink, { ...font, baseline: 'middle' });
  if (lineOver) {
    const ya = y - Math.trunc(h / 2) - 1;
    p.line({ x, y: ya }, { x: x + w, y: ya }, ink, { width: 1 });
  }
}

/** Text centred vertically at (x, y), and horizontally too when cx (upstream `drawCenteredText`). */
export function drawCenteredText(
  ctx: DrawContext,
  s: string,
  x: number,
  y: number,
  cx: boolean,
  ink: Ink,
  style: TextStyle = UNITS_FONT,
): void {
  ctx.painter.text(s, { x, y }, ink, {
    ...style,
    baseline: 'middle',
    align: cx ? 'center' : 'left',
  });
}

/** Map points of a local frame (x along a->b, y across) into circuit coordinates. */
export function localFrame(a: Pt, b: Pt, flipY = false): (x: number, y: number) => Pt {
  const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const s = flipY ? -1 : 1;
  return (x, y) => ({ x: a.x + ux * x - uy * y * s, y: a.y + uy * x + ux * y * s });
}
