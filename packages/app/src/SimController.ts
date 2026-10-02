// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Frame pacing follows CircuitJS1 SimulationManager.runCircuit and UIManager.updateCircuit
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032:
// 160 * iterCount steps per second, at most about 50 ms of simulation per frame.

import { SwitchElm, viewFor, type CircuitElm } from '@circuitjs-next/elements';
import { Circuit, OptionFlag } from '@circuitjs-next/format';
import { CircuitRenderer, currentMultiplier, type FrameState } from '@circuitjs-next/render';
import { BUILTIN_THEMES, DEFAULT_THEME_ID, type Theme } from '@circuitjs-next/theme';
import { useApp, type AppState } from './store.ts';

/** Simulation time per frame before the frame is cut short (upstream `frameTimeLimit`). */
const FRAME_BUDGET_MS = 50;
/** Steps per sim.step() call; small enough to check the clock often. */
const MAX_CHUNK = 500;
const STATUS_INTERVAL_MS = 100;

export function themeById(id: string): Theme {
  return BUILTIN_THEMES[id] ?? (BUILTIN_THEMES[DEFAULT_THEME_ID] as Theme);
}

/**
 * Owns the loaded circuit, the renderer and the animation loop. React components drive it through
 * the store and these methods; the per-frame work never goes through React.
 */
export class SimController {
  readonly circuit = new Circuit();
  private renderer: CircuitRenderer | null = null;
  private raf = 0;
  private lastFrame = 0;
  private stepsOwed = 0;
  private lastStatus = 0;
  private needsFit = true;
  private unsubscribe: (() => void) | null = null;
  private detachInput: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  /** For tests and debugging: frames rendered and steps run. */
  frames = 0;
  steps = 0;

  constructor() {
    this.circuit.read('');
  }

  // ---- loading -----------------------------------------------------------------------------

  /** Load circuit text (either upstream format) and show it. Returns false on a parse error. */
  load(text: string, title: string, running = true): boolean {
    try {
      this.circuit.read(text);
    } catch (e) {
      this.circuit.read('');
      useApp.setState({
        error: `Could not read the circuit: ${e instanceof Error ? e.message : String(e)}`,
      });
      this.afterLoad(title, false);
      return false;
    }
    useApp.setState({ error: null });
    this.afterLoad(title, running);
    return true;
  }

  private afterLoad(title: string, running: boolean): void {
    const o = this.circuit.options;
    useApp.setState({
      title,
      running,
      speed: o.speed,
      currentSpeed: o.currentBar,
      warnings: [...this.circuit.warnings],
      display: {
        showDots: (o.flags & OptionFlag.DOTS) !== 0,
        voltageColors: (o.flags & OptionFlag.HIDE_VOLTAGE_COLORS) === 0,
        showValues: (o.flags & OptionFlag.HIDE_VALUES) === 0,
        smallGrid: (o.flags & OptionFlag.SMALL_GRID) !== 0,
      },
    });
    this.stepsOwed = 0;
    this.lastFrame = 0;
    this.renderer?.setElements(this.circuit.elements);
    this.needsFit = true;
    this.resize();
    this.publishStatus(true);
  }

  /** Upstream reset button: restart the simulation from t = 0. */
  reset(): void {
    this.circuit.reset();
    this.stepsOwed = 0;
    if (this.renderer) this.renderer.stopElm = null;
    // upstream resumes a stopped simulation when reset at t = 0
    useApp.setState({ running: true });
    this.publishStatus(true);
  }

  setRunning(running: boolean): void {
    // a stopped simulation (convergence failure etc.) only restarts through reset
    if (running && this.circuit.sim.stopMessage !== null) return;
    this.lastFrame = 0;
    useApp.setState({ running });
  }

  fit(): void {
    this.renderer?.fit();
  }

  // ---- canvas --------------------------------------------------------------------------------

  attach(canvas: HTMLCanvasElement): void {
    this.detach();
    const state = useApp.getState();
    const renderer = new CircuitRenderer(canvas, themeById(state.settings.themeId));
    this.renderer = renderer;
    renderer.setElements(this.circuit.elements);
    this.needsFit = true;
    this.unsubscribe = useApp.subscribe((s, prev) => this.onStore(s, prev));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.detachInput = this.attachInput(canvas);
    const loop = (now: number): void => {
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  detach(): void {
    cancelAnimationFrame(this.raf);
    this.unsubscribe?.();
    this.detachInput?.();
    this.resizeObserver?.disconnect();
    this.unsubscribe = this.detachInput = this.resizeObserver = null;
    this.renderer = null;
  }

  private resize(): void {
    const r = this.renderer;
    if (!r) return;
    const rect = r.canvas.getBoundingClientRect();
    r.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    if (this.needsFit && rect.width > 0) {
      r.fit();
      this.needsFit = false;
    }
  }

  private onStore(s: AppState, prev: AppState): void {
    if (s.settings.themeId !== prev.settings.themeId)
      this.renderer?.setTheme(themeById(s.settings.themeId));
    const o = this.circuit.options;
    // only changes made through the UI; a load sets the store from the circuit, not the reverse
    if (s.speed !== prev.speed) o.speed = s.speed;
    if (s.currentSpeed !== prev.currentSpeed) o.currentBar = s.currentSpeed;
    if (s.display !== prev.display) {
      let f =
        o.flags &
        ~(
          OptionFlag.DOTS |
          OptionFlag.HIDE_VOLTAGE_COLORS |
          OptionFlag.HIDE_VALUES |
          OptionFlag.SMALL_GRID
        );
      if (s.display.showDots) f |= OptionFlag.DOTS;
      if (!s.display.voltageColors) f |= OptionFlag.HIDE_VOLTAGE_COLORS;
      if (!s.display.showValues) f |= OptionFlag.HIDE_VALUES;
      if (s.display.smallGrid) f |= OptionFlag.SMALL_GRID;
      o.flags = f;
      this.circuit.sim.gridSize = s.display.smallGrid ? 8 : 16;
    }
  }

  // ---- frame loop ----------------------------------------------------------------------------

  /** One animation frame: run the simulation for the elapsed time, then draw. */
  frame(now: number): void {
    const state = useApp.getState();
    const elapsed = this.lastFrame === 0 ? 0 : Math.min(now - this.lastFrame, 1000);
    this.lastFrame = now;
    const sim = this.circuit.sim;
    let running = state.running;

    if (running) {
      const steprate = 160 * this.circuit.getIterCount();
      this.stepsOwed += (steprate * elapsed) / 1000;
      // after loading, resetting or a switch flip, run at least one step so the drawing is current
      if (sim.analyzeFlag && this.stepsOwed < 1) this.stepsOwed = 1;
      const start = performance.now();
      while (this.stepsOwed >= 1) {
        const k = Math.min(Math.floor(this.stepsOwed), MAX_CHUNK);
        const done = sim.step(k);
        this.steps += done;
        this.stepsOwed -= k;
        if (sim.stopMessage !== null) break;
        if (performance.now() - start > FRAME_BUDGET_MS) {
          // the circuit is too slow for this speed: drop the backlog rather than spiral
          this.stepsOwed = 0;
          break;
        }
      }
      if (sim.stopMessage !== null) {
        running = false;
        useApp.setState({ running: false });
        if (this.renderer) this.renderer.stopElm = (sim.stopElm as CircuitElm | null) ?? null;
      }
    } else if (sim.analyzeFlag) {
      // analyze while paused too, so a newly loaded circuit shows its node structure
      sim.step(0);
    }

    const r = this.renderer;
    if (r) {
      const o = this.circuit.options;
      const frame: FrameState = {
        running,
        currentMult: currentMultiplier(
          elapsed,
          state.currentSpeed,
          state.settings.conventionalCurrent,
        ),
        showDots: state.display.showDots,
        voltageColors: state.display.voltageColors,
        showValues: state.display.showValues,
        voltageRange: o.voltageRange,
        euroResistors: state.settings.euroResistors,
        showOhm: state.settings.showOhm,
        gridSize: sim.gridSize,
      };
      r.render(frame);
      this.frames++;
    }
    this.publishStatus(false);
  }

  private publishStatus(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastStatus < STATUS_INTERVAL_MS) return;
    this.lastStatus = now;
    const sim = this.circuit.sim;
    useApp.setState({
      status: {
        t: sim.t,
        timeStep: sim.timeStep,
        stopMessage: sim.stopMessage,
        badConnections: this.renderer?.badConnectionCount ?? 0,
      },
    });
  }

  // ---- input: pan, zoom, hover, switches ----------------------------------------------------

  private attachInput(canvas: HTMLCanvasElement): () => void {
    let drag: { x: number; y: number; moved: boolean; id: number } | null = null;
    let held: SwitchElm | null = null;
    const local = (e: MouseEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const down = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      const p = local(e);
      const elm = this.renderer?.elementAt(p.x, p.y) ?? null;
      if (elm instanceof SwitchElm) {
        this.toggleSwitch(elm);
        if (elm.momentary) held = elm;
        return;
      }
      drag = { x: p.x, y: p.y, moved: false, id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent): void => {
      const r = this.renderer;
      if (!r) return;
      const p = local(e);
      if (drag) {
        r.viewport.pan(p.x - drag.x, p.y - drag.y);
        drag.x = p.x;
        drag.y = p.y;
        drag.moved = true;
        canvas.style.cursor = 'grabbing';
        return;
      }
      const elm = r.elementAt(p.x, p.y);
      r.hovered = elm;
      canvas.style.cursor = elm instanceof SwitchElm ? 'pointer' : 'default';
    };
    const up = (e: PointerEvent): void => {
      if (held) {
        // a push switch springs back on release (upstream SwitchElm.mouseUp)
        this.toggleSwitch(held);
        held = null;
      }
      if (drag && drag.id === e.pointerId) {
        canvas.releasePointerCapture(e.pointerId);
        drag = null;
        canvas.style.cursor = 'default';
      }
    };
    const leave = (): void => {
      if (this.renderer) this.renderer.hovered = null;
    };
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      const p = local(e);
      this.renderer?.viewport.zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('wheel', wheel);
    };
  }

  /** Flip a switch and have the circuit analyzed again (upstream `doSwitch`). */
  toggleSwitch(s: SwitchElm): void {
    s.toggle();
    this.circuit.sim.analyzeFlag = true;
    this.renderer?.refreshPosts();
  }

  /** Elements under a canvas point, for tests. */
  elementAt(x: number, y: number): CircuitElm | null {
    return this.renderer?.elementAt(x, y) ?? null;
  }

  /** Screen position (CSS px, canvas relative) of an element's box centre, for tests. */
  elementCenter(e: CircuitElm): { x: number; y: number } | null {
    const r = this.renderer;
    const v = viewFor(e);
    if (!r || !v) return null;
    const b = v.bbox(e);
    return r.viewport.toScreen((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2);
  }
}

export const controller = new SimController();
