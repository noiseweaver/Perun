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
    /** Plot area. */
    background: string;
    /** Card around each scope, with its header and legend (card look only). */
    card: string;
    /** Grid lines. */
    grid: string;
    /** Zero line, every tenth time line, muted plots. */
    gridMajor: string;
    /** Labels, readouts, cursor, power and other non-V/I plots. */
    text: string;
    /** Current plots. */
    current: string;
    /** Trigger level and state. */
    trigger: string;
    /** Spectrum (FFT) trace and labels. */
    fft: string;
    fftGrid: string;
    /** The first entry draws voltage plots; later plots of one kind cycle through the rest. */
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
    /** UI text and canvas labels. */
    font: string;
    /** Component values on the canvas and numeric readouts. */
    monoFont: string;
    /**
     * How scopes look: `classic` draws them as upstream does, `cards` puts each one in a card
     * with a header, legend and labeled axes.
     */
    scopeLook: 'classic' | 'cards';
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

const color = (description: string) =>
  z
    .string()
    .max(64)
    .refine((s) => parseColor(s) !== null, { message: 'not a hex, RGB or HSL color' })
    .describe(description);
const text = (description: string) => z.string().max(MAX_TEXT).describe(description);
/** A font family list: names, quotes, spaces, commas and hyphens only (no url(), no CSS). */
const fontFamily = (description: string) =>
  z
    .string()
    .max(MAX_TEXT)
    .regex(/^[\w\s,'"-]+$/, { message: 'font must be a family name list' })
    .describe(description);

/**
 * zod schema for ThemeInput. Unknown keys are dropped. The descriptions feed the generated JSON
 * Schema and the key reference in docs/THEMES.md.
 */
export const themeInputSchema = z
  .object({
    schemaVersion: z.literal(1).describe('Always 1.'),
    meta: z
      .object({
        name: text('Name shown in the theme menu.'),
        author: text('Who made the theme.'),
        description: text('One line about the theme.'),
        base: z
          .string()
          .max(40)
          .describe(
            'Built-in theme the missing keys come from: dark (the default), light, classic, ' +
              'classic-dots, high-contrast, colorblind-safe, nord, solarized-dark, gruvbox-dark ' +
              'or adwaita-dark.',
          ),
      })
      .partial()
      .optional()
      .describe('About the theme.'),
    canvas: z
      .object({
        background: color('Circuit area background.'),
        grid: color('Grid dots or lines.'),
        gridMajor: color('Every eighth grid line or dot.'),
      })
      .partial()
      .optional()
      .describe('The circuit area.'),
    circuit: z
      .object({
        voltage: z
          .object({
            negative: color('Most negative voltage (at minus the voltage range).'),
            zero: color('Zero volts.'),
            positive: color('Most positive voltage.'),
          })
          .partial()
          .describe('Voltage coloring: wires blend between these three stops.'),
        currentDot: color('Moving current dots.'),
        component: color('Element bodies and wires when voltage colors are off.'),
        componentMuted: color(
          'Secondary element parts: source and LED circles, transistor envelope.',
        ),
        selection: color('Selected elements and the selection box.'),
        hover: color('The element under the pointer.'),
        post: color('Element end posts and junction dots.'),
        text: color('Values drawn next to elements.'),
        label: color('Labels: labeled nodes, outputs, text boxes, op-amp symbols.'),
        badConnection: color('Posts that touch an element without connecting to it.'),
      })
      .partial()
      .optional()
      .describe('Elements and wires.'),
    scope: z
      .object({
        background: color('Plot area.'),
        card: color('Card around each scope, with its header and legend (card look only).'),
        grid: color('Grid lines.'),
        gridMajor: color('Zero line, every tenth time line, muted plots.'),
        text: color('Labels, readouts, cursor, power and other plots that are not V or I.'),
        current: color('Current plots.'),
        trigger: color('Trigger level and state.'),
        fft: color('Spectrum (FFT) trace and labels.'),
        fftGrid: color('Spectrum grid.'),
        traces: z
          .array(color('A trace color.'))
          .min(1)
          .max(16)
          .describe(
            'The first color draws voltage plots; further plots of one kind cycle through the rest.',
          ),
      })
      .partial()
      .optional()
      .describe('Oscilloscopes.'),
    ui: z
      .object({
        surface: color('App background: bars, menus, dialogs (Material surface).'),
        surfaceAlt: color('Raised containers: panels, cards, fields (Material surface container).'),
        border: color('Dividers and outlines (Material outline variant).'),
        text: color('Main text (Material on surface).'),
        textMuted: color('Secondary text and icons (Material on surface variant).'),
        accent: color('Primary buttons, checked items, focus (Material primary).'),
        danger: color('Errors and warnings (Material error).'),
      })
      .partial()
      .optional()
      .describe('The app around the canvas.'),
    style: z
      .object({
        strokeWidth: z
          .number()
          .min(0.5)
          .max(8)
          .describe('Width of thick lines in circuit units (CircuitJS draws them 3 wide).'),
        dotRadius: z
          .number()
          .min(0.5)
          .max(6)
          .describe('Half the side of a current dot (CircuitJS: 2).'),
        grid: z.enum(['none', 'dots', 'lines']).describe('Grid drawn behind the circuit.'),
        font: fontFamily('UI text and canvas labels: a CSS font family list.'),
        monoFont: fontFamily('Component values and numeric readouts: a CSS font family list.'),
        scopeLook: z
          .enum(['classic', 'cards'])
          .describe(
            'classic draws scopes as CircuitJS does; cards puts each in a card with a header, ' +
              'legend and labeled axes.',
          ),
      })
      .partial()
      .optional()
      .describe('Line widths, grid and fonts.'),
  })
  .describe('A circuitjs-next theme. Every key but schemaVersion is optional.');
