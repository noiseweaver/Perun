// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// The card look for scopes, this port's own: each scope sits in a card with a header (title,
// time scale, settings and close buttons), legend chips with live values, the readouts upstream
// draws over the plot, a calmer grid with labeled axes, smooth traces with a shaded min/max band,
// and a crosshair that reads every trace. It draws the same data, scales and auto-ranging as
// Scope.draw (CircuitJS1 Scope.java at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032), so switching
// looks changes nothing but the picture.

import { getFixedUnitText, getTimeText, getUnitText } from '../view/units.ts';
import type { WaveEventKind } from './ScopeSnap.ts';
import {
  UNITS_A,
  UNITS_OHMS,
  UNITS_V,
  UNITS_W,
  VAL_IB,
  VAL_IC,
  VAL_VBC,
  VAL_VBE,
} from './constants.ts';
import type { Scope, ScopeRect } from './Scope.ts';
import { ScopeFFT } from './ScopeFFT.ts';
import type { ScopeGraphics, ScopeInk } from './ScopeGraphics.ts';
import type { ScopePlot } from './ScopePlot.ts';

/** Space between cards. */
export const CARD_GAP = 8;
/** Card padding around the plot. */
const PAD = 8;
/** Height of one header line. */
const LINE = 20;
const CARD_RADIUS = 10;
const PLOT_RADIUS = 6;
const ICON = 16;
/** Smooth trace width. */
const TRACE_WIDTH = 1.5;

/** Header lines a card has room for: title and buttons, then legend and readouts. */
export function headerLines(slot: ScopeRect): number {
  return slot.height >= 120 ? 2 : 1;
}

/**
 * An undocked card too small for a header (upstream's undocked scopes can be tiny): just the
 * plot, and the whole card moves it.
 */
export function isMiniCard(slot: ScopeRect): boolean {
  return slot.height < 80 || slot.width < 150;
}

/** Inset of the plot in a mini card. */
const MINI_PAD = 3;

/** The plot area inside a card (`undocked`: on the circuit, where a small one has no header). */
export function cardPlotRect(slot: ScopeRect, undocked = false): ScopeRect {
  if (undocked && isMiniCard(slot))
    return {
      x: slot.x + MINI_PAD,
      y: slot.y + MINI_PAD,
      width: Math.max(4, slot.width - 2 * MINI_PAD),
      height: Math.max(4, slot.height - 2 * MINI_PAD),
    };
  const top = 6 + LINE * headerLines(slot);
  return {
    x: slot.x + PAD,
    y: slot.y + top,
    width: Math.max(10, slot.width - 2 * PAD),
    height: Math.max(10, slot.height - top - PAD),
  };
}

/**
 * Something clickable on a card. `index` is the plot (chip) or column (tab). Undocked cards also
 * have a drag handle (`handle`, the whole card when it is a mini one) and a resize grip.
 */
export interface CardHit {
  kind: 'settings' | 'close' | 'dock' | 'freeze' | 'chip' | 'tab' | 'handle' | 'resize';
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Clickable parts of each card as last drawn. */
const cardHits = new WeakMap<Scope, CardHit[]>();

/** The clickable part of a scope's card at a point, as last drawn. */
export function cardHitTest(scope: Scope, x: number, y: number): CardHit | null {
  for (const h of cardHits.get(scope) ?? [])
    if (x >= h.x && x < h.x + h.width && y >= h.y && y < h.y + h.height) return h;
  return null;
}

/** Short legend name of a plot: V, I, P, R, Q, or a transistor value. */
export function plotName(scope: Scope, plot: ScopePlot): string {
  const tr = plot.elm !== null && scope.mgr.kinds.isTransistor(plot.elm);
  let name: string;
  switch (plot.units) {
    case UNITS_V:
      name = !tr ? 'V' : plot.value === VAL_VBE ? 'Vbe' : plot.value === VAL_VBC ? 'Vbc' : 'Vce';
      break;
    case UNITS_A:
      name = !tr ? 'I' : plot.value === VAL_IB ? 'Ib' : plot.value === VAL_IC ? 'Ic' : 'Ie';
      break;
    case UNITS_W:
      name = 'P';
      break;
    case UNITS_OHMS:
      name = 'R';
      break;
    default:
      name = 'Q';
  }
  // several elements in one scope: number them in the order they appear
  const elms: unknown[] = [];
  for (const p of scope.plots) if (!elms.includes(p.elm)) elms.push(p.elm);
  return elms.length > 1 ? `${name}${elms.indexOf(plot.elm) + 1}` : name;
}

/** Java's Math.round. */
const jround = (v: number): number => Math.floor(v + 0.5);

/** One plot's trace in plot-area pixels: top (max) and bottom (min) edge per column. */
interface Trace {
  plot: ScopePlot;
  selected: boolean;
  n: number;
  top: Float64Array;
  bot: Float64Array;
  valid: Uint8Array;
}

/**
 * Pixel columns of a plot, with upstream's auto-range bookkeeping (Scope.drawPlot): a value
 * outside the middle band means the scale has no room to shrink.
 */
function tracePixels(
  scope: Scope,
  plot: ScopePlot,
  selected: boolean,
  allPlotsSameUnits: boolean,
): { trace: Trace; gridMid: number } {
  const rect = scope.rect;
  const maxy = Math.trunc((rect.height - 1) / 2);
  const ipa = scope.displayStartIndex(plot, rect.width);
  const gridMid = scope.calcGridParams(plot, allPlotsSameUnits);
  let minRangeLo = -10 - Math.trunc(gridMid * plot.gridMult);
  let minRangeHi = 10 - Math.trunc(gridMid * plot.gridMult);
  const n = plot.elm === null ? 0 : scope.validDataCount(plot, ipa, rect.width);
  const top = new Float64Array(n);
  const bot = new Float64Array(n);
  const valid = new Uint8Array(n);
  const spc = scope.scopePointCount;
  for (let i = 0; i !== n; i++) {
    const ip = (i + ipa) & (spc - 1);
    const lo = plot.gridMult * (plot.minValues[ip] + plot.plotOffset);
    const hi = plot.gridMult * (plot.maxValues[ip] + plot.plotOffset);
    const minvy = jround(lo);
    const maxvy = jround(hi);
    if (minvy > maxy) continue;
    if (minvy < minRangeLo || maxvy > minRangeHi) {
      scope.reduceRange[plot.units] = false;
      minRangeLo = -1000;
      minRangeHi = 1000;
    }
    valid[i] = 1;
    top[i] = maxy - hi + 0.5;
    bot[i] = maxy - lo + 0.5;
  }
  return { trace: { plot, selected, n, top, bot, valid }, gridMid };
}

/** Horizontal grid lines of the plot the grid follows: pixel row and line number. */
function horizontalLines(
  scope: Scope,
  plot: ScopePlot,
  gridMid: number,
  allPlotsSameUnits: boolean,
  step = scope.gridStepY,
): { y: number; ll: number }[] {
  const rect = scope.rect;
  const maxy = Math.trunc((rect.height - 1) / 2);
  const showH = step !== 0 && (scope.isManualScale() || allPlotsSameUnits);
  const lines: { y: number; ll: number }[] = [];
  for (let ll = -100; ll <= 100; ll++) {
    if (ll !== 0 && !showH) continue;
    const yl = maxy - Math.trunc((ll * step - gridMid) * plot.gridMult);
    if (yl < 0 || yl >= rect.height - 1) continue;
    lines.push({ y: yl, ll });
  }
  return lines;
}

/** Grid lines, from the first plot drawn (as upstream's grid). */
function drawGrid(
  scope: Scope,
  g: ScopeGraphics,
  plot: ScopePlot,
  gridMid: number,
  allPlotsSameUnits: boolean,
  allSelected: boolean,
): void {
  const rect = scope.rect;
  const sim = scope.sim;
  const manual = scope.isManualScale();
  const majorInk: ScopeInk = allSelected ? 'selection' : 'gridMajor';
  const hLines = horizontalLines(scope, plot, gridMid, allPlotsSameUnits);

  const ts = sim.maxTimeStep * scope.speed;
  const tRight = scope.isTriggered()
    ? scope.trigger.time + (ts * rect.width) / 2
    : scope.displayT();
  const tstart = tRight - ts * rect.width;
  const gsx = scope.gridStepX;
  const tx = tRight - (tRight % gsx);
  const vMinor: number[] = [];
  const vMajor: number[] = [];
  for (let ll = 0; gsx > 0; ll++) {
    const tl = tx - gsx * ll;
    const gx = Math.trunc((tl - tstart) / ts);
    if (gx < 0) break;
    if (gx >= rect.width || tl < 0) continue;
    ((tl + gsx / 4) % (gsx * 10) < gsx ? vMajor : vMinor).push(gx);
  }

  // minor lines dotted, major lines and the zero line solid
  g.setColor('gridMinor');
  g.setLineDash([2, 3]);
  for (const h of hLines) if (h.ll !== 0 || manual) g.drawLine(0, h.y, rect.width - 1, h.y);
  for (const x of vMinor) g.drawLine(x, 0, x, rect.height - 1);
  g.setLineDash([]);
  g.setColor(majorInk);
  for (const h of hLines) if (h.ll === 0 && !manual) g.drawLine(0, h.y, rect.width - 1, h.y);
  for (const x of vMajor) g.drawLine(x, 0, x, rect.height - 1);
}

/**
 * Values on the horizontal grid lines, thinned out when they would crowd. In manual scale each
 * plot has its own scale, so the labels follow the selected plot (or the first).
 */
function drawAxisLabels(
  scope: Scope,
  g: ScopeGraphics,
  plot: ScopePlot,
  gridMid: number,
  allPlotsSameUnits: boolean,
): void {
  const rect = scope.rect;
  const manual = scope.isManualScale();
  if (scope.gridStepY === 0 || !(manual || allPlotsSameUnits) || rect.height < 60) return;
  const vp = scope.visiblePlots;
  const lp = manual ? (vp[scope.selectedPlot >= 0 ? scope.selectedPlot : 0] ?? plot) : plot;
  const step = manual ? lp.manScale : scope.gridStepY;
  const hLines = horizontalLines(scope, lp, manual ? 0 : gridMid, allPlotsSameUnits, step);
  if (hLines.length === 0) return;
  const spacing = hLines.length > 1 ? Math.abs(hLines[0].y - hLines[1].y) : rect.height;
  const every = spacing >= 16 ? 1 : spacing >= 8 ? 2 : 4;
  g.setTextStyle('label');
  g.setColor('textMuted');
  for (const h of hLines) {
    // labels sit just above their line; one too close to the top would cover the next
    if (h.ll % every !== 0 || h.y < 12) continue;
    const v = manual ? h.ll * step - lp.plotOffset : h.ll * step - plot.plotOffset - gridMid;
    g.drawString(lp.getUnitText(Math.abs(v) < step * 1e-6 ? 0 : v), 4, h.y - 3);
  }
  g.setTextStyle('normal');
}

/** A trace as a smooth line, with the min/max band shaded where the signal moves within a pixel. */
function drawTrace(scope: Scope, g: ScopeGraphics, t: Trace, allSelected: boolean): void {
  const ink = scope.plotInk(t.plot, t.selected, allSelected);
  const xs = new Float64Array(t.n * 2);
  const ys = new Float64Array(t.n * 2);
  g.setColor(ink);
  let i = 0;
  while (i < t.n) {
    if (t.valid[i] === 0) {
      i++;
      continue;
    }
    let j = i;
    let band = false;
    while (j < t.n && t.valid[j] !== 0) {
      if (t.bot[j] - t.top[j] > 1.5) band = true;
      j++;
    }
    const m = j - i;
    for (let k = 0; k !== m; k++) {
      xs[k] = i + k + 0.5;
      ys[k] = t.top[i + k];
    }
    if (band) {
      for (let k = 0; k !== m; k++) {
        xs[m + k] = j - k - 0.5;
        ys[m + k] = t.bot[j - 1 - k];
      }
      g.save();
      g.setGlobalAlpha(0.25);
      g.fillPolygon(xs, ys, m * 2);
      g.restore();
      g.setColor(ink);
    }
    if (m === 1) g.drawLine(i, t.top[i], i, t.bot[i], TRACE_WIDTH);
    else {
      g.strokePolyline(xs, ys, m, TRACE_WIDTH);
      if (band) {
        for (let k = 0; k !== m; k++) ys[k] = t.bot[i + k];
        g.strokePolyline(xs, ys, m, TRACE_WIDTH);
      }
    }
    i = j;
  }
  // where zero is, in manual scale (upstream draws a "0" tick)
  if (scope.isManualScale()) {
    const maxy = Math.trunc((scope.rect.height - 1) / 2);
    const y0 = maxy - Math.trunc(t.plot.gridMult * t.plot.plotOffset);
    g.drawLine(0, y0, 6, y0, 2);
  }
}

/** A cog: eight square teeth round a solid ring, with a hole in the card's color. */
function gear(g: ScopeGraphics, cx: number, cy: number): void {
  const teeth = 8;
  const rOut = 7.5;
  const rIn = 5.6;
  const xs: number[] = [];
  const ys: number[] = [];
  const step = (2 * Math.PI) / teeth;
  for (let k = 0; k !== teeth; k++) {
    const a = k * step;
    // tooth from a - 0.2 step to a + 0.2 step, slightly narrower at the tip
    for (const [da, r] of [
      [-0.3, rIn],
      [-0.17, rOut],
      [0.17, rOut],
      [0.3, rIn],
    ] as const) {
      xs.push(cx + Math.cos(a + da * step) * r);
      ys.push(cy + Math.sin(a + da * step) * r);
    }
  }
  g.fillPolygon(xs, ys, xs.length);
  g.setColor('card');
  g.fillOval(cx - 2.4, cy - 2.4, 4.8, 4.8);
}

/** Width the six-dot handle takes in the header, with its gap. */
const HANDLE_W = 14;

/** Two columns of three dots, from (x, y) at the top left. */
function sixDots(g: ScopeGraphics, x: number, y: number): void {
  for (let r = 0; r !== 3; r++)
    for (let c = 0; c !== 2; c++) g.fillOval(x + c * 5, y + r * 4.5, 2.6, 2.6);
}

/** Diagonal lines in the bottom right corner, to resize by. */
function resizeGrip(g: ScopeGraphics, x: number, y: number): void {
  for (let k = 1; k <= 2; k++) g.drawLine(x - 4 * k, y, x, y - 4 * k, 1);
}

/** Pop out: a box open at the top right, with an arrow leaving it. */
function undockIcon(g: ScopeGraphics, cx: number, cy: number): void {
  g.drawLine(cx - 6, cy - 3, cx - 6, cy + 6, 1.5);
  g.drawLine(cx - 6, cy + 6, cx + 3, cy + 6, 1.5);
  g.drawLine(cx + 3, cy + 6, cx + 3, cy + 2, 1.5);
  g.drawLine(cx - 6, cy - 3, cx - 2, cy - 3, 1.5);
  g.drawLine(cx - 2, cy + 2, cx + 6, cy - 6, 1.5);
  g.drawLine(cx + 1, cy - 6, cx + 6, cy - 6, 1.5);
  g.drawLine(cx + 6, cy - 6, cx + 6, cy - 1, 1.5);
}

/** Dock: an arrow down into a tray. */
function dockIcon(g: ScopeGraphics, cx: number, cy: number): void {
  g.drawLine(cx, cy - 6, cx, cy + 2, 1.5);
  g.drawLine(cx - 4, cy - 2, cx, cy + 2, 1.5);
  g.drawLine(cx + 4, cy - 2, cx, cy + 2, 1.5);
  g.drawLine(cx - 6, cy + 2, cx - 6, cy + 6, 1.5);
  g.drawLine(cx - 6, cy + 6, cx + 6, cy + 6, 1.5);
  g.drawLine(cx + 6, cy + 6, cx + 6, cy + 2, 1.5);
}

/** Freeze: two bars. */
function pauseIcon(g: ScopeGraphics, cx: number, cy: number): void {
  g.fillRoundRect(cx - 5, cy - 6, 3.5, 12, 1);
  g.fillRoundRect(cx + 1.5, cy - 6, 3.5, 12, 1);
}

/** Resume: a triangle pointing right. */
function playIcon(g: ScopeGraphics, cx: number, cy: number): void {
  g.fillPolygon([cx - 4, cx + 6, cx - 4], [cy - 6, cy, cy + 6], 3);
}

/** How long the plot flashes when it is frozen or let go (ms). */
const FLASH_MS = 320;

/** A fading wash over the plot just after a freeze (plot coordinates). */
function drawFlash(scope: Scope, g: ScopeGraphics): void {
  const t = (scope.mgr.now - scope.flashAt) / FLASH_MS;
  if (!(t >= 0 && t < 1)) return;
  g.save();
  g.setGlobalAlpha(0.28 * (1 - t) ** 2);
  g.setColor('selection');
  g.fillRect(0, 0, scope.rect.width, scope.rect.height);
  g.restore();
}

/** A "Frozen" pill in the plot's top left corner (plot coordinates). */
function drawFrozenBadge(g: ScopeGraphics): void {
  g.setTextStyle('label');
  const label = 'Frozen';
  const w = g.measureWidth(label) + 22;
  g.save();
  g.setGlobalAlpha(0.9);
  g.setColor('selection');
  g.fillRoundRect(6, 6, w, 18, 9);
  g.restore();
  g.setColor('card');
  g.fillRoundRect(12, 11, 2.2, 8, 1);
  g.fillRoundRect(15.8, 11, 2.2, 8, 1);
  g.drawString(label, 22, 19);
  g.setTextStyle('normal');
}

function cross(g: ScopeGraphics, cx: number, cy: number): void {
  g.drawLine(cx - 4, cy - 4, cx + 4, cy + 4, 1.5);
  g.drawLine(cx - 4, cy + 4, cx + 4, cy - 4, 1.5);
}

/** Text cut to a width with an ellipsis. */
function fit(g: ScopeGraphics, s: string, width: number): string {
  if (g.measureWidth(s) <= width) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (g.measureWidth(s.slice(0, mid) + '…') <= width) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? '' : s.slice(0, lo) + '…';
}

/** The card's title: its label, else what it shows. */
function cardTitle(scope: Scope): string {
  if (scope.text !== null) return scope.text;
  const names: string[] = [];
  const seen: unknown[] = [];
  for (const p of scope.plots) {
    if (p.elm === null || seen.includes(p.elm)) continue;
    seen.push(p.elm);
    const t = p.elm.getScopeText(p.value);
    if (t !== null && t !== '') names.push(t);
  }
  return names.join(' · ');
}

function drawHeader(
  scope: Scope,
  g: ScopeGraphics,
  hits: CardHit[],
  readouts: readonly string[],
  scaleText: string | null,
): void {
  const mgr = scope.mgr;
  const slot = scope.slot;
  const lines = headerLines(slot);
  const base1 = slot.y + 19;
  const iconY = slot.y + 6;
  const mx = mgr.mouseCursorX;
  const my = mgr.mouseCursorY;
  const over = (h: CardHit): boolean =>
    mx >= h.x && mx < h.x + h.width && my >= h.y && my < h.y + h.height;
  let right = slot.x + slot.width - PAD;

  // close and settings buttons
  const close: CardHit = {
    kind: 'close',
    index: 0,
    x: right - ICON,
    y: iconY,
    width: ICON,
    height: ICON,
  };
  g.setColor(over(close) ? 'text' : 'textMuted');
  cross(g, close.x + ICON / 2, close.y + ICON / 2);
  right -= ICON + 6;
  const settings: CardHit = {
    kind: 'settings',
    index: 0,
    x: right - ICON,
    y: iconY,
    width: ICON,
    height: ICON,
  };
  g.setColor(over(settings) ? 'selection' : 'textMuted');
  gear(g, settings.x + ICON / 2, settings.y + ICON / 2);
  right -= ICON + 6;
  // undock a docked card onto the circuit, or dock an undocked one
  const dock: CardHit = {
    kind: 'dock',
    index: 0,
    x: right - ICON,
    y: iconY,
    width: ICON,
    height: ICON,
  };
  g.setColor(over(dock) ? 'selection' : 'textMuted');
  if (scope.position < 0) dockIcon(g, dock.x + ICON / 2, dock.y + ICON / 2);
  else undockIcon(g, dock.x + ICON / 2, dock.y + ICON / 2);
  right -= ICON + 6;
  // hold the trace (play resumes it)
  const freeze: CardHit = {
    kind: 'freeze',
    index: 0,
    x: right - ICON,
    y: iconY,
    width: ICON,
    height: ICON,
  };
  const frozen = scope.frozen !== null;
  g.setColor(frozen || over(freeze) ? 'selection' : 'textMuted');
  if (frozen) playIcon(g, freeze.x + ICON / 2, freeze.y + ICON / 2);
  else pauseIcon(g, freeze.x + ICON / 2, freeze.y + ICON / 2);
  right -= ICON + 10;
  hits.push(close, settings, dock, freeze);

  // compact: tabs for the columns, on the top card of the shown column
  const cols = mgr.columnCount();
  if (mgr.compact && cols > 1 && mgr.scopes.find((s) => s.position === scope.position) === scope) {
    g.setTextStyle('label');
    for (let c = cols - 1; c >= 0; c--) {
      const tab: CardHit = {
        kind: 'tab',
        index: c,
        x: right - 20,
        y: iconY - 1,
        width: 20,
        height: 18,
      };
      const active = c === mgr.activeColumn;
      g.setColor(active ? 'selection' : 'gridMajor');
      if (active) g.fillRoundRect(tab.x, tab.y, tab.width, tab.height, 9);
      else g.strokeRoundRect(tab.x + 0.5, tab.y + 0.5, tab.width - 1, tab.height - 1, 9, 1);
      const label = String(c + 1);
      g.setColor(active ? 'card' : 'textMuted');
      g.drawString(label, tab.x + (tab.width - g.measureWidth(label)) / 2, tab.y + 13);
      hits.push(tab);
      right -= 24;
    }
    right -= 4;
  }

  // undocked: a six-dot handle to drag the card by
  let left = slot.x + PAD;
  if (scope.position < 0) {
    const handle: CardHit = {
      kind: 'handle',
      index: 0,
      x: slot.x + 2,
      y: slot.y + 2,
      width: HANDLE_W + 6,
      height: LINE,
    };
    g.setColor(over(handle) ? 'text' : 'textMuted');
    sixDots(g, slot.x + PAD, slot.y + 6 + 2);
    hits.push(handle);
    left += HANDLE_W;
  }

  // time scale (with one header line it goes after the chips, if they leave room)
  if (scaleText !== null && lines === 2) {
    g.setTextStyle('value');
    const w = g.measureWidth(scaleText);
    if (right - w > left + 60) {
      g.setColor('textMuted');
      g.drawString(scaleText, right - w, base1);
      right -= w + 12;
    }
  }

  // title
  g.setTextStyle('title');
  g.setColor('text');
  const titleRoom = lines === 2 ? right - left : (right - left) * 0.45;
  const title = fit(g, cardTitle(scope), Math.max(0, titleRoom));
  g.drawString(title, left, base1);
  const titleEnd = left + (title === '' ? 0 : g.measureWidth(title) + 14);

  // legend chips, then readouts: on the second line, or after the title if there is one line
  let x = lines === 2 ? left : titleEnd;
  const base = lines === 2 ? base1 + LINE : base1;
  const limit = lines === 2 ? slot.x + slot.width - PAD : right;
  if (scope.plot2d.enabled) return;
  const vp = scope.visiblePlots;
  const chips = scope.plots.map((p) => {
    const shown = vp.includes(p);
    const name = plotName(scope, p);
    g.setTextStyle('label');
    const nw = g.measureWidth(name);
    g.setTextStyle('value');
    // fixed decimals: the value keeps its width as it changes
    const value = shown && p.elm !== null ? getFixedUnitText(p.lastValue, p.unitSymbol()) : '';
    return { p, shown, name, nw, value, vw: value === '' ? 0 : g.measureWidth(value) + 5 };
  });
  // short of room: chips without their values
  let total = 0;
  for (const c of chips) total += 14 + c.nw + c.vw + 12;
  const withValues = x + total <= limit;
  for (let i = 0; i !== chips.length; i++) {
    const { p, shown, name, nw } = chips[i];
    const value = withValues ? chips[i].value : '';
    const vw = withValues ? chips[i].vw : 0;
    const w = 14 + nw + vw + 8;
    if (x + w > limit) break;
    const chip: CardHit = { kind: 'chip', index: i, x, y: base - 13, width: w, height: 18 };
    if (over(chip)) {
      g.setColor('gridMinor');
      g.fillRoundRect(chip.x, chip.y, chip.width, chip.height, 9);
    }
    g.setColor(shown ? p.color : 'muted');
    if (shown) g.fillOval(x + 4, base - 8, 7, 7);
    else g.strokeRoundRect(x + 4.5, base - 7.5, 6, 6, 3, 1);
    g.setTextStyle('label');
    g.setColor(shown ? 'text' : 'textMuted');
    g.drawString(name, x + 14, base);
    if (value !== '') {
      g.setTextStyle('value');
      g.setColor('textMuted');
      g.drawString(value, x + 14 + nw + 5, base);
    }
    hits.push(chip);
    x += w + 4;
  }
  if (lines === 1) {
    if (scaleText !== null) {
      g.setTextStyle('value');
      const w = g.measureWidth(scaleText);
      if (x + 8 + w <= right) {
        g.setColor('textMuted');
        g.drawString(scaleText, right - w, base1);
      }
    }
    g.setTextStyle('normal');
    return;
  }
  g.setTextStyle('label');
  g.setColor('textMuted');
  x += 6;
  for (const r of readouts) {
    const w = g.measureWidth(r);
    if (x + w > limit) break;
    g.drawString(r, x, base);
    x += w + 12;
  }
  g.setTextStyle('normal');
}

const SNAP_NAMES: Record<WaveEventKind, string> = {
  peak: 'peak',
  trough: 'trough',
  rise: 'rising edge',
  fall: 'falling edge',
};

/** A crosshair at the cursor time: dots on every trace and a readout of their values. */
function drawCursor(scope: Scope, g: ScopeGraphics): void {
  const mgr = scope.mgr;
  if (mgr.dialogShowing || mgr.cursorScope === null) return;
  const r = scope.rect;
  const vp = scope.visiblePlots;
  const here = mgr.cursorScope === scope;
  const lines: { ink: ScopeInk | null; text: string }[] = [];
  let x: number;
  const fft = scope.fftPlot.enabled;
  if (fft) {
    if (!here) return;
    // the cursor snaps to a nearby peak and reads its frequency; a drag measures between two
    const f = scope.fftPlot;
    const px = mgr.mouseCursorX - r.x;
    const peak = f.peakNear(px, ScopeFFT.SNAP);
    const freq = peak?.freq ?? f.xToFrequency(px);
    x = peak !== null ? r.x + Math.round(f.frequencyToX(freq)) : mgr.mouseCursorX;
    lines.push({ ink: null, text: (peak !== null ? 'peak ' : '') + getUnitText(freq, 'Hz') });
    if (peak !== null) {
      lines.push({ ink: null, text: `${peak.db.toFixed(1)} dB` });
      g.setColor('fft');
      g.fillOval(x - 3, r.y + f.magnitudeToY(peak.magnitude) - 3, 7, 7);
    }
    if (mgr.dragStartFreq >= 0 && mgr.dragFreqScope === scope) {
      const sx = r.x + Math.round(f.frequencyToX(mgr.dragStartFreq));
      if (sx >= r.x && sx < r.x + r.width) {
        g.setColor('measure');
        g.drawLine(sx, r.y, sx, r.y + r.height - 1);
      }
      lines.push({ ink: null, text: 'from ' + getUnitText(mgr.dragStartFreq, 'Hz') });
      lines.push({
        ink: null,
        text: 'Δf ' + getUnitText(Math.abs(freq - mgr.dragStartFreq), 'Hz'),
      });
    }
  } else {
    if (mgr.cursorTime < 0 || vp.length === 0) return;
    x = scope.timeToX(mgr.cursorTime);
  }
  if (x < r.x || x >= r.x + r.width) return;

  g.setColor('textMuted');
  g.setLineDash([3, 3]);
  g.drawLine(x, r.y, x, r.y + r.height - 1);
  g.setLineDash([]);
  if (!fft) {
    for (const p of vp) {
      const v = scope.drawPlotDot(g, p, x);
      if (here && !Number.isNaN(v))
        lines.push({
          ink: p.color,
          text: `${plotName(scope, p)} ${getFixedUnitText(v, p.unitSymbol())}`,
        });
    }
  }
  if (!here) return;

  // drag to measure: a second line where the drag started, and the differences
  const plot = vp[scope.selectedPlot >= 0 ? scope.selectedPlot : 0];
  if (mgr.dragStartTime >= 0 && !fft && plot !== undefined) {
    const dragX = scope.timeToX(mgr.dragStartTime);
    if (dragX >= r.x && dragX < r.x + r.width) {
      g.setColor('measure');
      g.drawLine(dragX, r.y, dragX, r.y + r.height - 1);
      const start = scope.drawPlotDot(g, plot, dragX);
      const dt = Math.abs(mgr.cursorTime - mgr.dragStartTime);
      lines.push({ ink: null, text: 'Δt ' + getTimeText(dt) });
      if (dt > 0) lines.push({ ink: null, text: 'f ' + getUnitText(1 / dt, 'Hz') });
      const end = scope.drawPlotDot(g, plot, x);
      if (!Number.isNaN(start) && !Number.isNaN(end))
        lines.push({ ink: plot.color, text: 'Δ ' + plot.getUnitText(end - start) });
    }
  }
  // snapped to a peak or crossing: name it, and the period to the like one before
  const snap = mgr.cursorSnap;
  if (!fft && snap !== null && plot !== undefined) {
    const v = scope.drawPlotDot(g, plot, x);
    if (!Number.isNaN(v)) {
      const vy =
        r.y + Math.trunc((r.height - 1) / 2) - Math.trunc(plot.gridMult * (v + plot.plotOffset));
      g.setColor(plot.color);
      g.strokeRoundRect(x - 5.5, vy - 5.5, 11, 11, 5.5, 1.5);
    }
    if (mgr.dragStartTime < 0) {
      lines.push({ ink: null, text: SNAP_NAMES[snap.kind] });
      if (snap.period > 0) {
        lines.push({ ink: null, text: 'T ' + getTimeText(snap.period) });
        lines.push({ ink: null, text: 'f ' + getUnitText(1 / snap.period, 'Hz') });
      }
    }
  }
  if (!fft) lines.push({ ink: null, text: getTimeText(mgr.cursorTime) });
  if (lines.length === 0) return;

  g.setTextStyle('value');
  let w = 0;
  for (const l of lines) w = Math.max(w, g.measureWidth(l.text) + (l.ink !== null ? 14 : 0));
  w += 16;
  const h = lines.length * 16 + 8;
  let bx = x + 10;
  if (bx + w > r.x + r.width) bx = x - 10 - w;
  if (bx < r.x) bx = r.x;
  const by = r.y + 6;
  g.save();
  g.setGlobalAlpha(0.92);
  g.setColor('card');
  g.fillRoundRect(bx, by, w, h, 6);
  g.restore();
  g.setColor('gridMajor');
  g.strokeRoundRect(bx + 0.5, by + 0.5, w - 1, h - 1, 6, 1);
  for (let i = 0; i !== lines.length; i++) {
    const l = lines[i];
    const ty = by + 17 + i * 16;
    let tx = bx + 8;
    if (l.ink !== null) {
      g.setColor(l.ink);
      g.fillOval(tx, ty - 8, 7, 7);
      tx += 14;
    }
    g.setColor('text');
    g.drawString(l.text, tx, ty);
  }
  g.setTextStyle('normal');
}

/** Draw a scope in the card look (in place of Scope.draw's upstream look). */
export function drawScopeCard(scope: Scope, g: ScopeGraphics): void {
  const slot = scope.slot;
  const r = scope.rect;
  const hits: CardHit[] = [];
  cardHits.set(scope, hits);
  const undocked = scope.position < 0;
  const mini = undocked && isMiniCard(slot);
  const radius = mini ? PLOT_RADIUS : CARD_RADIUS;
  g.setColor('card');
  g.fillRoundRect(slot.x, slot.y, slot.width, slot.height, radius);
  g.setColor('background');
  g.fillRoundRect(r.x, r.y, r.width, r.height, mini ? PLOT_RADIUS - 2 : PLOT_RADIUS);
  if (undocked) {
    // resize grip first: it wins over the handle where they meet
    const grip: CardHit = {
      kind: 'resize',
      index: 0,
      x: slot.x + slot.width - 14,
      y: slot.y + slot.height - 14,
      width: 14,
      height: 14,
    };
    hits.push(grip);
    if (mini) hits.push({ kind: 'handle', index: 0, ...slot });
  }
  const header = (readouts: readonly string[], scale: string | null): void => {
    if (!mini) drawHeader(scope, g, hits, readouts, scale);
    if (undocked) drawUndockedChrome(scope, g, mini, radius);
  };

  if (scope.plot2d.enabled) {
    scope.plot2d.draw(g);
    if (scope.frozen !== null) {
      g.save();
      g.translate(r.x, r.y);
      drawFrozenBadge(g);
      g.restore();
    }
    header([], null);
    return;
  }

  const { sel, highlight, allPlotsSameUnits } = scope.prepareDraw();
  const vp = scope.visiblePlots;
  const sp = scope.selectedPlot;
  // other plots underneath, then currents, then voltages, then the selected plot on top
  const order: { plot: ScopePlot; selected: boolean }[] = [];
  for (let i = 0; i !== vp.length; i++)
    if (vp[i].units > UNITS_A && i !== sp) order.push({ plot: vp[i], selected: false });
  for (let i = 0; i !== vp.length; i++)
    if (vp[i].units === UNITS_A && i !== sp) order.push({ plot: vp[i], selected: false });
  for (let i = 0; i !== vp.length; i++)
    if (vp[i].units === UNITS_V && i !== sp) order.push({ plot: vp[i], selected: false });
  if (sp >= 0 && sp < vp.length) order.push({ plot: vp[sp], selected: true });

  g.save();
  g.translate(r.x, r.y);
  g.clipRect(0, 0, r.width, r.height);
  if (highlight) {
    g.save();
    g.setGlobalAlpha(0.08);
    g.setColor('selection');
    g.fillRect(0, 0, r.width, r.height);
    g.restore();
  }
  if (scope.fftPlot.enabled) {
    scope.fftPlot.drawVerticalGridLines(g);
    scope.fftPlot.draw(g);
    drawPeakLabel(scope, g);
  }
  scope.gridStepX = scope.calcGridStepX();
  const traces: Trace[] = [];
  let gridPlot: { plot: ScopePlot; gridMid: number } | null = null;
  for (const o of order) {
    const { trace, gridMid } = tracePixels(scope, o.plot, o.selected, allPlotsSameUnits);
    if (gridPlot === null) {
      gridPlot = { plot: o.plot, gridMid };
      drawGrid(scope, g, o.plot, gridMid, allPlotsSameUnits, sel);
    }
    traces.push(trace);
  }
  for (const t of traces) drawTrace(scope, g, t, sel);
  if (gridPlot !== null)
    drawAxisLabels(scope, g, gridPlot.plot, gridPlot.gridMid, allPlotsSameUnits);
  scope.trigger.drawIndicator(g, vp, r);
  if (scope.frozen !== null) drawFrozenBadge(g);
  drawFlash(scope, g);
  g.restore();
  scope.finishDraw();

  const readouts = vp.length > 0 ? scope.overlays.readouts(g) : [];
  const scale =
    vp.length > 0 && !scope.fftPlot.enabled ? getUnitText(scope.gridStepX, 's') + '/div' : null;
  header(mini ? [] : readouts, scale);
  if (highlight || sel || scope.canvasSelected) {
    g.setColor('selection');
    g.strokeRoundRect(
      slot.x + 0.75,
      slot.y + 0.75,
      slot.width - 1.5,
      slot.height - 1.5,
      radius,
      1.5,
    );
  }
  drawCursor(scope, g);
}

/** The strongest peak of a spectrum, marked with its frequency (in plot-area coordinates). */
function drawPeakLabel(scope: Scope, g: ScopeGraphics): void {
  const f = scope.fftPlot;
  const pk = f.strongestPeak();
  if (pk === null) return;
  const x = f.frequencyToX(pk.freq);
  const y = f.magnitudeToY(pk.magnitude);
  g.setColor('fft');
  g.fillOval(x - 2.5, y - 2.5, 5, 5);
  g.setTextStyle('value');
  const label = getUnitText(pk.freq, 'Hz');
  const w = g.measureWidth(label);
  const tx = Math.max(2, Math.min(x + 6, scope.rect.width - w - 4));
  g.drawString(label, tx, Math.max(12, y - 4));
  g.setTextStyle('normal');
}

/** The resize grip (always) of an undocked card, and a mini card's handle while the mouse is over it. */
function drawUndockedChrome(scope: Scope, g: ScopeGraphics, mini: boolean, radius: number): void {
  const slot = scope.slot;
  const mgr = scope.mgr;
  const mx = mgr.mouseCursorX;
  const my = mgr.mouseCursorY;
  const inside =
    mx >= slot.x && my >= slot.y && mx < slot.x + slot.width && my < slot.y + slot.height;
  // the grip always shows (Gady, 2026-10-04); brighter while the mouse is over the card
  g.setColor(inside || scope.canvasSelected ? 'text' : 'textMuted');
  resizeGrip(g, slot.x + slot.width - 4, slot.y + slot.height - 4);
  if (mini && (inside || scope.canvasSelected)) {
    g.save();
    g.setGlobalAlpha(0.85);
    g.setColor('card');
    g.fillRoundRect(slot.x + 2, slot.y + 2, 16, 18, Math.min(radius, 4));
    g.restore();
    g.setColor('text');
    sixDots(g, slot.x + 6, slot.y + 6);
  }
}

/**
 * The leader line from an undocked card to what it shows: straight and 45° segments only, leaving
 * the side of the card that faces the target, or null when the target is under the card.
 */
export function leaderPath(slot: ScopeRect, tx: number, ty: number): { x: number; y: number }[] {
  const x1 = slot.x;
  const y1 = slot.y;
  const x2 = slot.x + slot.width;
  const y2 = slot.y + slot.height;
  const outX = tx < x1 ? x1 - tx : tx > x2 ? tx - x2 : 0;
  const outY = ty < y1 ? y1 - ty : ty > y2 ? ty - y2 : 0;
  if (outX === 0 && outY === 0) return [];
  const inset = Math.min(CARD_RADIUS + 4, slot.width / 2, slot.height / 2);
  const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
  if (outX >= outY) {
    // leave from the left or right side, level with the target if the side reaches it
    const ax = tx < x1 ? x1 : x2;
    const ay = clamp(ty, y1 + inset, y2 - inset);
    const dx = tx - ax;
    const dy = ty - ay;
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    if (Math.abs(dy) <= Math.abs(dx)) {
      // straight out, then diagonally in
      const bx = ax + sx * (Math.abs(dx) - Math.abs(dy));
      return dedupe([
        { x: ax, y: ay },
        { x: bx, y: ay },
        { x: tx, y: ty },
      ]);
    }
    // diagonally out, then straight down or up
    return dedupe([
      { x: ax, y: ay },
      { x: tx, y: ay + sy * Math.abs(dx) },
      { x: tx, y: ty },
    ]);
  }
  const ay = ty < y1 ? y1 : y2;
  const ax = clamp(tx, x1 + inset, x2 - inset);
  const dx = tx - ax;
  const dy = ty - ay;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  if (Math.abs(dx) <= Math.abs(dy)) {
    const by = ay + sy * (Math.abs(dy) - Math.abs(dx));
    return dedupe([
      { x: ax, y: ay },
      { x: ax, y: by },
      { x: tx, y: ty },
    ]);
  }
  return dedupe([
    { x: ax, y: ay },
    { x: ax + sx * Math.abs(dy), y: ty },
    { x: tx, y: ty },
  ]);
}

function dedupe(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}

/**
 * Draw an undocked card's leader to (tx, ty): a thin line with a dot on the target. `active`
 * (the card or its element is hovered or selected) draws it in the selection color.
 */
export function drawLeader(
  scope: Scope,
  g: ScopeGraphics,
  tx: number,
  ty: number,
  active: boolean,
): void {
  const pts = leaderPath(scope.slot, tx, ty);
  if (pts.length < 2) return;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  g.setColor(active ? 'selection' : 'textMuted');
  g.strokePolyline(xs, ys, pts.length, active ? 1.5 : 1);
  g.fillOval(tx - 3, ty - 3, 6, 6);
  // a selected card's leader end can be dragged onto a post: show it as a handle
  if (scope.canvasSelected) g.strokeRoundRect(tx - 6.5, ty - 6.5, 13, 13, 6.5, 1.5);
  const a = pts[0];
  g.fillOval(a.x - 2, a.y - 2, 4, 4);
}
