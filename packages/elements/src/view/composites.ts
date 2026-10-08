// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Geometry learned from CircuitJS1 OTAElm, NortonAmpElm, DarlingtonElm, CrystalElm,
// CustomCompositeElm, OpAmpRealElm and OptocouplerElm draw()
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032;
// the drawing code is new.

import type {
  ComparatorElm,
  CrystalElm,
  DarlingtonElm,
  NortonAmpElm,
  OTAElm,
  UnijunctionElm,
} from '../elm/compositeParts.ts';
import type { CustomCompositeElm } from '../elm/CustomCompositeElm.ts';
import type { OpAmpRealElm } from '../elm/OpAmpRealElm.ts';
import type { OptocouplerElm } from '../elm/OptocouplerElm.ts';
import type { DrawContext } from './Painter.ts';
import { diodeView, transistorView } from './semis.ts';
import { drawChip } from './chips.ts';
import {
  drawCenteredText,
  drawValues,
  elementBox,
  LABEL,
  MUTED,
  vInk,
  volt,
  type ElementView,
} from './common.ts';
import { calcArrow, rectOf, sign, unionRect } from './geometry.ts';
import { addCurCount } from './passive.ts';
import { getShortUnitText } from './units.ts';

export const otaView: ElementView<OTAElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const wires = [e.in1p, e.in2p, e.in3p, e.in4p];
    wires.forEach((w, i) => {
      p.line(w[0], w[1], vInk(volt(e, i)));
    });
    p.polyline(e.triangle, LABEL, { closed: true });
    for (const [d1, d2] of e.arrows) p.fillPolygon(calcArrow(d1, d2, 8, 4), LABEL);
    p.line(e.bar1[0], e.bar1[1], LABEL);
    p.line(e.bar2[0], e.bar2[1], LABEL);
    for (const c of e.circCent) p.circle(c, 19 / 2, LABEL);
    const font = { size: 14 };
    drawCenteredText(ctx, '+', e.textp[0].x, e.textp[0].y - 2, true, LABEL, font);
    drawCenteredText(ctx, '-', e.textp[1].x, e.textp[1].y, true, LABEL, font);
    wires.forEach((w, i) => {
      p.dots(w[0], w[1], ctx.dotCount(i, -e.getCurrentIntoNode(i)));
    });
  },
  bbox: (e) => unionRect(elementBox(e, (3 * 32) / 2), rectOf(e.triangle)),
};

export const nortonAmpView: ElementView<NortonAmpElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    p.line(e.in1p[0], e.in1p[1], vInk(volt(e, 0)));
    p.line(e.in2p[0], e.in2p[1], vInk(volt(e, 1)));
    p.line(e.lead2, e.point2, vInk(volt(e, 2)));
    p.polyline(e.triangle, LABEL, { closed: true });
    const font = { size: e.opsize === 2 ? 14 : 10 };
    drawCenteredText(ctx, '+', e.textp[0].x, e.textp[0].y - 2, true, LABEL, font);
    drawCenteredText(ctx, '-', e.textp[1].x, e.textp[1].y, true, LABEL, font);
    p.circle(e.nortonCenter, e.nortonRadius, LABEL);
    p.fillPolygon(e.nortonTriangle, LABEL);
    p.dots(e.in1p[0], e.in1p[1], ctx.dotCount(0, -e.getCurrentIntoNode(0)));
    p.dots(e.in2p[0], e.in2p[1], ctx.dotCount(1, -e.getCurrentIntoNode(1)));
    p.dots(e.point2, e.lead2, ctx.dotCount(2, -e.getCurrentIntoNode(2)));
  },
  bbox: (e) => unionRect(elementBox(e, e.opheight * 2), rectOf(e.triangle)),
};

export const comparatorView: ElementView<ComparatorElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    p.line(e.in1p[0], e.in1p[1], vInk(volt(e, 0)));
    p.line(e.in2p[0], e.in2p[1], vInk(volt(e, 1)));
    p.polyline(e.triangle, LABEL, { closed: true });
    const font = { size: e.opsize === 2 ? 14 : 10 };
    drawCenteredText(ctx, '-', e.textp[0].x, e.textp[0].y - 2, true, LABEL, font);
    drawCenteredText(ctx, '+', e.textp[1].x, e.textp[1].y, true, LABEL, font);
    drawCenteredText(ctx, '\u2265?', e.textp[2].x, e.textp[2].y, true, LABEL, font);
    p.line(e.lead2, e.point2, vInk(volt(e, 2)));
    p.dots(e.point2, e.lead2, ctx.dotCount(2, -e.getCurrentIntoNode(2)));
  },
  bbox: (e) => unionRect(elementBox(e, e.opheight * 2), rectOf(e.triangle)),
};

export const unijunctionView: ElementView<UnijunctionElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const { b1, b2, emitter } = e;
    const vb1 = vInk(volt(e, 1));
    p.line(b1[0], b1[1], vb1);
    p.line(b1[1], b1[2], vb1);
    const vb2 = vInk(volt(e, 2));
    p.line(b2[0], b2[1], vb2);
    p.line(b2[1], b2[2], vb2);
    const ve = vInk(volt(e, 0));
    p.line(emitter[0], emitter[1], ve);
    p.line(emitter[1], emitter[2], ve);
    p.fillPolygon(calcArrow(emitter[1], emitter[2], 8, 3), ve);
    p.fillPolygon(e.emitterPoly, LABEL);
    const ib2 = -e.getCurrentIntoNode(2);
    const ib1 = -e.getCurrentIntoNode(1);
    const c1 = ctx.dotCount(1, ib1);
    const c2 = ctx.dotCount(2, ib2);
    const ce = ctx.dotCount(0, -ib1 - ib2);
    if (c1 !== 0 || c2 !== 0) {
      p.dots(b1[0], b1[1], c1);
      p.dots(b1[1], b1[2], addCurCount(c1, 8));
      p.dots(b2[0], b2[1], c2);
      p.dots(b2[1], b2[2], addCurCount(c2, 8));
      p.dots(emitter[0], emitter[1], ce);
      p.dots(emitter[1], emitter[2], ce);
    }
  },
  bbox: (e) => unionRect(rectOf([e.point1, ...e.b1, ...e.b2]), rectOf(e.emitter)),
};

export const darlingtonView: ElementView<DarlingtonElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const vc = vInk(volt(e, 1));
    p.line(e.coll[0], e.coll[1], vc);
    p.line(e.coll2[0], e.coll2[1], vc);
    p.line(e.coll[0], e.coll2[0], vc);
    p.line(e.emit[0], e.emit[1], vInk(volt(e, 2)));
    p.fillPolygon(calcArrow(e.arrow[0], e.arrow[1], 8, 4), LABEL);
    p.line(e.point1, e.base, vInk(volt(e, 0)));
    p.dots(e.base, e.point1, ctx.dotCount(0, e.getCurrentIntoNode(0)));
    p.dots(e.coll[1], e.coll[0], ctx.dotCount(1, e.getCurrentIntoNode(1)));
    p.dots(e.emit[1], e.emit[0], ctx.dotCount(2, e.getCurrentIntoNode(2)));
    const r = e.rect;
    p.fillPolygon([r[0], r[2], r[3], r[1]], vInk(volt(e, 0)));
    if ((ctx.highlighted || e.isCreating()) && e.dy === 0) {
      const ds = sign(e.dx);
      p.text('B', { x: e.base.x - 10 * ds, y: e.base.y - 5 }, LABEL);
      p.text('C', { x: e.coll[0].x - 3 + 9 * ds, y: e.coll[0].y + 4 }, LABEL);
      p.text('E', { x: e.emit[0].x - 3 + 9 * ds, y: e.emit[0].y + 4 }, LABEL);
    }
  },
  bbox: (e) => elementBox(e, 16),
};

export const crystalView: ElementView<CrystalElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const v0 = vInk(volt(e, 0));
    const v1 = vInk(volt(e, 1));
    p.line(e.point1, e.lead1, v0);
    p.line(e.plate1[0], e.plate1[1], v0);
    p.line(e.point2, e.lead2, v1);
    p.line(e.plate2[0], e.plate2[1], v1);
    p.polyline(e.sandwichPoints, vInk(0.5 * (volt(e, 0) + volt(e, 1))), { closed: true });
    if (!e.isCreating()) {
      const c = ctx.dotCount(0, e.current);
      p.dots(e.point1, e.lead1, c);
      p.dots(e.point2, e.lead2, -c);
    }
    if (e.hasFlag(2) && ctx.showValues)
      drawValues(e, ctx, getShortUnitText(e.seriesFrequency(), 'Hz'), 12);
  },
  bbox: (e) => elementBox(e, 12),
};

export const subcircuitView: ElementView<CustomCompositeElm> = {
  draw(e, ctx) {
    const chip = e.syncChip();
    if (chip === null) return;
    drawChip(chip, ctx);
    if (chip.label !== null)
      ctx.painter.text(chip.label, { x: chip.labelX, y: chip.labelY }, LABEL, {
        font: 'units',
        align: 'center',
        baseline: 'middle',
      });
  },
  bbox(e) {
    const r = e.chip?.rectPoints ?? [];
    if (r.length < 3) return { x1: e.x, y1: e.y, x2: e.x, y2: e.y };
    return { x1: r[0].x, y1: r[0].y, x2: r[2].x, y2: r[2].y };
  },
};

export const opAmpRealView: ElementView<OpAmpRealElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    p.line(e.in1p[0], e.in1p[1], vInk(volt(e, 0)));
    p.line(e.in2p[0], e.in2p[1], vInk(volt(e, 1)));
    p.line(e.lead2, e.point2, vInk(volt(e, 2)));
    p.line(e.rail1p[0], e.rail1p[1], vInk(volt(e, 3)));
    p.line(e.rail2p[0], e.rail2p[1], vInk(volt(e, 4)));
    p.polyline(e.triangle, LABEL, { closed: true });
    const font = { size: 14 };
    drawCenteredText(ctx, '-', e.textp[0].x, e.textp[0].y - 2, true, LABEL, font);
    drawCenteredText(ctx, '+', e.textp[1].x, e.textp[1].y, true, LABEL, font);
    const c: number[] = [];
    for (let i = 0; i !== 5; i++) c.push(ctx.dotCount(i, e.getCurrentIntoNode(i)));
    p.dots(e.in1p[1], e.in1p[0], c[0]);
    p.dots(e.in2p[1], e.in2p[0], c[1]);
    p.dots(e.lead2, e.point2, c[2]);
    // the rail leads may not be a multiple of the grid, so dots run the other way to line up
    p.dots(e.rail1p[0], e.rail1p[1], -c[3]);
    p.dots(e.rail2p[0], e.rail2p[1], -c[4]);
  },
  bbox: (e) => unionRect(elementBox(e, e.opheight * 2), rectOf(e.triangle)),
};

/** A part's own dot counters, kept apart from the parent's (slots from `base` up). */
function partContext(ctx: DrawContext, base: number): DrawContext {
  return { ...ctx, dotCount: (slot, current) => ctx.dotCount(base + slot, current) };
}

export const optocouplerView: ElementView<OptocouplerElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    p.polyline(e.rectPoints, MUTED, { closed: true });
    // stubs
    for (let i = 0; i !== 4; i++) {
      const a = e.posts[i];
      const b = e.stubs[i];
      p.line(a, b, vInk(volt(e, i)));
      p.dots(a, b, ctx.dotCount(i, -e.getCurrentIntoNode(i)));
    }
    diodeView.draw(e.diode, partContext(ctx, 10));
    transistorView.draw(e.transistor, partContext(ctx, 20));
    // little arrows: light from the LED
    for (const [a, b] of e.arrows) {
      p.fillPolygon(calcArrow(a, b, 5, 2), MUTED);
      const dx = Math.sign(b.x - a.x);
      p.line({ x: a.x + 10 * dx, y: a.y }, { x: a.x + 15 * dx, y: a.y }, MUTED, { width: 1 });
    }
  },
  bbox: (e) => rectOf([...e.rectPoints, ...e.posts]),
};
