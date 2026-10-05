// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Geometry learned from CircuitJS1 TransformerElm, TappedTransformerElm, TransLineElm, RelayElm,
// RelayCoilElm and RelayContactElm draw() (src/com/lushprojects/circuitjs1/client/, master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032; the drawing code is new.

import { RelayCoilElm, type RelayContactElm } from '../elm/RelayCoilElm.ts';
import type { RelayElm } from '../elm/RelayElm.ts';
import type { TappedTransformerElm } from '../elm/TappedTransformerElm.ts';
import { TransformerElm } from '../elm/TransformerElm.ts';
import type { TransLineElm } from '../elm/TransLineElm.ts';
import { javaDoubleToInt } from '../java.ts';
import {
  COMPONENT,
  elementBox,
  LABEL,
  MUTED,
  UNITS_FONT,
  vInk,
  type ElementView,
} from './common.ts';
import { interp, pt, rectOf, unionRect, type Rect } from './geometry.ts';
import type { DrawContext, Ink, Pt } from './Painter.ts';
import { addCurCount, coilLoops } from './passive.ts';

function drawCoil(ctx: DrawContext, hs: number, p1: Pt, p2: Pt, v1: number, v2: number): void {
  const ink: Ink = { gradient: { from: p1, to: p2, v1, v2 } };
  for (const loop of coilLoops(p1, p2, hs)) ctx.painter.polyline(loop, ink);
}

export const transformerView: ElementView<TransformerElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const { ptEnds, ptCoil, ptCore, volts } = e;
    for (let i = 0; i !== 4; i++) p.line(ptEnds[i], ptCoil[i], vInk(volts[i]));
    for (let i = 0; i !== 2; i++) {
      let csign = e.dsign * (i === 1 ? -6 * e.polarity : 6) * e.flip;
      if (e.hasFlag(TransformerElm.FLAG_VERTICAL)) csign *= -1;
      drawCoil(ctx, csign, ptCoil[i], ptCoil[i + 2], volts[i], volts[i + 2]);
    }
    for (let i = 0; i !== 2; i++) {
      p.line(ptCore[i], ptCore[i + 2], MUTED);
      if (e.dots !== null) p.fillCircle(e.dots[i], 2.5, MUTED);
    }
    for (let i = 0; i !== 2; i++) {
      const c = ctx.dotCount(i, e.currents[i]);
      p.dots(ptEnds[i], ptCoil[i], c);
      p.dots(ptCoil[i], ptCoil[i + 2], c);
      p.dots(ptEnds[i + 2], ptCoil[i + 2], -c);
    }
  },
  bbox: (e) => rectOf(e.ptEnds.concat(e.ptCoil)),
};

export const tappedTransformerView: ElementView<TappedTransformerElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const { ptEnds, ptCoil, ptCore, volts } = e;
    for (let i = 0; i !== 5; i++) p.line(ptEnds[i], ptCoil[i], vInk(volts[i]));
    for (let i = 0; i !== 4; i++) {
      if (i === 1) continue;
      drawCoil(
        ctx,
        i > 1 ? -6 * e.flip : 6 * e.flip,
        ptCoil[i],
        ptCoil[i + 1],
        volts[i],
        volts[i + 1],
      );
    }
    for (let i = 0; i !== 4; i += 2) p.line(ptCore[i], ptCore[i + 1], MUTED);
    const c = [0, 1, 2, 3].map((i) => ctx.dotCount(i, e.currents[i]));
    p.dots(ptEnds[0], ptCoil[0], c[0]);
    p.dots(ptCoil[0], ptCoil[1], c[0]);
    p.dots(ptCoil[1], ptEnds[1], c[0]);
    p.dots(ptEnds[2], ptCoil[2], c[1]);
    p.dots(ptCoil[2], ptCoil[3], c[1]);
    p.dots(ptCoil[3], ptEnds[3], c[3]);
    p.dots(ptCoil[3], ptCoil[4], c[2]);
    p.dots(ptCoil[4], ptEnds[4], c[2]);
  },
  bbox: (e) => rectOf(e.ptEnds.concat(e.ptCoil)),
};

export const transLineView: ElementView<TransLineElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const { posts, inner, volts } = e;
    if (posts.length < 4) return;
    for (let i = 0; i !== 4; i++) p.line(posts[i], inner[i], vInk(volts[i]));
    const vl = e.voltageL;
    const vr = e.voltageR;
    const segments = javaDoubleToInt(e.dn / 2);
    if (vl !== null && vr !== null && e.lenSteps > 0) {
      // the wave on the line: each slice colored by the sum of the waves passing it
      const lenSteps = e.lenSteps;
      const ix0 = e.ptr - 1 + lenSteps;
      const segf = 1 / segments;
      for (let i = 0; i !== segments; i++) {
        const ix1 = (ix0 - Math.trunc((lenSteps * i) / segments)) % lenSteps;
        const ix2 = (ix0 - Math.trunc((lenSteps * (segments - 1 - i)) / segments)) % lenSteps;
        const ink = vInk(((vl[ix1] ?? 0) + (vr[ix2] ?? 0)) / 2);
        const ps1 = interp(inner[0], inner[1], i * segf);
        const ps2 = interp(inner[2], inner[3], i * segf);
        p.line(ps1, ps2, ink, { width: 1 });
        p.line(interp(inner[2], inner[3], (i + 1) * segf), ps2, ink);
      }
    }
    p.line(inner[0], inner[1], vInk(volts[0]));
    const c1 = ctx.dotCount(0, -e.current1);
    const c2 = ctx.dotCount(1, e.current2);
    p.dots(posts[0], inner[0], c1);
    p.dots(posts[2], inner[2], -c1);
    p.dots(posts[1], inner[1], -c2);
    p.dots(posts[3], inner[3], c2);
  },
  bbox: (e) => (e.posts.length < 4 ? elementBox(e, 0) : rectOf(e.posts)),
};

function outlineBox(ctx: DrawContext, o: readonly Pt[]): void {
  ctx.painter.polyline(o, MUTED, { closed: true });
}

export const relayView: ElementView<RelayElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const model = e.getModel();
    const pc = e.poleCount();
    const { coilPosts, coilLeads, volts, nCoil1, nCoil2 } = e;
    if (coilPosts.length < 2 || e.swposts.length < pc) return;
    for (let i = 0; i !== 2; i++) p.line(coilLeads[i], coilPosts[i], vInk(volts[nCoil1 + i]));
    const x = model.coilStyle === 2 ? 1 : 0;
    drawCoil(
      ctx,
      e.dflip * 6,
      coilLeads[x],
      coilLeads[1 - x],
      volts[nCoil1 + x],
      volts[nCoil2 - x],
    );
    if (model.showBox) outlineBox(ctx, e.outline);
    // the dashed link from the coil to the blades
    const { point1, point2, openhs, dflip, d_position } = e;
    for (let i = 0; i !== pc; i++) {
      let a: Pt;
      if (i === 0) {
        const off = model.coilStyle === 0 ? 4 : 0;
        a = interp(point1, point2, 0.5, openhs * 2 + 5 * dflip - i * openhs * 3 + off);
      } else
        a = interp(
          point1,
          point2,
          0.5,
          javaDoubleToInt(openhs * (-i * 3 + 3 - 0.5 + d_position)) + 5 * dflip,
        );
      const b = interp(
        point1,
        point2,
        0.5,
        javaDoubleToInt(openhs * (-i * 3 - 0.5 + d_position)) - 5 * dflip,
      );
      p.line(a, b, MUTED, { width: 1, dash: [4, 4] });
    }
    for (let k = 0; k !== pc; k++) {
      const posts = e.swposts[k];
      const poles = e.swpoles[k];
      for (let i = 0; i !== 3; i++) p.line(posts[i], poles[i], vInk(volts[k * 3 + i]));
      p.line(poles[0], interp(poles[1], poles[2], d_position), COMPONENT);
      const c = ctx.dotCount(k, e.switchCurrent[k]);
      p.dots(posts[0], poles[0], c);
      if (e.i_position !== 2) p.dots(poles[e.i_position + 1], posts[e.i_position + 1], c);
    }
    const cc = ctx.dotCount(pc, e.coilCurrent);
    if (cc !== 0) {
      p.dots(coilPosts[0], coilLeads[0], cc);
      p.dots(coilLeads[0], coilLeads[1], addCurCount(cc, e.currentOffset1));
      p.dots(coilLeads[1], coilPosts[1], addCurCount(cc, e.currentOffset2));
    }
  },
  bbox: (e): Rect => {
    if (e.outline.length < 4) return elementBox(e, 0);
    let r = rectOf([e.outline[0], e.outline[2]]);
    r = unionRect(r, rectOf(e.coilPosts));
    if (e.swposts.length > 0) r = unionRect(r, rectOf(e.swposts[0].slice(0, 2)));
    return r;
  },
};

export const relayCoilView: ElementView<RelayCoilElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const { coilPosts, coilLeads, outline, extraPoints: xp, volts } = e;
    if (outline.length < 4) return;
    for (let i = 0; i !== 2; i++) p.line(coilLeads[i], coilPosts[i], vInk(volts[i]));
    outlineBox(ctx, outline);
    if (RelayCoilElm.isLatchingType(e.type)) {
      p.polyline(xp, MUTED);
      if (e.type === RelayCoilElm.TYPE_LATCHING_ON || e.type === RelayCoilElm.TYPE_LATCHING_OFF)
        p.text(
          e.type === RelayCoilElm.TYPE_LATCHING_ON ? 'S' : 'R',
          pt(xp[0].x + 3, xp[0].y + 9),
          LABEL,
          UNITS_FONT,
        );
    } else if (e.type === RelayCoilElm.TYPE_ON_DELAY) {
      p.line(xp[1], xp[2], MUTED);
      p.line(xp[0], xp[2], MUTED);
      p.line(xp[1], xp[3], MUTED);
    } else if (e.type === RelayCoilElm.TYPE_OFF_DELAY) {
      p.fillPolygon([xp[0], pt(xp[2].x, xp[0].y), xp[2], pt(xp[0].x, xp[2].y)], MUTED);
    }
    if (e.x === e.x2)
      p.text(e.label, pt(outline[2].x + 10, (e.y + e.y2) / 2 + 4), LABEL, UNITS_FONT);
    else
      p.text(e.label, pt((e.x + e.x2) / 2, outline[1].y + 15), LABEL, {
        ...UNITS_FONT,
        align: 'center',
      });
    const cc = ctx.dotCount(0, e.coilCurrent);
    if (cc !== 0) {
      p.dots(coilPosts[0], coilLeads[0], cc);
      p.dots(coilLeads[1], coilPosts[1], addCurCount(cc, e.currentOffset2));
    }
  },
  bbox: (e) =>
    e.outline.length < 4
      ? elementBox(e, 0)
      : unionRect(rectOf([e.outline[0], e.outline[2]]), rectOf(e.coilPosts)),
};

/** An arc of radius r around c from angle a0 to a1, as a polyline. */
function arc(c: Pt, r: number, a0: number, a1: number): Pt[] {
  const pts: Pt[] = [];
  const steps = 12;
  for (let k = 0; k <= steps; k++) {
    const a = a0 + ((a1 - a0) * k) / steps;
    pts.push(pt(c.x + r * Math.cos(a), c.y + r * Math.sin(a)));
  }
  return pts;
}

export const relayContactView: ElementView<RelayContactElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const { swposts, swpoles, volts } = e;
    if (swposts.length < 3) return;
    for (let i = 0; i !== 2; i++) p.line(swposts[i], swpoles[i], vInk(volts[i]));
    p.line(swpoles[0], interp(swpoles[1], swpoles[2], e.i_position), COMPONENT);
    if (e.x === e.x2)
      p.text(e.label, pt(e.x + 10, swpoles[e.y < e.y2 ? 0 : 1].y - 5), LABEL, UNITS_FONT);
    else p.text(e.label, pt((e.x + e.x2) / 2, e.y + 15), LABEL, { ...UNITS_FONT, align: 'center' });
    const delay = e.type === RelayCoilElm.TYPE_ON_DELAY || e.type === RelayCoilElm.TYPE_OFF_DELAY;
    if (e.useIECSymbol() && delay && e.extraPoints.length === 2) {
      // the delay mark: two struts and a parachute arc
      const lift = e.i_position === 1 ? e.openhs / 2 : 0;
      const l1 = e.lead1;
      const l2 = e.lead2;
      const thin = { width: 1 };
      p.line(interp(l1, l2, 0.5 - 2 / 32, lift), e.extraPoints[0], MUTED, thin);
      p.line(interp(l1, l2, 0.5 + 2 / 32, lift), e.extraPoints[1], MUTED, thin);
      let ang = -Math.atan2(-e.dy * e.dsign, e.dx * e.dsign);
      const ds = 22 * e.dsign;
      let c: Pt;
      if (e.type === RelayCoilElm.TYPE_OFF_DELAY) {
        ang += Math.PI;
        c = interp(l1, l2, 0.5, ds + 6 * e.dsign);
      } else c = interp(l1, l2, 0.5, ds - 5 * e.dsign);
      // upstream's canvas arc runs anticlockwise from -pi/8 to 9pi/8 (a three-quarter-pi sweep)
      p.polyline(
        arc(c, 6, -Math.PI / 8 + ang, -Math.PI / 8 + ang - (Math.PI * 3) / 4),
        MUTED,
        thin,
      );
    }
    const c = ctx.dotCount(0, e.switchCurrent);
    p.dots(swposts[0], swpoles[0], c);
    if (e.i_position === 0) p.dots(swpoles[1], swposts[1], c);
  },
  bbox: (e) => elementBox(e, e.openhs),
};
