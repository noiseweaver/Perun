// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { ScopeDefaultsStore } from '@perun/elements';
import { Circuit } from '@perun/format';
import { CircuitRenderer, DEFAULT_FRAME, ScopeRenderer, currentMultiplier } from '@perun/render';
import type { Theme } from '@perun/theme';

/**
 * The fixed circuit the theme editor previews themes on (PLAN.md section 6): an AC source
 * charging a capacitor, so wires swing through negative, zero and positive voltage, with an LED,
 * a labeled output, a text box and a scope of the capacitor's voltage and current.
 */
export const SAMPLE_CIRCUIT = [
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11',
  'v 96 304 96 112 0 1 40 5 0 0 0.5',
  'r 96 112 240 112 0 220',
  'c 240 112 240 304 0 0.000015 0',
  'w 96 304 240 304 0',
  'r 240 112 368 112 0 330',
  '162 368 112 368 304 0 1 0 0',
  'w 240 304 368 304 0',
  'g 96 304 96 336 0',
  'O 368 112 432 112 0',
  'x 92 76 186 79 4 14 Sample',
  'o 2 64 0 4099 5 0.05 0 2 2 3',
].join('\n');

/** Scope settings stay out of the user's saved scope defaults. */
const memoryStore: ScopeDefaultsStore = {
  getItem: () => null,
  setItem: () => undefined,
};

/** Share of the preview's height the scope takes. */
const SCOPE_FRACTION = 0.36;

/** Runs SAMPLE_CIRCUIT on its own canvas and draws it in a given theme. */
export class SamplePreview {
  private readonly circuit = new Circuit();
  private readonly renderer: CircuitRenderer;
  private readonly scopes: ScopeRenderer;
  private raf = 0;
  private last = 0;
  private owed = 0;
  private warmedUp = false;
  private width = 0;
  private height = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement, theme: Theme) {
    this.renderer = new CircuitRenderer(canvas, theme);
    this.renderer.motion = false;
    this.scopes = new ScopeRenderer(canvas, theme);
    this.circuit.setScopeUi({
      createImage: (w, h) => this.scopes.createImage(w, h),
      defaultsStore: memoryStore,
    });
    this.circuit.read(SAMPLE_CIRCUIT);
    this.circuit.scopes.look = theme.style.scopeLook;
    this.renderer.setElements(this.circuit.elements);
  }

  setTheme(theme: Theme): void {
    this.renderer.setTheme(theme);
    this.scopes.setTheme(theme);
    // the sample has no X-Y plot, so no trail image to redraw in the new colors
    this.circuit.scopes.look = theme.style.scopeLook;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.renderer.resize(width, height, dpr);
    this.renderer.circuitHeight = this.circuitHeight();
    this.renderer.fit();
  }

  private circuitHeight(): number {
    return Math.round(this.height * (1 - SCOPE_FRACTION));
  }

  /** Animate until stop(); `animate` false draws one still frame (reduced motion). */
  start(animate: boolean): void {
    const loop = (now: number): void => {
      if (animate) this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  private frame(now: number): void {
    if (this.width === 0) return;
    const elapsed = this.last === 0 ? 0 : Math.min(now - this.last, 100);
    this.last = now;
    const sim = this.circuit.sim;
    const mgr = this.circuit.scopes;
    const ch = this.circuitHeight();
    const area = { x: 0, y: ch, width: this.width, height: this.height - ch };
    mgr.compact = false;
    mgr.setupScopes(area, 0);
    if (!this.warmedUp) {
      // run a few cycles once the scope has its size, so the first frame shows a full trace
      sim.step(40000);
      this.warmedUp = true;
    }
    this.owed += (160 * this.circuit.getIterCount() * elapsed) / 1000;
    if (this.owed >= 1 && sim.stopMessage === null) {
      const k = Math.floor(this.owed);
      sim.step(k);
      this.owed -= k;
    }
    this.renderer.render({
      ...DEFAULT_FRAME,
      currentMult: currentMultiplier(elapsed, this.circuit.options.currentBar, true),
      voltageRange: this.circuit.options.voltageRange,
    });
    this.scopes.render(mgr, { area, info: [], splitterHot: false }, this.dpr);
  }
}
