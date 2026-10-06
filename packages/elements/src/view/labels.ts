// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Geometry learned from CircuitJS1 LabeledNodeElm, ProbeElm, OutputElm, AudioOutputElm, TextElm,
// BoxElm and LineElm
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032;
// the drawing code is new.

import type { AudioOutputElm } from '../elm/AudioOutputElm.ts';
import type { BoxElm, LineElm } from '../elm/GraphicElm.ts';
import type { InstructionDisplayElm } from '../elm/InstructionDisplayElm.ts';
import { LabeledNodeElm } from '../elm/LabeledNodeElm.ts';
import { OutputElm } from '../elm/OutputElm.ts';
import { ProbeElm } from '../elm/ProbeElm.ts';
import { TextElm } from '../elm/TextElm.ts';
import {
  COMPONENT,
  drawCenteredText,
  drawLabeledNode,
  LABEL_FONT,
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
import { calcLeads, interp, pt, sign, type Rect } from './geometry.ts';
import type { DrawContext, Ink, Pt, TextStyle } from './Painter.ts';
import { getUnitTextWithScale } from './units.ts';

const NODE_CIRCLE = 17;

/** Label text turned to read along a vertical lead (upstream `drawRotatedLabeledNode`). */
function drawRotatedLabel(ctx: DrawContext, str: string, pt1: Pt, pt2: Pt, ink: Ink): void {
  const p = ctx.painter;
  let lineOver = false;
  if (str.startsWith('/')) {
    lineOver = true;
    str = str.substring(1);
  }
  const w = Math.trunc(p.measureText(str, LABEL_FONT));
  const h = Math.trunc(p.fontSize(LABEL_FONT));
  const dir = sign(pt2.y - pt1.y);
  // further from the wire so long names do not overlap it
  const offset = h + Math.max(0, Math.trunc(w / 2) - h);
  const at = pt(pt2.x, pt2.y + dir * offset);
  p.text(str, at, ink, {
    ...LABEL_FONT,
    align: 'center',
    baseline: 'middle',
    rotate: -Math.PI / 2,
  });
  if (lineOver) {
    const xa = -Math.trunc(h / 2) - 1;
    // the bar is above the rotated text, i.e. to its left on screen
    p.line(pt(at.x + xa, at.y + Math.trunc(w / 2)), pt(at.x + xa, at.y - Math.trunc(w / 2)), ink, {
      width: 1,
    });
  }
}

export const labeledNodeView: ElementView<LabeledNodeElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const lead1 = interp(e.point1, e.point2, 1 - NODE_CIRCLE / e.dn);
    p.line(e.point1, lead1, vInk(volt(e, 0)), { width: e.busWidth > 1 ? 5 : 3 });
    if (e.hasFlag(LabeledNodeElm.FLAG_ROTATE_TEXT) && e.point1.x === lead1.x)
      drawRotatedLabel(ctx, e.text, e.point1, lead1, COMPONENT);
    else drawLabeledNode(ctx, e.text, e.point1, lead1, COMPONENT);
    let current = e.current;
    if (e.currents !== null) current = e.currents.reduce((a, b) => a + b, 0);
    p.dots(e.point1, lead1, ctx.dotCount(0, current));
  },
  bbox: (e) => elementBox(e, NODE_CIRCLE, e.point1, interp(e.point1, e.point2, 1 + 11 / e.dn)),
};

const PROBE_CIRCLE = 12;
/** The small badge and dashed join drawn in a circle-less probe's empty middle. */
const PROBE_BADGE = 7;
const PROBE_DASH = { width: 1, dash: [4, 3] } as const;
const PROBE_BADGE_FONT: TextStyle = { size: 9, bold: true, align: 'center', baseline: 'middle' };

export const probeView: ElementView<ProbeElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const showCircle = e.hasFlag(ProbeElm.FLAG_CIRCLE);
    const showValue = e.hasFlag(ProbeElm.FLAG_SHOWVOLTAGE);
    let len = ctx.highlighted || showValue ? 16 : e.dn - 32;
    if (showCircle) len = PROBE_CIRCLE * 2;
    const [lead1, lead2] = calcLeads(e.point1, e.point2, e.dn, Math.trunc(len));
    p.line(e.point1, lead1, vInk(volt(e, 0)));
    p.line(lead2, e.point2, vInk(volt(e, 1)));
    if (showValue) {
      drawValues(e, ctx, e.meterValueText(), showCircle ? PROBE_CIRCLE + 3 : 4);
    }
    const plus = interp(e.point1, e.point2, (e.dn / 2 - len / 2 - 4) / e.dn, -10 * e.dsign);
    let py = plus.y;
    if (e.y2 > e.y) py += 4;
    if (e.y > e.y2) py += 3;
    const w = Math.trunc(p.measureText('+', UNITS_FONT));
    p.text('+', pt(plus.x - Math.trunc(w / 2), py), TEXT, UNITS_FONT);
    if (showCircle) {
      const center = interp(e.point1, e.point2, 0.5);
      p.circle(center, PROBE_CIRCLE * 0.98, LABEL);
      drawCenteredText(ctx, 'V', center.x, center.y, true, LABEL);
    } else if (len > 2 * PROBE_BADGE + 8) {
      // Upstream leaves the middle empty, so a probe reads as two stray stubs (Gady,
      // 2026-10-06). Join them with a faint dashed line and a small V badge.
      const center = interp(e.point1, e.point2, 0.5);
      const a = interp(e.point1, e.point2, 0.5 - PROBE_BADGE / e.dn);
      const b = interp(e.point1, e.point2, 0.5 + PROBE_BADGE / e.dn);
      p.line(lead1, a, MUTED, PROBE_DASH);
      p.line(b, lead2, MUTED, PROBE_DASH);
      p.circle(center, PROBE_BADGE, MUTED, { width: 1 });
      p.text('V', center, MUTED, PROBE_BADGE_FONT);
    }
  },
  bbox: (e) => elementBox(e, e.hasFlag(ProbeElm.FLAG_CIRCLE) ? PROBE_CIRCLE : 8),
};

export const outputView: ElementView<OutputElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const font: TextStyle = { font: 'value', size: 14, bold: ctx.highlighted };
    const s = e.hasFlag(OutputElm.FLAG_VALUE)
      ? getUnitTextWithScale(volt(e, 0), 'V', e.scale, e.hasFlag(OutputElm.FLAG_FIXED))
      : 'out';
    const w = Math.trunc(p.measureText(s, font));
    const lead1 = interp(e.point1, e.point2, 1 - (Math.trunc(w / 2) + 8) / e.dn);
    drawCenteredText(ctx, s, e.x2, e.y2, true, LABEL, font);
    p.line(e.point1, lead1, vInk(volt(e, 0)));
  },
  bbox: (e) => elementBox(e, 8),
};

export const audioOutputView: ElementView<AudioOutputElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const font: TextStyle = { font: 'value', size: 14, bold: ctx.highlighted };
    const s = e.getLabel();
    const w = Math.trunc(p.measureText(s, font));
    // how much of the recording buffer is filled
    const pct = Math.trunc(w * e.fillFraction());
    const x0 = e.x2 - Math.trunc(w / 2);
    if (pct > 0)
      p.fillPolygon(
        [pt(x0, e.y2 - 10), pt(x0 + pct, e.y2 - 10), pt(x0 + pct, e.y2 + 10), pt(x0, e.y2 + 10)],
        MUTED,
      );
    const lead1 = interp(e.point1, e.point2, 1 - (w / 2 + 8) / e.dn);
    drawCenteredText(ctx, s, e.x2, e.y2, true, LABEL, font);
    p.line(e.point1, lead1, vInk(volt(e, 0)));
  },
  bbox: (e) => elementBox(e, 8),
};

/** A text element's own color, `#rrggbb` (circuit data, not styling). */
function textColor(c: string | null): Ink | null {
  if (c === null) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m || m[1] === undefined) return null;
  const v = parseInt(m[1], 16);
  return { rgb: [(v >> 16) & 255, (v >> 8) & 255, v & 255] };
}

function textBox(e: TextElm, measure: (s: string) => number): Rect {
  let y2 = e.y;
  let x2 = e.x;
  let y = e.y;
  for (const line of e.lines) {
    x2 = Math.max(x2, e.x + measure(line));
    y2 = y + 3;
    y += e.size + 3;
  }
  return { x1: e.x, y1: e.y - e.size, x2, y2 };
}

export const textView: ElementView<TextElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const ink = ctx.highlighted ? LABEL : (textColor(e.color) ?? LABEL);
    // the box's own font, else the Options default
    const tf = ctx.textFont;
    const family =
      e.family === 'options'
        ? (tf?.family ?? 'default')
        : e.family === 'sans'
          ? 'default'
          : e.family;
    const st = e.fontStyle;
    const font: TextStyle = {
      size: e.size,
      font: family === 'mono' ? 'value' : family === 'serif' ? 'serif' : 'units',
      bold: st === 'options' ? (tf?.bold ?? false) : st === 'bold' || st === 'boldItalic',
      italic: st === 'options' ? (tf?.italic ?? false) : st === 'italic' || st === 'boldItalic',
    };
    let cury = e.y;
    for (const s of e.lines) {
      p.text(s, pt(e.x, cury), ink, font);
      if (e.hasFlag(TextElm.FLAG_BAR)) {
        const by = cury - e.size;
        const sw = Math.trunc(p.measureText(s, font));
        p.line(pt(e.x, by), pt(e.x + sw - 1, by), ink, { width: 1 });
      }
      cury += e.size + 3;
    }
  },
  // without a painter, assume an average glyph is 0.55 em wide
  bbox: (e) => textBox(e, (s) => s.length * e.size * 0.55),
};

export const boxView: ElementView<BoxElm> = {
  draw(e, ctx) {
    const x1 = Math.min(e.x, e.x2);
    const y1 = Math.min(e.y, e.y2);
    const x2 = Math.max(e.x, e.x2);
    const y2 = Math.max(e.y, e.y2);
    const corners = [pt(x1, y1), pt(x2, y1), pt(x2, y2), pt(x1, y2)];
    ctx.painter.polyline(corners, MUTED, { closed: true, width: 1, dash: [16, 6] });
  },
  bbox: (e) => ({
    x1: Math.min(e.x, e.x2),
    y1: Math.min(e.y, e.y2),
    x2: Math.max(e.x, e.x2),
    y2: Math.max(e.y, e.y2),
  }),
};

export const lineView: ElementView<LineElm> = {
  draw(e, ctx) {
    ctx.painter.line(pt(e.x, e.y), pt(e.x2, e.y2), MUTED, { width: 1 });
  },
  bbox: (e) => ({
    x1: Math.min(e.x, e.x2),
    y1: Math.min(e.y, e.y2),
    x2: Math.max(e.x, e.x2),
    y2: Math.max(e.y, e.y2),
  }),
};

/** Text at the second point, fed by a thick bus lead (upstream InstructionDisplayElm.draw). */
export const instructionDisplayView: ElementView<InstructionDisplayElm> = {
  draw(e, ctx) {
    const p = ctx.painter;
    const style: TextStyle = { font: 'value', size: 14, bold: ctx.highlighted };
    const s = e.getDisplayText();
    const w = Math.trunc(p.measureText(s, style));
    const lead = interp(e.point1, e.point2, 1 - (Math.trunc(w / 2) + 8) / e.dn);
    drawCenteredText(ctx, s, e.x2, e.y2, true, LABEL, style);
    p.line(e.point1, lead, vInk(volt(e, 0)), { width: 5 });
  },
  bbox: (e) => elementBox(e, 10),
};
