// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { contrastRatio, parseColor, type Rgba } from './color.ts';
import type { Theme } from './schema.ts';

/** A theme color that is hard to see on what it is drawn on. */
export interface ContrastWarning {
  /** Dotted key of the color, like `circuit.text`. */
  key: string;
  /** Dotted key of the background. */
  against: string;
  ratio: number;
  /** WCAG minimum: 4.5 for text, 3 for lines, dots and other graphics. */
  min: number;
}

/** WCAG 2 minimum contrast for normal text (1.4.3) and for graphics (1.4.11). */
export const TEXT_CONTRAST = 4.5;
export const GRAPHIC_CONTRAST = 3;

/** `fg` seen over the opaque `bg`. */
function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function get(theme: Theme, key: string): string | undefined {
  let v: unknown = theme;
  for (const part of key.split('.')) v = (v as Record<string, unknown> | undefined)?.[part];
  return typeof v === 'string' ? v : undefined;
}

/** [color, background, minimum]: text first, then graphics. */
const PAIRS: [string, string, number][] = [
  ['ui.text', 'ui.surface', TEXT_CONTRAST],
  ['ui.text', 'ui.surfaceAlt', TEXT_CONTRAST],
  ['ui.textMuted', 'ui.surface', TEXT_CONTRAST],
  ['ui.danger', 'ui.surface', TEXT_CONTRAST],
  // text on primary buttons is the surface color
  ['ui.surface', 'ui.accent', TEXT_CONTRAST],
  ['circuit.text', 'canvas.background', TEXT_CONTRAST],
  ['circuit.label', 'canvas.background', TEXT_CONTRAST],
  ['scope.text', 'scope.background', TEXT_CONTRAST],
  ['ui.accent', 'ui.surface', GRAPHIC_CONTRAST],
  ['circuit.voltage.negative', 'canvas.background', GRAPHIC_CONTRAST],
  ['circuit.voltage.zero', 'canvas.background', GRAPHIC_CONTRAST],
  ['circuit.voltage.positive', 'canvas.background', GRAPHIC_CONTRAST],
  ['circuit.component', 'canvas.background', GRAPHIC_CONTRAST],
  ['circuit.post', 'canvas.background', GRAPHIC_CONTRAST],
  ['circuit.currentDot', 'canvas.background', GRAPHIC_CONTRAST],
  ['circuit.selection', 'canvas.background', GRAPHIC_CONTRAST],
  ['circuit.hover', 'canvas.background', GRAPHIC_CONTRAST],
  ['scope.traces.0', 'scope.background', GRAPHIC_CONTRAST],
  ['scope.current', 'scope.background', GRAPHIC_CONTRAST],
];

/**
 * WCAG contrast problems in a theme: text against its background below 4.5:1 and graphics
 * (voltage colors, wires, dots) below 3:1. Translucent colors are judged over their background.
 */
export function contrastWarnings(theme: Theme): ContrastWarning[] {
  const pairs = [...PAIRS];
  // in the card look scope text sits on the card as much as on the plot
  if (theme.style.scopeLook === 'cards') pairs.push(['scope.text', 'scope.card', TEXT_CONTRAST]);
  const out: ContrastWarning[] = [];
  for (const [key, against, min] of pairs) {
    const fg = parseColor(get(theme, key) ?? '');
    const bgRaw = parseColor(get(theme, against) ?? '');
    if (fg === null || bgRaw === null) continue;
    const bg = { ...bgRaw, a: 1 };
    const ratio = contrastRatio(over(fg, bg), bg);
    if (ratio < min) out.push({ key, against, ratio, min });
  }
  return out;
}
