// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { ScopeDefaultsStore } from '@perun/elements';
import { Circuit, OptionFlag } from '@perun/format';
import {
  CircuitRenderer,
  DEFAULT_FRAME,
  DEFAULT_SCHEMATIC,
  ScopeRenderer,
  currentMultiplier,
  schematicBounds,
  schematicSvg,
} from '@perun/render';
import type { Theme } from '@perun/theme';
import type { DrawSettings } from './settings.ts';

/** Scope settings stay out of anyone's saved scope defaults. */
const memoryStore: ScopeDefaultsStore = {
  getItem: () => null,
  setItem: () => undefined,
};

/** Steps per sim.step() call, and the time a frame may spend simulating (as the editor). */
const MAX_CHUNK = 1000;
const FRAME_BUDGET_MS = 30;
/** The circuit's height on screen, in CSS pixels. */
const MIN_HEIGHT = 140;
const MAX_HEIGHT = 400;
/** Height of the scope strip, when the circuit has scopes. */
const SCOPE_HEIGHT = 160;

/**
 * One circuit running on its own canvas: the engine and renderer without the editor, for a
 * circuit block in a note. Runs while `start()`ed; the block stops it when scrolled away.
 */
export class CircuitPlayer {
  readonly circuit = new Circuit();
  private readonly renderer: CircuitRenderer;
  private readonly scopes: ScopeRenderer;
  private raf = 0;
  private last = 0;
  private owed = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  /** The simulation advances; when false the last frame stays on screen. */
  running = true;

  private readonly text: string;
  private theme: Theme;
  private draw: DrawSettings;

  /** Throws when the circuit text can't be read. */
  constructor(canvas: HTMLCanvasElement, text: string, theme: Theme, draw: DrawSettings) {
    this.text = text;
    this.theme = theme;
    this.draw = draw;
    this.renderer = new CircuitRenderer(canvas, theme);
    this.scopes = new ScopeRenderer(canvas, theme);
    this.circuit.setScopeUi({
      createImage: (w, h) => this.scopes.createImage(w, h),
      defaultsStore: memoryStore,
    });
    this.circuit.read(text);
    this.circuit.scopes.look = theme.style.scopeLook;
    this.renderer.setElements(this.circuit.elements);
  }

  get hasScopes(): boolean {
    return this.circuit.scopes.scopeCount > 0;
  }

  /** The canvas height that shows the whole circuit at `width`, plus its scopes. */
  heightFor(width: number): number {
    const b = schematicBounds(this.circuit.elements);
    let h = MIN_HEIGHT;
    if (b !== null && b.x2 > b.x1) h = Math.round((width * (b.y2 - b.y1)) / (b.x2 - b.x1));
    h = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h));
    return h + (this.hasScopes ? SCOPE_HEIGHT : 0);
  }

  setTheme(theme: Theme, draw: DrawSettings): void {
    this.theme = theme;
    this.draw = draw;
    this.renderer.setTheme(theme);
    this.scopes.setTheme(theme);
    this.circuit.scopes.look = theme.style.scopeLook;
    this.circuit.scopes.resetGraphs();
    this.frame(performance.now(), false);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.renderer.resize(width, height, dpr);
    this.renderer.circuitHeight = this.circuitHeight();
    this.renderer.fit();
    this.frame(performance.now(), false);
  }

  private circuitHeight(): number {
    return this.hasScopes ? Math.max(0, this.height - SCOPE_HEIGHT) : this.height;
  }

  /** Draw every animation frame until stop(); `animate` false draws one still frame. */
  start(animate: boolean): void {
    this.stop();
    this.last = 0;
    const loop = (now: number): void => {
      if (animate) this.raf = requestAnimationFrame(loop);
      this.frame(now, this.running);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Start the circuit again from the file (upstream Reset). */
  reset(): void {
    this.circuit.read(this.text);
    this.circuit.scopes.look = this.theme.style.scopeLook;
    this.renderer.setElements(this.circuit.elements);
    this.owed = 0;
    this.frame(performance.now(), false);
  }

  private frame(now: number, step: boolean): void {
    if (this.width === 0) return;
    const elapsed = this.last === 0 ? 0 : Math.min(now - this.last, 100);
    this.last = now;
    const sim = this.circuit.sim;
    if (step && sim.stopMessage === null) {
      // as the editor's frame loop: the circuit's speed, with a time budget per frame
      this.owed += (160 * this.circuit.getIterCount() * elapsed) / 1000;
      if (sim.analyzeFlag && this.owed < 1) this.owed = 1;
      const begin = performance.now();
      while (this.owed >= 1) {
        const k = Math.min(Math.floor(this.owed), MAX_CHUNK);
        sim.step(k);
        this.owed -= k;
        if (sim.stopMessage !== null || sim.pauseRequested) break;
        if (performance.now() - begin > FRAME_BUDGET_MS) {
          this.owed = 0;
          break;
        }
      }
      if (sim.pauseRequested) {
        sim.pauseRequested = false;
        this.running = false;
      }
    } else if (sim.analyzeFlag) sim.step(0);

    const o = this.circuit.options;
    const ch = this.circuitHeight();
    this.renderer.circuitHeight = ch;
    this.renderer.render({
      ...DEFAULT_FRAME,
      ...this.draw.frame,
      running: step,
      currentMult: step
        ? currentMultiplier(elapsed, o.currentBar, this.draw.conventionalCurrent)
        : 0,
      showDots: (o.flags & OptionFlag.DOTS) !== 0,
      voltageColors: (o.flags & OptionFlag.HIDE_VOLTAGE_COLORS) === 0,
      showValues: (o.flags & OptionFlag.HIDE_VALUES) === 0,
      voltageRange: o.voltageRange,
      gridSize: sim.gridSize,
    });
    if (this.hasScopes) {
      const mgr = this.circuit.scopes;
      const area = { x: 0, y: ch, width: this.width, height: this.height - ch };
      // nothing in a note can be clicked: no card buttons, and every column shown (no tabs)
      mgr.compact = false;
      mgr.cardButtons = false;
      mgr.setupScopes(area, 0);
      this.scopes.render(mgr, { area, info: [], splitterHot: false }, this.dpr);
    }
  }

  /** A still picture of the circuit as it is now, for printing and PDF export. */
  svg(): string | null {
    const o = this.circuit.options;
    return schematicSvg(this.circuit.elements, this.theme, {
      ...DEFAULT_SCHEMATIC,
      ...this.draw.frame,
      showValues: (o.flags & OptionFlag.HIDE_VALUES) === 0,
      voltageRange: o.voltageRange,
    });
  }
}
