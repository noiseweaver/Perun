// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Geometry learned from CircuitJS1 WireElm, GroundElm, ResistorElm, CapacitorElm, InductorElm and
// PotElm (src/com/lushprojects/circuitjs1/client/, master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032; the drawing code is new.

import type { CapacitorElm } from '../elm/CapacitorElm.ts';
import type { GroundElm } from '../elm/GroundElm.ts';
import type { InductorElm } from '../elm/InductorElm.ts';
import { PotElm } from '../elm/PotElm.ts';
import type { ResistorElm } from '../elm/ResistorElm.ts';
import type { RoutedWireElm } from '../elm/RoutedWireElm.ts';
import { WireElm } from '../elm/WireElm.ts';
import {
  doDots,
  draw2Leads,
  drawValues,
  elementBox,
  localFrame,
  TEXT,
  VALUE_FONT,
  vInk,
  volt,
  type ElementView,
} from './common.ts';
import { calcLeads, distance, interp, interp2, pt, rectOf, unionRect } from './geometry.ts';
import type { Ink, Pt } from './Painter.ts';
import { getFixedUnitText, getShortUnitText, OHM } from './units.ts';

export const wireView: ElementView<WireElm> = {
  draw(e, ctx) {
    ctx.painter.line(e.point1, e.point2, vInk(volt(e, 0)));
    doDots(e, ctx);
    let s = '';
    if (e.hasFlag(WireElm.FLAG_SHOWCURRENT)) s = getShortUnitText(Math.abs(e.getCurrent()), 'A');
    if (e.hasFlag(WireElm.FLAG_SHOWVOLTAGE))
      s = (s.length > 0 ? s + ' ' : '') + getShortUnitText(volt(e, 0), 'V');
    drawValues(e, ctx, s, 4);
  },
  bbox: (e) => elementBox(e, 3),
};

export const routedWireView: ElementView<RoutedWireElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const rp = e.route();
    const width = e.busWidth > 1 ? 5 : 3;
    const ink = vInk(volt(e, 0));
    for (let i = 0; i < rp.length - 1; i++) p.line(rp[i], rp[i + 1], ink, { width });
    // a bus wire's current is the sum over its bits
    let current = e.current;
    if (e.currents !== null) current = e.currents.reduce((a, c) => a + c, 0);
    if (!e.isCreating()) {
      let cc = ctx.dotCount(0, current);
      for (let i = 0; i < rp.length - 1; i++) {
        const a = rp[i];
        const b = rp[i + 1];
        p.dots(a, b, cc);
        // carry the dot position on, so the dots run on round the bends
        cc = addCurCount(cc, Math.hypot(b.x - a.x, b.y - a.y));
      }
    }
    // live values keep a fixed width (owner's rule), so they don't shift as they change
    let s = '';
    if (e.busWidth === 1) {
      if (e.hasFlag(WireElm.FLAG_SHOWCURRENT)) s = getFixedUnitText(Math.abs(current), 'A');
      if (e.hasFlag(WireElm.FLAG_SHOWVOLTAGE))
        s = (s.length > 0 ? s + ' ' : '') + getFixedUnitText(volt(e, 0), 'V');
    }
    if (s.length > 0) {
      // on the longest segment: above a horizontal one, right of a vertical one
      let best = 0;
      let bestSeg = 0;
      for (let i = 0; i < rp.length - 1; i++) {
        const len = (rp[i + 1].x - rp[i].x) ** 2 + (rp[i + 1].y - rp[i].y) ** 2;
        if (len > best) {
          best = len;
          bestSeg = i;
        }
      }
      const a = rp[bestSeg];
      const b = rp[bestSeg + 1];
      const mx = Math.trunc((a.x + b.x) / 2);
      const my = Math.trunc((a.y + b.y) / 2);
      const w = Math.trunc(p.measureText(s, VALUE_FONT));
      const ya = Math.trunc(p.fontSize(VALUE_FONT) / 2);
      if (a.y === b.y) p.text(s, { x: mx - Math.trunc(w / 2), y: my - 6 }, TEXT, VALUE_FONT);
      else p.text(s, { x: mx + 4, y: my + ya }, TEXT, VALUE_FONT);
    }
  },
  bbox(e) {
    const rp = e.route();
    let x1 = e.x;
    let y1 = e.y;
    let x2 = e.x;
    let y2 = e.y;
    for (const q of rp) {
      x1 = Math.min(x1, q.x);
      y1 = Math.min(y1, q.y);
      x2 = Math.max(x2, q.x);
      y2 = Math.max(y2, q.y);
    }
    return { x1: x1 - 5, y1: y1 - 5, x2: x2 + 5, y2: y2 + 5 };
  },
};

export const groundView: ElementView<GroundElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const { point1, point2, dn, dx, dy, dpx1, dpy1 } = e;
    const ink = vInk(0);
    p.line(point1, point2, ink);
    if (e.symbolType === 0) {
      for (let i = 0; i !== 3; i++) {
        const a = 10 - i * 4;
        const b = i * 5;
        const [p1, p2] = interp2(point1, point2, 1 + b / dn, a);
        p.line(p1, p2, ink);
      }
    } else if (e.symbolType === 1) {
      // chassis ground
      const [p1, p2] = interp2(point1, point2, 1, 10);
      p.line(p1, p2, ink);
      for (let i = 0; i <= 2; i++) {
        const q = interp(p1, p2, i / 2);
        const end = pt(
          Math.trunc(q.x - 5 * dpx1 + (8 * dx) / dn),
          Math.trunc(q.y + (8 * dy) / dn - 5 * dpy1),
        );
        p.line(q, end, ink);
      }
    } else if (e.symbolType === 2) {
      // signal ground
      const [p1, p2] = interp2(point1, point2, 1, 10);
      p.line(p1, p2, ink);
      const tip = pt(Math.trunc(point2.x + (10 * dx) / dn), Math.trunc(point2.y + (10 * dy) / dn));
      p.line(p1, tip, ink);
      p.line(p2, tip, ink);
    } else {
      const [p1, p2] = interp2(point1, point2, 1, 10);
      p.line(p1, p2, ink);
    }
    doDots(e, ctx);
  },
  bbox: (e) => elementBox(e, 11, e.point1, interp(e.point1, e.point2, 1 + 11 / e.dn)),
};

export const resistorView: ElementView<ResistorElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, 32);
    draw2Leads(e, ctx, lead1, lead2);
    const hs = e.dn < 30 ? 2 : 6;
    const len = distance(lead1, lead2);
    const at = localFrame(lead1, lead2);
    const ink: Ink = { gradient: { from: lead1, to: lead2, v1: volt(e, 0), v2: volt(e, 1) } };
    if (!ctx.euroResistors) {
      const zig: Pt[] = [at(0, 0)];
      for (let i = 0; i < 4; i++) {
        zig.push(at(((1 + 4 * i) * len) / 16, hs), at(((3 + 4 * i) * len) / 16, -hs));
      }
      zig.push(at(len, 0));
      p.polyline(zig, ink);
    } else {
      p.polyline([at(0, -hs), at(len, -hs), at(len, hs), at(0, hs)], ink, { closed: true });
    }
    if (ctx.showValues)
      drawValues(e, ctx, getShortUnitText(e.resistance, ctx.showOhm ? OHM : ''), hs + 2);
    doDots(e, ctx);
  },
  bbox: (e) => elementBox(e, 6),
};

export const capacitorView: ElementView<CapacitorElm> = {
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
    p.line(b1, b2, v1);
    const c = ctx.dotCount(0, e.current);
    p.dots(point1, lead1, c);
    p.dots(point2, lead2, -c);
    if (ctx.showValues) drawValues(e, ctx, getShortUnitText(e.capacitance, 'F'), 12);
  },
  bbox: (e) => elementBox(e, 12),
};

/** A coil of half-circle loops from p1 to p2, bulging hs to the left (upstream `drawCoil`). */
export function coilLoops(p1: Pt, p2: Pt, hs: number): Pt[][] {
  const len = distance(p1, p2);
  const at = localFrame(p1, p2, hs < 0);
  const loopCt = Math.ceil(len / 11);
  const loops: Pt[][] = [];
  const steps = 12;
  for (let loop = 0; loop !== loopCt; loop++) {
    const cx = (len * (loop + 0.5)) / loopCt;
    const r = len / (2 * loopCt);
    const pts: Pt[] = [];
    for (let k = 0; k <= steps; k++) {
      const th = Math.PI + (Math.PI * k) / steps;
      pts.push(at(cx + r * Math.cos(th), r * Math.sin(th)));
    }
    loops.push(pts);
  }
  return loops;
}

export const inductorView: ElementView<InductorElm> = {
  draw(e, ctx) {
    const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, 32);
    draw2Leads(e, ctx, lead1, lead2);
    const ink: Ink = { gradient: { from: lead1, to: lead2, v1: volt(e, 0), v2: volt(e, 1) } };
    for (const loop of coilLoops(lead1, lead2, 8)) ctx.painter.polyline(loop, ink);
    if (ctx.showValues) drawValues(e, ctx, getShortUnitText(e.inductance, 'H'), 8);
    doDots(e, ctx);
  },
  bbox: (e) => elementBox(e, 8),
};

function potGeometry(e: PotElm) {
  const { point1, point2, dn, offset } = e;
  const bodyLen = 32;
  const [lead1, lead2] = calcLeads(point1, point2, dn, bodyLen);
  const soff = Math.trunc((e.position - 0.5) * bodyLen);
  const s = Math.sign(offset);
  const corner2 = interp(point1, point2, soff / dn + 0.5, offset);
  const arrowPoint = interp(point1, point2, soff / dn + 0.5, 8 * s);
  const midpoint = interp(point1, point2, soff / dn + 0.5);
  const clen = Math.abs(offset) - 8;
  const [arrow1, arrow2] = interp2(corner2, arrowPoint, (clen - 8) / clen, 8);
  return { lead1, lead2, corner2, arrowPoint, midpoint, arrow1, arrow2 };
}

export const potView: ElementView<PotElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const { lead1, lead2, corner2, arrowPoint, midpoint, arrow1, arrow2 } = potGeometry(e);
    const hs = ctx.euroResistors ? 6 : 8;
    const v1 = volt(e, 0);
    const v2 = volt(e, 1);
    const v3 = volt(e, 2);
    draw2Leads(e, ctx, lead1, lead2);
    const segments = 16;
    const segf = 1 / segments;
    const divide = Math.trunc(segments * e.position);
    const segV = (i: number): number =>
      i >= divide
        ? v3 + ((v2 - v3) * (i - divide)) / (segments - divide)
        : v1 + ((v3 - v1) * i) / divide;
    if (!ctx.euroResistors) {
      let ox = 0;
      for (let i = 0; i !== segments; i++) {
        const nx = (i & 3) === 0 ? 1 : (i & 3) === 2 ? -1 : 0;
        p.line(
          interp(lead1, lead2, i * segf, hs * ox),
          interp(lead1, lead2, (i + 1) * segf, hs * nx),
          vInk(segV(i)),
        );
        ox = nx;
      }
    } else {
      const [s1, s2] = interp2(lead1, lead2, 0, hs);
      p.line(s1, s2, vInk(v1));
      for (let i = 0; i !== segments; i++) {
        const [a1, a2] = interp2(lead1, lead2, i * segf, hs);
        const [b1, b2] = interp2(lead1, lead2, (i + 1) * segf, hs);
        p.line(a1, b1, vInk(segV(i)));
        p.line(a2, b2, vInk(segV(i)));
      }
      const [e1, e2] = interp2(lead1, lead2, 1, hs);
      p.line(e1, e2, vInk(v2));
    }
    const w = vInk(v3);
    p.line(e.post3, corner2, w);
    p.line(corner2, arrowPoint, w);
    p.line(arrow1, arrowPoint, w);
    p.line(arrow2, arrowPoint, w);
    const c1 = ctx.dotCount(0, e.current1);
    const c2 = ctx.dotCount(1, e.current2);
    const c3 = ctx.dotCount(2, e.current3);
    p.dots(e.point1, midpoint, c1);
    p.dots(e.point2, midpoint, c2);
    p.dots(e.post3, corner2, c3);
    p.dots(corner2, midpoint, addCurCount(c3, distance(e.post3, corner2)));

    if (ctx.showValues && e.resistance1 > 0 && e.hasFlag(PotElm.FLAG_SHOW_VALUES)) {
      // vertical pot with the wiper on the left, horizontal with the wiper on top
      const reverseY = e.post3.x < lead1.x && lead1.x === lead2.x;
      const reverseX = e.post3.y < lead1.y && lead1.x !== lead2.x;
      // swap the texts when the leads run right to left or bottom to top
      const rev =
        (lead1.x === lead2.x && lead1.y < lead2.y) || (lead1.y === lead2.y && lead1.x > lead2.x);
      const unit = ctx.showOhm ? OHM : '';
      const s1 = getShortUnitText(rev ? e.resistance2 : e.resistance1, unit);
      const s2 = getShortUnitText(rev ? e.resistance1 : e.resistance2, unit);
      const ya = Math.trunc(p.fontSize(VALUE_FONT) / 2);
      let w1 = Math.trunc(p.measureText(s1, VALUE_FONT));
      if (lead1.x === lead2.x)
        p.text(
          s1,
          pt(
            !reverseY ? arrowPoint.x + 2 : arrowPoint.x - 2 - w1,
            Math.max(arrow1.y, arrow2.y) + 5 + ya,
          ),
          TEXT,
          VALUE_FONT,
        );
      else
        p.text(
          s1,
          pt(
            Math.min(arrow1.x, arrow2.x) - 2 - w1,
            !reverseX ? arrowPoint.y + 4 + ya : arrowPoint.y - 4,
          ),
          TEXT,
          VALUE_FONT,
        );
      w1 = Math.trunc(p.measureText(s2, VALUE_FONT));
      if (lead1.x === lead2.x)
        p.text(
          s2,
          pt(
            !reverseY ? arrowPoint.x + 2 : arrowPoint.x - 2 - w1,
            Math.min(arrow1.y, arrow2.y) - 3,
          ),
          TEXT,
          VALUE_FONT,
        );
      else
        p.text(
          s2,
          pt(
            Math.max(arrow1.x, arrow2.x) + 2,
            !reverseX ? arrowPoint.y + 4 + ya : arrowPoint.y - 4,
          ),
          TEXT,
          VALUE_FONT,
        );
    }
  },
  bbox: (e) => unionRect(elementBox(e, 8), rectOf([e.post3])),
};

/** Upstream `addCurCount`: shift a dot position, leaving the "too fast" marker alone. */
export const CURRENT_TOO_FAST = 100;
export function addCurCount(c: number, a: number): number {
  if (c === CURRENT_TOO_FAST || c === -CURRENT_TOO_FAST) return c;
  return c + a;
}
