// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

/**
 * What a scope draws with. Like element views, scopes never pick colors: the renderer maps each
 * ink to the active theme. Upstream's hard-coded scope colors are noted per ink.
 */
export type ScopeInk =
  /** A voltage plot (upstream: the positive voltage color). */
  | 'voltage'
  /** A current plot (upstream: yellow). */
  | 'current'
  /** Power, resistance and charge plots (upstream: white). */
  | 'other'
  /** Grid lines (upstream: #404040). */
  | 'gridMinor'
  /** The zero line and every tenth time line (upstream: #A0A0A0). */
  | 'gridMajor'
  /** Scope text, cursor line and info (upstream: white). */
  | 'text'
  /** Background behind the cursor readout (upstream: black). */
  | 'background'
  /** Selected scope or plot (upstream: the selection color). */
  | 'selection'
  /** Every plot while another element's plot is selected (upstream: #A0A0A0). */
  | 'muted'
  /** Settings wheel at rest (upstream: dark gray). */
  | 'settings'
  /** Trigger level, edge and state (upstream: #FF8000). */
  | 'trigger'
  /** Spectrum and its labels (upstream: #FF0000). */
  | 'fft'
  /** Spectrum grid (upstream: #880000). */
  | 'fftGrid'
  /** Drag-to-measure start line (upstream: light gray). */
  | 'measure'
  /** Second and later plots of the same kind (upstream: eight fixed colors). */
  | { readonly trace: number }
  /** A color computed from circuit data (X-Y plot color modulation). 0..255. */
  | { readonly rgb: readonly [number, number, number] };

/**
 * A 2D drawing surface in scope pixels (upstream's `Graphics` as scopes use it). Lines are one
 * pixel wide unless a width is given.
 */
export interface ScopeGraphics {
  setColor(ink: ScopeInk): void;
  drawLine(x1: number, y1: number, x2: number, y2: number, width?: number): void;
  /** Circle outline of radius r, three pixels wide (upstream `drawThickCircle`). */
  drawThickCircle(cx: number, cy: number, r: number): void;
  drawString(s: string, x: number, y: number): void;
  measureWidth(s: string): number;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillOval(x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  clipRect(x: number, y: number, w: number, h: number): void;
  setGlobalAlpha(a: number): void;
  drawImage(img: ScopeImage, x: number, y: number): void;
}

/**
 * Off-screen image an X-Y plot draws into as the simulation runs (upstream keeps a canvas per
 * scope). The renderer creates them; without one (headless) X-Y plots record nothing.
 */
export interface ScopeImage {
  resize(w: number, h: number): void;
  /** Fill with the X-Y background (upstream: #111). */
  clear(): void;
  segment(x1: number, y1: number, x2: number, y2: number, ink: ScopeInk, alpha: number): void;
  /** Darken toward the background by `alpha` (trail fade). */
  fade(alpha: number): void;
}
