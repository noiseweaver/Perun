// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Teaching tools (PLAN.md Phase 9): pencil strokes drawn over the circuit and a laser pointer
// whose trail fades out. Not in upstream. Strokes live in circuit coordinates, so they move and
// zoom with the circuit; they are an overlay only and never saved in the circuit file.

import type { Theme } from '@circuitjs-next/theme';
import type { Viewport } from './Viewport.ts';

export interface Pt {
  x: number;
  y: number;
}

export interface Stroke {
  /** Index into the theme's pens, so strokes follow a theme change. */
  pen: number;
  /** Line width in circuit units (a fixed screen width at the zoom it was drawn at). */
  width: number;
  points: Pt[];
}

interface LaserPoint extends Pt {
  t: number;
}

/** How long a laser trail point takes to fade (ms). */
export const LASER_FADE_MS = 900;
/** Pencil width on screen, in CSS pixels. */
export const PENCIL_WIDTH = 3;
/** How near (CSS pixels) the eraser must pass to a stroke to remove it. */
const ERASE_RADIUS = 10;
/** Undo keeps this many steps. */
const HISTORY_LIMIT = 100;

export class AnnotationLayer {
  strokes: Stroke[] = [];
  private current: Stroke | null = null;
  private laser: LaserPoint[] = [];
  /** Where the laser is now (the bright head), or null when it is off the canvas. */
  private laserHead: LaserPoint | null = null;
  /** Earlier stroke lists, for Undo. */
  private history: Stroke[][] = [];
  /** Called when the strokes change (draw, erase, undo, clear). */
  onChange: (() => void) | null = null;

  get drawing(): boolean {
    return this.current !== null;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  /** Something is drawn or fading: the canvas must keep repainting. */
  get active(): boolean {
    return this.laser.length > 0 || this.laserHead !== null;
  }

  private remember(): void {
    this.history.push(this.strokes.slice());
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  private changed(): void {
    this.onChange?.();
  }

  /** Start a pencil stroke at a circuit point. `scale` is the zoom, for the line width. */
  beginStroke(p: Pt, pen: number, scale: number): void {
    this.current = { pen, width: PENCIL_WIDTH / scale, points: [p] };
    this.remember();
    this.strokes = [...this.strokes, this.current];
  }

  extendStroke(p: Pt): void {
    const s = this.current;
    if (s === null) return;
    const last = s.points[s.points.length - 1];
    // skip points closer than a fraction of the line width: they only add noise
    if (last !== undefined && Math.hypot(p.x - last.x, p.y - last.y) < s.width * 0.4) return;
    s.points.push(p);
  }

  endStroke(): void {
    if (this.current === null) return;
    this.current = null;
    this.changed();
  }

  /** A second finger came down mid-stroke: it was the start of a pinch, not a line. */
  cancelStroke(): void {
    if (this.current === null) return;
    const s = this.current;
    this.current = null;
    this.strokes = this.strokes.filter((x) => x !== s);
    this.history.pop();
    this.changed();
  }

  /** An eraser gesture has removed something (one undo step covers the whole gesture). */
  private erasing = false;

  /** Remove every stroke that passes near the circuit point. Returns whether any went. */
  eraseAt(p: Pt, scale: number): boolean {
    const r = ERASE_RADIUS / scale;
    const keep = this.strokes.filter((s) => !nearStroke(s, p, r + s.width / 2));
    if (keep.length === this.strokes.length) return false;
    if (!this.erasing) this.remember();
    this.erasing = true;
    this.strokes = keep;
    this.changed();
    return true;
  }

  /** The eraser was lifted. */
  endErase(): void {
    this.erasing = false;
  }

  undo(): void {
    const prev = this.history.pop();
    if (prev === undefined) return;
    this.current = null;
    this.strokes = prev;
    this.changed();
  }

  clear(): void {
    if (this.strokes.length === 0) return;
    this.remember();
    this.strokes = [];
    this.current = null;
    this.changed();
  }

  /** The laser moved to a circuit point (null: it left the canvas). */
  laserTo(p: Pt | null, now: number): void {
    if (p === null) {
      this.laserHead = null;
      return;
    }
    const pt = { x: p.x, y: p.y, t: now };
    this.laserHead = pt;
    this.laser.push(pt);
  }

  /** The laser stopped (pen or finger lifted): the trail fades, the head goes. */
  laserUp(): void {
    this.laserHead = null;
  }

  /** Draw the strokes and the laser over whatever is on the canvas. */
  draw(ctx: CanvasRenderingContext2D, vp: Viewport, dpr: number, theme: Theme, now: number): void {
    const pens = theme.teaching.pens;
    ctx.save();
    ctx.setTransform(vp.scale * dpr, 0, 0, vp.scale * dpr, vp.offsetX * dpr, vp.offsetY * dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
    for (const s of this.strokes) {
      ctx.strokeStyle = pens[s.pen % pens.length] ?? pens[0] ?? theme.circuit.selection;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = s.width;
      strokePath(ctx, s.points);
    }

    // laser: a trail that thins and fades with age, with a soft glow and a bright head. Each
    // piece is a quadratic curve from the midpoint before a sample, bent by the sample, to the
    // midpoint after it, so the trail is smooth for no more drawing than straight segments. Butt
    // caps: round caps overlapping at every joint left a bright dot at each sample.
    this.laser = this.laser.filter((p) => now - p.t < LASER_FADE_MS);
    const pts = this.laser;
    const color = theme.teaching.laser;
    const w = 6 / vp.scale;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 * dpr;
    ctx.lineCap = 'butt';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1] as LaserPoint;
      const b = pts[i] as LaserPoint;
      if (lifted(a, b)) continue;
      const k = 1 - (now - b.t) / LASER_FADE_MS;
      if (k <= 0) continue;
      const before = pts[i - 2];
      const after = pts[i + 1];
      ctx.globalAlpha = k * 0.85;
      ctx.lineWidth = w * (0.35 + 0.65 * k);
      ctx.beginPath();
      if (before === undefined || lifted(before, a)) ctx.moveTo(a.x, a.y);
      else ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (after === undefined || lifted(b, after)) ctx.quadraticCurveTo(b.x, b.y, b.x, b.y);
      else ctx.quadraticCurveTo(b.x, b.y, (b.x + after.x) / 2, (b.y + after.y) / 2);
      ctx.stroke();
    }
    const head = this.laserHead;
    if (head !== null) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.shadowBlur = 18 * dpr;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 5 / vp.scale, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** A smooth line through the points (quadratic curves through the midpoints). */
function strokePath(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  const first = pts[0];
  if (first === undefined) return;
  if (pts.length === 1) {
    // a tap leaves a dot
    ctx.beginPath();
    ctx.arc(first.x, first.y, ctx.lineWidth / 2, 0, 2 * Math.PI);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i] as Pt;
    const q = pts[i + 1] as Pt;
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  const last = pts[pts.length - 1] as Pt;
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

/** A gap in time means the laser was lifted between the two points. */
function lifted(a: LaserPoint, b: LaserPoint): boolean {
  return b.t - a.t > 120;
}

function nearStroke(s: Stroke, p: Pt, r: number): boolean {
  const pts = s.points;
  if (pts.length === 1) {
    const a = pts[0] as Pt;
    return Math.hypot(p.x - a.x, p.y - a.y) <= r;
  }
  for (let i = 1; i < pts.length; i++)
    if (segmentDistance(p, pts[i - 1] as Pt, pts[i] as Pt) <= r) return true;
  return false;
}

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
