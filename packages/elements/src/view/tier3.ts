// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Geometry learned from CircuitJS1 PolarCapacitorElm, VaractorElm, TunnelDiodeElm, MemristorElm,
// SparkGapElm, LampElm, SCRElm, TriacElm, DiacElm, TriodeElm and AmmeterElm draw()
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032;
// the drawing code is new.

import type { CircuitElm } from '../CircuitElm.ts';
import { SCALE_AUTO } from '../constants.ts';
import { AmmeterElm } from '../elm/AmmeterElm.ts';
import type { DiacElm } from '../elm/DiacElm.ts';
import type { LampElm } from '../elm/LampElm.ts';
import type { MemristorElm } from '../elm/MemristorElm.ts';
import type { PolarCapacitorElm } from '../elm/PolarCapacitorElm.ts';
import type { SCRElm } from '../elm/SCRElm.ts';
import type { SparkGapElm } from '../elm/SparkGapElm.ts';
import type { TriacElm } from '../elm/TriacElm.ts';
import type { TriodeElm } from '../elm/TriodeElm.ts';
import type { TunnelDiodeElm } from '../elm/TunnelDiodeElm.ts';
import type { VaractorElm } from '../elm/VaractorElm.ts';
import { javaDoubleToInt } from '../java.ts';
import {
  COMPONENT,
  doDots,
  draw2Leads,
  drawCenteredText,
  drawValues,
  elementBox,
  LABEL,
  MUTED,
  TEXT,
  UNITS_FONT,
  vInk,
  volt,
  type ElementView,
} from './common.ts';
import {
  calcArrow,
  calcLeads,
  distance,
  interp,
  interp2,
  pt,
  rectOf,
  sign,
  unionRect,
} from './geometry.ts';
import type { DrawContext, Pt } from './Painter.ts';
import { addCurCount } from './passive.ts';
import { getFixedUnitText, getShortUnitText, getUnitTextWithScale } from './units.ts';

export const polarCapacitorView: ElementView<PolarCapacitorElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const { point1, point2, dn } = e;
    const f = (dn / 2 - 4) / dn;
    const lead1 = interp(point1, point2, f);
    const lead2 = interp(point1, point2, 1 - f);
    const [a1, a2] = interp2(point1, point2, f, 12);
    const [b1, b2] = interp2(point1, point2, 1 - f, 12);
    const v0 = vInk(volt(e, 0));
    const v1 = vInk(volt(e, 1));
    p.line(point1, lead1, v0);
    p.line(a1, a2, v0);
    p.line(point2, lead2, v1);
    // the negative plate is curved
    const maxI = 13;
    const midI = maxI / 2;
    const curve: Pt[] = [];
    for (let i = 0; i <= maxI; i++) {
      const q = ((i - midI) * 0.9) / midI;
      curve.push(interp(b1, b2, i / maxI, 5 * (1 - Math.sqrt(1 - q * q))));
    }
    p.polyline(curve, v1);
    const plus = interp(point1, point2, f - 8 / dn, -10 * e.dsign);
    let py = plus.y;
    if (e.y2 > e.y) py += 4;
    if (e.y > e.y2) py += 3;
    const w = Math.trunc(p.measureText('+', UNITS_FONT));
    p.text('+', pt(plus.x - Math.trunc(w / 2), py), TEXT, UNITS_FONT);
    const c = ctx.dotCount(0, e.current);
    p.dots(point1, lead1, c);
    p.dots(point2, lead2, -c);
    if (ctx.showValues) drawValues(e, ctx, getShortUnitText(e.capacitance, 'F'), 12);
  },
  bbox: (e) => elementBox(e, 12),
};

export const varactorView: ElementView<VaractorElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, 16);
    const platef = 0.6;
    const [pa0, pa1] = interp2(lead1, lead2, 0, 8);
    const cathode = interp2(lead1, lead2, platef, 8);
    const plate2 = interp2(lead1, lead2, 1, 8);
    draw2Leads(e, ctx, lead1, lead2);
    p.fillPolygon([pa0, pa1, interp(lead1, lead2, platef)], vInk(volt(e, 0)));
    p.line(cathode[0], cathode[1], vInk(volt(e, 0)));
    p.line(plate2[0], plate2[1], vInk(volt(e, 1)));
    doDots(e, ctx);
  },
  bbox: (e) => elementBox(e, 8),
};

export const tunnelDiodeView: ElementView<TunnelDiodeElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, 16);
    const [pa0, pa1] = interp2(lead1, lead2, 0, 8);
    const [c0, c1] = interp2(lead1, lead2, 1, 8);
    const [c2, c3] = interp2(lead1, lead2, 0.8, 8);
    draw2Leads(e, ctx, lead1, lead2);
    p.fillPolygon([pa0, pa1, lead2], vInk(volt(e, 0)));
    const v2 = vInk(volt(e, 1));
    p.line(c0, c1, v2);
    p.line(c2, c0, v2);
    p.line(c3, c1, v2);
    doDots(e, ctx);
  },
  bbox: (e) => elementBox(e, 8),
};

export const memristorView: ElementView<MemristorElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, 32);
    const segments = 6;
    const hs = 2 + javaDoubleToInt(8 * (1 - e.dopeWidth / e.totalWidth));
    draw2Leads(e, ctx, lead1, lead2);
    const v1 = volt(e, 0);
    const v2 = volt(e, 1);
    const segf = 1 / segments;
    // a square wave whose height shows the undoped width
    let ox = 0;
    for (let i = 0; i <= segments; i++) {
      let nx = (i & 1) === 0 ? 1 : -1;
      if (i === segments) nx = 0;
      const ink = vInk(v1 + ((v2 - v1) * i) / segments);
      const ps2 = interp(lead1, lead2, i * segf, hs * nx);
      p.line(interp(lead1, lead2, i * segf, hs * ox), ps2, ink);
      if (i === segments) break;
      p.line(interp(lead1, lead2, (i + 1) * segf, hs * nx), ps2, ink);
      ox = nx;
    }
    doDots(e, ctx);
  },
  bbox: (e) => elementBox(e, 10),
};

export const sparkGapView: ElementView<SparkGapElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const { point1, point2, dn } = e;
    const alen = 8;
    const [lead1, lead2] = calcLeads(point1, point2, dn, 16 + alen);
    draw2Leads(e, ctx, lead1, lead2);
    p.fillPolygon(
      calcArrow(point1, interp(point1, point2, (dn - alen) / (2 * dn)), alen, alen),
      vInk(volt(e, 0)),
    );
    p.fillPolygon(
      calcArrow(point2, interp(point1, point2, (dn + alen) / (2 * dn)), alen, alen),
      vInk(volt(e, 1)),
    );
    if (e.state) doDots(e, ctx);
  },
  bbox: (e) => elementBox(e, 8),
};

export const lampView: ElementView<LampElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const bulb = e.bulb;
    if (bulb === null || e.filament.length < 2) return;
    const lead1 = e.lead1;
    const lead2 = e.lead2;
    const [f0, f1] = e.filament;
    draw2Leads(e, ctx, lead1, lead2);
    // the glow is circuit data: the filament's color at its temperature
    p.fillCircle(bulb, e.bulbR, { rgb: e.getTempColor() });
    p.circle(bulb, e.bulbR, MUTED);
    const v1 = volt(e, 0);
    const v2 = volt(e, 1);
    p.line(lead1, f0, vInk(v1));
    p.line(lead2, f1, vInk(v2));
    p.line(f0, f1, vInk((v1 + v2) * 0.5));
    const c = ctx.dotCount(0, e.current);
    p.dots(e.point1, lead1, c);
    let cc = addCurCount(c, (e.dn - 16) / 2);
    p.dots(lead1, f0, cc);
    cc = addCurCount(cc, 24);
    p.dots(f0, f1, cc);
    cc = addCurCount(cc, 16);
    p.dots(f1, lead2, cc);
    p.dots(lead2, e.point2, c);
  },
  bbox: (e) => {
    const r = elementBox(e, 4);
    const b = e.bulb;
    if (b === null) return r;
    return unionRect(
      r,
      rectOf([pt(b.x - e.bulbR, b.y - e.bulbR), pt(b.x + e.bulbR, b.y + e.bulbR)]),
    );
  },
};

/** The gate lead of an SCR or TRIAC, with its dots, and the pin names when highlighted. */
function drawGate(
  e: SCRElm | TriacElm,
  ctx: DrawContext,
  lead2: Pt,
  ig: number,
  names: [string, string, number],
): void {
  const p = ctx.painter;
  if (e.gate.length < 2) return;
  const [g0, g1] = e.gate;
  const vg = vInk(volt(e, 2));
  p.line(lead2, g0, vg);
  p.line(g0, g1, vg);
  const cg = ctx.dotCount(2, ig);
  p.dots(g1, g0, cg);
  p.dots(g0, lead2, addCurCount(cg, distance(g1, g0)));
  if ((ctx.highlighted || e.isCreating()) && e.point1.x === e.point2.x && e.point2.y > e.point1.y) {
    const ds = sign(e.dx);
    const [low, high, wide] = names;
    p.text(low, pt(lead2.x + (ds < 0 ? 5 : -wide), lead2.y + 12), LABEL, UNITS_FONT);
    p.text(high, pt(e.lead1.x + 5, e.lead1.y - 4), LABEL, UNITS_FONT);
    p.text('G', pt(g0.x, g0.y + 12), LABEL, UNITS_FONT);
  }
}

function gateBox(e: SCRElm | TriacElm, w: number) {
  const r = elementBox(e, w);
  return e.gate.length < 2 ? r : unionRect(r, rectOf(e.gate));
}

export const scrView: ElementView<SCRElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const lead1 = e.lead1;
    const lead2 = e.lead2;
    draw2Leads(e, ctx, lead1, lead2);
    const [pa0, pa1] = interp2(lead1, lead2, 0, 8);
    const cathode = interp2(lead1, lead2, 1, 8);
    p.fillPolygon([pa0, pa1, lead2], vInk(volt(e, 0)));
    drawGate(e, ctx, lead2, e.ig, ['C', 'A', 15]);
    p.line(cathode[0], cathode[1], vInk(volt(e, 1)));
    p.dots(e.point1, lead2, ctx.dotCount(0, e.ia));
    p.dots(e.point2, lead2, ctx.dotCount(1, e.ic));
  },
  bbox: (e) => gateBox(e, 8),
};

/** Two plates with opposed arrows between them (TRIAC and DIAC). */
function drawBidirectional(e: CircuitElm, ctx: DrawContext): void {
  const p = ctx.painter;
  const lead1 = e.lead1;
  const lead2 = e.lead2;
  const v1 = vInk(volt(e, 0));
  const v2 = vInk(volt(e, 1));
  const [a0, a1] = interp2(lead1, lead2, 0, 16);
  const [b0, b1] = interp2(lead1, lead2, 1, 16);
  p.line(a0, a1, v1);
  p.line(b0, b1, v2);
  for (let i = 0; i !== 2; i++) {
    const sgn = -1 + i * 2;
    const arrow = [
      interp(lead1, lead2, i, 8 * sgn),
      interp(lead1, lead2, 1 - i, 16 * sgn),
      interp(lead1, lead2, 1 - i, 0),
    ];
    p.fillPolygon(arrow, i === 0 ? v2 : v1);
  }
}

export const triacView: ElementView<TriacElm> = {
  draw(e, ctx) {
    draw2Leads(e, ctx, e.lead1, e.lead2);
    drawBidirectional(e, ctx);
    drawGate(e, ctx, e.lead2, e.ig, ['MT1', 'MT2', 30]);
    const p = ctx.painter;
    p.dots(e.point1, e.lead2, ctx.dotCount(0, e.i2));
    p.dots(e.point2, e.lead2, ctx.dotCount(1, e.i1));
  },
  bbox: (e) => gateBox(e, 6),
};

export const diacView: ElementView<DiacElm> = {
  draw(e, ctx) {
    draw2Leads(e, ctx, e.lead1, e.lead2);
    drawBidirectional(e, ctx);
    doDots(e, ctx);
  },
  bbox: (e) => elementBox(e, 6),
};

export const triodeView: ElementView<TriodeElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const { plate, grid, cath, midgrid, midcath } = e;
    if (plate.length < 4 || midgrid === null || midcath === null) return;
    p.circle(e.point2, e.circler, MUTED);
    const vp = vInk(volt(e, 0));
    p.line(plate[0], plate[1], vp);
    p.line(plate[2], plate[3], vp);
    const vg = vInk(volt(e, 1));
    for (let i = 0; i !== 8; i += 2) p.line(grid[i], grid[i + 1], vg);
    const vc = vInk(volt(e, 2));
    for (let i = 0; i !== 3; i++) p.line(cath[i], cath[i + 1], vc);
    const cp = ctx.dotCount(0, e.currentp);
    const cc = ctx.dotCount(1, e.currentc);
    const cg = ctx.dotCount(2, e.currentg);
    if (!e.isCreating()) {
      p.dots(plate[0], midgrid, cp);
      p.dots(midgrid, midcath, cc);
      p.dots(midcath, cath[1], addCurCount(cc, 8));
      p.dots(cath[1], cath[0], addCurCount(cc, 8));
      p.dots(e.point1, midgrid, cg);
    }
  },
  bbox: (e) => {
    if (e.plate.length < 4) return elementBox(e, 16);
    const r = e.circler;
    return unionRect(
      rectOf([e.point1, e.plate[0]]),
      rectOf([
        pt(e.cath[0].x, e.cath[1].y),
        pt(e.point2.x + r, e.point2.y + r),
        pt(e.point2.x - r, e.point2.y - r),
      ]),
    );
  },
};

const AMMETER_CIRCLE = 12;

/** The ammeter's reading, in a fixed character budget so it never shifts as it changes. */
export function ammeterText(e: AmmeterElm): string {
  const rms = e.meter === AmmeterElm.AM_RMS;
  const v = rms ? e.rmsI : e.getCurrent();
  const u = rms ? 'A(rms)' : 'A';
  if (e.scale === SCALE_AUTO) return getFixedUnitText(v, u);
  return getUnitTextWithScale(v, u, e.scale, true);
}

export const ammeterView: ElementView<AmmeterElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const { point1, point2, dn } = e;
    const v0 = vInk(volt(e, 0));
    let width = 4;
    if (!e.drawAsCircle()) {
      p.line(point1, point2, v0);
      p.fillPolygon(calcArrow(point1, interp(point1, point2, 0.6), 14, 7), v0);
    } else {
      const [lead1, lead2] = calcLeads(point1, point2, dn, AMMETER_CIRCLE * 2);
      p.line(point1, lead1, v0);
      p.line(lead2, point2, v0);
      const center = interp(point1, point2, 0.5);
      p.circle(center, AMMETER_CIRCLE, COMPONENT);
      drawCenteredText(ctx, 'A', center.x, center.y, true, LABEL);
      const len = AMMETER_CIRCLE * 2;
      const plus = interp(point1, point2, (dn / 2 - len / 2 - 4) / dn, -10 * e.dsign);
      let py = plus.y;
      if (e.y2 > e.y) py += 4;
      if (e.y > e.y2) py += 3;
      const w = Math.trunc(p.measureText('+', UNITS_FONT));
      p.text('+', pt(plus.x - Math.trunc(w / 2), py), TEXT, UNITS_FONT);
      width = AMMETER_CIRCLE;
    }
    doDots(e, ctx);
    drawValues(e, ctx, ammeterText(e), width);
  },
  bbox: (e) => elementBox(e, e.drawAsCircle() ? AMMETER_CIRCLE : 4),
};
