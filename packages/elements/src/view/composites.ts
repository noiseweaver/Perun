// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Geometry learned from CircuitJS1 OTAElm, NortonAmpElm, DarlingtonElm, CrystalElm and
// CustomCompositeElm draw()
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032;
// the drawing code is new.

import type { CrystalElm, DarlingtonElm, NortonAmpElm, OTAElm } from '../elm/compositeParts.ts';
import type { CustomCompositeElm } from '../elm/CustomCompositeElm.ts';
import { drawChip } from './chips.ts';
import {
  drawCenteredText,
  drawValues,
  elementBox,
  LABEL,
  vInk,
  volt,
  type ElementView,
} from './common.ts';
import { calcArrow, rectOf, sign, unionRect } from './geometry.ts';
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
