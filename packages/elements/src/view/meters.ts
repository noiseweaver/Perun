// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Geometry learned from CircuitJS1 FuseElm, LDRElm, ThermistorNTCElm, TestPointElm,
// StopTriggerElm, DataRecorderElm, WattmeterElm and WattmeterTrueElm draw()
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032;
// the drawing code is new.

import type { CircuitElm } from '../CircuitElm.ts';
import type { DataRecorderElm } from '../elm/DataRecorderElm.ts';
import type { FuseElm } from '../elm/FuseElm.ts';
import type { LDRElm } from '../elm/LDRElm.ts';
import type { StopTriggerElm } from '../elm/StopTriggerElm.ts';
import {
  TestPointElm,
  TP_AVG,
  TP_BIN,
  TP_DUT,
  TP_FRQ,
  TP_MAX,
  TP_MIN,
  TP_P2P,
  TP_PWI,
  TP_RMS,
  TP_VOL,
} from '../elm/TestPointElm.ts';
import type { ThermistorNTCElm } from '../elm/ThermistorNTCElm.ts';
import { WattmeterTrueElm, type WattmeterElm } from '../elm/WattmeterElm.ts';
import {
  doDots,
  draw2Leads,
  drawLabeledNode,
  drawValues,
  elementBox,
  LABEL,
  MUTED,
  UNITS_FONT,
  VALUE_FONT,
  vInk,
  volt,
  localFrame,
  type ElementView,
} from './common.ts';
import { calcLeads, distance, interp, pt, rectOf, unionRect, type Rect } from './geometry.ts';
import type { DrawContext, Ink, Pt, TextStyle } from './Painter.ts';
import { formatNumber, getFixedUnitText, getShortUnitText, OHM } from './units.ts';

/** A resistor body from lead1 to lead2: zigzag, or a box for IEC resistors. */
function resistorBody(e: CircuitElm, ctx: DrawContext, lead1: Pt, lead2: Pt, hs: number): void {
  const len = distance(lead1, lead2);
  const at = localFrame(lead1, lead2);
  const ink: Ink = { gradient: { from: lead1, to: lead2, v1: volt(e, 0), v2: volt(e, 1) } };
  if (!ctx.euroResistors) {
    const zig: Pt[] = [at(0, 0)];
    for (let i = 0; i < 4; i++)
      zig.push(at(((1 + 4 * i) * len) / 16, hs), at(((3 + 4 * i) * len) / 16, -hs));
    zig.push(at(len, 0));
    ctx.painter.polyline(zig, ink);
  } else {
    ctx.painter.polyline([at(0, -hs), at(len, -hs), at(len, hs), at(0, hs)], ink, {
      closed: true,
    });
  }
}

export const fuseView: ElementView<FuseElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, e.isIECSymbol() ? 32 : 16);
    draw2Leads(e, ctx, lead1, lead2);
    const hs = 6;
    const len = distance(lead1, lead2);
    const at = localFrame(lead1, lead2);
    const ink: Ink = { heat: { voltage: volt(e, 0), level: e.heatLevel() } };
    if (!e.blown) {
      if (!e.isIECSymbol()) {
        const segments = 16;
        const wave: Pt[] = [at(0, 0)];
        for (let i = 0; i <= segments; i++)
          wave.push(at((i * len) / segments, hs * Math.sin((i * Math.PI * 2) / segments)));
        p.polyline(wave, ink);
      } else {
        p.line(at(0, 0), at(len, 0), ink);
        p.polyline([at(0, -hs), at(len, -hs), at(len, hs), at(0, hs)], ink, { closed: true });
      }
    }
    doDots(e, ctx);
  },
  bbox: (e) => elementBox(e, 6),
};

/** Two arrows pointing at the body: light falling on it. */
function lightArrows(at: (x: number, y: number) => Pt): Pt[][] {
  return [
    [at(-8, 26), at(8, 12)],
    [at(2, 12), at(8, 12), at(8, 18)],
    [at(12, 26), at(26, 12)],
    [at(20, 12), at(26, 12), at(26, 18)],
  ];
}

export const ldrView: ElementView<LDRElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const hs = 6;
    const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, 32);
    draw2Leads(e, ctx, lead1, lead2);
    resistorBody(e, ctx, lead1, lead2, hs);
    const at = localFrame(lead1, lead2);
    const ink: Ink = { gradient: { from: lead1, to: lead2, v1: volt(e, 0), v2: volt(e, 1) } };
    for (const arrow of lightArrows(at)) p.polyline(arrow, ink);
    if (ctx.showValues) drawValues(e, ctx, getShortUnitText(e.resistance, '') + OHM, hs);
    doDots(e, ctx);
  },
  bbox: (e) => {
    const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, 32);
    return unionRect(elementBox(e, 6), rectOf(lightArrows(localFrame(lead1, lead2)).flat()));
  },
};

export const thermistorView: ElementView<ThermistorNTCElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const hs = 6;
    const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, 32);
    draw2Leads(e, ctx, lead1, lead2);
    resistorBody(e, ctx, lead1, lead2, hs);
    const at = localFrame(lead1, lead2);
    const len = distance(lead1, lead2);
    const ink: Ink = { gradient: { from: lead1, to: lead2, v1: volt(e, 0), v2: volt(e, 1) } };
    // the slanted line through the body marks a thermistor
    p.polyline([at(-hs, hs * 2), at(hs, hs * 2), at(len, -hs * 2)], ink);
    if (ctx.showValues) {
      const s = getShortUnitText(e.resistance, '');
      drawValues(e, ctx, String(e.temperature) + '°C=' + s + OHM, hs);
    }
    doDots(e, ctx);
  },
  bbox: (e) => elementBox(e, 12),
};

const TP_FONT: TextStyle = { font: 'value', size: 14 };

/**
 * The live reading of a test point. It changes while the simulation runs, so it has a fixed
 * width (the owner's rule for live values); the label and the "Period" case are static.
 */
function testPointValue(e: TestPointElm): string {
  switch (e.meter) {
    case TP_VOL:
      return getFixedUnitText(volt(e, 0), 'V');
    case TP_RMS:
      return getFixedUnitText(e.rmsV, 'V(rms)');
    case TP_AVG:
      return getFixedUnitText(e.avgV, 'V(avg)');
    case TP_MAX:
      return getFixedUnitText(e.lastMaxV, 'Vpk');
    case TP_MIN:
      return getFixedUnitText(e.lastMinV, 'Vmin');
    case TP_P2P:
      return getFixedUnitText(e.lastMaxV - e.lastMinV, 'Vp2p');
    case TP_BIN:
      return String(e.binaryLevel);
    case TP_FRQ:
      return getFixedUnitText(e.frequency, 'Hz');
    case TP_PWI:
      return getFixedUnitText(e.pulseWidth, 's');
    case TP_DUT:
      return formatNumber(e.dutyCycle, 3, true).padStart(8);
  }
  return e.label;
}

/** Where the test point's two text lines go, and the lead end. */
function testPointLayout(
  e: TestPointElm,
  ctx: DrawContext | null,
  measure: (s: string, f: TextStyle) => number,
  value: string,
): { lead1: Pt; x: number; y: number; w1: number; w2: number; wmax: number; h: number } {
  const label = e.label;
  const labelFont: TextStyle = { ...TP_FONT, bold: ctx?.highlighted ?? false };
  const lead1 = interp(
    e.point1,
    e.point2,
    1 - (Math.trunc(measure('TP', labelFont) / 2) + 8) / e.dn,
  );
  const w1 = Math.trunc(measure(label, labelFont));
  const w2 = Math.trunc(measure(value, { ...VALUE_FONT, size: 14 }));
  const wmax = Math.max(w1, w2);
  const h = 14;
  const spacing = 14;
  let x = lead1.x;
  let y = lead1.y;
  if (e.point1.y !== lead1.y) {
    x -= Math.trunc(wmax / 2);
    y += Math.sign(lead1.y - e.point1.y) * h;
    if (lead1.y < e.point1.y) y -= spacing - 4;
  } else if (lead1.x > e.point1.x) x += 4;
  else x -= 4 + wmax;
  return { lead1, x, y, w1, w2, wmax, h };
}

export const testPointView: ElementView<TestPointElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const value = testPointValue(e);
    const l = testPointLayout(e, ctx, (s, f) => p.measureText(s, f), value);
    const mid = { baseline: 'middle' } as const;
    p.text(e.label, pt(l.x + Math.trunc((l.wmax - l.w1) / 2), l.y), LABEL, {
      ...TP_FONT,
      bold: ctx.highlighted,
      ...mid,
    });
    p.text(value, pt(l.x + Math.trunc((l.wmax - l.w2) / 2), l.y + 14), LABEL, {
      ...VALUE_FONT,
      size: 14,
      ...mid,
    });
    p.line(e.point1, l.lead1, vInk(volt(e, 0)));
  },
  bbox: (e) => {
    // text widths are estimated here (no painter): 7 px per character at 14 px
    const value = testPointValue(e);
    const l = testPointLayout(e, null, (s) => s.length * 7, value);
    const text: Rect = rectOf([pt(l.x, l.y - l.h / 2), pt(l.x + l.wmax, l.y + 14 + l.h / 2)]);
    return unionRect(rectOf([e.point1, l.lead1]), text);
  },
};

/** A one-post element drawn as a labeled lead (stop trigger, data export). */
function labeledLeadView<T extends StopTriggerElm | DataRecorderElm>(
  label: string,
): ElementView<T> {
  return {
    draw(e, ctx) {
      const font: TextStyle = { font: 'value', size: 14, bold: ctx.highlighted };
      drawLabeledNode(ctx, label, e.point1, e.lead1, LABEL, font);
      ctx.painter.line(e.point1, e.lead1, vInk(volt(e, 0)));
    },
    bbox: (e) => {
      // the text box as drawLabeledNode places it, with the width estimated (no painter here)
      const w = label.length * 7;
      const h = 14;
      let x = e.lead1.x;
      let y = e.lead1.y;
      if (e.point1.y !== e.lead1.y) {
        x -= w / 2;
        y += Math.sign(e.lead1.y - e.point1.y) * h;
      } else if (e.lead1.x > e.point1.x) x += 4;
      else x -= 4 + w;
      return unionRect(
        rectOf([e.point1, e.lead1]),
        rectOf([pt(x, y - h / 2), pt(x + w, y + h / 2)]),
      );
    },
  };
}

export const stopTriggerView = labeledLeadView<StopTriggerElm>('trigger');
export const dataRecorderView = labeledLeadView<DataRecorderElm>('export');

const WATT_LABELS = ['V', 'C', 'M', 'L'];

export const wattmeterView: ElementView<WattmeterElm | WattmeterTrueElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const isTrue = e instanceof WattmeterTrueElm;
    let flip = 1;
    const c = [ctx.dotCount(0, e.currents[0]), ctx.dotCount(1, e.currents[1])];
    for (let i = 0; i !== 4; i++) {
      p.line(e.posts[i], e.inner[i], vInk(volt(e, i)));
      if (!isTrue || i >= 2) p.dots(e.posts[i], e.inner[i], c[Math.trunc(i / 2)] * flip);
      if (isTrue) {
        // terminal marks just inside the box: M L over C V
        const s = WATT_LABELS[i];
        const w = Math.trunc(p.measureText(s, UNITS_FONT));
        const at = interp(e.posts[i], e.inner[i], 1.5);
        p.text(s, pt(at.x - Math.trunc(w / 2), at.y + 4), LABEL, UNITS_FONT);
      }
      flip *= -1;
    }
    p.polyline(e.rectPoints, MUTED, { closed: true });
    // the reading has a fixed width, so the font size is fitted once and stays put
    const str = getFixedUnitText(e.meterPower(), e.meterUnit());
    let fsize = 15;
    let w: number;
    for (;;) {
      w = Math.trunc(p.measureText(str, { ...VALUE_FONT, size: fsize }));
      if (w < e.maxTextLen || fsize <= 1) break;
      fsize--;
    }
    p.text(str, pt(e.center.x - Math.trunc(w / 2), e.center.y), LABEL, {
      ...VALUE_FONT,
      size: fsize,
      baseline: 'middle',
    });
  },
  bbox: (e) => (e.posts.length === 0 ? elementBox(e, 0) : rectOf([...e.posts, ...e.rectPoints])),
};
