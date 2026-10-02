// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Geometry learned from CircuitJS1 VoltageElm, RailElm and CurrentElm
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032;
// the drawing code is new.

import type { CurrentElm } from '../elm/CurrentElm.ts';
import { RailElm } from '../elm/RailElm.ts';
import { VoltageElm } from '../elm/VoltageElm.ts';
import {
  COMPONENT,
  doDots,
  draw2Leads,
  drawLabeledNode,
  drawValues,
  elementBox,
  MUTED,
  TEXT,
  UNITS_FONT,
  vInk,
  volt,
  type ElementView,
} from './common.ts';
import { calcArrow, calcLeads, interp, interp2, pt } from './geometry.ts';
import type { DrawContext, Pt } from './Painter.ts';
import { getShortUnitText, showFormat } from './units.ts';

const CIRCLE_SIZE = 17;

function isCircleDc(e: VoltageElm): boolean {
  return e.waveform === VoltageElm.WF_DC && e.hasFlag(VoltageElm.FLAG_CIRCLE_SYMBOL);
}

/** Upstream `useRmsDisplay` and `getRmsMultiplier`. */
function rmsMultiplier(e: VoltageElm): number {
  switch (e.waveform) {
    case VoltageElm.WF_AC:
      return 1 / Math.sqrt(2);
    case VoltageElm.WF_TRIANGLE:
    case VoltageElm.WF_SAWTOOTH:
      return 1 / Math.sqrt(3);
    case VoltageElm.WF_PULSE:
      return Math.sqrt(e.dutyCycle);
    default:
      return 1;
  }
}
const diffFromInteger = (x: number): number => Math.abs(x - Math.round(x));

function shortVoltageText(e: VoltageElm): string {
  if (e.bias !== 0) return getShortUnitText(e.bias + e.maxVoltage, 'V');
  const m = rmsMultiplier(e);
  const rms = e.maxVoltage * m;
  if (
    m !== 1 &&
    Math.abs(e.maxVoltage) > 1e-4 &&
    diffFromInteger(rms * 1e4) < diffFromInteger(e.maxVoltage * 1e4)
  )
    return getShortUnitText(rms, 'V') + 'rms';
  return getShortUnitText(e.maxVoltage, 'V');
}

/** Source and value text for a source (frequency too for time-varying waveforms). */
function sourceText(e: VoltageElm, ctx: DrawContext, showV: boolean): string | null {
  const showF =
    ctx.showValues && e.waveform !== VoltageElm.WF_DC && e.waveform !== VoltageElm.WF_NOISE;
  if (showV && showF) return shortVoltageText(e) + ' ' + getShortUnitText(e.frequency, 'Hz');
  if (showV) return shortVoltageText(e);
  if (showF) return getShortUnitText(e.frequency, 'Hz');
  return null;
}

/** The waveform symbol in a circle centred at c (upstream `drawWaveform`). */
function drawWaveform(e: VoltageElm, ctx: DrawContext, c: Pt, lead1: Pt): void {
  const p = ctx.painter;
  const ink = MUTED;
  const xc = c.x;
  let yc = c.y;
  if (e.waveform !== VoltageElm.WF_NOISE) p.circle(c, CIRCLE_SIZE * 0.98, ink);
  const wl = 8;
  const seg = (x1: number, y1: number, x2: number, y2: number): void =>
    p.line(pt(x1, y1), pt(x2, y2), ink);
  switch (e.waveform) {
    case VoltageElm.WF_SQUARE: {
      let xc2 = Math.trunc(wl * 2 * e.dutyCycle - wl + xc);
      xc2 = Math.max(xc - wl + 3, Math.min(xc + wl - 3, xc2));
      seg(xc - wl, yc - wl, xc - wl, yc);
      seg(xc - wl, yc - wl, xc2, yc - wl);
      seg(xc2, yc - wl, xc2, yc + wl);
      seg(xc + wl, yc + wl, xc2, yc + wl);
      seg(xc + wl, yc, xc + wl, yc + wl);
      break;
    }
    case VoltageElm.WF_PULSE:
      yc += wl / 2;
      seg(xc - wl, yc - wl, xc - wl, yc);
      seg(xc - wl, yc - wl, xc - wl / 2, yc - wl);
      seg(xc - wl / 2, yc - wl, xc - wl / 2, yc);
      seg(xc - wl / 2, yc, xc + wl, yc);
      break;
    case VoltageElm.WF_SAWTOOTH:
      seg(xc, yc - wl, xc - wl, yc);
      seg(xc, yc - wl, xc, yc + wl);
      seg(xc, yc + wl, xc + wl, yc);
      break;
    case VoltageElm.WF_TRIANGLE: {
      const xl = 5;
      seg(xc - xl * 2, yc, xc - xl, yc - wl);
      seg(xc - xl, yc - wl, xc, yc);
      seg(xc, yc, xc + xl, yc + wl);
      seg(xc + xl, yc + wl, xc + xl * 2, yc);
      break;
    }
    case VoltageElm.WF_NOISE:
      drawLabeledNode(ctx, 'Noise', e.point1, lead1, COMPONENT);
      break;
    case VoltageElm.WF_AC: {
      const xl = 10;
      const wave: Pt[] = [];
      for (let i = -xl; i <= xl; i++)
        wave.push(pt(xc + i, yc + Math.trunc(0.95 * Math.sin((i * Math.PI) / xl) * wl)));
      p.polyline(wave, ink);
      break;
    }
  }
  if (e instanceof RailElm && (e.dx === 0 || e.dy === 0)) {
    const showV = e.hasFlag(VoltageElm.FLAG_SHOW_VOLTAGE_RAIL);
    const showF = ctx.showValues && e.waveform !== VoltageElm.WF_NOISE;
    let s: string | null = null;
    if (showV && showF) s = shortVoltageText(e) + ' ' + getShortUnitText(e.frequency, 'Hz');
    else if (showV) s = shortVoltageText(e);
    else if (showF) s = getShortUnitText(e.frequency, 'Hz');
    drawValues(e, ctx, s, CIRCLE_SIZE, { atEnd: true, left: true });
  }
}

function voltageLeads(e: VoltageElm): [Pt, Pt] {
  const dcLike = e.waveform === VoltageElm.WF_DC || e.waveform === VoltageElm.WF_VAR;
  const len = isCircleDc(e) ? CIRCLE_SIZE * 2 : dcLike ? 8 : CIRCLE_SIZE * 2;
  return calcLeads(e.point1, e.point2, e.dn, len);
}

export const voltageView: ElementView<VoltageElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const [lead1, lead2] = voltageLeads(e);
    draw2Leads(e, ctx, lead1, lead2);
    const battery = e.waveform === VoltageElm.WF_DC && !isCircleDc(e);
    if (isCircleDc(e)) {
      const c = interp(lead1, lead2, 0.5);
      p.circle(c, CIRCLE_SIZE * 0.98, MUTED);
      const signSize = 4;
      const plusPos = 0.74;
      const minusPos = 0.26;
      const [a1, a2] = interp2(lead1, lead2, plusPos, signSize);
      p.line(a1, a2, MUTED);
      const delta = signSize / (CIRCLE_SIZE * 2.0);
      p.line(interp(lead1, lead2, plusPos - delta), interp(lead1, lead2, plusPos + delta), MUTED);
      const [m1, m2] = interp2(lead1, lead2, minusPos, signSize);
      p.line(m1, m2, MUTED);
    } else if (battery) {
      const [a1, a2] = interp2(lead1, lead2, 0, 10);
      p.line(a1, a2, vInk(volt(e, 0)));
      const [b1, b2] = interp2(lead1, lead2, 1, 16);
      p.line(b1, b2, vInk(volt(e, 1)));
    } else {
      drawWaveform(e, ctx, interp(lead1, lead2, 0.5), lead1);
      const inds = e.bias > 0 || (e.bias === 0 && e.waveform === VoltageElm.WF_PULSE) ? '+' : '*';
      const plus = interp(e.point1, e.point2, (e.dn / 2 + CIRCLE_SIZE + 4) / e.dn, 10 * e.dsign);
      const w = Math.trunc(p.measureText(inds, UNITS_FONT));
      p.text(inds, pt(plus.x - Math.trunc(w / 2), plus.y + 4), TEXT, UNITS_FONT);
    }
    if (e.dx === 0 || e.dy === 0) {
      const s = sourceText(e, ctx, e.hasFlag(VoltageElm.FLAG_SHOW_VOLTAGE));
      drawValues(e, ctx, s, battery ? 16 : CIRCLE_SIZE, { left: true });
    }
    const c = ctx.dotCount(0, e.current);
    if (battery) p.dots(e.point1, e.point2, c);
    else {
      p.dots(e.point1, lead1, c);
      p.dots(e.point2, lead2, -c);
    }
  },
  bbox: (e) => elementBox(e, e.waveform === VoltageElm.WF_DC && !isCircleDc(e) ? 16 : CIRCLE_SIZE),
};

export const railView: ElementView<RailElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    let w = CIRCLE_SIZE;
    if (w > e.dn * 0.8) w = e.dn * 0.8;
    const lead1 = interp(e.point1, e.point2, 1 - w / e.dn);
    p.line(e.point1, lead1, vInk(volt(e, 0)));
    if (e.waveform === VoltageElm.WF_SQUARE && e.hasFlag(RailElm.FLAG_CLOCK)) {
      drawLabeledNode(ctx, 'CLK', e.point1, lead1, COMPONENT);
    } else if (e.waveform === VoltageElm.WF_DC || e.waveform === VoltageElm.WF_VAR) {
      const v = e.getVoltage();
      let s = Math.abs(v) < 1 ? showFormat(v) + ' V' : getShortUnitText(v, 'V');
      if (v > 0) s = '+' + s;
      drawLabeledNode(ctx, s, e.point1, lead1, COMPONENT);
    } else {
      drawWaveform(e, ctx, e.point2, lead1);
    }
    p.dots(e.point1, lead1, ctx.dotCount(0, -e.current));
  },
  bbox: (e) => elementBox(e, CIRCLE_SIZE),
};

export const currentView: ElementView<CurrentElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, 26);
    const center = interp(lead1, lead2, 0.5);
    draw2Leads(e, ctx, lead1, lead2);
    const ink = vInk((volt(e, 0) + volt(e, 1)) / 2);
    p.circle(center, 12 * 0.98, ink);
    p.line(interp(lead1, lead2, 0.25), interp(lead1, lead2, 0.6), ink);
    p.fillPolygon(calcArrow(center, interp(lead1, lead2, 0.75), 4, 4), ink);
    doDots(e, ctx);
    if (ctx.showValues && e.current !== 0 && (e.dx === 0 || e.dy === 0))
      drawValues(e, ctx, getShortUnitText(e.current, 'A'), 12);
  },
  bbox: (e) => elementBox(e, 12),
};
