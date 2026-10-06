// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// The bottom area follows CircuitJS1 UIManager.drawBottomArea
// (src/com/lushprojects/circuitjs1/client/UIManager.java, master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: scopes on the left, the info text right of them.

import type {
  Scope,
  ScopeGraphics,
  ScopeImage,
  ScopeInk,
  ScopeManager,
  ScopeDrop,
  ScopeRect,
  ScopeTextStyle,
} from '@circuitjs-next/elements';
import { CARD_GAP, drawLeader } from '@circuitjs-next/elements';
import { fullRadius, shapeRadius, toCss, type Theme } from '@circuitjs-next/theme';

/** Scope inks resolved to CSS colors for one theme. */
export class ScopePalette {
  readonly theme: Theme;
  private readonly named: Record<Exclude<ScopeInk, object>, string>;

  constructor(theme: Theme) {
    this.theme = theme;
    const s = theme.scope;
    this.named = {
      voltage: s.traces[0] ?? s.text,
      current: s.current,
      other: s.text,
      gridMinor: s.grid,
      gridMajor: s.gridMajor,
      text: s.text,
      background: s.background,
      selection: theme.circuit.selection,
      muted: s.gridMajor,
      settings: theme.ui.textMuted,
      trigger: s.trigger,
      fft: s.fft,
      fftGrid: s.fftGrid,
      measure: theme.ui.textMuted,
      card: s.card,
      textMuted: theme.ui.textMuted,
    };
  }

  color(ink: ScopeInk): string {
    if (typeof ink === 'string') return this.named[ink];
    if ('trace' in ink) {
      // the first trace color is the voltage plot's; repeated plots cycle through the rest
      const t = this.theme.scope.traces;
      if (t.length < 2) return t[0] ?? this.named.text;
      return t[1 + (ink.trace % (t.length - 1))] ?? this.named.text;
    }
    const [r, g, b] = ink.rgb;
    return toCss({ r, g, b, a: 1 });
  }
}

/** X-Y plot trail image on an offscreen canvas. */
export class CanvasScopeImage implements ScopeImage {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private readonly palette: () => ScopePalette;
  private readonly dpr: () => number;
  width = 1;
  height = 1;

  constructor(palette: () => ScopePalette, dpr: () => number, width: number, height: number) {
    this.palette = palette;
    this.dpr = dpr;
    this.canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(1, 1)
        : document.createElement('canvas');
    const ctx = this.canvas.getContext('2d') as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (ctx === null) throw new Error('2D canvas not available');
    this.ctx = ctx;
    this.resize(width, height);
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    const d = this.dpr();
    this.canvas.width = Math.max(1, Math.round(this.width * d));
    this.canvas.height = Math.max(1, Math.round(this.height * d));
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  clear(): void {
    const c = this.ctx;
    c.globalAlpha = 1;
    c.fillStyle = this.palette().color('background');
    c.fillRect(0, 0, this.width - 1, this.height - 1);
  }

  segment(x1: number, y1: number, x2: number, y2: number, ink: ScopeInk, alpha: number): void {
    const c = this.ctx;
    c.globalAlpha = alpha;
    c.strokeStyle = this.palette().color(ink);
    c.lineWidth = 1.25;
    // round ends so the short segments join without notches
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    c.globalAlpha = 1;
  }

  fade(alpha: number): void {
    const c = this.ctx;
    c.globalAlpha = alpha;
    c.fillStyle = this.palette().color('background');
    c.fillRect(0, 0, this.width, this.height);
    c.globalAlpha = 1;
  }
}

/**
 * ScopeGraphics on a 2D context. Consecutive lines of one color and width go into one path, so a
 * trace is a single stroke rather than one per pixel column.
 */
export class CanvasScopeGraphics implements ScopeGraphics {
  readonly ctx: CanvasRenderingContext2D;
  palette: ScopePalette;
  /** Fonts per text style; `normal` is upstream's 12 px scope text. */
  fonts: Record<ScopeTextStyle, string>;
  private textStyle: ScopeTextStyle = 'normal';
  private color = '';
  private pathWidth = 0;
  private pathOpen = false;

  constructor(ctx: CanvasRenderingContext2D, palette: ScopePalette, theme: Theme) {
    this.ctx = ctx;
    this.palette = palette;
    this.fonts = fontsFor(theme);
  }

  /** upstream's scope font. */
  get font(): string {
    return this.fonts.normal;
  }

  /** Forget the cached color: the canvas state was changed by someone else since. */
  begin(): void {
    this.pathOpen = false;
    this.color = '';
  }

  /** Stroke any batched lines. Call before reading the canvas or changing its state directly. */
  flush(): void {
    if (!this.pathOpen) return;
    this.ctx.stroke();
    this.pathOpen = false;
  }

  setColor(ink: ScopeInk): void {
    const c = this.palette.color(ink);
    if (c === this.color) return;
    this.flush();
    this.color = c;
    this.ctx.strokeStyle = c;
    this.ctx.fillStyle = c;
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, width = 1): void {
    const c = this.ctx;
    if (!this.pathOpen || width !== this.pathWidth) {
      this.flush();
      c.lineWidth = width;
      this.pathWidth = width;
      c.beginPath();
      this.pathOpen = true;
    }
    // upstream lines are square-ended; centre one-pixel lines on pixels so they stay crisp
    const o = width === 1 ? 0.5 : 0;
    c.moveTo(x1 + o, y1 + o);
    c.lineTo(x2 + o, y2 + o);
  }

  drawThickCircle(cx: number, cy: number, r: number): void {
    this.flush();
    const c = this.ctx;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();
  }

  drawString(s: string, x: number, y: number): void {
    this.flush();
    const c = this.ctx;
    c.font = this.fonts[this.textStyle];
    c.fillText(s, x, y);
  }

  measureWidth(s: string): number {
    const c = this.ctx;
    c.font = this.fonts[this.textStyle];
    return c.measureText(s).width;
  }

  setTextStyle(style: ScopeTextStyle): void {
    this.textStyle = style;
  }

  fillRoundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.flush();
    roundRect(this.ctx, x, y, w, h, r, this.palette.theme.style.roundness);
    this.ctx.fill();
  }

  strokeRoundRect(x: number, y: number, w: number, h: number, r: number, width: number): void {
    this.flush();
    const c = this.ctx;
    c.lineWidth = width;
    this.pathWidth = 0;
    roundRect(c, x, y, w, h, r, this.palette.theme.style.roundness);
    c.stroke();
  }

  setLineDash(segments: readonly number[]): void {
    this.flush();
    this.ctx.setLineDash(segments as number[]);
  }

  strokePolyline(xs: ArrayLike<number>, ys: ArrayLike<number>, n: number, width: number): void {
    if (n < 2) return;
    this.flush();
    const c = this.ctx;
    c.lineWidth = width;
    this.pathWidth = 0;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(xs[0] ?? 0, ys[0] ?? 0);
    for (let i = 1; i < n; i++) c.lineTo(xs[i] ?? 0, ys[i] ?? 0);
    c.stroke();
    c.lineJoin = 'miter';
    c.lineCap = 'butt';
  }

  fillPolygon(xs: ArrayLike<number>, ys: ArrayLike<number>, n: number): void {
    if (n < 3) return;
    this.flush();
    const c = this.ctx;
    c.beginPath();
    c.moveTo(xs[0] ?? 0, ys[0] ?? 0);
    for (let i = 1; i < n; i++) c.lineTo(xs[i] ?? 0, ys[i] ?? 0);
    c.closePath();
    c.fill();
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.flush();
    this.ctx.fillRect(x, y, w, h);
  }

  fillOval(x: number, y: number, w: number, h: number): void {
    this.flush();
    const c = this.ctx;
    c.beginPath();
    c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    c.fill();
  }

  save(): void {
    this.flush();
    this.ctx.save();
  }

  restore(): void {
    this.flush();
    this.ctx.restore();
    // the context's colors come back with it
    this.color = '';
  }

  translate(x: number, y: number): void {
    this.flush();
    this.ctx.translate(x, y);
  }

  clipRect(x: number, y: number, w: number, h: number): void {
    this.flush();
    const c = this.ctx;
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
  }

  setGlobalAlpha(a: number): void {
    this.flush();
    this.ctx.globalAlpha = a;
  }

  drawImage(img: ScopeImage, x: number, y: number): void {
    this.flush();
    if (!(img instanceof CanvasScopeImage)) return;
    this.ctx.drawImage(img.canvas, x, y, img.width, img.height);
  }
}

/** An undocked scope to draw, with the screen point its leader line goes to. */
export interface UndockedScopeItem {
  scope: Scope;
  target: { x: number; y: number } | null;
  /** The card or what it shows is hovered or selected. */
  active: boolean;
  /** While its leader is dragged: the posts it can snap to, and the one it would. */
  posts?: readonly { x: number; y: number }[];
  snapPost?: number;
}

/** What the bottom area shows besides the scopes. */
export interface BottomAreaState {
  /** Scope area in CSS pixels (the canvas below the circuit). */
  area: ScopeRect;
  /** Info lines: the hovered element's getInfo, or time and time step. */
  info: readonly string[];
  /** The mouse is on the splitter between circuit and scopes. */
  splitterHot: boolean;
  /**
   * A docked card being dragged by its handle: where it would land (ScopeManager.moveScope),
   * the pointer, and what dropping does, in words.
   */
  drag?: {
    from: Scope;
    to: Scope | null;
    where: ScopeDrop | null;
    x: number;
    y: number;
    label: string;
  } | null;
  /** The name of the card header button under the mouse, centred below (x, y). */
  tip?: { text: string; x: number; y: number } | null;
}

/** Text size of scope labels and the info area (upstream `unitsFont`, 12 px). */
const FONT_SIZE = 12;
/** Height of the info box when there are no scopes (upstream: 70 px). */
const INFO_BOX_HEIGHT = 70;

/**
 * Draws the docked scopes and the info text on the circuit canvas, below (and, for cursor
 * readouts, slightly over) the circuit, as upstream's bottom area.
 */
/** How long a card takes to fly into place (ms). */
const CARD_MS = 260;

export class ScopeRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private palette: ScopePalette;
  private graphics: CanvasScopeGraphics;
  private dpr = 1;
  /**
   * Width of the info box in the corner: it only grows while it shows the same thing (the same
   * first line and number of lines), so it doesn't jitter as the values change.
   */
  private infoBox = { key: '', width: 0 };
  /** Cards flying to a new place (docked, undocked) or growing in: where from, and when. */
  private readonly cardAnims = new WeakMap<Scope, { from: ScopeRect | null; start: number }>();

  constructor(canvas: HTMLCanvasElement, theme: Theme) {
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('2D canvas not available');
    this.canvas = canvas;
    this.ctx = ctx;
    this.palette = new ScopePalette(theme);
    this.graphics = new CanvasScopeGraphics(ctx, this.palette, theme);
  }

  /**
   * Animate a card into its place: from a rectangle (where it was docked or undocked, or the
   * point it was opened from), or growing in where it is when `from` is null.
   */
  animateCard(s: Scope, from: ScopeRect | null): void {
    this.cardAnims.set(s, { from, start: performance.now() });
  }

  /** Whether a card is still animating. */
  private cardAnimating(s: Scope, now: number): boolean {
    const a = this.cardAnims.get(s);
    if (a === undefined) return false;
    if (now - a.start < CARD_MS) return true;
    this.cardAnims.delete(s);
    return false;
  }

  /** Draw a scope, moved and scaled along its card animation if it has one. */
  private drawScope(s: Scope, now: number): void {
    const g = this.graphics;
    const a = this.cardAnims.get(s);
    if (a === undefined || !this.cardAnimating(s, now)) {
      s.draw(g);
      return;
    }
    const t = (now - a.start) / CARD_MS;
    const e = 1 - (1 - t) ** 3;
    const to = s.slot;
    const from = a.from ?? {
      x: to.x + to.width * 0.08,
      y: to.y + to.height * 0.08,
      width: to.width * 0.84,
      height: to.height * 0.84,
    };
    const lerp = (p: number, q: number): number => p + (q - p) * e;
    const w = lerp(Math.max(1, from.width), to.width);
    const h = lerp(Math.max(1, from.height), to.height);
    const cx = lerp(from.x + from.width / 2, to.x + to.width / 2);
    const cy = lerp(from.y + from.height / 2, to.y + to.height / 2);
    // one scale for both axes, so the card keeps its shape while it travels
    const sc = Math.sqrt((w / to.width) * (h / to.height));
    g.save();
    const c = this.ctx;
    c.translate(cx, cy);
    c.scale(sc, sc);
    c.translate(-(to.x + to.width / 2), -(to.y + to.height / 2));
    c.globalAlpha = Math.min(1, 0.3 + e);
    s.draw(g);
    g.restore();
  }

  setTheme(theme: Theme): void {
    this.palette = new ScopePalette(theme);
    this.graphics.palette = this.palette;
    this.graphics.fonts = fontsFor(theme);
  }

  /** An offscreen image for an X-Y plot (ScopeHost.createImage). */
  createImage(width: number, height: number): ScopeImage {
    return new CanvasScopeImage(
      () => this.palette,
      () => this.dpr,
      width,
      height,
    );
  }

  /**
   * Draw undocked scopes over the circuit (above `clipHeight`, the top of the scope area). In the
   * card look each has a leader line to the point it shows; upstream's look draws just the scope.
   */
  renderUndocked(
    mgr: ScopeManager,
    items: readonly UndockedScopeItem[],
    width: number,
    clipHeight: number,
    dpr: number,
  ): void {
    if (items.length === 0) return;
    this.dpr = dpr;
    const c = this.ctx;
    const g = this.graphics;
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalAlpha = 1;
    c.lineCap = 'butt';
    c.textBaseline = 'alphabetic';
    c.beginPath();
    c.rect(0, 0, width, clipHeight);
    c.clip();
    g.begin();
    const now = performance.now();
    const flying = items.filter((it) => this.cardAnimating(it.scope, now));
    if (mgr.look === 'cards') {
      for (const it of items)
        if (it.target !== null && !flying.includes(it))
          drawLeader(it.scope, g, it.target.x, it.target.y, it.active);
      // a leader being dragged: rings on the posts it can point at
      for (const it of items) {
        if (it.posts === undefined) continue;
        g.setColor('selection');
        it.posts.forEach((p, k) => {
          const r = k === it.snapPost ? 7 : 5;
          g.strokeRoundRect(p.x - r, p.y - r, 2 * r, 2 * r, r, k === it.snapPost ? 2 : 1);
        });
      }
      g.flush();
    }
    for (const it of items) if (!flying.includes(it)) it.scope.draw(g);
    g.flush();
    c.restore();
    // a card on its way in may come up from the docked area: not clipped to the circuit
    if (flying.length > 0) {
      c.save();
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.begin();
      for (const it of flying) this.drawScope(it.scope, now);
      g.flush();
      c.restore();
    }
    g.setTextStyle('normal');
  }

  render(mgr: ScopeManager, state: BottomAreaState, dpr: number): void {
    this.dpr = dpr;
    const c = this.ctx;
    const g = this.graphics;
    const { area } = state;
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalAlpha = 1;
    c.lineCap = 'butt';
    c.textBaseline = 'alphabetic';
    const theme = this.palette.theme;
    const hasScopes = mgr.scopeCount > 0;
    g.begin();

    const cards = mgr.look === 'cards';

    if (hasScopes) {
      // cards float on the canvas; upstream's scopes sit on one black strip
      c.fillStyle = cards ? theme.canvas.background : theme.scope.background;
      c.fillRect(area.x, area.y, area.width, area.height);
      const now = performance.now();
      for (const s of mgr.scopes) if (mgr.isShown(s)) this.drawScope(s, now);
      g.flush();
      g.setTextStyle('normal');
      if (state.drag) this.drawDrag(state.drag, area);
      if (state.splitterHot) {
        c.fillStyle = theme.circuit.selection;
        c.fillRect(area.x, area.y - 3, area.width, 4);
      }
    }

    const info = state.info;
    if (info.length > 0) {
      // values are fixed-width text: in the monospace font they don't shift as digits change
      c.font = `${FONT_SIZE}px ${theme.style.monoFont}`;
      c.textBaseline = 'alphabetic';
      if (hasScopes && !mgr.compact && !cards) {
        // upstream: right of the scopes
        c.fillStyle = theme.scope.text;
        const x = mgr.scopesRightEdge() + 20;
        for (let i = 0; i !== info.length; i++) c.fillText(info[i] ?? '', x, area.y + 15 * (i + 1));
      } else if (hasScopes && !mgr.compact) {
        // a card of its own beside the scope cards
        const x = mgr.scopesRightEdge() + CARD_GAP;
        const w = area.x + area.width - x - CARD_GAP / 2;
        const y = area.y + CARD_GAP / 2;
        const h = area.height - CARD_GAP;
        if (w > 40 && h > 20) {
          c.fillStyle = theme.scope.card;
          roundRect(c, x, y, w, h, 10, theme.style.roundness);
          c.fill();
          c.save();
          c.beginPath();
          c.rect(x, y, w - 8, h - 6);
          c.clip();
          c.fillStyle = theme.scope.text;
          for (let i = 0; i !== info.length; i++)
            c.fillText(info[i] ?? '', x + 12, y + 22 + 16 * i);
          c.restore();
        }
      } else {
        // no scopes, or one column on a phone: a box in the bottom right corner of the circuit
        let w = 0;
        for (const s of info) w = Math.max(w, c.measureText(s).width);
        const key = `${info.length} ${info[0] ?? ''}`;
        if (key !== this.infoBox.key) this.infoBox = { key, width: 0 };
        w = this.infoBox.width = Math.max(this.infoBox.width, w);
        const h = Math.max(hasScopes ? 0 : INFO_BOX_HEIGHT, 15 * info.length + 12);
        const bw = Math.ceil(w) + 20;
        const x = area.x + area.width - bw + 10 - (hasScopes ? 8 : 0);
        const y = (hasScopes ? area.y - 8 : area.y + area.height) - h;
        c.globalAlpha = 0.85;
        c.fillStyle = cards ? theme.scope.card : theme.scope.background;
        roundRect(c, x - 10, y, bw, h, 8, theme.style.roundness);
        c.fill();
        c.globalAlpha = 1;
        c.fillStyle = theme.scope.text;
        for (let i = 0; i !== info.length; i++) c.fillText(info[i] ?? '', x, y + 15 * (i + 1));
      }
    }
    if (state.drag && state.drag.label !== '')
      this.pill(state.drag.label, state.drag.x + 14, state.drag.y + 18, 'left');
    if (state.tip) this.pill(state.tip.text, state.tip.x, state.tip.y + 6, 'center');
    c.restore();
  }

  /** Where a dragged docked card would land: a bar between cards or columns, or a frame. */
  private drawDrag(drag: NonNullable<BottomAreaState['drag']>, area: ScopeRect): void {
    const c = this.ctx;
    const theme = this.palette.theme;
    // the card being moved fades back
    const f = drag.from.slot;
    c.globalAlpha = 0.55;
    c.fillStyle = theme.canvas.background;
    roundRect(c, f.x, f.y, f.width, f.height, 10, theme.style.roundness);
    c.fill();
    c.globalAlpha = 1;
    const to = drag.to;
    if (to === null || drag.where === null) return;
    const r = to.slot;
    c.fillStyle = c.strokeStyle = theme.ui.accent;
    const bar = 4;
    switch (drag.where) {
      case 'above':
        roundRect(c, r.x, r.y - bar / 2, r.width, bar, bar / 2, theme.style.roundness);
        break;
      case 'below':
        roundRect(c, r.x, r.y + r.height - bar / 2, r.width, bar, bar / 2, theme.style.roundness);
        break;
      case 'left':
        roundRect(
          c,
          r.x - bar / 2,
          area.y + 2,
          bar,
          area.height - 4,
          bar / 2,
          theme.style.roundness,
        );
        break;
      case 'right':
        roundRect(
          c,
          r.x + r.width - bar / 2,
          area.y + 2,
          bar,
          area.height - 4,
          bar / 2,
          theme.style.roundness,
        );
        break;
      case 'combine':
        c.globalAlpha = 0.12;
        roundRect(c, r.x, r.y, r.width, r.height, 10, theme.style.roundness);
        c.fill();
        c.globalAlpha = 1;
        c.lineWidth = 2;
        roundRect(c, r.x + 1, r.y + 1, r.width - 2, r.height - 2, 10, theme.style.roundness);
        c.stroke();
        return;
    }
    c.fill();
  }

  /** A small label in a pill (inverse colors, as a tooltip), kept inside the canvas. */
  private pill(text: string, x: number, y: number, align: 'left' | 'center'): void {
    const c = this.ctx;
    const theme = this.palette.theme;
    c.font = `${FONT_SIZE}px ${theme.style.font}`;
    const w = Math.ceil(c.measureText(text).width) + 16;
    const h = 22;
    const cw = this.canvas.width / this.dpr;
    const ch = this.canvas.height / this.dpr;
    let left = align === 'center' ? x - w / 2 : x;
    left = Math.max(4, Math.min(cw - w - 4, left));
    const top = Math.max(4, Math.min(ch - h - 4, y));
    c.globalAlpha = 0.92;
    c.fillStyle = theme.ui.text;
    roundRect(c, left, top, w, h, 6, theme.style.roundness);
    c.fill();
    c.globalAlpha = 1;
    c.fillStyle = theme.ui.surface;
    c.textBaseline = 'middle';
    c.fillText(text, left + 8, top + h / 2 + 1);
    c.textBaseline = 'alphabetic';
  }
}

function fontsFor(theme: Theme): Record<ScopeTextStyle, string> {
  const f = theme.style.font;
  return {
    normal: `${FONT_SIZE}px ${f}`,
    title: `500 ${FONT_SIZE}px ${f}`,
    label: `11px ${f}`,
    value: `11px ${theme.style.monoFont}`,
  };
}

/**
 * A canvas corner radius under the theme's `style.roundness`, as the UI's CSS radii follow it: a
 * radius of half the side or more is a round end (round while roundness is 1 or more). Glyphs and
 * markers (14 px or smaller: icon parts, legend dots, cursor rings) keep their shape.
 */
function corner(r: number, w: number, h: number, roundness: number): number {
  const half = Math.max(0, Math.min(w, h) / 2);
  if (Math.max(w, h) <= 14) return Math.min(r, half);
  if (r >= half) return roundness >= 1 ? half : Math.min(half, parseFloat(fullRadius(roundness)));
  return Math.min(half, shapeRadius(r, roundness));
}

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  roundness = 1,
): void {
  const r = corner(radius, w, h, roundness);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
