// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// What is drawn and in which order follows CircuitJS1 UIManager.updateCircuit and
// SimulationManager (post and bad-connection lists) (src/com/lushprojects/circuitjs1/client/,
// master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.

import {
  rectContains,
  unionRect,
  viewFor,
  type CircuitElm,
  type DrawContext,
  type Rect,
  type TextFont,
} from '@circuitjs-next/elements';
import type { Theme } from '@circuitjs-next/theme';
import { CanvasPainter } from './CanvasPainter.ts';
import { DotCounters } from './dots.ts';
import { anyFields, FieldOverlay, NO_FIELDS, type FieldOptions } from './fields.ts';
import { Palette } from './palette.ts';
import { findPosts, type PostInfo } from './posts.ts';
import { Viewport } from './Viewport.ts';

/** Per-frame inputs from the app. */
export interface FrameState {
  running: boolean;
  /** From currentMultiplier(): how far dots move per ampere this frame. */
  currentMult: number;
  /** Circuit options. */
  showDots: boolean;
  voltageColors: boolean;
  showValues: boolean;
  voltageRange: number;
  /** User settings. */
  euroResistors: boolean;
  euroGates: boolean;
  showOhm: boolean;
  textFont: TextFont;
  /** Mark points where three or more element ends meet with a solid schematic dot. */
  junctionDots: boolean;
  /** Field, charge and energy visualizations to draw (fields.ts). */
  fields: FieldOptions;
  /** Grid spacing in circuit units (16, or 8 with the small grid option). */
  gridSize: number;
  /** Size of component value text, as a fraction of 12 px (Options > Value text size). */
  valueScale: number;
}

export const DEFAULT_FRAME: FrameState = {
  running: true,
  currentMult: 0,
  showDots: true,
  voltageColors: true,
  showValues: true,
  voltageRange: 5,
  euroResistors: false,
  euroGates: false,
  showOhm: false,
  textFont: { family: 'default', bold: false, italic: false },
  junctionDots: false,
  fields: NO_FIELDS,
  gridSize: 16,
  valueScale: 1,
};

/** Radius of a junction dot, larger than a post so it reads as a schematic junction. */
const JUNCTION_RADIUS = 6;

/** Durations of the edit feedback effects (ms). */
const POP_MS = 220;
const GHOST_MS = 180;
const RIPPLE_MS = 420;
/** More elements than this added or removed at once (a load, a big paste) get no effect. */
const EFFECT_LIMIT = 40;

/**
 * Small animations that answer an edit: a new element pops in, a deleted one fades out, and a
 * ring spreads from a point where ends were just joined.
 */
type Effect =
  | { kind: 'pop'; elm: CircuitElm; start: number }
  | { kind: 'ghost'; elm: CircuitElm; start: number }
  | { kind: 'ripple'; x: number; y: number; start: number };

/** Ease out with a little overshoot. */
function easeOutBack(t: number): number {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

/**
 * Draws a circuit on a canvas: grid, elements through their views, posts, bad connections. Owns
 * the viewport (pan, zoom, HiDPI) and hit testing.
 */
export class CircuitRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly viewport = new Viewport();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly painter: CanvasPainter;
  private palette: Palette;
  private readonly dots = new DotCounters();
  private readonly fields = new FieldOverlay();
  private elements: CircuitElm[] = [];
  private posts: PostInfo = { draw: [], bad: [], junctions: [], joins: [] };
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  /** Element under the mouse. */
  hovered: CircuitElm | null = null;
  /** Element that stopped the simulation; drawn highlighted and on top. */
  stopElm: CircuitElm | null = null;
  /** Element being placed (not in the circuit yet); drawn on top with all its posts. */
  pending: CircuitElm | null = null;
  /** Rubber band selection in circuit coordinates. */
  selectionRect: Rect | null = null;
  /** Elements the scope under the mouse shows; drawn highlighted (upstream scopePlotRoles). */
  scopeHighlights: ReadonlyMap<CircuitElm, string> = new Map();
  /** Elements an analysis table row points at (a node's wires, a part); drawn highlighted. */
  analysisHighlights: ReadonlySet<CircuitElm> = new Set();
  /** Height of the circuit area in CSS pixels; scopes take the rest. Null: the whole canvas. */
  circuitHeight: number | null = null;
  /** Draw without hover or selection highlights and without the grid (a preview of a part). */
  plain = false;
  /** Play edit feedback animations (off when the user prefers reduced motion). */
  motion = true;
  private effects: Effect[] = [];
  /** The element last being placed: it needs no pop once it lands. */
  private lastPending: CircuitElm | null = null;

  constructor(canvas: HTMLCanvasElement, theme: Theme) {
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('2D canvas not available');
    this.canvas = canvas;
    this.ctx = ctx;
    this.palette = new Palette(theme);
    this.painter = new CanvasPainter(ctx, this.palette);
  }

  get theme(): Theme {
    return this.palette.theme;
  }

  setTheme(theme: Theme): void {
    this.palette = new Palette(theme);
    this.painter.palette = this.palette;
  }

  /** Show a new circuit; dot positions restart. */
  setElements(elements: CircuitElm[]): void {
    this.effects = [];
    this.elements = elements;
    this.dots.clear();
    this.fields.clear();
    this.hovered = null;
    this.stopElm = null;
    this.posts = this.findPosts();
  }

  /** The simulation restarted: the field overlay forgets the peaks it scales against. */
  resetFields(): void {
    this.fields.clear();
  }

  /** The circuit was edited (elements added, removed or moved); dot positions are kept. */
  elementsChanged(elements: CircuitElm[]): void {
    if (this.motion) this.diffEffects(this.elements, elements);
    this.elements = elements;
    if (this.hovered !== null && !elements.includes(this.hovered)) this.hovered = null;
    this.posts = this.findPosts();
  }

  private diffEffects(before: readonly CircuitElm[], after: readonly CircuitElm[]): void {
    const was = new Set(before);
    const now = new Set(after);
    const added = after.filter((e) => !was.has(e) && e !== this.lastPending);
    const removed = before.filter((e) => !now.has(e));
    const t = performance.now();
    if (added.length <= EFFECT_LIMIT)
      for (const elm of added) this.effects.push({ kind: 'pop', elm, start: t });
    if (removed.length <= EFFECT_LIMIT)
      for (const elm of removed) this.effects.push({ kind: 'ghost', elm, start: t });
  }

  /** A ring spreading from a circuit point (ends joined there, a leader pinned there). */
  ripple(x: number, y: number): void {
    if (this.motion) this.effects.push({ kind: 'ripple', x, y, start: performance.now() });
  }

  /** Points where two or more element ends meet, as "x,y" keys. */
  connectionKeys(): Set<string> {
    const keys = new Set<string>();
    for (const p of this.posts.joins) keys.add(`${p.x},${p.y}`);
    for (const p of this.posts.junctions) keys.add(`${p.x},${p.y}`);
    return keys;
  }

  /** Whether an effect is still playing (a test can wait for the canvas to settle). */
  get animating(): boolean {
    return this.effects.length > 0;
  }

  /** Recompute post lists after elements moved or changed shape. */
  refreshPosts(): void {
    this.posts = this.findPosts();
  }

  /** Number of bad connections (shown in the status bar, as upstream's info area does). */
  get badConnectionCount(): number {
    return this.posts.bad.length;
  }

  /** Canvas size in CSS pixels and the device pixel ratio. */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  /** Bounds of the circuit in circuit units (upstream `getCircuitBounds`), null when empty. */
  circuitBounds(elements: readonly CircuitElm[] = this.elements): Rect | null {
    let r: Rect | null = null;
    for (const e of elements) {
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
    return r;
  }

  /** Pan so an element is on screen (keyboard selection), keeping the zoom. */
  reveal(e: CircuitElm): void {
    const v = viewFor(e);
    const b = v ? v.bbox(e) : { x1: e.x, y1: e.y, x2: e.x2, y2: e.y2 };
    const vp = this.viewport;
    const h =
      this.circuitHeight === null ? this.cssHeight : Math.min(this.circuitHeight, this.cssHeight);
    const a = vp.toScreen(b.x1, b.y1);
    const z = vp.toScreen(b.x2, b.y2);
    const m = 24;
    if (a.x < m) vp.offsetX += m - a.x;
    else if (z.x > this.cssWidth - m) vp.offsetX -= z.x - (this.cssWidth - m);
    if (a.y < m) vp.offsetY += m - a.y;
    else if (z.y > h - m) vp.offsetY -= z.y - (h - m);
  }

  /** Centre the circuit in the canvas. */
  fit(): void {
    const h =
      this.circuitHeight === null ? this.cssHeight : Math.min(this.circuitHeight, this.cssHeight);
    this.viewport.fit(this.circuitBounds(), this.cssWidth, h);
  }

  /** The element at a point in CSS pixels relative to the canvas, smallest box first. */
  elementAt(sx: number, sy: number): CircuitElm | null {
    const { x, y } = this.viewport.toCircuit(sx, sy);
    let best: CircuitElm | null = null;
    let bestArea = Infinity;
    for (const e of this.elements) {
      const v = viewFor(e);
      if (!v) continue;
      const b = v.bbox(e);
      const pad = 2;
      if (!rectContains({ x1: b.x1 - pad, y1: b.y1 - pad, x2: b.x2 + pad, y2: b.y2 + pad }, x, y))
        continue;
      const area = (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1);
      if (area < bestArea) {
        best = e;
        bestArea = area;
      }
    }
    return best;
  }

  render(frame: FrameState): void {
    const c = this.ctx;
    const theme = this.palette.theme;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = theme.canvas.background;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const vp = this.viewport;
    const s = vp.scale * this.dpr;
    c.setTransform(s, 0, 0, s, vp.offsetX * this.dpr, vp.offsetY * this.dpr);
    c.lineCap = 'round';
    c.lineJoin = 'miter';

    if (!this.plain) this.drawGrid(frame.gridSize);

    const painter = this.painter;
    painter.settings = {
      voltageColors: frame.voltageColors,
      voltageRange: frame.voltageRange,
      dots: frame.showDots && frame.running,
      valueScale: frame.valueScale,
    };

    // under the elements, so the parts stay readable
    if (anyFields(frame.fields))
      this.fields.draw(c, this.elements, this.palette, {
        show: frame.fields,
        running: frame.running,
        voltageRange: frame.voltageRange,
        scale: vp.scale,
      });

    const now = performance.now();
    const pops = new Map<CircuitElm, number>();
    this.effects = this.effects.filter((fx) => {
      const age = now - fx.start;
      const keep = age < (fx.kind === 'pop' ? POP_MS : fx.kind === 'ghost' ? GHOST_MS : RIPPLE_MS);
      if (keep && fx.kind === 'pop') pops.set(fx.elm, age / POP_MS);
      return keep;
    });
    for (const fx of this.effects)
      if (fx.kind === 'ghost') this.drawElement(fx.elm, frame, -(now - fx.start) / GHOST_MS);
    for (const e of this.elements)
      if (e !== this.stopElm) this.drawElement(e, frame, pops.get(e) ?? 1);
    if (this.stopElm !== null) this.drawElement(this.stopElm, frame);

    painter.highlighted = false;
    for (const p of this.posts.draw) this.drawPost(p.x, p.y, 'post');
    if (frame.junctionDots) for (const p of this.posts.joins) this.drawPost(p.x, p.y, 'post');
    if (frame.junctionDots)
      for (const p of this.posts.junctions)
        this.painter.fillCircle({ x: p.x, y: p.y }, JUNCTION_RADIUS, { role: 'component' });
    for (const p of this.posts.bad) this.drawPost(p.x, p.y, 'badConnection');

    // upstream UIManager draws the element being placed only once it has length; until the
    // first drag some (MOSFET) have no post geometry yet
    const pend = this.pending;
    if (pend !== null && (pend.x !== pend.x2 || pend.y !== pend.y2)) this.drawElement(pend, frame);
    if (pend !== null) this.lastPending = pend;
    if (this.selectionRect !== null) this.drawSelectionRect(this.selectionRect);
    for (const fx of this.effects)
      if (fx.kind === 'ripple') this.drawRipple(fx.x, fx.y, (now - fx.start) / RIPPLE_MS);
  }

  private drawRipple(x: number, y: number, t: number): void {
    const c = this.ctx;
    const k = 1 - (1 - t) ** 3;
    const scale = this.viewport.scale;
    c.save();
    c.strokeStyle = this.palette.selection;
    c.globalAlpha = 0.7 * (1 - t);
    c.lineWidth = (2.5 - 1.5 * t) / scale;
    c.beginPath();
    c.arc(x + 0.5, y + 0.5, (4 + 16 * k) / scale, 0, 2 * Math.PI);
    c.stroke();
    c.restore();
  }

  private drawSelectionRect(r: Rect): void {
    const c = this.ctx;
    c.save();
    c.strokeStyle = this.palette.selection;
    c.fillStyle = this.palette.selection;
    c.lineWidth = 1 / this.viewport.scale;
    c.setLineDash([4 / this.viewport.scale, 3 / this.viewport.scale]);
    c.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
    c.globalAlpha = 0.08;
    c.fillRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
    c.restore();
  }

  /**
   * Draw one element. `anim` below 1 pops it in (0 to 1: how far along); below 0 it is a deleted
   * element fading out (0 to -1).
   */
  private drawElement(e: CircuitElm, frame: FrameState, anim = 1): void {
    const view = viewFor(e);
    if (!view) return;
    const ghost = anim < 0;
    const painter = this.painter;
    const highlighted =
      !ghost &&
      !this.plain &&
      (e === this.hovered ||
        e === this.stopElm ||
        e.selected ||
        e.drawsHighlighted() ||
        e === this.pending ||
        this.scopeHighlights.has(e) ||
        this.analysisHighlights.has(e));
    painter.highlighted = highlighted;
    painter.highlightColor =
      e === this.stopElm || e.selected || e.drawsHighlighted() || e === this.pending
        ? this.palette.selection
        : this.palette.hover;
    const dots = this.dots;
    const ctx: DrawContext = {
      painter,
      highlighted,
      showValues: frame.showValues,
      euroResistors: frame.euroResistors,
      euroGates: frame.euroGates,
      showOhm: frame.showOhm,
      textFont: frame.textFont,
      dotCount: (slot, current) =>
        dots.advance(e, slot, current, frame.currentMult, frame.running && !ghost),
    };
    this.ctx.save();
    if (anim < 1) {
      const t = ghost ? -anim : anim;
      const sc = ghost ? 1 - 0.15 * t : 0.6 + 0.4 * easeOutBack(t);
      const b = view.bbox(e);
      const cx = (b.x1 + b.x2) / 2;
      const cy = (b.y1 + b.y2) / 2;
      this.ctx.translate(cx, cy);
      this.ctx.scale(sc, sc);
      this.ctx.translate(-cx, -cy);
      this.ctx.globalAlpha = ghost ? 1 - t : Math.min(1, t * 2.5);
    }
    view.draw(e, ctx);
    this.ctx.restore();
    if (highlighted && !ghost) {
      // a highlighted element shows all its posts (upstream drawPosts)
      painter.highlighted = false;
      for (let i = 0; i !== e.getPostCount(); i++) {
        const p = e.getPost(i);
        this.drawPost(p.x, p.y, 'post');
      }
    }
  }

  private drawPost(x: number, y: number, role: 'post' | 'badConnection'): void {
    // upstream fillOval(x-3, y-3, 7, 7)
    this.painter.fillCircle({ x: x + 0.5, y: y + 0.5 }, 3.5, { role });
  }

  private drawGrid(gridSize: number): void {
    const theme = this.palette.theme;
    if (theme.style.grid === 'none' || this.cssWidth === 0) return;
    const vp = this.viewport;
    const step = gridSize * (vp.scale < 0.5 ? 4 : 1);
    const tl = vp.toCircuit(0, 0);
    const br = vp.toCircuit(this.cssWidth, this.cssHeight);
    const x0 = Math.floor(tl.x / step) * step;
    const y0 = Math.floor(tl.y / step) * step;
    const c = this.ctx;
    const major = step * 8;
    const isMajor = (v: number): boolean => Math.abs(v % major) < 1e-9;
    if (theme.style.grid === 'lines') {
      c.lineWidth = 1 / vp.scale;
      for (const majorPass of [false, true]) {
        c.strokeStyle = majorPass ? theme.canvas.gridMajor : theme.canvas.grid;
        c.beginPath();
        for (let x = x0; x <= br.x; x += step) {
          if (isMajor(x) !== majorPass) continue;
          c.moveTo(x, tl.y);
          c.lineTo(x, br.y);
        }
        for (let y = y0; y <= br.y; y += step) {
          if (isMajor(y) !== majorPass) continue;
          c.moveTo(tl.x, y);
          c.lineTo(br.x, y);
        }
        c.stroke();
      }
    } else {
      const r = 1 / vp.scale;
      for (let x = x0; x <= br.x; x += step) {
        for (let y = y0; y <= br.y; y += step) {
          c.fillStyle = isMajor(x) && isMajor(y) ? theme.canvas.gridMajor : theme.canvas.grid;
          c.fillRect(x - r, y - r, 2 * r, 2 * r);
        }
      }
    }
  }
  private findPosts(): PostInfo {
    return findPosts(this.elements);
  }
}
