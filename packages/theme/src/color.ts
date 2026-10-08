// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/** A color with 8-bit channels and alpha in 0..1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

const NUM = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;
const FUNC_RE = new RegExp(
  String.raw`^(rgb|hsl)a?\(\s*(${NUM}%?)\s*[,\s]\s*(${NUM}%?)\s*[,\s]\s*(${NUM}%?)\s*(?:[,/]\s*(${NUM}%?)\s*)?\)$`,
  'i',
);

function channel(s: string, scale: number): number {
  return s.endsWith('%') ? (parseFloat(s) / 100) * scale : parseFloat(s);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
}

/** Parse `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(a)(...)` or `hsl(a)(...)`; null if invalid. */
export function parseColor(text: string): Rgba | null {
  const s = text.trim();
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (!/^[0-9a-f]+$/i.test(hex)) return null;
    if (hex.length === 3 || hex.length === 4) {
      const v = [...hex].map((c) => parseInt(c + c, 16));
      return { r: v[0] ?? 0, g: v[1] ?? 0, b: v[2] ?? 0, a: (v[3] ?? 255) / 255 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const v = [0, 2, 4, 6].map((i) => parseInt(hex.slice(i, i + 2) || 'ff', 16));
      return { r: v[0] ?? 0, g: v[1] ?? 0, b: v[2] ?? 0, a: (v[3] ?? 255) / 255 };
    }
    return null;
  }
  const m = FUNC_RE.exec(s);
  if (!m) return null;
  const [, kind, c1 = '', c2 = '', c3 = '', ca] = m;
  const a = ca === undefined ? 1 : clamp(channel(ca, 1), 0, 1);
  if (kind?.toLowerCase() === 'rgb') {
    const [r, g, b] = [c1, c2, c3].map((c) => clamp(channel(c, 255), 0, 255));
    return { r: r ?? 0, g: g ?? 0, b: b ?? 0, a };
  }
  if (c1.endsWith('%') || !c2.endsWith('%') || !c3.endsWith('%')) return null;
  const [r, g, b] = hslToRgb(
    parseFloat(c1),
    clamp(parseFloat(c2) / 100, 0, 1),
    clamp(parseFloat(c3) / 100, 0, 1),
  );
  return { r, g, b, a };
}

/** Like parseColor, but throws on invalid input (theme values are validated before use). */
export function rgba(text: string): Rgba {
  const c = parseColor(text);
  if (c === null) throw new Error(`invalid color: ${text}`);
  return c;
}

/**
 * Mix of c1 and c2, `mix` of the way to c2, truncating channels as upstream's
 * `Color(Color c1, Color c2, double mix)` does.
 */
export function mixColor(c1: Rgba, c2: Rgba, mix: number): Rgba {
  const m0 = 1 - mix;
  return {
    r: Math.trunc(c1.r * m0 + c2.r * mix),
    g: Math.trunc(c1.g * m0 + c2.g * mix),
    b: Math.trunc(c1.b * m0 + c2.b * mix),
    a: c1.a * m0 + c2.a * mix,
  };
}

/** Scale the RGB channels (alpha unchanged), truncating. */
export function scaleColor(c: Rgba, f: number): Rgba {
  return { r: Math.trunc(c.r * f), g: Math.trunc(c.g * f), b: Math.trunc(c.b * f), a: c.a };
}

const hex2 = (v: number): string =>
  Math.round(clamp(v, 0, 255))
    .toString(16)
    .padStart(2, '0');

/** CSS hex notation: `#rrggbb`, or `#rrggbbaa` when not opaque. */
export function toCss(c: Rgba): string {
  const base = '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);
  return c.a >= 1 ? base : base + hex2(c.a * 255);
}

/** WCAG relative luminance. */
export function luminance(c: Rgba): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG contrast ratio between two opaque colors (1 to 21). */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
