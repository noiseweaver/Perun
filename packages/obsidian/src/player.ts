// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { SwitchElm, switchRect, type ScopeDefaultsStore } from '@perun/elements';
import { sliderEntries, type SliderEntry } from '@perun/app/sliders';
import { Circuit, OptionFlag } from '@perun/format';
import { frameState, type DrawingSettings, type FrameInputs } from '@perun/app/drawing';
import { StepClock } from '@perun/app/stepClock';
import {
  CircuitRenderer,
  DEFAULT_SCHEMATIC,
  ScopeRenderer,
  schematicSvg,
  onMathReady,
  placeUndocked,
  preloadMathFor,
  type UndockedScopeItem,
} from '@perun/render';
import type { Theme } from '@perun/theme';

/** Scope settings stay out of anyone's saved scope defaults. */
const memoryStore: ScopeDefaultsStore = {
  getItem: () => null,
  setItem: () => undefined,
};

/** The circuit's height on screen, in CSS pixels. */
const MIN_HEIGHT = 140;
const MAX_HEIGHT = 400;
/** Height of the scope strip, when the circuit has scopes. */
const SCOPE_HEIGHT = 160;
/** Distance (CSS px) round a switch that still counts as clicking it, for fingers. */
const SWITCH_PAD = 4;

/**
 * One circuit running on its own canvas: the engine and renderer without the editor, for a
 * circuit block in a note. Runs while `start()`ed; the block stops it when scrolled away.
 */
export class CircuitPlayer {
  readonly circuit = new Circuit();
  private readonly renderer: CircuitRenderer;
  private readonly scopes: ScopeRenderer;
  private raf = 0;
  private animating = false;
  private last = 0;
  /** The editor's pacing (packages/app/src/stepClock.ts). */
  private readonly clock = new StepClock();
  private width = 0;
  private height = 0;
  private dpr = 1;
  /** The simulation advances; when false the last frame stays on screen. */
  running = true;

  private readonly text: string;
  private theme: Theme;
  private draw: DrawingSettings;

  /** Throws when the circuit text can't be read. */
  constructor(canvas: HTMLCanvasElement, text: string, theme: Theme, draw: DrawingSettings) {
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
    // a still block showed its formulas' source until MathJax arrived: draw it again
    preloadMathFor(this.circuit.elements);
    onMathReady(() => {
      if (!this.animating) this.frame(performance.now(), false);
    });
  }

  get hasScopes(): boolean {
    return this.circuit.scopes.scopeCount > 0;
  }

  /** The canvas height that shows the whole circuit at `width`, plus its scopes. */
  heightFor(width: number): number {
    // the whole circuit, undocked scope cards included
    const b = this.renderer.circuitBounds();
    let h = MIN_HEIGHT;
    if (b !== null && b.x2 > b.x1) h = Math.round((width * (b.y2 - b.y1)) / (b.x2 - b.x1));
    h = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h));
    return h + (this.hasScopes ? SCOPE_HEIGHT : 0);
  }

  /** The records the circuit text had that couldn't be read and were left out. */
  get skipped(): number {
    return this.circuit.issues.length;
  }

  /**
   * The switch (toggle, push button, logic input) at a point on the canvas in CSS pixels, found
   * by the rectangle the editor flips it by (upstream doSwitch), or null.
   */
  switchAt(x: number, y: number): SwitchElm | null {
    const vp = this.renderer.viewport;
    const p = vp.toCircuit(x, y);
    const pad = SWITCH_PAD / Math.max(vp.scale, 1e-6);
    for (const e of this.circuit.elements) {
      if (!(e instanceof SwitchElm)) continue;
      const r = switchRect(e);
      if (p.x >= r.x1 - pad && p.x <= r.x2 + pad && p.y >= r.y1 - pad && p.y <= r.y2 + pad)
        return e;
    }
    return null;
  }

  /** Flip a switch (a push button: press or let go) and analyze the circuit again. */
  toggle(s: SwitchElm): void {
    s.toggle();
    this.circuit.sim.analyzeFlag = true;
    if (!this.animating) this.frame(performance.now(), false);
  }

  /** The circuit's sliders, as the editor's slider panel shows them. */
  sliders(): SliderEntry[] {
    return sliderEntries(this.circuit.elements, this.circuit.adjustables, () => {
      this.circuit.sim.analyzeFlag = true;
    });
  }

  /** Simulation speed (0 to 259) and current speed (1 to 99), as the circuit file stores them. */
  get speed(): number {
    return this.circuit.options.speed;
  }
  set speed(v: number) {
    this.circuit.options.speed = v;
  }
  get currentSpeed(): number {
    return this.circuit.options.currentBar;
  }
  set currentSpeed(v: number) {
    this.circuit.options.currentBar = v;
  }

  setTheme(theme: Theme, draw: DrawingSettings): void {
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
    this.animating = animate;
    this.last = 0;
    const loop = (now: number): void => {
      if (animate) this.raf = requestAnimationFrame(loop);
      this.frame(now, this.running);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.animating = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Start the circuit again from the file (upstream Reset). */
  reset(): void {
    this.circuit.read(this.text);
    this.circuit.scopes.look = this.theme.style.scopeLook;
    this.renderer.setElements(this.circuit.elements);
    this.clock.reset();
    this.frame(performance.now(), false);
  }

  private frame(now: number, step: boolean): void {
    if (this.width === 0) return;
    const elapsed = this.last === 0 ? 0 : Math.min(now - this.last, 100);
    this.last = now;
    const sim = this.circuit.sim;
    if (step && sim.stopMessage === null) {
      // as the editor's frame loop: the circuit's speed, with a time budget per frame
      const run = this.clock.advance(sim, 160 * this.circuit.getIterCount(), elapsed);
      if (run.paused) this.running = false;
    } else if (sim.analyzeFlag) sim.step(0);

    const ch = this.circuitHeight();
    this.renderer.circuitHeight = ch;
    this.renderer.render(frameState(this.draw, this.inputs(step, elapsed)));
    const mgr = this.circuit.scopes;
    // nothing in a note can be clicked: no card buttons, and every column shown (no tabs)
    mgr.compact = false;
    mgr.cardButtons = false;
    this.scopes.renderUndocked(mgr, this.layoutUndocked(), this.width, ch, this.dpr);
    if (this.hasScopes) {
      const area = { x: 0, y: ch, width: this.width, height: this.height - ch };
      mgr.setupScopes(area, 0);
      this.scopes.render(mgr, { area, info: [], splitterHot: false }, this.dpr);
    }
  }

  /** This frame's state from the circuit's own options (the editor keeps them in its menus). */
  private inputs(running: boolean, elapsed: number): FrameInputs {
    const o = this.circuit.options;
    return {
      running,
      elapsed,
      currentSpeed: o.currentBar,
      showDots: (o.flags & OptionFlag.DOTS) !== 0,
      voltageColors: (o.flags & OptionFlag.HIDE_VOLTAGE_COLORS) === 0,
      showValues: (o.flags & OptionFlag.HIDE_VALUES) === 0,
      voltageRange: o.voltageRange,
      gridSize: this.circuit.sim.gridSize,
    };
  }

  /** Undocked scopes: each card where its rectangle is on screen, with its leader line. */
  private layoutUndocked(): UndockedScopeItem[] {
    const vp = this.renderer.viewport;
    const cards = this.circuit.scopes.look === 'cards';
    return this.circuit
      .scopeElms()
      .map((e) => ({ scope: e.elmScope, target: placeUndocked(e, vp, cards), active: false }));
  }

  /** A still picture of the circuit as it is now, for printing and PDF export. */
  svg(): string | null {
    const f = frameState(this.draw, this.inputs(false, 0));
    return schematicSvg(this.circuit.elements, this.theme, {
      ...DEFAULT_SCHEMATIC,
      showValues: f.showValues,
      voltageRange: f.voltageRange,
      euroResistors: f.euroResistors,
      euroGates: f.euroGates,
      showOhm: f.showOhm,
      textFont: f.textFont,
      junctionDots: f.junctionDots,
      valueScale: f.valueScale,
    });
  }
}
