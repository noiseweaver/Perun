// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

/** A point in circuit coordinates. */
export interface Pt {
  readonly x: number;
  readonly y: number;
}

/**
 * Semantic color roles. Views never pick colors; the renderer maps each role to the active
 * theme (PLAN.md section 5). Roles that draw part of an element turn to the selection color while
 * the element is highlighted; `text` (values) and `currentDot` never do.
 */
export type ColorRole =
  'component' | 'componentMuted' | 'label' | 'text' | 'post' | 'currentDot' | 'badConnection';

/** What to draw with. */
export type Ink =
  | { readonly role: ColorRole }
  /** The theme's voltage scale at this voltage (component color when voltage coloring is off). */
  | { readonly voltage: number }
  /** Voltage colors blended from v1 at `from` to v2 at `to`. */
  | {
      readonly gradient: {
        readonly from: Pt;
        readonly to: Pt;
        readonly v1: number;
        readonly v2: number;
      };
    }
  /**
   * A fuse element's color: the voltage color heating through red and yellow as `level` (heat
   * over its limit) goes from 0 to 1, then the label color once blown (upstream `getTempColor`).
   */
  | { readonly heat: { readonly voltage: number; readonly level: number } }
  /** A color that is circuit data, not styling (LED light, a text element's own color). 0..255. */
  | { readonly rgb: readonly [number, number, number] };

export interface StrokeStyle {
  /** Line width in circuit units; 3 is upstream's thick line (the default), 1 a thin line. */
  readonly width?: number;
  readonly dash?: readonly number[];
}

/**
 * `units` and `value` are upstream's 12 px fonts; a size picks an explicit one. `value` is for
 * component values and draws in the theme's monospace font, everything else in its text font.
 */
export interface TextStyle {
  /** units: the theme's text font; value: its monospace font; serif: a generic serif. */
  readonly font?: 'units' | 'value' | 'serif';
  readonly size?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly align?: 'left' | 'center';
  readonly baseline?: 'alphabetic' | 'middle';
  /** Rotation in radians around the anchor point. */
  readonly rotate?: number;
}

/**
 * Drawing surface for element views. Coordinates are circuit units; the renderer owns the
 * viewport transform, theme and HiDPI scaling.
 */
export interface Painter {
  line(a: Pt, b: Pt, ink: Ink, style?: StrokeStyle): void;
  /** Connected segments; `closed` joins the last point to the first. */
  polyline(
    points: readonly Pt[],
    ink: Ink,
    style?: StrokeStyle & { readonly closed?: boolean },
  ): void;
  fillPolygon(points: readonly Pt[], ink: Ink): void;
  circle(center: Pt, r: number, ink: Ink, style?: StrokeStyle): void;
  fillCircle(center: Pt, r: number, ink: Ink): void;
  text(s: string, at: Pt, ink: Ink, style?: TextStyle): void;
  measureText(s: string, style?: TextStyle): number;
  /** Font size in circuit units for this style. */
  fontSize(style?: TextStyle): number;
  /**
   * Current dots from a to b at dot position `pos` (from DrawContext.dotCount). Draws nothing
   * while the simulation is paused or dots are off.
   */
  dots(a: Pt, b: Pt, pos: number): void;
}

/** Per-element drawing state the renderer provides. */
/** How text boxes are drawn (a display setting; circuits don't store it). */
export interface TextFont {
  readonly family: 'default' | 'serif' | 'mono';
  readonly bold: boolean;
  readonly italic: boolean;
}

export interface DrawContext {
  readonly painter: Painter;
  /** Hovered, selected or the element that stopped the simulation. */
  readonly highlighted: boolean;
  /** Circuit option: show component values. */
  readonly showValues: boolean;
  /** User setting: IEC (box) resistors instead of zigzags. */
  readonly euroResistors: boolean;
  /** User setting: IEC (box) logic gates. Off if absent. */
  readonly euroGates?: boolean;
  /** User setting: draw the ohm sign after resistances (upstream `showOhm`, off by default). */
  readonly showOhm: boolean;
  /** User setting, not in upstream: the font of text boxes (TextElm). Default font if absent. */
  readonly textFont?: TextFont;
  /**
   * Advance current-dot counter `slot` of this element by this frame's `current` and return it.
   * Call once per slot per frame (upstream `updateDotCount`).
   */
  dotCount(slot: number, current: number): number;
}
