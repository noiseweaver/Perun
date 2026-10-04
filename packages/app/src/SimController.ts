// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Frame pacing follows CircuitJS1 SimulationManager.runCircuit and UIManager.updateCircuit
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032:
// 160 * iterCount steps per second, at most about 50 ms of simulation per frame.

import {
  SwitchElm,
  VoltageElm,
  getTimeText,
  getUnitText,
  showFormat,
  switchRect,
  viewFor,
  type CircuitElm,
  type EditInfo,
  type Rect,
  type Scope,
  type ScopeDefaultsStore,
  type ScopeManager,
  type ScopeRect,
} from '@circuitjs-next/elements';
import { Circuit, OptionFlag } from '@circuitjs-next/format';
import {
  CircuitRenderer,
  ScopeRenderer,
  currentMultiplier,
  type FrameState,
} from '@circuitjs-next/render';
import { BUILTIN_THEMES, DEFAULT_THEME_ID, type Theme } from '@circuitjs-next/theme';
import {
  Editor,
  MouseMode,
  NO_MODIFIERS,
  type EditorHost,
  type Modifiers,
} from './editor/Editor.ts';
import { useApp, type AppState, type EditorState } from './store.ts';

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
  readonly editor: Editor;
  private renderer: CircuitRenderer | null = null;
  /** The circuit changed since it was loaded or saved. */
  unsavedChanges = false;
  /** File name of the last save, offered again (upstream ExportAsLocalFileDialog). */
  lastFileName: string | null = null;
  private raf = 0;
  /** Mouse wheel zoom still to apply (natural log of the factor), eased in over a few frames. */
  private zoomPending = 0;
  private zoomAnchor = { x: 0, y: 0 };
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

  // ---- scopes (upstream ScopeManager and the scope parts of MouseManager) ----
  private scopeRenderer: ScopeRenderer | null = null;
  /** Share of the canvas height the scopes take (upstream scopeHeightFraction). */
  scopeHeightFraction = 0.2;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  /** Mouse position over the canvas in CSS pixels, or null when it is elsewhere. */
  private mouse: { x: number; y: number } | null = null;
  /** The mouse is on the splitter between the circuit and the scopes. */
  private splitterHot = false;
  /** Element of the scope under the mouse (highlighted on the circuit, shown in the info). */
  private scopeHoverElm: CircuitElm | null = null;
  /** Docked scope the context menu was opened on, or -1; and its selected plot. */
  menuScope = -1;
  menuPlot = -1;
  /** Scope the properties dialog edits. */
  dialogScope: Scope | null = null;

  constructor() {
    this.circuit.setScopeUi({
      createImage: (w, h) => this.scopeRenderer?.createImage(w, h) ?? null,
      defaultsStore: scopeDefaultsStore,
    });
    this.circuit.read('');
    this.editor = new Editor(this.circuit, this.makeHost());
    this.editor.history.onChange = () => this.publishEditor();
    const stored = readClipboard();
    if (stored !== null) this.editor.setClipboard(stored);
    // upstream asks before shortening the timestep for a fast source
    if (typeof window !== 'undefined') VoltageElm.confirmAdjustTimestep = (m) => window.confirm(m);
  }

  // ---- loading -----------------------------------------------------------------------------

  /**
   * Load circuit text (either upstream format) and show it. Returns false on a parse error.
   * `undoable` records it as an edit, as upstream does for files and examples opened from menus.
   */
  load(text: string, title: string, running = true, undoable = false): boolean {
    const history = this.editor.history;
    if (undoable) history.begin('Open');
    else history.cancel();
    try {
      this.circuit.read(text);
    } catch (e) {
      this.circuit.read('');
      useApp.setState({
        error: `Could not read the circuit: ${e instanceof Error ? e.message : String(e)}`,
      });
      this.afterLoad(title, false);
      if (undoable) history.touch();
      history.commit();
      return false;
    }
    useApp.setState({ error: null });
    this.afterLoad(title, running);
    if (undoable) {
      history.touch();
      history.commit();
    }
    this.unsavedChanges = false;
    return true;
  }

  private afterLoad(title: string, running: boolean, fit = true): void {
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
    this.editor.circuitReplaced();
    if (fit) this.needsFit = true;
    this.resize();
    this.publishEditor(true);
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
    this.scopeRenderer = new ScopeRenderer(canvas, themeById(state.settings.themeId));
    renderer.setElements(this.circuit.elements);
    this.needsFit = true;
    this.unsubscribe = useApp.subscribe((s, prev) => this.onStore(s, prev));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.detachInput = this.attachInput(canvas);
    const loop = (now: number): void => {
      // schedule first: a bug in one frame must not stop drawing and editing for good
      this.raf = requestAnimationFrame(loop);
      try {
        this.frame(now);
      } catch (e) {
        console.error(e);
        if (useApp.getState().running) {
          useApp.setState({ running: false, error: `Internal error: ${String(e)}` });
        }
      }
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
    this.scopeRenderer = null;
  }

  private resize(): void {
    const r = this.renderer;
    if (!r) return;
    const rect = r.canvas.getBoundingClientRect();
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.dpr = window.devicePixelRatio || 1;
    r.resize(rect.width, rect.height, this.dpr);
    r.circuitHeight = this.circuitHeight();
    if (this.needsFit && rect.width > 0) {
      r.fit();
      this.needsFit = false;
    }
  }

  private onStore(s: AppState, prev: AppState): void {
    if (s.settings.themeId !== prev.settings.themeId) {
      this.renderer?.setTheme(themeById(s.settings.themeId));
      this.scopeRenderer?.setTheme(themeById(s.settings.themeId));
      // X-Y plot images are drawn in theme colors as the simulation runs
      this.circuit.scopes.resetGraphs();
    }
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
    this.easeZoom();
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
        textFont: state.settings.textFont,
        junctionDots: state.settings.junctionDots,
        gridSize: sim.gridSize,
      };
      r.circuitHeight = this.circuitHeight();
      r.render(frame);
      this.drawScopes();
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

  // ---- editor host ---------------------------------------------------------------------------

  private makeHost(): EditorHost {
    return {
      bbox: (e) => viewFor(e)?.bbox(e) ?? null,
      circuitChanged: () => this.circuitChanged(),
      selectionChanged: () => this.publishEditor(),
      restore: (xml) => this.restore(xml),
      visibleArea: () => {
        const r = this.renderer;
        if (!r) return { x1: 0, y1: 0, x2: 800, y2: 600 };
        const rect = r.canvas.getBoundingClientRect();
        const a = r.viewport.toCircuit(0, 0);
        const b = r.viewport.toCircuit(rect.width, rect.height);
        return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      },
    };
  }

  /** Apply part of the pending wheel zoom, so each notch glides instead of jumping. */
  private easeZoom(): void {
    if (this.zoomPending === 0 || !this.renderer) return;
    const step = Math.abs(this.zoomPending) < 0.002 ? this.zoomPending : this.zoomPending * 0.35;
    this.zoomPending -= step;
    this.renderer.viewport.zoomAt(Math.exp(step), this.zoomAnchor.x, this.zoomAnchor.y);
  }

  /** The element list or an element changed: analyze again (upstream `needAnalyze`). */
  circuitChanged(): void {
    this.circuit.sim.setElements(this.circuit.elements);
    if (this.renderer) {
      this.renderer.elementsChanged(this.circuit.elements);
      this.renderer.stopElm = null;
    }
    this.unsavedChanges = true;
    this.publishEditor();
    this.publishStatus(true);
  }

  /** Undo and redo: load a saved copy, keeping the title and the view. */
  private restore(xml: string): void {
    const title = useApp.getState().title;
    const running = useApp.getState().running;
    try {
      this.circuit.read(xml);
    } catch {
      return;
    }
    this.afterLoad(title, running, false);
  }

  /** Push editor state the UI shows into the store. */
  publishEditor(propertiesChanged = false): void {
    const ed = this.editor;
    const sel = ed.selectedElements();
    const prev = useApp.getState().editor;
    const r = this.renderer;
    if (r) {
      r.hovered = ed.mouseElm ?? this.scopeHoverElm;
      r.pending = ed.dragElm;
      r.selectionRect = ed.selectedArea;
    }
    const next: EditorState = {
      addClass: ed.mouseMode === MouseMode.ADD_ELM ? ed.addClass : null,
      selectionCount: sel.length,
      selected: sel.length === 1 ? (sel[0] ?? null) : null,
      canUndo: ed.history.canUndo,
      canRedo: ed.history.canRedo,
      canPaste: ed.hasClipboard,
      revision: prev.revision + (propertiesChanged ? 1 : 0),
    };
    if (
      next.addClass !== prev.addClass ||
      next.selectionCount !== prev.selectionCount ||
      next.selected !== prev.selected ||
      next.canUndo !== prev.canUndo ||
      next.canRedo !== prev.canRedo ||
      next.canPaste !== prev.canPaste ||
      next.revision !== prev.revision
    )
      useApp.setState({ editor: next });
  }

  // ---- scopes --------------------------------------------------------------------------------

  get scopes(): ScopeManager {
    return this.circuit.scopes;
  }

  /** Height of the circuit area in CSS pixels; the scopes, if any, take the rest. */
  circuitHeight(): number {
    const h = this.cssHeight;
    if (this.circuit.scopes.scopeCount === 0) return h;
    return h - Math.trunc(h * this.scopeHeightFraction);
  }

  /** The scope area in CSS pixels. */
  scopeArea(): ScopeRect {
    const ch = this.circuitHeight();
    return { x: 0, y: ch, width: this.cssWidth, height: this.cssHeight - ch };
  }

  /** Lay out and draw the scopes and the info text (upstream drawBottomArea). */
  private drawScopes(): void {
    const sr = this.scopeRenderer;
    if (!sr) return;
    const mgr = this.circuit.scopes;
    const before = mgr.scopeCount;
    mgr.setupScopes(this.scopeArea());
    // removing the last scope gives its room back to the circuit
    if (mgr.scopeCount !== before) mgr.setupScopes(this.scopeArea());
    mgr.dialogShowing = useApp.getState().dialog !== null;
    mgr.mouseElm = this.editor.mouseElm ?? this.scopeHoverElm;
    mgr.cursorScope = null;
    mgr.cursorTime = -1;
    const m = this.mouse;
    mgr.mouseCursorX = m?.x ?? -1;
    mgr.mouseCursorY = m?.y ?? -1;
    if (m !== null) for (const s of mgr.scopes) s.selectScope(m.x, m.y);
    sr.render(
      mgr,
      { area: this.scopeArea(), info: this.infoLines(), splitterHot: this.splitterHot },
      this.dpr,
    );
  }

  /**
   * The info text: the hovered element's getInfo (or the voltage of the hovered post), else the
   * time and time step, as upstream shows right of the scopes. Without scopes only an element's
   * info is shown; the control bar has the time.
   */
  infoLines(): string[] {
    const ed = this.editor;
    const mgr = this.circuit.scopes;
    const sim = this.circuit.sim;
    const elm = ed.mouseElm ?? this.scopeHoverElm;
    const arr: string[] = [];
    if (elm !== null) {
      if (elm === ed.mouseElm && ed.mousePost >= 0)
        arr.push('V = ' + getUnitText(elm.getPostVoltage(ed.mousePost), 'V'));
      else elm.getInfo(arr);
    } else if (mgr.scopeCount > 0) {
      arr[0] = 't = ' + getTimeText(sim.t);
      const timerate = 160 * this.circuit.getIterCount() * sim.timeStep;
      if (timerate >= 0.1) arr[0] += ' (' + showFormat(timerate) + 'x)';
      arr[1] = 'time step = ' + getTimeText(sim.timeStep);
    }
    // upstream stops at the first empty slot
    const info: string[] = [];
    for (const line of arr) {
      if (typeof line !== 'string') break;
      info.push(line);
    }
    if (mgr.scopeCount > 0) {
      const bad = this.renderer?.badConnectionCount ?? 0;
      if (bad > 0) info.push(`${bad} bad connection${bad === 1 ? '' : 's'}`);
    }
    return info;
  }

  /** Index of the docked scope at a canvas point, or -1. */
  scopeAt(x: number, y: number): number {
    const mgr = this.circuit.scopes;
    if (y < this.circuitHeight()) return -1;
    return mgr.scopes.findIndex(
      (s) =>
        x >= s.rect.x &&
        y >= s.rect.y &&
        x < s.rect.x + s.rect.width &&
        y < s.rect.y + s.rect.height,
    );
  }

  /** Hover over the scope area: select the scope and highlight what it shows (upstream). */
  private hoverScopes(x: number, y: number): void {
    const mgr = this.circuit.scopes;
    const i = this.scopeAt(x, y);
    mgr.scopeSelected = i;
    const s = i >= 0 ? mgr.scopes[i] : undefined;
    this.scopeHoverElm = s?.getElm() ?? null;
    const r = this.renderer;
    if (r) {
      const roles = new Map<CircuitElm, string>();
      s?.addScopePlotRoles(roles);
      r.scopeHighlights = roles;
    }
  }

  private clearScopeHover(): void {
    const mgr = this.circuit.scopes;
    mgr.scopeSelected = -1;
    this.scopeHoverElm = null;
    if (this.renderer) this.renderer.scopeHighlights = new Map();
  }

  /** Run a scope change as one undoable edit (upstream pushes an undo item first). */
  scopeCommand(label: string, fn: () => unknown): void {
    this.editor.history.record(label, () => {
      fn();
      return true;
    });
    this.unsavedChanges = true;
  }

  /** Element menu: View in New Scope. */
  viewInScope(elm: CircuitElm): void {
    this.scopeCommand('View in scope', () => this.circuit.scopes.viewInScope(elm));
  }

  /** Element menu: Add to Existing Scope n. */
  addToScope(n: number, elm: CircuitElm): void {
    this.scopeCommand('Add to scope', () => this.circuit.scopes.addToScope(n, elm));
  }

  /** Scope popup menu commands (upstream CommandManager "scopepop"). */
  scopeMenu(item: string): void {
    const mgr = this.circuit.scopes;
    const i = this.menuScope;
    const s = mgr.scopes[i];
    if (s === undefined) return;
    if (item === 'properties') {
      this.openScopeProperties(s);
      return;
    }
    if (item === 'exportcsv') {
      const csv = s.exportCSV();
      if (csv !== null) downloadText('circuitjs-scope.csv', csv, 'text/csv');
      return;
    }
    this.scopeCommand('Scope', () => {
      switch (item) {
        case 'remove':
          s.setElm(null); // setupScopes() removes it
          break;
        case 'removeplot':
          s.removePlot(this.menuPlot);
          break;
        case 'maxscale':
          s.toggleMaxScale();
          break;
        case 'stack':
          mgr.stackScope(i);
          break;
        case 'unstack':
          mgr.unstackScope(i);
          break;
        case 'combine':
          mgr.combineScope(i);
          break;
        case 'selecty':
          s.selectY();
          break;
        case 'reset':
          s.resetGraph(true);
          break;
      }
    });
  }

  /** Scopes menu: stack, unstack, combine or separate all. */
  allScopes(item: 'stackAll' | 'unstackAll' | 'combineAll' | 'separateAll'): void {
    const mgr = this.circuit.scopes;
    this.scopeCommand('Scopes', () => mgr[item]());
  }

  openScopeProperties(s: Scope): void {
    this.dialogScope = s;
    useApp.setState({ dialog: 'scopeProperties' });
  }

  // ---- commands ------------------------------------------------------------------------------

  undo(): void {
    this.editor.history.undo();
  }

  redo(): void {
    this.editor.history.redo();
  }

  copy(menuElm: CircuitElm | null = this.editor.keyTarget()): void {
    const s = this.editor.copySelected(menuElm);
    if (s !== null) writeClipboard(s);
    this.publishEditor();
  }

  cut(menuElm: CircuitElm | null = this.editor.keyTarget()): void {
    const s = this.editor.cut(menuElm);
    if (s !== null) writeClipboard(s);
    this.publishEditor();
  }

  paste(): void {
    // another tab may have copied something since (upstream reads its storage on mouse down)
    const stored = readClipboard();
    if (stored !== null) this.editor.setClipboard(stored);
    this.editor.paste();
  }

  /** Apply a property panel change to an element (upstream EditDialog apply). */
  applyEdit(e: CircuitElm, n: number, ei: EditInfo): void {
    this.editor.history.record('Edit', () => e.setEditValue(n, ei));
    this.circuitChanged();
  }

  /** Simulation settings (upstream EditOptions time step fields), undoable, then re-analyze. */
  setTimeStep(maxTimeStep: number, adjust: boolean, minTimeStep: number): void {
    const sim = this.circuit.sim;
    this.editor.history.record('Time step', () => {
      if (
        sim.maxTimeStep === maxTimeStep &&
        sim.adjustTimeStep === adjust &&
        sim.minTimeStep === minTimeStep
      )
        return false;
      sim.maxTimeStep = maxTimeStep;
      sim.adjustTimeStep = adjust;
      sim.minTimeStep = minTimeStep;
      return true;
    });
    this.circuitChanged();
  }

  /** The circuit as upstream saves it. */
  saveText(): string {
    return this.circuit.dumpXml();
  }

  /** Start a new blank circuit (upstream "New Blank Circuit" loads blank.txt). */
  newCircuit(): void {
    this.load('$ 1 5.0E-6 10 50 5.0\n', 'Untitled', true, true);
    this.lastFileName = null;
  }

  // ---- input: editing, pan, zoom ------------------------------------------------------------

  private attachInput(canvas: HTMLCanvasElement): () => void {
    const ed = this.editor;
    let pan: { x: number; y: number; id: number } | null = null;
    let gestureId: number | null = null;
    const touches = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; mx: number; my: number } | null = null;
    // touch long press: opens the context menu, as a right click does with a mouse
    let press: { timer: number; id: number; x: number; y: number; cx: number; cy: number } | null =
      null;
    const cancelPress = (): void => {
      if (press !== null) window.clearTimeout(press.timer);
      press = null;
    };
    /** End the gesture in progress without it editing anything more. */
    const abandonGesture = (id: number): void => {
      if (gestureId !== id) return;
      gestureId = null;
      pan = null;
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      ed.pointerUp(NO_MODIFIERS);
      this.publishEditor();
    };

    const local = (e: MouseEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const grid = (p: { x: number; y: number }): { x: number; y: number } => {
      const r = this.renderer;
      const c = r ? r.viewport.toCircuit(p.x, p.y) : p;
      // upstream inverseTransform truncates to int
      return { x: Math.trunc(c.x), y: Math.trunc(c.y) };
    };
    const mods = (e: MouseEvent | KeyboardEvent): Modifiers => ({
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
    });
    const updateCursor = (gx: number, gy: number): void => {
      let cursor = 'default';
      const m = ed.mouseElm;
      if (pan !== null) cursor = 'grabbing';
      else if (ed.mouseMode === MouseMode.ADD_ELM) cursor = 'crosshair';
      else if (m instanceof SwitchElm && inRect(switchRect(m), gx, gy)) cursor = 'pointer';
      else if (m !== null) cursor = ed.mousePost >= 0 ? 'crosshair' : 'move';
      canvas.style.cursor = cursor;
    };
    const pinchState = (): { dist: number; mx: number; my: number } | null => {
      const pts = [...touches.values()];
      if (pts.length < 2) return null;
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };

    // scope area gestures: dragging the splitter, or a press in a scope (drag-to-measure)
    let split: number | null = null;
    let scopeGesture: number | null = null;
    const mgr = (): ScopeManager => this.circuit.scopes;
    const onSplitter = (p: { x: number; y: number }): boolean =>
      mgr().scopeCount > 0 && Math.abs(p.y - this.circuitHeight()) <= 4;
    const inScopes = (p: { x: number; y: number }): boolean =>
      mgr().scopeCount > 0 && p.y > this.circuitHeight();
    const scopeDown = (e: PointerEvent, p: { x: number; y: number }): boolean => {
      if (onSplitter(p)) {
        split = e.pointerId;
      } else if (inScopes(p)) {
        const m = mgr();
        m.mouseCursorX = p.x;
        m.mouseCursorY = p.y;
        this.hoverScopes(p.x, p.y);
        const s = m.scopes[m.scopeSelected];
        if (s !== undefined && !m.dialogShowing && s.cursorInSettingsWheel()) {
          this.openScopeProperties(s);
          return true;
        }
        if (!m.dialogShowing) for (const sc of m.scopes) sc.mousePressed(p.x, p.y);
        // alt-drag or middle-drag moves the selected plot in manual scale mode
        if (
          !m.dialogShowing &&
          (e.button === 1 || (e.button === 0 && e.altKey)) &&
          s !== undefined
        ) {
          s.selectScope(p.x, p.y);
          s.startDragPlotY(p.x, p.y);
        }
        scopeGesture = e.pointerId;
      } else return false;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone
      }
      e.preventDefault();
      return true;
    };
    const endScopeGesture = (): void => {
      const m = mgr();
      m.dragStartTime = -1;
      if (m.draggingPlotYScope !== null) m.draggingPlotYScope.draggingPlotY = false;
      m.draggingPlotYScope = null;
      scopeGesture = null;
      split = null;
    };

    const down = (e: PointerEvent): void => {
      if (e.button === 2) return; // the context menu handles it
      canvas.focus({ preventScroll: true });
      const p = local(e);
      this.mouse = p;
      if (!(e.pointerType === 'touch' && touches.size > 0) && scopeDown(e, p)) return;
      if (e.pointerType === 'touch') {
        // a primary touch starts a new gesture: no other finger is down, so forget any touch
        // whose end never reached the canvas (it would turn this drag into a pinch zoom)
        if (e.isPrimary) {
          touches.clear();
          pinch = null;
        }
        touches.set(e.pointerId, p);
        if (touches.size === 2) {
          // second finger: pinch zoom and two-finger pan instead of editing
          cancelPress();
          if (ed.isDragging) ed.leave();
          pan = null;
          gestureId = null;
          pinch = pinchState();
          return;
        }
        if (touches.size > 2) return;
      }
      if (e.button !== 0 && e.button !== 1) return;
      if (this.renderer) this.renderer.stopElm = null;
      const g = grid(p);
      const touchPan =
        e.pointerType === 'touch' &&
        ed.mouseMode === MouseMode.SELECT &&
        ed.pick(g.x, g.y).elm === null;
      const res = ed.pointerDown(g.x, g.y, mods(e), e.button === 1 || touchPan);
      if (res === 'pan') pan = { x: p.x, y: p.y, id: e.pointerId };
      gestureId = e.pointerId;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone (released before this handler ran)
      }
      if (e.pointerType === 'touch' && ed.mouseMode === MouseMode.SELECT) {
        cancelPress();
        const id = e.pointerId;
        press = {
          id,
          x: p.x,
          y: p.y,
          cx: e.clientX,
          cy: e.clientY,
          timer: window.setTimeout(() => {
            const at = press;
            press = null;
            if (at === null) return;
            abandonGesture(id);
            canvas.dispatchEvent(
              new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: at.cx,
                clientY: at.cy,
                button: 2,
              }),
            );
          }, LONG_PRESS_MS),
        };
      }
      this.publishEditor();
      updateCursor(g.x, g.y);
      e.preventDefault();
    };
    const move = (e: PointerEvent): void => {
      const r = this.renderer;
      if (!r) return;
      const p = local(e);
      this.mouse = p;
      if (split === e.pointerId) {
        const f = 1 - p.y / Math.max(1, this.cssHeight);
        this.scopeHeightFraction = Math.min(0.9, Math.max(0.1, f));
        return;
      }
      if (scopeGesture === e.pointerId) {
        mgr().draggingPlotYScope?.dragPlotY(p.y);
        this.hoverScopes(p.x, p.y);
        return;
      }
      if (gestureId === null && pan === null && pinch === null) {
        this.splitterHot = onSplitter(p);
        if (this.splitterHot || inScopes(p)) {
          if (ed.mouseElm !== null) ed.leave();
          this.hoverScopes(p.x, p.y);
          const m = mgr();
          const s = m.scopes[m.scopeSelected];
          m.mouseCursorX = p.x;
          m.mouseCursorY = p.y;
          canvas.style.cursor = this.splitterHot
            ? 'ns-resize'
            : s !== undefined && s.cursorInSettingsWheel()
              ? 'pointer'
              : 'default';
          this.publishEditor();
          return;
        }
        if (this.scopeHoverElm !== null || mgr().scopeSelected >= 0) this.clearScopeHover();
      }
      if (
        press !== null &&
        press.id === e.pointerId &&
        Math.hypot(p.x - press.x, p.y - press.y) > LONG_PRESS_SLOP
      )
        cancelPress();
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
        touches.set(e.pointerId, p);
        if (pinch !== null) {
          const now = pinchState();
          if (now !== null) {
            r.viewport.zoomAt(now.dist / pinch.dist, now.mx, now.my);
            r.viewport.pan(now.mx - pinch.mx, now.my - pinch.my);
            pinch = now;
          }
          return;
        }
      }
      if (pan !== null && pan.id === e.pointerId) {
        r.viewport.pan(p.x - pan.x, p.y - pan.y);
        pan.x = p.x;
        pan.y = p.y;
        return;
      }
      const g = grid(p);
      if (ed.isDragging && gestureId === e.pointerId) ed.pointerDrag(g.x, g.y, mods(e));
      else if (!ed.isDragging) ed.hover(g.x, g.y);
      this.publishEditor();
      updateCursor(g.x, g.y);
    };
    const up = (e: PointerEvent): void => {
      if (split === e.pointerId || scopeGesture === e.pointerId) {
        endScopeGesture();
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        return;
      }
      if (press !== null && press.id === e.pointerId) cancelPress();
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
      if (gestureId !== e.pointerId) return;
      gestureId = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (pan !== null) {
        pan = null;
        ed.pointerUp(mods(e));
      } else ed.pointerUp(mods(e));
      this.publishEditor();
      const g = grid(local(e));
      updateCursor(g.x, g.y);
    };
    const leave = (e: PointerEvent): void => {
      if (gestureId !== null || split !== null || scopeGesture !== null) return; // captured
      this.mouse = null;
      this.splitterHot = false;
      this.clearScopeHover();
      if (e.pointerType !== 'mouse') return;
      ed.leave();
      this.publishEditor();
    };
    // A trackpad's two-finger swipe pans and its pinch (which browsers send with ctrlKey) zooms;
    // a mouse wheel zooms, as upstream's does, and pans sideways with shift held.
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      const r = this.renderer;
      if (!r) return;
      const p = local(e);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (inScopes(p)) {
        // the wheel over a scope changes its time scale (about one step per notch)
        const i = this.scopeAt(p.x, p.y);
        if (i >= 0) mgr().scopes[i]?.onMouseWheel(dy / 16);
        return;
      }
      if (e.ctrlKey || e.metaKey) r.viewport.zoomAt(Math.exp(-dy * 0.01), p.x, p.y);
      // some browsers turn shift+wheel into deltaX themselves, others leave it in deltaY
      else if (e.shiftKey) r.viewport.pan(-(dx !== 0 ? dx : dy), 0);
      else if (isMouseWheel(e)) {
        // about 8% per notch (100 px in Chrome, 3 lines in Firefox), eased in by frame()
        const notches = e.deltaMode === 1 ? e.deltaY / 3 : dy / 100;
        this.zoomPending -= notches * WHEEL_ZOOM_PER_NOTCH;
        this.zoomAnchor = p;
      } else r.viewport.pan(-dx, -dy);
    };
    const contextMenu = (e: MouseEvent): void => {
      // the browser's own long-press menu event: same as ours, so the timer is not needed
      if (press !== null) {
        const id = press.id;
        cancelPress();
        abandonGesture(id);
      }
      const lp = local(e);
      this.menuScope = -1;
      if (inScopes(lp)) {
        const i = this.scopeAt(lp.x, lp.y);
        const s = mgr().scopes[i];
        this.menuElm = null;
        if (s !== undefined && s.canMenu()) {
          this.menuScope = i;
          this.menuPlot = s.selectedPlot;
        }
        this.publishEditor();
        return;
      }
      // pick what is under the mouse now (a touch long-press has no hover before it)
      const g = grid(lp);
      ed.hover(g.x, g.y);
      this.menuElm = ed.mouseElm;
      this.menuPos = g;
      this.publishEditor();
    };
    const dblclick = (e: MouseEvent): void => {
      const lp = local(e);
      if (inScopes(lp)) {
        const s = mgr().scopes[this.scopeAt(lp.x, lp.y)];
        if (s !== undefined) this.openScopeProperties(s);
        return;
      }
      const g = grid(lp);
      const elm = ed.pick(g.x, g.y).elm;
      if (elm === null || elm instanceof SwitchElm) return;
      ed.select(elm);
      useApp.setState({ inspectorFocus: useApp.getState().inspectorFocus + 1 });
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', contextMenu);
    canvas.addEventListener('dblclick', dblclick);
    return () => {
      cancelPress();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('contextmenu', contextMenu);
      canvas.removeEventListener('dblclick', dblclick);
    };
  }

  /** Element the context menu was opened on, and where (circuit coordinates). */
  menuElm: CircuitElm | null = null;
  menuPos: { x: number; y: number } = { x: 0, y: 0 };

  /** Flip a switch and have the circuit analyzed again (upstream `doSwitch`). */
  toggleSwitch(s: SwitchElm): void {
    this.editor.toggleSwitch(s);
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

  /** Circuit coordinates of a page point, or null when it is not over the canvas. */
  clientToCircuit(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = this.renderer;
    if (!r) return null;
    const rect = r.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    const c = r.viewport.toCircuit(x, y);
    return { x: Math.trunc(c.x), y: Math.trunc(c.y) };
  }

  /** Current theme, for palette previews. */
  get theme(): Theme {
    return themeById(useApp.getState().settings.themeId);
  }

  /** Screen position (CSS px, canvas relative) of a circuit point, for tests. */
  toScreen(x: number, y: number): { x: number; y: number } | null {
    return this.renderer?.viewport.toScreen(x, y) ?? null;
  }
}

/** Natural log of the zoom factor for one mouse wheel notch. */
const WHEEL_ZOOM_PER_NOTCH = 0.08;

/**
 * Whether a wheel event comes from a mouse wheel rather than a trackpad. Browsers don't say, so
 * this goes by the usual signs: a wheel scrolls by lines (Firefox) or in notches of 120 on the
 * legacy wheelDelta, and only vertically.
 */
function isMouseWheel(e: WheelEvent): boolean {
  if (e.deltaMode === 1) return true;
  if (e.deltaX !== 0) return false;
  const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY ?? 0;
  return legacy !== 0 && legacy % 120 === 0;
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
}

/** How long a touch must stay still to open the context menu, and how far it may wander (px). */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 8;

/** Scope "Save as default" settings, in local storage as upstream (key `scopeDefaults`). */
const scopeDefaultsStore: ScopeDefaultsStore = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // storage disabled: the defaults last for this page
    }
  },
};

function downloadText(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Upstream keeps the clipboard in local storage so it survives reloads and other tabs. */
const CLIPBOARD_KEY = 'circuitClipboard';

function writeClipboard(s: string): void {
  try {
    localStorage.setItem(CLIPBOARD_KEY, s);
  } catch {
    // storage disabled: the clipboard lasts for this page
  }
}

function readClipboard(): string | null {
  try {
    return localStorage.getItem(CLIPBOARD_KEY);
  } catch {
    return null;
  }
}

export const controller = new SimController();
