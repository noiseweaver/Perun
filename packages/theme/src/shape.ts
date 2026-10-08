// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/** Material 3's corner radii in px at roundness 1: extra small to extra large. */
export const SHAPE_SIZES = { xs: 4, s: 8, m: 12, l: 16, xl: 28 } as const;

/** Above this roundness, round buttons and pills stay round; below, they become rounded squares. */
const ROUND = 1;

/**
 * A corner radius for `style.roundness` (0 square, 1 Material's own, 2 extra round). Radii don't
 * all scale by one factor: below 1 a large radius shrinks faster than a small one, so dialogs and
 * sheets square off before menus and fields do and the shapes keep their order; above 1 a small
 * radius grows more than a large one, as there is less room left to round a large one into.
 */
export function shapeRadius(base: number, roundness: number): number {
  const r = Math.min(2, Math.max(0, roundness));
  const k = base / SHAPE_SIZES.xl;
  const scale = r <= 1 ? Math.pow(r, 1 + k) : 1 + (r - 1) * (1 - k / 2);
  return Math.round(base * scale * 10) / 10;
}

/**
 * The radius of a fully round shape (round buttons, chips, switches, pills). At roundness 1 or
 * more it is round whatever its size; below that it is a radius that shrinks with the square of
 * the roundness, so a 40 px round button turns into a rounded square, then a square.
 */
export function fullRadius(roundness: number): string {
  if (roundness >= ROUND) return '999px';
  const r = Math.max(0, roundness);
  return `${Math.round(SHAPE_SIZES.xl * r * r * 10) / 10}px`;
}

/** The `--md-shape-*` CSS variables for a roundness. */
export function shapeCssVariables(roundness: number): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(SHAPE_SIZES))
    vars[`--md-shape-${k}`] = `${shapeRadius(v, roundness)}px`;
  vars['--md-shape-full'] = fullRadius(roundness);
  return vars;
}
