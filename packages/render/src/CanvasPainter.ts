// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import {
  CURRENT_TOO_FAST,
  type Ink,
  type Painter,
  type Pt,
  type StrokeStyle,
  type TextStyle,
} from '@circuitjs-next/elements';
import { toCss } from '@circuitjs-next/theme';
import type { Palette } from './palette.ts';

/** Drawing settings for one frame. */
export interface PaintSettings {
  /** Color wires and leads by voltage (circuit option); otherwise they use the component color. */
  voltageColors: boolean;
  /** Full-scale voltage of the color scale. */
  voltageRange: number;
  /** Draw current dots (circuit option and simulation running). */
  dots: boolean;
}

const UPSTREAM_THICK = 3;
const DOT_SPACING = 16;

/**
 * Painter on a 2D canvas context. It maps semantic inks to theme colors; the context's transform
 * is already set to circuit coordinates. Lines use round caps, as upstream.
 */
export class CanvasPainter implements Painter {
  readonly ctx: CanvasRenderingContext2D;
  palette: Palette;
  settings: PaintSettings = { voltageColors: true, voltageRange: 5, dots: true };
  /** The element being drawn is highlighted (selection color for its own parts). */
  highlighted = false;
  /** Highlight color: hover or selection. */
  highlightColor: string;
  private random: () => number;

  constructor(ctx: CanvasRenderingContext2D, palette: Palette, random: () => number = Math.random) {
    this.ctx = ctx;
    this.palette = palette;
    this.highlightColor = palette.hover;
    this.random = random;
  }

  /** Resolve an ink to a fill or stroke style. */
  style(ink: Ink): string | CanvasGradient {
    const p = this.palette;
    if ('role' in ink) {
      if (this.highlighted && ink.role !== 'text' && ink.role !== 'currentDot')
        return this.highlightColor;
      return p.roles[ink.role];
    }
    if ('voltage' in ink) {
      if (this.highlighted) return this.highlightColor;
      if (!this.settings.voltageColors) return p.roles.component;
      return p.voltage(ink.voltage, this.settings.voltageRange);
    }
    if ('gradient' in ink) {
      if (this.highlighted) return this.highlightColor;
      if (!this.settings.voltageColors) return p.roles.component;
      const { from, to, v1, v2 } = ink.gradient;
      const g = this.ctx.createLinearGradient(from.x, from.y, to.x, to.y);
      g.addColorStop(0, p.voltage(v1, this.settings.voltageRange));
      g.addColorStop(1, p.voltage(v2, this.settings.voltageRange));
      return g;
    }
    const [r, g, b] = ink.rgb;
    return toCss({ r, g, b, a: 1 });
  }

  private stroke(ink: Ink, style: StrokeStyle | undefined): void {
    const c = this.ctx;
    c.strokeStyle = this.style(ink);
    c.lineWidth =
      ((style?.width ?? UPSTREAM_THICK) * this.palette.theme.style.strokeWidth) / UPSTREAM_THICK;
    c.setLineDash(style?.dash ? [...style.dash] : []);
    c.stroke();
  }

  line(a: Pt, b: Pt, ink: Ink, style?: StrokeStyle): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    this.stroke(ink, style);
  }

  polyline(
    points: readonly Pt[],
    ink: Ink,
    style?: StrokeStyle & { readonly closed?: boolean },
  ): void {
    if (points.length === 0) return;
    const c = this.ctx;
    c.beginPath();
    points.forEach((q, i) => (i === 0 ? c.moveTo(q.x, q.y) : c.lineTo(q.x, q.y)));
    if (style?.closed) c.closePath();
    this.stroke(ink, style);
  }

  fillPolygon(points: readonly Pt[], ink: Ink): void {
    if (points.length === 0) return;
    const c = this.ctx;
    c.beginPath();
    points.forEach((q, i) => (i === 0 ? c.moveTo(q.x, q.y) : c.lineTo(q.x, q.y)));
    c.closePath();
    c.fillStyle = this.style(ink);
    c.fill();
  }

  circle(center: Pt, r: number, ink: Ink, style?: StrokeStyle): void {
    const c = this.ctx;
    c.beginPath();
    c.arc(center.x, center.y, r, 0, 2 * Math.PI);
    this.stroke(ink, style);
  }

  fillCircle(center: Pt, r: number, ink: Ink): void {
    const c = this.ctx;
    c.beginPath();
    c.arc(center.x, center.y, r, 0, 2 * Math.PI);
    c.closePath();
    c.fillStyle = this.style(ink);
    c.fill();
  }

  private font(style?: TextStyle): string {
    const size = this.fontSize(style);
    const { font, monoFont } = this.palette.theme.style;
    const family =
      style?.font === 'value' ? monoFont : style?.font === 'serif' ? 'Georgia, serif' : font;
    return `${style?.italic ? 'italic ' : ''}${style?.bold ? 'bold ' : ''}${size}px ${family}`;
  }

  fontSize(style?: TextStyle): number {
    return style?.size ?? 12;
  }

  measureText(s: string, style?: TextStyle): number {
    this.ctx.font = this.font(style);
    return this.ctx.measureText(s).width;
  }

  text(s: string, at: Pt, ink: Ink, style?: TextStyle): void {
    const c = this.ctx;
    c.font = this.font(style);
    c.fillStyle = this.style(ink);
    c.textAlign = style?.align ?? 'left';
    c.textBaseline = style?.baseline ?? 'alphabetic';
    if (style?.rotate) {
      c.save();
      c.translate(at.x, at.y);
      c.rotate(style.rotate);
      c.fillText(s, 0, 0);
      c.restore();
    } else c.fillText(s, at.x, at.y);
  }

  dots(a: Pt, b: Pt, pos: number): void {
    if (!this.settings.dots || pos === 0 || !Number.isFinite(pos)) return;
    const c = this.ctx;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dn = Math.sqrt(dx * dx + dy * dy);
    const color = this.palette.roles.currentDot;
    if (pos === CURRENT_TOO_FAST || pos === -CURRENT_TOO_FAST) {
      // too fast to animate: a translucent line, dots at a random phase
      c.save();
      c.globalAlpha = 0.5;
      c.strokeStyle = color;
      c.lineWidth = 4;
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.restore();
      pos = this.random() * DOT_SPACING;
    }
    pos %= DOT_SPACING;
    if (pos < 0) pos += DOT_SPACING;
    const r = this.palette.theme.style.dotRadius;
    c.fillStyle = color;
    for (let di = pos; di < dn; di += DOT_SPACING) {
      const x0 = Math.trunc(a.x + (di * dx) / dn);
      const y0 = Math.trunc(a.y + (di * dy) / dn);
      c.fillRect(x0 - r, y0 - r, 2 * r, 2 * r);
    }
  }
}
