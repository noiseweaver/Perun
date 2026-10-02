// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { z } from 'zod';
import { parseColor } from './color.ts';

/** Theme schema version 1 (PLAN.md section 6). Every color is a CSS color string. */
export interface Theme {
  schemaVersion: 1;
  meta: {
    name: string;
    author: string;
    description: string;
    /** Built-in the missing keys came from. */
    base: string;
  };
  canvas: {
    background: string;
    grid: string;
    gridMajor: string;
  };
  circuit: {
    /** Voltage coloring: negative, zero and positive stops. */
    voltage: { negative: string; zero: string; positive: string };
    currentDot: string;
    /** Element bodies and wires when voltage coloring is off. */
    component: string;
    /** Secondary element bodies (source and LED circles, transistor envelope). */
    componentMuted: string;
    selection: string;
    hover: string;
    post: string;
    /** Values drawn next to elements. */
    text: string;
    /** Labels: labeled nodes, outputs, text elements, op-amp bodies. */
    label: string;
    /** Posts that touch an element without connecting to it. */
    badConnection: string;
  };
  scope: {
    background: string;
    grid: string;
    traces: string[];
  };
  ui: {
    surface: string;
    surfaceAlt: string;
    border: string;
    text: string;
    textMuted: string;
    accent: string;
    danger: string;
  };
  style: {
    /** Width of a thick line (upstream draws them 3 units wide). */
    strokeWidth: number;
    /** Half the side of a current dot (upstream: 2). */
    dotRadius: number;
    /** Grid drawn behind the circuit. */
    grid: 'none' | 'dots' | 'lines';
    font: string;
    monoFont: string;
  };
}

/** A theme as authored: every key but schemaVersion is optional and falls back to `meta.base`. */
export type ThemeInput = {
  schemaVersion: 1;
  meta?: Partial<Theme['meta']>;
  canvas?: Partial<Theme['canvas']>;
  circuit?: Partial<Omit<Theme['circuit'], 'voltage'>> & {
    voltage?: Partial<Theme['circuit']['voltage']>;
  };
  scope?: Partial<Theme['scope']>;
  ui?: Partial<Theme['ui']>;
  style?: Partial<Theme['style']>;
};

export const MAX_THEME_BYTES = 16 * 1024;
const MAX_TEXT = 200;

const color = z
  .string()
  .max(64)
  .refine((s) => parseColor(s) !== null, { message: 'not a hex, RGB or HSL color' });
const text = z.string().max(MAX_TEXT);
/** A font family list: names, quotes, spaces, commas and hyphens only (no url(), no CSS). */
const fontFamily = z
  .string()
  .max(MAX_TEXT)
  .regex(/^[\w\s,'"-]+$/, { message: 'font must be a family name list' });

/** zod schema for ThemeInput. Unknown keys are dropped. */
export const themeInputSchema = z.object({
  schemaVersion: z.literal(1),
  meta: z
    .object({ name: text, author: text, description: text, base: z.string().max(40) })
    .partial()
    .optional(),
  canvas: z.object({ background: color, grid: color, gridMajor: color }).partial().optional(),
  circuit: z
    .object({
      voltage: z.object({ negative: color, zero: color, positive: color }).partial(),
      currentDot: color,
      component: color,
      componentMuted: color,
      selection: color,
      hover: color,
      post: color,
      text: color,
      label: color,
      badConnection: color,
    })
    .partial()
    .optional(),
  scope: z
    .object({ background: color, grid: color, traces: z.array(color).min(1).max(16) })
    .partial()
    .optional(),
  ui: z
    .object({
      surface: color,
      surfaceAlt: color,
      border: color,
      text: color,
      textMuted: color,
      accent: color,
      danger: color,
    })
    .partial()
    .optional(),
  style: z
    .object({
      strokeWidth: z.number().min(0.5).max(8),
      dotRadius: z.number().min(0.5).max(6),
      grid: z.enum(['none', 'dots', 'lines']),
      font: fontFamily,
      monoFont: fontFamily,
    })
    .partial()
    .optional(),
});
