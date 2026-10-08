// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Geometry learned from CircuitJS1 GateElm, XorGateElm, InverterElm, SchmittElm,
// InvertingSchmittElm, TriStateElm, DelayBufferElm and CircuitElm.getSchmittPolygon
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032;
// the drawing code is new.

import { GateElm, XnorGateElm, XorGateElm } from '../elm/GateElm.ts';
import {
  DelayBufferElm,
  InverterElm,
  InvertingSchmittElm,
  SchmittElm,
  TriStateElm,
} from '../elm/InverterElm.ts';
import type { CircuitElm } from '../CircuitElm.ts';
import {
  draw2Leads,
  drawCenteredText,
  elementBox,
  MUTED,
  vInk,
  volt,
  type ElementView,
} from './common.ts';
import { distance, interp, interp2, type Rect } from './geometry.ts';
import type { DrawContext, Ink, Pt } from './Painter.ts';

/** Points along a cubic Bezier from p0 to p3, without p0. */
function cubic(p0: Pt, c1: Pt, c2: Pt, p3: Pt, out: Pt[], n = 12): void {
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push({
      x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
      y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
    });
  }
}

/** Upstream `getSchmittPolygon`: the hysteresis symbol inside a gate body. */
function schmittPolygon(lead1: Pt, lead2: Pt, gsize: number, ctr: number): Pt[] {
  const hs = 3 * gsize;
  const h1 = 3 * gsize;
  const h2 = h1 * 2;
  const len = distance(lead1, lead2);
  return [
    interp(lead1, lead2, ctr - h2 / len, hs),
    interp(lead1, lead2, ctr + h1 / len, hs),
    interp(lead1, lead2, ctr + h1 / len, -hs),
    interp(lead1, lead2, ctr + h2 / len, -hs),
    interp(lead1, lead2, ctr - h1 / len, -hs),
    interp(lead1, lead2, ctr - h1 / len, hs),
  ];
}

/** The rectangular IEC body from a to b, `hs` each side of the line. */
function euroBox(a: Pt, b: Pt, hs: number): Pt[] {
  const [p0, p1] = interp2(a, b, 0, hs);
  const [p3, p2] = interp2(a, b, 1, hs);
  return [p0, p1, p2, p3];
}

// upstream's float constants
const CTR_GATE = Math.fround(0.47);
const CTR_SCHMITT = Math.fround(0.3);

function gateBody(e: GateElm, ctx: DrawContext, ink: Ink): void {
  const p = ctx.painter;
  const l1 = e.lead1;
  const l2 = e.bodyLead2;
  const hs2 = e.hs2;
  const xor = e instanceof XorGateElm || e instanceof XnorGateElm;
  if (e.drawAsAndGate()) {
    const [t0, t6] = interp2(l1, l2, 0, hs2);
    const [t1, t5] = interp2(l1, l2, 0.5, hs2);
    const [t2, t4] = interp2(l1, l2, 1, hs2);
    const t3 = interp(l1, l2, 1);
    const pts: Pt[] = [t0, t1];
    cubic(t1, t1, t2, t3, pts);
    cubic(t3, t3, t4, t5, pts);
    pts.push(t6);
    p.polyline(pts, ink, { closed: true });
  } else {
    const [t0, t6] = interp2(l1, l2, 0, hs2);
    const [t1, t5] = interp2(l1, l2, 0.3, hs2);
    const t3 = l2;
    const [t2, t4] = interp2(l1, l2, 0.733, hs2 * 0.85);
    const t7 = interp(l1, l2, 0.105);
    const pts: Pt[] = [t0, t1];
    cubic(t1, t2, t2, t3, pts);
    cubic(t3, t4, t4, t5, pts);
    pts.push(t6);
    cubic(t6, t7, t7, t0, pts);
    p.polyline(pts, ink, { closed: true });
  }
  if (xor) {
    const ww2 = e.ww === 0 ? e.dn * 2 : e.ww * 2;
    const [t8, t9] = interp2(l1, l2, -0.05 - 8 / ww2, hs2);
    const t10 = interp(l1, l2, 0.1 - 8 / ww2);
    const pts: Pt[] = [t8];
    cubic(t8, t10, t10, t9, pts);
    p.polyline(pts, ink);
  }
}

export const gateView: ElementView<GateElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const euro = ctx.euroGates === true;
    const hs = e.gheight;
    const ww2 = e.ww * 2;
    const bubbles = e.hasFlag(GateElm.FLAG_INVERT_INPUTS) || e.hasFlag(GateElm.FLAG_DEMORGAN);
    for (let i = 0; i !== e.inputCount; i++) {
      const g = hs * e.inputRow(i);
      const adj = e.getLeadAdjustment(i, euro);
      const inGate = interp(e.lead1, e.bodyLead2, bubbles ? -8 / ww2 + adj : adj, g);
      p.line(e.inPosts[i], inGate, vInk(volt(e, i)));
      if (bubbles) p.circle(interp(e.lead1, e.bodyLead2, -4 / ww2, g), 3, MUTED);
    }
    p.line(e.lead2, e.point2, vInk(volt(e, e.inputCount)));
    if (euro) {
      p.polyline(euroBox(e.lead1, e.bodyLead2, e.hs2), MUTED, { closed: true });
      const center = interp(e.point1, e.point2, 0.5);
      const text = e.getGateText();
      if (text !== null) drawCenteredText(ctx, text, center.x, center.y - 6 * e.gsize, true, MUTED);
    } else gateBody(e, ctx, MUTED);
    if (e.hasSchmittInputs())
      p.polyline(schmittPolygon(e.lead1, e.bodyLead2, e.gsize, CTR_GATE), MUTED, {
        width: 2,
        closed: true,
      });
    if (e.isInverting() !== e.hasFlag(GateElm.FLAG_DEMORGAN)) p.circle(e.pcircle, 3, MUTED);
    p.dots(e.lead2, e.point2, ctx.dotCount(0, e.current));
  },
  bbox: (e) => elementBox(e, e.hs2),
};

function clampWw(e: CircuitElm, ww: number): number {
  return ww > e.dn / 2 ? Math.trunc(e.dn / 2) : ww;
}

export const inverterView: ElementView<InverterElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const hs = 16;
    const ww = clampWw(e, 16);
    const dn = e.dn;
    const lead1 = interp(e.point1, e.point2, 0.5 - ww / dn);
    const lead2 = interp(e.point1, e.point2, 0.5 + (ww + 2) / dn);
    draw2Leads(e, ctx, lead1, lead2);
    let pcircle: Pt;
    if (ctx.euroGates === true) {
      pcircle = demorganCircle(e, ww);
      const l2 = interp(e.point1, e.point2, 0.5 + (ww - 5) / dn);
      p.polyline(euroBox(lead1, l2, hs), MUTED, { closed: true });
      const center = interp(lead1, l2, 0.5);
      drawCenteredText(ctx, '1', center.x, center.y - 6, true, MUTED);
    } else {
      let start: Pt;
      let endF: number;
      if (e.hasFlag(InverterElm.FLAG_DEMORGAN)) {
        start = interp(e.point1, e.point2, 0.5 - (ww - 8) / dn);
        endF = 0.5 + (ww + 2) / dn;
      } else {
        start = lead1;
        endF = 0.5 + (ww - 5) / dn;
      }
      pcircle = demorganCircle(e, ww);
      const [t0, t1] = interp2(start, lead2, 0, hs);
      p.polyline([t0, t1, interp(e.point1, e.point2, endF)], MUTED, { closed: true });
    }
    p.circle(pcircle, 3, MUTED);
    p.dots(lead2, e.point2, ctx.dotCount(0, e.current));
  },
  bbox: (e) => elementBox(e, 16),
};

function demorganCircle(e: InverterElm, ww: number): Pt {
  if (e.hasFlag(InverterElm.FLAG_DEMORGAN))
    return interp(e.point1, e.point2, 0.5 - (ww - 4) / e.dn);
  return interp(e.point1, e.point2, 0.5 + (ww - 1) / e.dn);
}

export const schmittView: ElementView<InvertingSchmittElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const hs = 16;
    const ww = clampWw(e, 16);
    const dn = e.dn;
    const inverting = !(e instanceof SchmittElm);
    const lead1 = interp(e.point1, e.point2, 0.5 - ww / dn);
    const lead2 = interp(e.point1, e.point2, 0.5 + (inverting ? ww + 2 : ww - 3) / dn);
    draw2Leads(e, ctx, lead1, lead2);
    const [t0, t1] = interp2(lead1, lead2, 0, hs);
    p.polyline([t0, t1, interp(e.point1, e.point2, 0.5 + (ww - 5) / dn)], MUTED, {
      closed: true,
    });
    // upstream's SchmittElm keeps the symbol computed from the inverting body's leads
    const symLead2 = interp(e.point1, e.point2, 0.5 + (ww + 2) / dn);
    p.polyline(schmittPolygon(lead1, symLead2, 1, CTR_SCHMITT), MUTED, { width: 2, closed: true });
    if (inverting) p.circle(interp(e.point1, e.point2, 0.5 + (ww - 2) / dn), 3, MUTED);
    p.dots(lead2, e.point2, ctx.dotCount(0, e.current));
  },
  bbox: (e) => elementBox(e, 16),
};

export const delayBufferView: ElementView<DelayBufferElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const hs = 16;
    const ww = clampWw(e, 16 - 2);
    const dn = e.dn;
    const lead1 = interp(e.point1, e.point2, 0.5 - ww / dn);
    const lead2 = interp(e.point1, e.point2, 0.5 + ww / dn);
    draw2Leads(e, ctx, lead1, lead2);
    if (ctx.euroGates === true) {
      const l2 = interp(e.point1, e.point2, 0.5 + (ww - 5) / dn);
      p.polyline(euroBox(lead1, l2, hs), MUTED, { closed: true });
      const center = interp(lead1, l2, 0.5);
      drawCenteredText(ctx, '1', center.x, center.y - 6, true, MUTED);
    } else {
      const [t0, t1] = interp2(lead1, lead2, 0, hs);
      p.polyline([t0, t1, interp(e.point1, e.point2, 0.5 + ww / dn)], MUTED, { closed: true });
    }
    p.dots(lead2, e.point2, ctx.dotCount(0, e.current));
  },
  bbox: (e) => elementBox(e, 16),
};

export const triStateView: ElementView<TriStateElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const bw = e.busWidth;
    p.line(e.point3, e.lead3, vInk(volt(e, 2 * bw)));
    if (bw > 1) {
      p.line(e.point1, e.busLead1, vInk(volt(e, 0)), { width: 5 });
      p.line(e.lead2, e.point2, vInk(volt(e, bw)), { width: 5 });
    } else {
      p.line(e.point1, e.lead1, vInk(volt(e, 0)));
      p.line(e.lead2, e.point2, vInk(volt(e, 1)));
    }
    const ww = Math.trunc(Math.min(16, e.dn / 2));
    const [t0, t1] = interp2(e.lead1, e.lead2, 0, 16 + 2);
    p.polyline([t0, t1, interp(e.lead1, e.lead2, 0.5 + (ww - 2) / 32)], MUTED, { closed: true });
    p.dots(e.lead2, e.point2, ctx.dotCount(0, e.current));
  },
  bbox: (e): Rect => elementBox(e, 16, e.point1, e.point2),
};
