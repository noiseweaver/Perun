// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Geometry learned from CircuitJS1 SwitchElm, Switch2Elm, DPDTSwitchElm, MBBSwitchElm,
// CrossSwitchElm, LogicInputElm, LogicOutputElm, BusLogicInputElm, AnalogSwitchElm and
// AnalogSwitch2Elm (src/com/lushprojects/circuitjs1/client/, master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032; the drawing code is new.

import type { CircuitElm } from '../CircuitElm.ts';
import { AnalogSwitch2Elm, AnalogSwitchElm } from '../elm/AnalogSwitchElm.ts';
import { BusLogicInputElm, LogicInputElm, LogicOutputElm } from '../elm/LogicInputElm.ts';
import { CrossSwitchElm, DPDTSwitchElm, MBBSwitchElm, Switch2Elm } from '../elm/Switch2Elm.ts';
import { SwitchElm } from '../elm/SwitchElm.ts';
import {
  COMPONENT,
  doDots,
  draw2Leads,
  drawCenteredText,
  elementBox,
  MUTED,
  UNITS_FONT,
  vInk,
  volt,
  type ElementView,
} from './common.ts';
import { boxAround, calcLeads, interp, pt, rectOf, unionRect, type Rect } from './geometry.ts';
import type { DrawContext, Ink, Pt } from './Painter.ts';

const OPEN_HS = 16;

/** Toggle and push switches: a blade that lifts OPEN_HS off the line when open. */
export const switchView: ElementView<SwitchElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, 32);
    const open = e.position === 1;
    draw2Leads(e, ctx, lead1, lead2);
    if (e.position === 0) doDots(e, ctx);
    p.line(
      interp(lead1, lead2, 0, open ? 0 : 2),
      interp(lead1, lead2, 1, open ? OPEN_HS : 2),
      COMPONENT,
    );

    if (e.label !== null) {
      if (Math.abs(e.dy) > Math.abs(e.dx)) {
        p.text(e.label, pt(e.x + 10, (e.y < e.y2 ? lead1 : lead2).y - 5), COMPONENT, UNITS_FONT);
      } else {
        const ty = e.x2 > e.x ? e.y + 15 : e.y - 15;
        p.text(e.label, pt(Math.trunc((e.x + e.x2) / 2), ty), COMPONENT, {
          ...UNITS_FONT,
          align: 'center',
        });
      }
    }

    if (e.hasFlag(SwitchElm.FLAG_IEC)) {
      // IEC actuator: dashed plunger, plus a detent for latching switches
      const thin = { width: 1 };
      const x0 = interp(lead1, lead2, 0.5, open ? OPEN_HS / 2 : 2);
      const x1 = interp(lead1, lead2, 0.5, 24);
      const x2 = interp(lead1, lead2, 0.5 - 0.1, 24);
      const x3 = interp(lead1, lead2, 0.5 + 0.1, 24);
      const x4 = interp(lead1, lead2, 0.5, 19);
      const x5 = interp(lead1, lead2, 0.5 - 0.1, 16);
      const x6 = interp(lead1, lead2, 0.5, 13);
      p.line(x2, x3, COMPONENT, thin);
      const dashed = { width: 1, dash: [3, 3] };
      if (e.momentary) p.line(x1, x0, COMPONENT, dashed);
      else {
        p.line(x6, x0, COMPONENT, dashed);
        p.line(x1, x4, COMPONENT, dashed);
        p.line(x4, x5, COMPONENT, thin);
        p.line(x6, x5, COMPONENT, thin);
      }
    }
  },
  bbox: (e) => elementBox(e, OPEN_HS),
};

const BIG_BOLD = { font: 'units', size: 20, bold: true } as const;

/** The blade from the pole lead to the chosen throw, plus each throw's lead. */
export const switch2View: ElementView<Switch2Elm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    p.line(e.point1, e.lead1, vInk(volt(e, 0)));
    for (let i = 0; i !== e.throwCount; i++)
      p.line(e.swpoles[i], e.swposts[i], vInk(volt(e, i + 1)));
    p.line(e.lead1, e.swpoles[e.position], COMPONENT);
    const dc = ctx.dotCount(0, e.current);
    p.dots(e.point1, e.lead1, dc);
    if (!(e.position === 2 && e.hasCenterOff()))
      p.dots(e.swpoles[e.position], e.swposts[e.position], dc);
  },
  bbox: (e) =>
    unionRect(elementBox(e, OPEN_HS), rectOf([e.swposts[0], e.swposts[e.throwCount - 1]])),
};

export const mbbSwitchView: ElementView<MBBSwitchElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    p.line(e.point1, e.lead1, vInk(volt(e, 0)));
    for (let i = 0; i !== 2; i++) p.line(e.swpoles[i], e.swposts[i], vInk(volt(e, i + 1)));
    if (e.both || e.position === 0) p.line(e.lead1, e.swpoles[0], COMPONENT);
    if (e.both || e.position === 2) p.line(e.lead1, e.swpoles[1], COMPONENT);
    for (let i = 0; i !== 2; i++)
      p.dots(e.swpoles[i], e.swposts[i], ctx.dotCount(i, e.currents[i]));
    p.dots(e.point1, e.lead1, ctx.dotCount(2, e.currents[0] + e.currents[1]));
  },
  bbox: (e) => unionRect(elementBox(e, OPEN_HS), rectOf(e.swposts)),
};

/** Dashed link between stacked poles (upstream draws it light gray). */
function poleLink(e: SwitchElm, ctx: DrawContext, i: number, a: number, b: number): void {
  const offset = -i * OPEN_HS * 3;
  ctx.painter.line(
    interp(e.point1, e.point2, 0.5, offset + a),
    interp(e.point1, e.point2, 0.5, offset - OPEN_HS * 3 + b),
    MUTED,
    { width: 1, dash: [4, 4] },
  );
}

export const dpdtSwitchView: ElementView<DPDTSwitchElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const pos = e.position;
    for (let i = 0; i !== e.poleCount; i++) {
      p.line(e.polePosts[i], e.poleLeads[i], vInk(volt(e, i * 3)));
      const v1 = vInk(volt(e, i * 3 + 1));
      p.line(e.throwPosts[i * 2], e.throwLeads[i * 4], v1);
      if (e.useIECSymbol()) p.line(e.throwLeads[i * 4], e.throwLeads[i * 4 + 2], v1);
      p.line(e.throwPosts[i * 2 + 1], e.throwLeads[i * 4 + 1], vInk(volt(e, i * 3 + 2)));
      if (i < e.poleCount - 1)
        poleLink(
          e,
          ctx,
          i,
          -OPEN_HS * (0.5 - pos) - 4 * pos,
          -OPEN_HS * (0.5 - pos) + 3 + 8 * (1 - pos),
        );
      p.line(e.poleLeads[i], e.throwLeads[i * 4 + 3 - pos * 2], COMPONENT);
      const dc = ctx.dotCount(i, e.currents[i] ?? 0);
      p.dots(e.polePosts[i], e.poleLeads[i], dc);
      p.dots(e.throwLeads[i * 4 + pos], e.throwPosts[i * 2 + pos], dc);
    }
  },
  bbox: (e) =>
    unionRect(elementBox(e, 1), rectOf([e.throwPosts[1], e.throwPosts[e.poleCount * 2 - 2]])),
};

export const crossSwitchView: ElementView<CrossSwitchElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const pos = e.position;
    const cp = e.crossPoints;
    const tp = e.throwPosts;
    const tl = e.throwLeads;
    const v1 = vInk(volt(e, 1));
    p.line(cp[1], cp[2], v1);
    p.line(cp[1], cp[3], v1);
    p.line(cp[3], tp[0], v1);
    p.line(tp[0], tp[3], v1);
    const v3 = vInk(volt(e, 3));
    p.line(tp[2], cp[5], v3);
    p.line(tp[1], cp[0], v3);
    p.line(cp[0], cp[4], v3);
    const dcs = [ctx.dotCount(0, e.currents[0]), ctx.dotCount(1, e.currents[1])];
    for (let i = 0; i !== 2; i++) {
      p.line(e.polePosts[i], e.poleLeads[i], vInk(volt(e, i * 2)));
      const vt = vInk(volt(e, i * 2 + 1));
      if (e.useIECSymbol()) p.line(tl[i * 4], tl[i * 4 + 2], vt);
      p.line(tp[i * 2], tl[i * 4], vt);
      p.line(tp[i * 2 + 1], tl[i * 4 + 1], vInk(volt(e, 3 - i * 2)));
      if (i < 1) {
        const adj = pos * -3;
        poleLink(e, ctx, i, -OPEN_HS * (0.5 - pos) + adj, -OPEN_HS * (0.5 - pos) + 7 + adj);
      }
      p.line(e.poleLeads[i], tl[i * 4 + 3 - pos * 2], COMPONENT);
      p.dots(e.polePosts[i], e.poleLeads[i], dcs[i]);
      p.dots(tl[i * 4 + pos], tp[i * 2 + pos], dcs[i]);
      if (i === 1 && pos === 0) p.dots(tp[2], cp[5], dcs[1]);
      if (i === 0 && pos === 1) {
        p.dots(tp[1], cp[0], dcs[0]);
        p.dots(cp[0], cp[4], dcs[0]);
        p.dots(cp[4], cp[5], dcs[0]);
      }
      if (i === 1 && pos === 1) p.dots(tp[3], tp[0], dcs[1]);
      p.dots(tp[0], cp[3], dcs[pos]);
      p.dots(cp[3], cp[1], dcs[pos]);
      p.dots(cp[1], cp[2], dcs[pos]);
    }
    // the inner junctions are not posts but are drawn like them
    p.fillCircle(tp[0], 3, { role: 'post' });
    p.fillCircle(cp[4], 3, { role: 'post' });
  },
  bbox: (e) => unionRect(elementBox(e, 1), rectOf([e.crossPoints[2], e.crossPoints[5]])),
};

/** A short lead ending in big bold text (logic input and output, bus input). */
function drawLogicTerminal(
  e: SwitchElm | LogicOutputElm,
  ctx: DrawContext,
  s: string,
  ink: Ink,
  lead1: Pt,
  width = 3,
): void {
  const p = ctx.painter;
  drawCenteredText(ctx, s, e.x2, e.y2, true, ink, BIG_BOLD);
  p.line(e.point1, lead1, vInk(volt(e, 0)), { width });
}

export const logicInputView: ElementView<LogicInputElm> = {
  draw(e, ctx) {
    drawLogicTerminal(e, ctx, e.displayText(), COMPONENT, e.lead1);
    ctx.painter.dots(e.point1, e.lead1, ctx.dotCount(0, -e.current));
  },
  bbox: (e) => unionRect(boxAround(e.point1, e.lead1, 0), logicTextRect(e)),
};

export const logicOutputView: ElementView<LogicOutputElm> = {
  draw(e, ctx) {
    drawLogicTerminal(e, ctx, e.displayText(), MUTED, e.lead1);
  },
  bbox: (e) => unionRect(boxAround(e.point1, e.lead1, 0), logicTextRect(e)),
};

export const busLogicInputView: ElementView<BusLogicInputElm> = {
  draw(e, ctx) {
    const s = '' + e.value;
    const w = Math.trunc(ctx.painter.measureText(s, BIG_BOLD) / 2) + 8;
    const lead1 = interp(e.point1, e.point2, 1 - w / e.dn);
    drawLogicTerminal(e, ctx, s, COMPONENT, lead1, 5);
    ctx.painter.dots(e.point1, lead1, ctx.dotCount(0, -e.totalCurrent()));
  },
  bbox: (e) => unionRect(boxAround(e.point1, e.point2, 0), logicTextRect(e)),
};

function logicTextRect(e: CircuitElm): Rect {
  return { x1: e.x2 - 10, y1: e.y2 - 10, x2: e.x2 + 10, y2: e.y2 + 10 };
}

export const analogSwitchView: ElementView<AnalogSwitchElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const hs1 = e.open ? 0 : 2;
    const hs2 = e.open ? e.openhs : 2;
    draw2Leads(e, ctx, e.lead1, e.lead2);
    p.line(interp(e.lead1, e.lead2, 0, hs1), interp(e.lead1, e.lead2, 1, hs2), MUTED);
    p.line(e.point3, e.lead3, vInk(volt(e, 2)));
    if (!e.open) doDots(e, ctx);
  },
  bbox: (e) => elementBox(e, Math.abs(e.openhs)),
};

export const analogSwitch2View: ElementView<AnalogSwitch2Elm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    p.line(e.point1, e.lead1, vInk(volt(e, 0)));
    p.line(e.swpoles[0], e.swposts[0], vInk(volt(e, 1)));
    p.line(e.swpoles[1], e.swposts[1], vInk(volt(e, 2)));
    const position = e.open ? 1 : 0;
    p.line(e.lead1, e.swpoles[position], MUTED);
    const dc = ctx.dotCount(0, e.current);
    p.dots(e.point1, e.lead1, dc);
    p.dots(e.swpoles[position], e.swposts[position], dc);
    // label the throws while selected: at rest swposts[1] is connected (NC) unless swapped
    if (ctx.highlighted) {
      const inverted = e.hasFlag(AnalogSwitchElm.FLAG_INVERT);
      const [l0, l1] = e.labelPts;
      drawCenteredText(ctx, inverted ? 'NC' : 'NO', l0.x, l0.y, true, COMPONENT);
      drawCenteredText(ctx, inverted ? 'NO' : 'NC', l1.x, l1.y, true, COMPONENT);
    }
  },
  bbox: (e) => elementBox(e, Math.abs(e.openhs)),
};

/** Where a click toggles a switch rather than grabbing it (upstream `getSwitchRect`). */
export function switchRect(e: SwitchElm): Rect {
  if (e instanceof LogicInputElm || e instanceof BusLogicInputElm) return logicTextRect(e);
  if (e instanceof Switch2Elm) return rectOf([e.lead1, e.swpoles[0], e.swpoles[e.throwCount - 1]]);
  if (e instanceof MBBSwitchElm) return rectOf([e.lead1, e.swpoles[0], e.swpoles[1]]);
  if (e instanceof DPDTSwitchElm || e instanceof CrossSwitchElm) {
    const n = e instanceof DPDTSwitchElm ? e.poleCount : 2;
    return rectOf([e.poleLeads[0], e.throwLeads[1], e.throwLeads[n * 4 - 4]]);
  }
  const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, 32);
  return rectOf([lead1, lead2, interp(lead1, lead2, 0, OPEN_HS)]);
}
