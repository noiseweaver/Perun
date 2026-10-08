// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Geometry learned from CircuitJS1 DiodeElm, ZenerElm, LEDElm, TransistorElm, MosfetElm and
// OpAmpElm (src/com/lushprojects/circuitjs1/client/, master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032; the drawing code is new.

import type { DiodeElm } from '../elm/DiodeElm.ts';
import type { LEDElm } from '../elm/LEDElm.ts';
import type { JfetElm } from '../elm/JfetElm.ts';
import { MosfetElm } from '../elm/MosfetElm.ts';
import { OpAmpElm } from '../elm/OpAmpElm.ts';
import { TransistorElm } from '../elm/TransistorElm.ts';
import type { ZenerElm } from '../elm/ZenerElm.ts';
import {
  COMPONENT,
  doDots,
  draw2Leads,
  drawCenteredText,
  drawLabeledNode,
  elementBox,
  LABEL,
  MUTED,
  TEXT,
  UNITS_FONT,
  VALUE_FONT,
  vInk,
  volt,
  type ElementView,
} from './common.ts';
import { calcArrow, calcLeads, interp, interp2, pt, rectOf, sign, unionRect } from './geometry.ts';
import type { DrawContext, Pt } from './Painter.ts';
import { getShortUnitText } from './units.ts';
import { addCurCount } from './passive.ts';

const DIODE_HS = 8;

export function diodeGeometry(e: DiodeElm) {
  const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, 16);
  const [pa0, pa1] = interp2(lead1, lead2, 0, DIODE_HS);
  const cathode = interp2(lead1, lead2, 1, DIODE_HS);
  return { lead1, lead2, cathode, poly: [pa0, pa1, lead2] };
}

function drawDiode(e: DiodeElm, ctx: DrawContext): void {
  const { lead1, lead2, cathode, poly } = diodeGeometry(e);
  draw2Leads(e, ctx, lead1, lead2);
  ctx.painter.fillPolygon(poly, vInk(volt(e, 0)));
  ctx.painter.line(cathode[0], cathode[1], vInk(volt(e, 1)));
}

export const diodeView: ElementView<DiodeElm> = {
  draw(e, ctx) {
    drawDiode(e, ctx);
    doDots(e, ctx);
  },
  bbox: (e) => elementBox(e, DIODE_HS),
};

export const zenerView: ElementView<ZenerElm> = {
  draw(e, ctx) {
    const { lead1, lead2, cathode, poly } = diodeGeometry(e);
    draw2Leads(e, ctx, lead1, lead2);
    const p = ctx.painter;
    p.fillPolygon(poly, vInk(volt(e, 0)));
    const v2 = vInk(volt(e, 1));
    p.line(cathode[0], cathode[1], v2);
    p.line(interp(cathode[0], cathode[1], -0.2, -DIODE_HS), cathode[0], v2);
    p.line(interp(cathode[1], cathode[0], -0.2, -DIODE_HS), cathode[1], v2);
    doDots(e, ctx);
  },
  bbox: (e) => elementBox(e, DIODE_HS),
};

export const ledView: ElementView<LEDElm> = {
  draw(e, ctx) {
    if (ctx.highlighted) {
      drawDiode(e, ctx);
      doDots(e, ctx);
      return;
    }
    const p = ctx.painter;
    const cr = 12;
    const ledLead1 = interp(e.point1, e.point2, 0.5 - cr / e.dn);
    const ledLead2 = interp(e.point1, e.point2, 0.5 + cr / e.dn);
    const center = interp(e.point1, e.point2, 0.5);
    p.line(e.point1, ledLead1, vInk(volt(e, 0)));
    p.line(ledLead2, e.point2, vInk(volt(e, 1)));
    p.circle(center, cr * 0.98, MUTED);
    // brightness: logarithmic in current, full at maxBrightnessCurrent
    let w = e.current / e.maxBrightnessCurrent;
    if (w > 0) w = 255 * (1 + 0.2 * Math.log(w));
    w = Math.min(Math.max(w, 0), 255);
    p.fillCircle(center, cr - 4, {
      rgb: [Math.trunc(e.colorR * w), Math.trunc(e.colorG * w), Math.trunc(e.colorB * w)],
    });
    const c = ctx.dotCount(0, e.current);
    p.dots(e.point1, ledLead1, c);
    p.dots(e.point2, ledLead2, -c);
  },
  bbox: (e) => elementBox(e, 12),
};

function transistorGeometry(e: TransistorElm) {
  const { point1, point2, dn, pnp } = e;
  // setPoints() has already flipped dsign for FLAG_FLIP
  const dsign = e.dsign;
  const [rect0, rect1] = interp2(point1, point2, 1 - 16 / dn, 16);
  const [rect2, rect3] = interp2(point1, point2, 1 - 13 / dn, 16);
  const [coll1, emit1] = interp2(point1, point2, 1 - 13 / dn, 6 * dsign * pnp);
  const base = interp(point1, point2, 1 - 16 / dn);
  const coll0 = e.coll[0] as Pt;
  const emit0 = e.emit[0] as Pt;
  const arrow = pnp === 1 ? calcArrow(emit1, emit0, 8, 4) : calcArrow(emit0, emit1, 8, 4);
  return {
    coll0,
    coll1,
    emit0,
    emit1,
    base,
    rectPoly: [rect0, rect2, rect3, rect1],
    arrow,
    circleCenter: interp(base, point2, 0.5),
  };
}

export const transistorView: ElementView<TransistorElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const g = transistorGeometry(e);
    if (e.hasFlag(TransistorElm.FLAG_CIRCLE)) p.circle(g.circleCenter, 20 * 0.98, MUTED);
    p.line(g.coll0, g.coll1, vInk(volt(e, 1)));
    p.line(g.emit0, g.emit1, vInk(volt(e, 2)));
    p.fillPolygon(g.arrow, vInk(volt(e, 2)));
    p.line(e.point1, g.base, vInk(volt(e, 0)));
    p.dots(g.base, e.point1, ctx.dotCount(0, -e.ib));
    p.dots(g.coll1, g.coll0, ctx.dotCount(1, -e.ic));
    p.dots(g.emit1, g.emit0, ctx.dotCount(2, -e.ie));
    p.fillPolygon(g.rectPoly, vInk(volt(e, 0)));
    if (ctx.highlighted) {
      const { dx, dy } = e;
      if (dy === 0) {
        p.text('B', pt(g.base.x - (dx < 0 ? -2 : 10), g.base.y - 4), COMPONENT, UNITS_FONT);
        p.text('C', pt(g.coll0.x - (dx < 0 ? 13 : -6), g.coll0.y + 4), COMPONENT, UNITS_FONT);
        p.text('E', pt(g.emit0.x - (dx < 0 ? 13 : -6), g.emit0.y + 4), COMPONENT, UNITS_FONT);
      } else if (dx === 0) {
        p.text('B', pt(g.base.x + 3, g.base.y - (dy < 0 ? -11 : 3)), COMPONENT, UNITS_FONT);
        p.text('C', pt(g.coll0.x - 4, g.coll0.y - (dy < 0 ? 7 : -14)), COMPONENT, UNITS_FONT);
        p.text('E', pt(g.emit0.x - 4, g.emit0.y - (dy < 0 ? 7 : -14)), COMPONENT, UNITS_FONT);
      }
    }
  },
  bbox: (e) => elementBox(e, 16),
};

const MOSFET_HS = 16;

export function mosfetGeometry(e: MosfetElm) {
  const { point1, point2, dn, pnp } = e;
  let hs2 = MOSFET_HS * e.dsign;
  if (e.hasFlag(MosfetElm.FLAG_FLIP)) hs2 = -hs2;
  const [src0, drn0] = interp2(point1, point2, 1, -hs2);
  const [src1, drn1] = interp2(point1, point2, 1 - 22 / dn, -hs2);
  const [src2, drn2] = interp2(point1, point2, 1 - 22 / dn, -Math.trunc((hs2 * 4) / 3));
  const [gate0, gate2] = interp2(point1, point2, 1 - 28 / dn, Math.trunc(hs2 / 2));
  let gate1 = interp(gate0, gate2, 0.5);
  const bulk = e.showBulk();
  const body = bulk ? [interp(src0, drn0, 0.5), interp(src1, drn1, 0.5)] : [];
  const [body0, body1] = body;
  let arrow: Pt[] | null = null;
  let pcircle: Pt | null = null;
  if (!e.drawDigital()) {
    if (pnp === 1)
      arrow = !bulk ? calcArrow(src1, src0, 10, 4) : calcArrow(body0 as Pt, body1 as Pt, 12, 5);
    else arrow = !bulk ? calcArrow(drn0, drn1, 12, 5) : calcArrow(body1 as Pt, body0 as Pt, 12, 5);
  } else if (pnp === -1) {
    gate1 = interp(point1, point2, 1 - 36 / dn);
    pcircle = interp(point1, point2, 1 - (e.dsign < 0 ? 32 : 31) / dn);
  }
  return {
    hs2,
    src: [src0, src1, src2],
    drn: [drn0, drn1, drn2],
    gate: [gate0, gate1, gate2],
    body,
    arrow,
    pcircle,
  };
}

/** Body diode symbol(s): one offset diode, or two inline ones when the body is a terminal. */
function bodyDiodeGeometry(e: MosfetElm, g: ReturnType<typeof mosfetGeometry>) {
  const [src0, ,] = g.src as [Pt, Pt, Pt];
  const [drn0, ,] = g.drn as [Pt, Pt, Pt];
  if (!e.hasBodyTerminal()) {
    const diodeHs = 6;
    const dp1 = interp(src0, drn0, 0.5 - diodeHs / 2 / MOSFET_HS, -g.hs2);
    const dp2 = interp(src0, drn0, 0.5 + diodeHs / 2 / MOSFET_HS, -g.hs2);
    const [pa0, pa1] = interp2(dp1, dp2, 0, diodeHs);
    return {
      polys: [[pa0, pa1, dp2]],
      cathodes: [interp2(dp1, dp2, 1, diodeHs)],
      leads: [interp(src0, drn0, 0, -g.hs2), dp1, dp2, interp(src0, drn0, 1, -g.hs2)],
    };
  }
  const body0 = g.body[0] as Pt;
  const diodeHs = 3;
  const one = (a: Pt, b: Pt) => {
    const dp1 = interp(a, b, 0.3);
    const dp2 = interp(a, b, 0.7);
    const [pa0, pa1] = interp2(dp1, dp2, 0, diodeHs);
    return { poly: [pa0, pa1, dp2], cathode: interp2(dp1, dp2, 1, diodeHs) };
  };
  const d1 = e.pnp === 1 ? one(body0, src0) : one(src0, body0);
  const d2 = e.pnp === 1 ? one(body0, drn0) : one(drn0, body0);
  return { polys: [d1.poly, d2.poly], cathodes: [d1.cathode, d2.cathode], leads: [] };
}

export const mosfetView: ElementView<MosfetElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const g = mosfetGeometry(e);
    const [src0, src1, src2] = g.src as [Pt, Pt, Pt];
    const [drn0, drn1, drn2] = g.drn as [Pt, Pt, Pt];
    const [gate0, gate1, gate2] = g.gate as [Pt, Pt, Pt];
    const vs = volt(e, 1);
    const vd = volt(e, 2);
    p.line(src0, src1, vInk(vs));
    p.line(drn0, drn1, vInk(vd));
    // channel, broken in two places for an enhancement device
    const segments = 6;
    const enhancement = e.vt > 0 && e.showBulk();
    for (let i = 0; i !== segments; i++) {
      if ((i === 1 || i === 4) && enhancement) continue;
      const v = vs + ((vd - vs) * i) / segments;
      p.line(interp(src1, drn1, i / segments), interp(src1, drn1, (i + 1) / segments), vInk(v));
    }
    p.line(src1, src2, vInk(vs));
    p.line(drn1, drn2, vInk(vd));
    const bodyV = vInk(volt(e, e.bodyTerminal));
    if (e.showBulk()) {
      const [body0, body1] = g.body as [Pt, Pt];
      if (!e.hasBodyTerminal()) p.line(e.pnp === -1 ? drn0 : src0, body0, bodyV);
      p.line(body0, body1, bodyV);
    }
    if (e.bodyDiodeSymbolShown) {
      const bd = bodyDiodeGeometry(e, g);
      if (!e.hasBodyTerminal()) {
        const [l0, l1, l2, l3] = bd.leads as [Pt, Pt, Pt, Pt];
        const [c0, c1] = bd.cathodes[0] as [Pt, Pt];
        p.fillPolygon(bd.polys[0] as Pt[], vInk(vs));
        p.line(src0, l0, vInk(vs));
        p.line(l0, l1, vInk(vs));
        p.line(c0, c1, vInk(vd));
        p.line(l2, l3, vInk(vd));
        p.line(drn0, l3, vInk(vd));
      } else {
        const bt = e.bodyTerminal;
        const [a1, k1, a2, k2] = e.pnp === 1 ? [bt, 1, bt, 2] : [1, bt, 2, bt];
        p.fillPolygon(bd.polys[0] as Pt[], vInk(volt(e, a1)));
        const [c0, c1] = bd.cathodes[0] as [Pt, Pt];
        p.line(c0, c1, vInk(volt(e, k1)), { width: 1 });
        p.fillPolygon(bd.polys[1] as Pt[], vInk(volt(e, a2)));
        const [d0, d1] = bd.cathodes[1] as [Pt, Pt];
        p.line(d0, d1, vInk(volt(e, k2)), { width: 1 });
      }
    }
    if (g.arrow) p.fillPolygon(g.arrow, bodyV);
    const vg = vInk(volt(e, 0));
    p.line(e.point1, gate1, vg);
    p.line(gate0, gate2, vg);
    if (g.pcircle) p.circle(g.pcircle, 3 * 0.98, vg);
    if (e.hasFlag(MosfetElm.FLAG_SHOWVT)) {
      drawCenteredText(ctx, String(e.vt * e.pnp), e.x2 + 2, e.y2, false, TEXT, VALUE_FONT);
    }
    const cs = ctx.dotCount(0, -(e.ids + e.capCurGS));
    const cd = ctx.dotCount(1, -e.ids + e.capCurGD);
    p.dots(src0, src1, cs);
    p.dots(src1, drn1, cs);
    p.dots(drn1, drn0, cd);
    if (e.hasGateCaps()) p.dots(e.point1, gate1, ctx.dotCount(2, e.capCurGS + e.capCurGD));
    if (e.showBulk()) {
      const b1 = ctx.dotCount(3, e.diodeCurrent1);
      const b2 = ctx.dotCount(4, e.diodeCurrent2);
      const body0 = g.body[0] as Pt;
      if (e.bodyDiodeSymbolShown && !e.hasBodyTerminal()) {
        const leads = bodyDiodeGeometry(e, g).leads as [Pt, Pt, Pt, Pt];
        const cur = -b1 + b2;
        p.dots(src0, leads[0], cur);
        p.dots(leads[0], leads[3], cur);
        p.dots(leads[3], drn0, cur);
      } else {
        p.dots(src0, body0, -b1);
        p.dots(body0, drn0, b2);
      }
    }
    if (ctx.highlighted) {
      const dsx = sign(e.dx);
      const dsyn = e.dy === 0 ? 0 : 1;
      const pnp = e.pnp;
      p.text(
        'G',
        pt(gate1.x - (e.dx < 0 ? -2 : 12), gate1.y + (e.dy > 0 ? -5 : 12)),
        COMPONENT,
        UNITS_FONT,
      );
      const extra = e.bodyDiodeSymbolShown && !e.hasBodyTerminal() && e.dy === 0 ? 16 * e.dsign : 0;
      const lx = (q: Pt): number => q.x - 3 + 9 * (dsx - dsyn * pnp) + extra;
      p.text(pnp === -1 ? 'D' : 'S', pt(lx(src0), src0.y + 4), COMPONENT, UNITS_FONT);
      p.text(pnp === -1 ? 'S' : 'D', pt(lx(drn0), drn0.y + 4), COMPONENT, UNITS_FONT);
      if (e.hasBodyTerminal()) {
        const body0 = g.body[0] as Pt;
        p.text('B', pt(body0.x - 3 + 9 * (dsx - dsyn * pnp), body0.y + 4), COMPONENT, UNITS_FONT);
      }
    }
  },
  bbox: (e) => elementBox(e, MOSFET_HS),
};

export const jfetView: ElementView<JfetElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const { point1, point2, dn } = e;
    let hs2 = MOSFET_HS * e.dsign;
    if (e.hasFlag(MosfetElm.FLAG_FLIP)) hs2 = -hs2;
    const [src0, drn0] = interp2(point1, point2, 1, -hs2);
    const [src1, drn1] = interp2(point1, point2, 1, -Math.trunc(hs2 / 2));
    const [src2, drn2] = interp2(point1, point2, 1 - 10 / dn, -Math.trunc(hs2 / 2));
    const gatePt = interp(point1, point2, 1 - 14 / dn);
    const [ra0, ra1] = interp2(point1, point2, 1 - 13 / dn, MOSFET_HS);
    const [ra2, ra3] = interp2(point1, point2, 1 - 10 / dn, MOSFET_HS);
    const arrow =
      e.pnp === -1
        ? calcArrow(gatePt, interp(gatePt, point1, 18 / dn), 12, 5)
        : calcArrow(point1, gatePt, 12, 5);
    const vs = vInk(volt(e, 1));
    const vd = vInk(volt(e, 2));
    const vg = vInk(volt(e, 0));
    p.line(src0, src1, vs);
    p.line(src1, src2, vs);
    p.line(drn0, drn1, vd);
    p.line(drn1, drn2, vd);
    p.line(point1, gatePt, vg);
    p.fillPolygon(arrow, vg);
    p.fillPolygon([ra0, ra1, ra3, ra2], COMPONENT);
    const cd = ctx.dotCount(0, -e.ids);
    const cg = ctx.dotCount(1, e.gateCurrent);
    const cs = ctx.dotCount(2, -e.gateCurrent - e.ids);
    p.dots(src0, src1, cs);
    p.dots(src1, src2, addCurCount(cs, 8));
    p.dots(drn0, drn1, -cd);
    p.dots(drn1, drn2, -addCurCount(cd, 8));
    p.dots(point1, gatePt, cg);
    if (ctx.highlighted) {
      const dsx = sign(e.dx);
      const dsyn = e.dy === 0 ? 0 : 1;
      const pnp = e.pnp;
      const gate1 = interp(...interp2(point1, point2, 1 - 28 / dn, Math.trunc(hs2 / 2)), 0.5);
      p.text(
        'G',
        pt(gate1.x - (e.dx < 0 ? -2 : 12), gate1.y + (e.dy > 0 ? -5 : 12)),
        COMPONENT,
        UNITS_FONT,
      );
      const s = pnp === -1 ? 'D' : 'S';
      const d = pnp === -1 ? 'S' : 'D';
      if (e.dy === 0) {
        const lx = (q: Pt): number => q.x - 3 + 9 * (dsx - dsyn * pnp);
        p.text(s, pt(lx(src0), src0.y + 4), COMPONENT, UNITS_FONT);
        p.text(d, pt(lx(drn0), drn0.y + 4), COMPONENT, UNITS_FONT);
      } else if (e.dx === 0) {
        const ly = (q: Pt): number => q.y - (e.dy < 0 ? 7 : -14);
        p.text(s, pt(src0.x - 4, ly(src0)), COMPONENT, UNITS_FONT);
        p.text(d, pt(drn0.x - 4, ly(drn0)), COMPONENT, UNITS_FONT);
      }
    }
  },
  bbox: (e) => elementBox(e, MOSFET_HS),
};

function opAmpGeometry(e: OpAmpElm) {
  let ww = e.opwidth;
  if (ww > e.dn / 2) ww = Math.trunc(e.dn / 2);
  const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, ww * 2);
  let hs = e.opheight * e.dsign;
  if (e.hasFlag(OpAmpElm.FLAG_SWAP)) hs = -hs;
  const [in1, in2] = interp2(lead1, lead2, 0, hs);
  const [t1, t2] = interp2(lead1, lead2, 0.2, hs);
  const [tri0, tri1] = interp2(lead1, lead2, 0, hs * 2);
  // supply rail stubs (not upstream): from the middle of each slanted side out to the height of
  // the triangle's back, V+ on the side the real op-amp puts it (unswapped -), whatever the swap
  const hr = e.opheight * e.dsign;
  const [posEdge, negEdge] = interp2(lead1, lead2, 0.5, hr);
  const [posEnd, negEnd] = interp2(lead1, lead2, 0.5, hr * 2);
  return {
    lead1,
    lead2,
    in1,
    in2,
    text1: t1,
    text2: t2,
    triangle: [tri0, tri1, lead2],
    rails: [
      [posEdge, posEnd],
      [negEdge, negEnd],
    ] as const,
  };
}

/** `+15V` style rail label: always signed, so either rail reads as a supply. */
function railText(v: number): string {
  return (v < 0 ? '-' : '+') + getShortUnitText(Math.abs(v), 'V');
}

export const opAmpView: ElementView<OpAmpElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const g = opAmpGeometry(e);
    p.line(e.in1p[0] as Pt, g.in1, vInk(volt(e, 0)));
    p.line(e.in2p[0] as Pt, g.in2, vInk(volt(e, 1)));
    p.line(g.lead2, e.point2, vInk(volt(e, 2)));
    p.polyline(g.triangle, LABEL, { closed: true });
    const font = { size: e.opsize === 2 ? 14 : 10 };
    drawCenteredText(ctx, '-', g.text1.x, g.text1.y - 2, true, LABEL, font);
    drawCenteredText(ctx, '+', g.text2.x, g.text2.y, true, LABEL, font);
    if (e.showRails) {
      const [pos, neg] = g.rails;
      p.line(pos[0], pos[1], vInk(e.maxOut));
      p.line(neg[0], neg[1], vInk(e.minOut));
      drawLabeledNode(ctx, railText(e.maxOut), pos[0], pos[1], COMPONENT);
      drawLabeledNode(ctx, railText(e.minOut), neg[0], neg[1], COMPONENT);
    }
    p.dots(e.point2, g.lead2, ctx.dotCount(0, e.current));
  },
  bbox: (e) => {
    const g = opAmpGeometry(e);
    const body = unionRect(elementBox(e, e.opheight * 2), rectOf(g.triangle));
    return e.showRails ? unionRect(body, rectOf([g.rails[0][1], g.rails[1][1]])) : body;
  },
};
