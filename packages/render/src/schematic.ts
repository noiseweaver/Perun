// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import {
  unionRect,
  viewFor,
  type CircuitElm,
  type DrawContext,
  type Ink,
  type Painter,
  type Pt,
  type Rect,
  type StrokeStyle,
  type TextFont,
  type TextStyle,
} from '@perun/elements';
import { parseColor, toCss, type Theme } from '@perun/theme';
import { CanvasPainter, heatColor } from './CanvasPainter.ts';
import { Palette } from './palette.ts';
import { findPosts } from './posts.ts';

/** What a schematic export shows (not in upstream, which has no image export). */
export interface SchematicOptions {
  /** Color wires and leads by their present voltage; otherwise the component color. */
  voltageColors: boolean;
  voltageRange: number;
  showValues: boolean;
  euroResistors: boolean;
  euroGates: boolean;
  showOhm: boolean;
  textFont: TextFont;
  junctionDots: boolean;
  valueScale: number;
  /** Leave the background transparent instead of the theme's canvas color. */
  transparent: boolean;
}

export const DEFAULT_SCHEMATIC: SchematicOptions = {
  voltageColors: false,
  voltageRange: 5,
  showValues: true,
  euroResistors: false,
  euroGates: false,
  showOhm: false,
  textFont: { family: 'default', bold: false, italic: false },
  junctionDots: false,
  valueScale: 1,
  transparent: false,
};

/** Space around the drawing, in circuit units. */
const MARGIN = 24;
const UPSTREAM_THICK = 3;
const JUNCTION_RADIUS = 6;

/** Undocked scopes are cards drawn by the scope renderer; an image of the schematic skips them. */
function drawn(elements: readonly CircuitElm[]): CircuitElm[] {
  return elements.filter((e) => e.getClassName() !== 'ScopeElm' && viewFor(e) !== null);
}

/** The area an export covers: every element's ends and box, plus a margin. Null when empty. */
export function schematicBounds(elements: readonly CircuitElm[]): Rect | null {
  let r: Rect | null = null;
  for (const e of drawn(elements)) {
    const pts: Rect = {
      x1: Math.min(e.x, e.x2),
      y1: Math.min(e.y, e.y2),
      x2: Math.max(e.x, e.x2),
      y2: Math.max(e.y, e.y2),
    };
    const v = viewFor(e);
    const box = v ? unionRect(pts, v.bbox(e)) : pts;
    r = r === null ? box : unionRect(r, box);
  }
  if (r === null) return null;
  return { x1: r.x1 - MARGIN, y1: r.y1 - MARGIN, x2: r.x2 + MARGIN, y2: r.y2 + MARGIN };
}

/** Draw the elements and their posts, without highlights, current dots or the grid. */
export function drawSchematic(
  painter: Painter,
  elements: readonly CircuitElm[],
  opts: SchematicOptions,
): void {
  const els = drawn(elements);
  for (const e of els) {
    const dc: DrawContext = {
      painter,
      highlighted: false,
      showValues: opts.showValues,
      euroResistors: opts.euroResistors,
      euroGates: opts.euroGates,
      showOhm: opts.showOhm,
      textFont: opts.textFont,
      dotCount: () => 0,
    };
    viewFor(e)?.draw(e, dc);
  }
  const posts = findPosts(els);
  const post = (p: { x: number; y: number }, role: 'post' | 'badConnection'): void =>
    painter.fillCircle({ x: p.x + 0.5, y: p.y + 0.5 }, 3.5, { role });
  for (const p of posts.draw) post(p, 'post');
  if (opts.junctionDots) {
    for (const p of posts.joins) post(p, 'post');
    for (const p of posts.junctions) painter.fillCircle(p, JUNCTION_RADIUS, { role: 'component' });
  }
  for (const p of posts.bad) post(p, 'badConnection');
}

/** Draw a schematic on a canvas `scale` pixels per circuit unit. Null when there is nothing. */
export function schematicCanvas(
  canvas: HTMLCanvasElement,
  elements: readonly CircuitElm[],
  theme: Theme,
  opts: SchematicOptions,
  scale: number,
): boolean {
  const b = schematicBounds(elements);
  const ctx = canvas.getContext('2d');
  if (b === null || ctx === null) return false;
  canvas.width = Math.max(1, Math.round((b.x2 - b.x1) * scale));
  canvas.height = Math.max(1, Math.round((b.y2 - b.y1) * scale));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!opts.transparent) {
    ctx.fillStyle = theme.canvas.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(scale, 0, 0, scale, -b.x1 * scale, -b.y1 * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter';
  const painter = new CanvasPainter(ctx, new Palette(theme));
  painter.settings = {
    voltageColors: opts.voltageColors,
    voltageRange: opts.voltageRange,
    dots: false,
    valueScale: opts.valueScale,
  };
  drawSchematic(painter, elements, opts);
  return true;
}

/** Text widths for the SVG painter: a canvas in the browser, an estimate elsewhere. */
export type MeasureText = (s: string, font: string, size: number) => number;

export const estimateText: MeasureText = (s, _font, size) => s.length * size * 0.6;

const fmt = (v: number): string => String(Math.round(v * 100) / 100);

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Painter that writes SVG elements, in circuit units (the viewBox maps them to the image). */
export class SvgPainter implements Painter {
  private readonly out: string[] = [];
  private readonly defs: string[] = [];
  private gradients = 0;

  readonly palette: Palette;
  readonly opts: SchematicOptions;
  private readonly measure: MeasureText;

  constructor(palette: Palette, opts: SchematicOptions, measure: MeasureText = estimateText) {
    this.palette = palette;
    this.opts = opts;
    this.measure = measure;
  }

  /** The color of an ink: a CSS color, or `url(#g…)` for a voltage gradient. */
  private paint(ink: Ink): string {
    const p = this.palette;
    const o = this.opts;
    if ('role' in ink) return p.roles[ink.role];
    if ('voltage' in ink)
      return o.voltageColors ? p.voltage(ink.voltage, o.voltageRange) : p.roles.component;
    if ('gradient' in ink) {
      if (!o.voltageColors) return p.roles.component;
      const { from, to, v1, v2 } = ink.gradient;
      const id = `g${this.gradients++}`;
      this.defs.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fmt(from.x)}" y1="${fmt(from.y)}" x2="${fmt(to.x)}" y2="${fmt(to.y)}">` +
          `<stop offset="0" stop-color="${p.voltage(v1, o.voltageRange)}"/>` +
          `<stop offset="1" stop-color="${p.voltage(v2, o.voltageRange)}"/></linearGradient>`,
      );
      return `url(#${id})`;
    }
    if ('heat' in ink) {
      const { voltage, level } = ink.heat;
      const base = o.voltageColors ? p.voltage(voltage, o.voltageRange) : p.roles.component;
      const c = heatColor(parseColor(base) ?? { r: 0, g: 0, b: 0, a: 1 }, level);
      return c === null ? p.roles.label : toCss(c);
    }
    const [r, g, b] = ink.rgb;
    return toCss({ r, g, b, a: 1 });
  }

  private strokeAttrs(ink: Ink, style: StrokeStyle | undefined): string {
    const w = ((style?.width ?? UPSTREAM_THICK) * this.palette.theme.style.strokeWidth) / 3;
    const dash = style?.dash?.length ? ` stroke-dasharray="${style.dash.map(fmt).join(' ')}"` : '';
    return `fill="none" stroke="${this.paint(ink)}" stroke-width="${fmt(w)}"${dash}`;
  }

  private points(pts: readonly Pt[]): string {
    return pts.map((q) => `${fmt(q.x)},${fmt(q.y)}`).join(' ');
  }

  line(a: Pt, b: Pt, ink: Ink, style?: StrokeStyle): void {
    this.out.push(
      `<line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(b.x)}" y2="${fmt(b.y)}" ${this.strokeAttrs(ink, style)}/>`,
    );
  }

  polyline(
    points: readonly Pt[],
    ink: Ink,
    style?: StrokeStyle & { readonly closed?: boolean },
  ): void {
    if (points.length === 0) return;
    const tag = style?.closed ? 'polygon' : 'polyline';
    this.out.push(`<${tag} points="${this.points(points)}" ${this.strokeAttrs(ink, style)}/>`);
  }

  fillPolygon(points: readonly Pt[], ink: Ink): void {
    if (points.length === 0) return;
    this.out.push(`<polygon points="${this.points(points)}" fill="${this.paint(ink)}"/>`);
  }

  circle(center: Pt, r: number, ink: Ink, style?: StrokeStyle): void {
    this.out.push(
      `<circle cx="${fmt(center.x)}" cy="${fmt(center.y)}" r="${fmt(r)}" ${this.strokeAttrs(ink, style)}/>`,
    );
  }

  fillCircle(center: Pt, r: number, ink: Ink): void {
    this.out.push(
      `<circle cx="${fmt(center.x)}" cy="${fmt(center.y)}" r="${fmt(r)}" fill="${this.paint(ink)}"/>`,
    );
  }

  private family(style?: TextStyle): string {
    const { font, monoFont } = this.palette.theme.style;
    return style?.font === 'value' ? monoFont : style?.font === 'serif' ? 'Georgia, serif' : font;
  }

  fontSize(style?: TextStyle): number {
    if (style?.font === 'value' && style.size === undefined) return 12 * this.opts.valueScale;
    return style?.size ?? 12;
  }

  measureText(s: string, style?: TextStyle): number {
    const size = this.fontSize(style);
    const font = `${style?.italic ? 'italic ' : ''}${style?.bold ? 'bold ' : ''}${size}px ${this.family(style)}`;
    return this.measure(s, font, size);
  }

  text(s: string, at: Pt, ink: Ink, style?: TextStyle): void {
    let a = `x="${fmt(at.x)}" y="${fmt(at.y)}"`;
    a += ` font-family="${esc(this.family(style))}" font-size="${fmt(this.fontSize(style))}"`;
    if (style?.bold) a += ' font-weight="bold"';
    if (style?.italic) a += ' font-style="italic"';
    if (style?.align === 'center') a += ' text-anchor="middle"';
    if (style?.baseline === 'middle') a += ' dominant-baseline="middle"';
    if (style?.rotate)
      a += ` transform="rotate(${fmt((style.rotate * 180) / Math.PI)} ${fmt(at.x)} ${fmt(at.y)})"`;
    this.out.push(`<text ${a} fill="${this.paint(ink)}" xml:space="preserve">${esc(s)}</text>`);
  }

  dots(): void {}

  /** The SVG document for the area `b` (circuit units), one image pixel per unit. */
  document(b: Rect, background: string | null): string {
    const w = b.x2 - b.x1;
    const h = b.y2 - b.y1;
    const bg =
      background === null
        ? ''
        : `<rect x="${fmt(b.x1)}" y="${fmt(b.y1)}" width="${fmt(w)}" height="${fmt(h)}" fill="${background}"/>\n`;
    const defs = this.defs.length ? `<defs>\n${this.defs.join('\n')}\n</defs>\n` : '';
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}" height="${fmt(h)}" viewBox="${fmt(b.x1)} ${fmt(b.y1)} ${fmt(w)} ${fmt(h)}" stroke-linecap="round" stroke-linejoin="miter">\n` +
      defs +
      bg +
      this.out.join('\n') +
      '\n</svg>\n'
    );
  }
}

/** The schematic as an SVG document, or null when there is nothing to draw. */
export function schematicSvg(
  elements: readonly CircuitElm[],
  theme: Theme,
  opts: SchematicOptions,
  measure: MeasureText = estimateText,
): string | null {
  const b = schematicBounds(elements);
  if (b === null) return null;
  const painter = new SvgPainter(new Palette(theme), opts, measure);
  drawSchematic(painter, elements, opts);
  return painter.document(b, opts.transparent ? null : theme.canvas.background);
}
