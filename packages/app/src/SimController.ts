// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Frame pacing follows CircuitJS1 SimulationManager.runCircuit and UIManager.updateCircuit
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032:
// 160 * iterCount steps per second, at most about 50 ms of simulation per frame.

import {
  INFO_WIDTH,
  MAX_SCOPES,
  ScopeElm,
  SwitchElm,
  UNITS_A,
  UNITS_V,
  VAL_CURRENT,
  AudioOutputElm,
  CustomCompositeElm,
  type CustomCompositeModel,
  layoutNewModel,
  modelsFor,
  preservePinLayout,
  modelEditor,
  type ModelEditRequest,
  DataRecorderElm,
  VAL_VOLTAGE,
  VoltageElm,
  cardHitTest,
  cardPlotRect,
  constructElement,
  getTimeText,
  getUnitText,
  showFormat,
  withFixedWidthValues,
  Adjustable,
  PotElm,
  VarRailElm,
  findAdjustable,
  reorderAdjustables,
  switchRect,
  viewFor,
  type CardHit,
  type CircuitElm,
  type EditInfo,
  type Rect,
  type Scope,
  type ScopeDefaultsStore,
  type ScopeDrop,
  type ScopeManager,
  type ScopeRect,
} from '@circuitjs-next/elements';
import { Circuit, OptionFlag, getCircuitAsComposite } from '@circuitjs-next/format';
import {
  AnnotationLayer,
  CircuitRenderer,
  ScopeRenderer,
  currentMultiplier,
  type FrameState,
  type UndockedScopeItem,
} from '@circuitjs-next/render';
import type { Theme } from '@circuitjs-next/theme';
import {
  Editor,
  MouseMode,
  NO_MODIFIERS,
  type EditorHost,
  type Modifiers,
} from './editor/Editor.ts';
import { download } from './download.ts';
import { sliderEntries, type SliderEntry } from './sliders.ts';
import {
  showToast,
  shownTheme,
  useApp,
  type AppState,
  type EditorState,
  type TeachTool,
} from './store.ts';
import { t } from './i18n.ts';

/** What dropping a dragged docked scope does, as its drop label and undo name say. */
const SCOPE_DROP_LABELS: Record<ScopeDrop, string> = {
  above: 'Stack above',
  below: 'Stack below',
  left: 'New column',
  right: 'New column',
  combine: 'Combine',
};

/** Simulation time per frame before the frame is cut short (upstream `frameTimeLimit`). */
const FRAME_BUDGET_MS = 50;
/** Steps per sim.step() call; small enough to check the clock often. */
const MAX_CHUNK = 500;
const STATUS_INTERVAL_MS = 100;

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
  /** The kind of pointer that last moved (hover labels are for a mouse). */
  private mouseType = 'mouse';
  /** The mouse is on the splitter between the circuit and the scopes. */
  private splitterHot = false;
  /** Element of the scope under the mouse (highlighted on the circuit, shown in the info). */
  private scopeHoverElm: CircuitElm | null = null;
  /** The element of the slider under the pointer (upstream Scrollbar.onMouseOver). */
  private sliderHoverElm: CircuitElm | null = null;
  /** Undocked scope whose card is under the mouse (card look), or null. */
  private hoverUndocked: ScopeElm | null = null;
  /** Play feedback animations (not when the user prefers reduced motion). */
  readonly motion =
    typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** An undocked scope's leader end being dragged onto a post, at a screen point. */
  private leaderDrag: { elm: ScopeElm; x: number; y: number; id: number } | null = null;
  /** A docked card dragged by its handle, and where it would land if dropped now. */
  private scopeMove: {
    id: number;
    from: Scope;
    x: number;
    y: number;
    to: Scope | null;
    where: ScopeDrop | null;
  } | null = null;
  /** Where each undocked scope's leader ends on screen, as last laid out. */
  private readonly leaderTargets = new WeakMap<ScopeElm, { x: number; y: number } | null>();
  /** Docked scope the context menu was opened on, or -1; and its selected plot. */
  menuScope = -1;
  /** Undocked scope the context menu was opened on, or null. */
  menuUndocked: ScopeElm | null = null;
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
    this.annotations.onChange = () => this.publishTeach();
    this.editor.history.onChange = () => this.publishEditor();
    const stored = readClipboard();
    if (stored !== null) this.editor.setClipboard(stored);
    // upstream asks before shortening the timestep for a fast source
    if (typeof window !== 'undefined') {
      VoltageElm.confirmAdjustTimestep = (m) => window.confirm(m);
      AudioOutputElm.confirmAdjustTimestep = (m) => window.confirm(m);
      AudioOutputElm.notify = (m) => window.alert(m);
      AudioOutputElm.player = playSamples;
      CustomCompositeElm.hooks = {
        editPinLayout: (e) => this.editPinLayout(e),
        viewComponents: (e) => this.viewComponents(e),
        editModel: (e) => this.editSubcircuitModel(e),
        alert: (m) => window.alert(t(m)),
      };
      const lib = modelsFor(this.circuit.sim).composite;
      try {
        lib.storage = window.localStorage;
        lib.loadModelsFromStorage(this.circuit.sim);
      } catch {
        // storage disabled: models last for the session
      }
      modelEditor.open = (req) => {
        this.modelRequest = req;
        useApp.setState({ dialog: 'model' });
      };
      DataRecorderElm.download = (name, text) => download(name, text, 'text/plain');
    }
  }

  // ---- loading -----------------------------------------------------------------------------

  /**
   * Load circuit text (either upstream format) and show it. Returns false on a parse error.
   * `undoable` records it as an edit, as upstream does for files and examples opened from menus.
   */
  load(text: string, title: string, running = true, undoable = false): boolean {
    const history = this.editor.history;
    // a new circuit ends any model editing (upstream resetEditingContext)
    if (this.contextStack.length > 0) {
      this.contextStack.length = 0;
      this.circuit.keepLocalModels = false;
      history.clear();
    }
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
    this.viewStack = [];
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
    this.sliderHoverElm = null;
    this.slidersChanged();
    if (fit) this.needsFit = true;
    this.resize();
    this.publishEditor(true);
    this.publishStatus(true);
    this.publishSubcircuits();
  }

  /** Upstream reset button: restart the simulation from t = 0. */
  reset(): void {
    this.circuit.reset();
    // upstream resetAction clears every scope too (scopeManager.resetGraphs)
    this.circuit.scopes.resetGraphs();
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
    const renderer = new CircuitRenderer(canvas, shownTheme(state));
    renderer.motion = this.motion;
    this.renderer = renderer;
    this.scopeRenderer = new ScopeRenderer(canvas, shownTheme(state));
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
    const theme = shownTheme(s);
    if (theme !== shownTheme(prev)) {
      this.renderer?.setTheme(theme);
      this.scopeRenderer?.setTheme(theme);
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
        if (sim.pauseRequested) {
          // a stop trigger fired: pause, as upstream's setSimRunning(false)
          sim.pauseRequested = false;
          this.stepsOwed = 0;
          running = false;
          useApp.setState({ running: false });
          break;
        }
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
        euroGates: state.settings.euroGates,
        showOhm: state.settings.showOhm,
        textFont: state.settings.textFont,
        junctionDots: state.settings.junctionDots,
        gridSize: sim.gridSize,
      };
      r.circuitHeight = this.circuitHeight();
      r.render(frame);
      this.drawScopes();
      this.drawAnnotations();
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
    this.circuit.removeUnusedScopeElms();
    this.circuit.pruneAdjustables();
    this.slidersChanged();
    this.circuit.sim.setElements(this.circuit.elements);
    if (this.renderer) {
      const viewed = this.viewStack.at(-1);
      this.renderer.elementsChanged(
        viewed === undefined ? this.circuit.elements : viewed.buildDisplayElmList(),
      );
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
    const panel = sel.filter((e) => !(e instanceof ScopeElm));
    const prev = useApp.getState().editor;
    const r = this.renderer;
    if (r) {
      r.hovered = ed.mouseElm ?? this.scopeHoverElm ?? this.sliderHoverElm;
      r.pending = ed.dragElm;
      r.selectionRect = ed.selectedArea;
    }
    const next: EditorState = {
      addClass: ed.mouseMode === MouseMode.ADD_ELM ? ed.addClass : null,
      selectionCount: sel.length,
      selected: sel.length === 1 ? (sel[0] ?? null) : null,
      panelCount: panel.length,
      panelElm: panel.length === 1 ? (panel[0] ?? null) : null,
      canUndo: ed.history.canUndo,
      canRedo: ed.history.canRedo,
      canPaste: ed.hasClipboard,
      revision: prev.revision + (propertiesChanged ? 1 : 0),
      moving: ed.isMoving,
    };
    if (
      next.addClass !== prev.addClass ||
      next.selectionCount !== prev.selectionCount ||
      next.selected !== prev.selected ||
      next.panelCount !== prev.panelCount ||
      next.panelElm !== prev.panelElm ||
      next.canUndo !== prev.canUndo ||
      next.canRedo !== prev.canRedo ||
      next.canPaste !== prev.canPaste ||
      next.revision !== prev.revision ||
      next.moving !== prev.moving
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
    let sh = Math.trunc(h * this.scopeHeightFraction);
    // one column at a time on a phone: give it room for a header and a readable plot
    if (this.cssWidth < COMPACT_WIDTH) sh = Math.max(sh, Math.min(220, Math.trunc(h * 0.35)));
    return h - sh;
  }

  /** The scope area in CSS pixels. */
  scopeArea(): ScopeRect {
    const ch = this.circuitHeight();
    return { x: 0, y: ch, width: this.cssWidth, height: this.cssHeight - ch };
  }

  /**
   * Place each undocked scope where its rectangle is on screen (upstream ScopeElm.setScopeRect),
   * with the point its leader line goes to.
   */
  private layoutUndocked(): UndockedScopeItem[] {
    const r = this.renderer;
    if (!r) return [];
    const vp = r.viewport;
    const mgr = this.circuit.scopes;
    const cards = mgr.look === 'cards';
    const ed = this.editor;
    const items: UndockedScopeItem[] = [];
    for (const e of this.circuit.scopeElms()) {
      const b = e.box();
      const a = vp.toScreen(b.x1, b.y1);
      const c = vp.toScreen(b.x2, b.y2);
      const slot = {
        x: Math.round(a.x),
        y: Math.round(a.y),
        width: Math.max(1, Math.round(c.x - a.x)),
        height: Math.max(1, Math.round(c.y - a.y)),
      };
      const s = e.elmScope;
      s.position = -1;
      s.slot = slot;
      s.canvasSelected = e.selected;
      const rect = cards ? cardPlotRect(slot, true) : slot;
      const o = s.rect;
      if (rect.x !== o.x || rect.y !== o.y || rect.width !== o.width || rect.height !== o.height)
        s.setRect(rect);
      const shown = s.getElm();
      const t = shown !== null ? scopeAnchor(shown, e.leaderPost) : null;
      const item: UndockedScopeItem = {
        scope: s,
        target: t !== null ? vp.toScreen(t.x, t.y) : null,
        active:
          e.selected ||
          e === this.hoverUndocked ||
          e === this.leaderDrag?.elm ||
          (shown !== null && (ed.mouseElm === shown || shown.selected)),
      };
      const drag = this.leaderDrag;
      if (drag !== null && drag.elm === e && shown !== null) {
        item.target = { x: drag.x, y: drag.y };
        item.posts = this.leaderPosts(e);
        item.snapPost = this.leaderSnap(e, drag.x, drag.y);
      }
      this.leaderTargets.set(e, item.target);
      items.push(item);
    }
    return items;
  }

  /** A ripple at each point where ends meet now but didn't before (a few at most). */
  private rippleNewJoins(before: Set<string> | null): void {
    const r = this.renderer;
    if (!r || before === null) return;
    let n = 0;
    for (const k of r.connectionKeys()) {
      if (before.has(k)) continue;
      const [x, y] = k.split(',').map(Number) as [number, number];
      r.ripple(x, y);
      if (++n === 6) break;
    }
  }

  /** Screen points of the posts of what an undocked scope shows. */
  private leaderPosts(e: ScopeElm): { x: number; y: number }[] {
    const shown = e.elmScope.getElm();
    const r = this.renderer;
    if (shown === null || !r) return [];
    const pts: { x: number; y: number }[] = [];
    for (let k = 0; k !== shown.getPostCount(); k++) {
      const p = shown.getPost(k);
      pts.push(r.viewport.toScreen(p.x, p.y));
    }
    return pts;
  }

  /** The post a leader dropped at a screen point snaps to, or -1 (the element's middle). */
  private leaderSnap(e: ScopeElm, x: number, y: number): number {
    let best = -1;
    let bestDist = LEADER_SNAP;
    this.leaderPosts(e).forEach((p, k) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= bestDist) {
        best = k;
        bestDist = d;
      }
    });
    return best;
  }

  /** The selected undocked scope whose leader end is at a screen point, or null. */
  leaderAt(x: number, y: number, reach: number): ScopeElm | null {
    if (this.circuit.scopes.look !== 'cards' || y >= this.circuitHeight()) return null;
    const elms = this.circuit.scopeElms();
    for (let i = elms.length - 1; i >= 0; i--) {
      const e = elms[i];
      const t = e !== undefined ? this.leaderTargets.get(e) : undefined;
      // only a selected card's leader: its end sits on the element, which is pressed there too
      if (e?.selected === true && t != null && Math.hypot(t.x - x, t.y - y) <= reach) return e;
    }
    return null;
  }

  /** Point an undocked scope's leader at a post of what it shows (-1: the middle). */
  setLeaderPost(e: ScopeElm, post: number): void {
    if (e.leaderPost === post) return;
    this.scopeCommand('Move leader', () => {
      e.leaderPost = post;
    });
  }

  /** The undocked scope whose card is at a canvas point (the one drawn on top), or null. */
  undockedAt(x: number, y: number): ScopeElm | null {
    if (y >= this.circuitHeight()) return null;
    const elms = this.circuit.scopeElms();
    for (let i = elms.length - 1; i >= 0; i--) {
      const e = elms[i];
      if (e === undefined) continue;
      const sl = e.elmScope.slot;
      if (x >= sl.x && y >= sl.y && x < sl.x + sl.width && y < sl.y + sl.height) return e;
    }
    return null;
  }

  /** Lay out and draw the scopes and the info text (upstream drawBottomArea). */
  private drawScopes(): void {
    const sr = this.scopeRenderer;
    if (!sr) return;
    const mgr = this.circuit.scopes;
    mgr.look = this.theme.style.scopeLook;
    mgr.compact = this.cssWidth < COMPACT_WIDTH;
    // the card look's info card holds fixed-width values in the monospace font ("time step =
    // 5.000 μs" needs 23 characters), so it gets more room than upstream's 160 px, and more again
    // for a language whose "time step = " is longer
    const extra = Math.max(0, t('time step = ').length - 12) * MONO_CHAR_WIDTH;
    const infoWidth = mgr.compact ? 0 : mgr.look === 'cards' ? CARD_INFO_WIDTH + extra : INFO_WIDTH;
    const before = mgr.scopeCount;
    mgr.setupScopes(this.scopeArea(), infoWidth);
    // removing the last scope gives its room back to the circuit
    if (mgr.scopeCount !== before) mgr.setupScopes(this.scopeArea(), infoWidth);
    mgr.dialogShowing = useApp.getState().dialog !== null;
    mgr.mouseElm = this.editor.mouseElm ?? this.scopeHoverElm ?? this.sliderHoverElm;
    mgr.cursorScope = null;
    mgr.cursorTime = -1;
    mgr.cursorSnap = null;
    mgr.now = this.motion ? performance.now() : 0;
    const m = this.mouse;
    mgr.mouseCursorX = m?.x ?? -1;
    mgr.mouseCursorY = m?.y ?? -1;
    const undocked = this.layoutUndocked();
    if (m !== null) {
      for (const s of mgr.scopes) s.selectScope(m.x, m.y);
      // an undocked card over the circuit; the docked area covers any part below it
      const u = m.y < this.circuitHeight() ? this.undockedAt(m.x, m.y) : null;
      if (u !== null) u.elmScope.selectScope(m.x, m.y);
    }
    sr.renderUndocked(mgr, undocked, this.cssWidth, this.circuitHeight(), this.dpr);
    const sm = this.scopeMove;
    sr.render(
      mgr,
      {
        area: this.scopeArea(),
        info: this.infoLines(),
        splitterHot: this.splitterHot,
        drag:
          sm === null
            ? null
            : { ...sm, label: sm.where === null ? '' : t(SCOPE_DROP_LABELS[sm.where]) },
        tip: this.cardTip(),
      },
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
    const elm = ed.mouseElm ?? this.scopeHoverElm ?? this.sliderHoverElm;
    const arr: string[] = [];
    // every value keeps its width as it changes (owner's rule), in the monospace info font
    withFixedWidthValues(() => {
      if (elm !== null) {
        if (elm === ed.mouseElm && ed.mousePost >= 0)
          arr.push('V = ' + getUnitText(elm.getPostVoltage(ed.mousePost), 'V'));
        else {
          elm.getInfo(arr);
          // upstream translates the first two lines (UIManager)
          if (typeof arr[0] === 'string') arr[0] = t(arr[0]);
          if (typeof arr[1] === 'string') arr[1] = t(arr[1]);
        }
      } else if (mgr.scopeCount > 0 && !mgr.compact) {
        arr[0] = 't = ' + getTimeText(sim.t);
        const timerate = 160 * this.circuit.getIterCount() * sim.timeStep;
        if (timerate >= 0.1) arr[0] += ' (' + showFormat(timerate).trimStart().padStart(8) + 'x)';
        arr[1] = t('time step = ') + getTimeText(sim.timeStep);
      }
    });
    // upstream stops at the first empty slot
    const info: string[] = [];
    for (const line of arr) {
      if (typeof line !== 'string') break;
      info.push(line);
    }
    if (mgr.scopeCount > 0) {
      const bad = this.renderer?.badConnectionCount ?? 0;
      if (bad > 0) info.push(bad + t(bad === 1 ? ' bad connection' : ' bad connections'));
    }
    return info;
  }

  /**
   * Where a dragged docked card would land at a point: on a card's top or bottom edge it stacks
   * above or below it, on its left or right edge it gets a new column there, in the middle it
   * combines with it.
   */
  private scopeDropAt(
    from: Scope,
    x: number,
    y: number,
  ): { to: Scope | null; where: ScopeDrop | null } {
    const mgr = this.circuit.scopes;
    if (y < this.circuitHeight()) return { to: null, where: null };
    const to = mgr.scopes.find(
      (s) =>
        mgr.isShown(s) &&
        x >= s.slot.x &&
        x < s.slot.x + s.slot.width &&
        y >= s.slot.y &&
        y < s.slot.y + s.slot.height,
    );
    if (to === undefined) return { to: null, where: null };
    const fx = (x - to.slot.x) / to.slot.width;
    const fy = (y - to.slot.y) / to.slot.height;
    const alone = mgr.scopes.filter((s) => s.position === from.position).length === 1;
    let where: ScopeDrop | null;
    if (fx < 0.2) where = 'left';
    else if (fx > 0.8) where = 'right';
    else if (fy < 0.3) where = 'above';
    else if (fy > 0.7) where = 'below';
    else where = 'combine';
    // on itself only splitting it off its stack into a column of its own does something
    if (to === from && !(alone === false && (where === 'left' || where === 'right'))) where = null;
    return { to, where };
  }

  /** Drop a dragged docked card where scopeDropAt says, letting every card fly to its place. */
  private dropScope(from: Scope, to: Scope, where: ScopeDrop): void {
    const mgr = this.circuit.scopes;
    const i = mgr.scopes.indexOf(from);
    const j = mgr.scopes.indexOf(to);
    if (i < 0 || j < 0) return;
    const slots = new Map(mgr.scopes.map((s) => [s, { ...s.slot }]));
    this.scopeCommand(SCOPE_DROP_LABELS[where], () => mgr.moveScope(i, j, where));
    for (const [s, r] of slots) if (s !== from || where !== 'combine') this.animateCard(s, r);
    this.circuitChanged();
  }

  /** A label for the card header button under the mouse (mouse only: touch has no hover). */
  private cardTip(): { text: string; x: number; y: number } | null {
    const m = this.mouse;
    if (m === null || this.mouseType !== 'mouse' || this.scopeMove !== null) return null;
    const mgr = this.circuit.scopes;
    if (mgr.look !== 'cards') return null;
    const u = m.y < this.circuitHeight() ? this.undockedAt(m.x, m.y) : null;
    const s =
      u?.elmScope ?? (m.y >= this.circuitHeight() ? mgr.scopes[this.scopeAt(m.x, m.y)] : undefined);
    if (s === undefined) return null;
    const hit = cardHitTest(s, m.x, m.y);
    if (hit === null) return null;
    const docked = s.position >= 0;
    let text: string;
    switch (hit.kind) {
      case 'settings':
        text = 'Properties…';
        break;
      case 'close':
        text = 'Remove Scope';
        break;
      case 'dock':
        text = docked ? 'Undock Scope' : 'Dock Scope';
        break;
      case 'freeze':
        text = s.frozen !== null ? 'Resume' : 'Freeze';
        break;
      case 'handle':
        text = docked ? 'Drag to stack or move' : 'Drag to move';
        break;
      default:
        return null;
    }
    return { text: t(text), x: hit.x + hit.width / 2, y: hit.y + hit.height };
  }

  /** Index of the docked scope at a canvas point, or -1. */
  scopeAt(x: number, y: number): number {
    if (y < this.circuitHeight()) return -1;
    return this.circuit.scopes.scopeIndexAt(x, y);
  }

  /**
   * A click on a scope card's header: settings, close, a legend chip (shows or hides voltage or
   * current) or a column tab. Returns whether it hit one.
   */
  private cardClick(s: Scope, x: number, y: number): boolean {
    const mgr = this.circuit.scopes;
    if (mgr.look !== 'cards') return false;
    const hit = cardHitTest(s, x, y);
    if (hit === null) return false;
    switch (hit.kind) {
      case 'settings':
        this.openScopeProperties(s);
        break;
      case 'close':
        if (s.position < 0) this.removeUndocked(s);
        else this.scopeCommand('Remove scope', () => s.setElm(null));
        break;
      case 'dock':
        if (s.position < 0) {
          const u = this.circuit.scopeElms().find((e) => e.elmScope === s);
          if (u !== undefined) this.dockScope(u);
        } else this.undockScope(mgr.scopes.indexOf(s));
        break;
      case 'freeze':
        s.setFrozen(s.frozen === null);
        break;
      case 'handle':
      case 'resize':
        return false;
      case 'tab':
        mgr.activeColumn = hit.index;
        break;
      case 'chip': {
        const p = s.plots[hit.index];
        if (p === undefined) break;
        // voltage and current plots can be hidden and shown again (upstream's Show Voltage and
        // Show Current); others stay, unless they are all a scope has left
        if (p.value === VAL_VOLTAGE && p.units === UNITS_V && !(s.showV && !s.showI))
          this.scopeCommand('Scope', () => s.showVoltage(!s.showV));
        else if (p.value === VAL_CURRENT && p.units === UNITS_A && !(s.showI && !s.showV))
          this.scopeCommand('Scope', () => s.showCurrent(!s.showI));
        break;
      }
    }
    return true;
  }

  /** The clickable part of a scope's card at a point (for tests). */
  cardHit(s: Scope, x: number, y: number): CardHit | null {
    return cardHitTest(s, x, y);
  }

  /** Compact: show the next (+1) or previous (-1) scope column. */
  private swipeScopes(dir: number): void {
    const mgr = this.circuit.scopes;
    const n = mgr.columnCount();
    if (n > 1) mgr.activeColumn = (mgr.activeColumn + dir + n) % n;
  }

  /** Hover over the scope area: select the scope and highlight what it shows (upstream). */
  private hoverScopes(x: number, y: number): void {
    const mgr = this.circuit.scopes;
    const u = mgr.look === 'cards' ? this.undockedAt(x, y) : null;
    this.hoverUndocked = u;
    const i = u === null ? this.scopeAt(x, y) : -1;
    mgr.scopeSelected = i;
    const s = u !== null ? u.elmScope : i >= 0 ? mgr.scopes[i] : undefined;
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
    this.hoverUndocked = null;
    this.scopeHoverElm = null;
    if (this.renderer) this.renderer.scopeHighlights = new Map();
  }

  /** Run a scope change as one undoable edit (upstream pushes an undo item first). */
  scopeCommand(label: string, fn: () => unknown): void {
    const before = new Set(this.everyScope());
    this.editor.history.record(label, () => {
      fn();
      return true;
    });
    this.unsavedChanges = true;
    // new cards grow in
    for (const s of this.everyScope()) if (!before.has(s)) this.animateCard(s, null);
  }

  /** Docked and undocked scopes. */
  private everyScope(): Scope[] {
    return [...this.circuit.scopes.scopes, ...this.circuit.scopeElms().map((e) => e.elmScope)];
  }

  private animateCard(s: Scope, from: ScopeRect | null): void {
    if (this.motion) this.scopeRenderer?.animateCard(s, from);
  }

  /** Element menu: View in New Scope. */
  viewInScope(elm: CircuitElm): void {
    this.scopeCommand('View in scope', () => this.circuit.scopes.viewInScope(elm));
    this.showScopeOnPhone();
  }

  /**
   * On a phone the property sheet covers the scopes: after putting an element in one, close
   * the sheet (clear the selection) so the scope can be seen.
   */
  private showScopeOnPhone(): void {
    if (typeof window !== 'undefined' && window.innerWidth < 720) this.editor.clearSelection();
  }

  /** Element menu: Add to Existing Scope n. */
  addToScope(n: number, elm: CircuitElm): void {
    this.scopeCommand('Add to scope', () => this.circuit.scopes.addToScope(n, elm));
    this.showScopeOnPhone();
  }

  /** Scope popup menu commands (upstream CommandManager "scopepop"). */
  scopeMenu(item: string): void {
    const mgr = this.circuit.scopes;
    const i = this.menuScope;
    const u = this.menuUndocked;
    const s = u !== null ? u.elmScope : mgr.scopes[i];
    if (s === undefined) return;
    if (item === 'undock') {
      this.undockScope(i);
      return;
    }
    if (item === 'dock') {
      if (u !== null) this.dockScope(u);
      return;
    }
    if (item === 'remove' && u !== null) {
      this.removeUndocked(s);
      return;
    }
    if (item === 'freeze') {
      s.setFrozen(s.frozen === null);
      return;
    }
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

  /**
   * Where a new undocked scope for an element goes (circuit coordinates): up and to the right of
   * it, so its leader line is short. Upstream puts a 128 x 64 one 50 px below and right of the
   * element's first point; a card needs room for its header (DEVIATIONS.md).
   */
  private undockedPlace(elm: CircuitElm): { x1: number; y1: number; x2: number; y2: number } {
    const t = scopeAnchor(elm);
    const sim = this.circuit.sim;
    const snap = (v: number): number => (v + (sim.gridSize / 2 - 1)) & ~(sim.gridSize - 1);
    const W = UNDOCKED_WIDTH;
    const H = UNDOCKED_HEIGHT;
    const right = snap(t.x + 64);
    const left = snap(t.x - 64) - W;
    const above = snap(t.y - 48) - H;
    const below = snap(t.y + 48);
    const spots = [
      { x1: right, y1: above },
      { x1: right, y1: below },
      { x1: left, y1: above },
      { x1: left, y1: below },
    ];
    // the first spot on screen that leaves the other undocked scopes uncovered
    const r = this.renderer;
    const others = this.circuit.scopeElms().map((e) => e.box());
    const panels = this.overlayRects();
    const fits = (p: { x1: number; y1: number }, screen: boolean): boolean => {
      if (screen && r) {
        const tl = r.viewport.toCircuit(0, 0);
        const br = r.viewport.toCircuit(this.cssWidth, this.circuitHeight());
        if (p.x1 < tl.x || p.y1 < tl.y || p.x1 + W > br.x || p.y1 + H > br.y) return false;
        // nor under a panel floating over the canvas (the sliders)
        const a = r.viewport.toScreen(p.x1, p.y1);
        const b = r.viewport.toScreen(p.x1 + W, p.y1 + H);
        if (panels.some((o) => a.x < o.right && o.left < b.x && a.y < o.bottom && o.top < b.y))
          return false;
      }
      return !others.some((o) => p.x1 < o.x2 && o.x1 < p.x1 + W && p.y1 < o.y2 && o.y1 < p.y1 + H);
    };
    const spot = spots.find((p) => fits(p, true)) ?? spots.find((p) => fits(p, false)) ?? spots[0];
    const x1 = spot?.x1 ?? right;
    const y1 = spot?.y1 ?? above;
    return { x1, y1, x2: x1 + UNDOCKED_WIDTH, y2: y1 + UNDOCKED_HEIGHT };
  }

  /** Panels floating over the canvas (the sliders), in canvas coordinates. */
  private overlayRects(): { left: number; top: number; right: number; bottom: number }[] {
    const canvas = this.renderer?.canvas;
    if (!canvas) return [];
    const c = canvas.getBoundingClientRect();
    return [...document.querySelectorAll('[data-canvas-overlay]')].map((el) => {
      const b = el.getBoundingClientRect();
      return {
        left: b.left - c.left,
        top: b.top - c.top,
        right: b.right - c.left,
        bottom: b.bottom - c.top,
      };
    });
  }

  private newScopeElm(elm: CircuitElm): ScopeElm | null {
    const p = this.undockedPlace(elm);
    const se = constructElement('ScopeElm', p.x1, p.y1, this.circuit.sim);
    if (!(se instanceof ScopeElm)) return null;
    se.x2 = p.x2;
    se.y2 = p.y2;
    se.setPoints();
    return se;
  }

  /** Element menu: View in New Undocked Scope (upstream viewInFloatScope). */
  viewInUndockedScope(elm: CircuitElm): void {
    let added: ScopeElm | null = null;
    this.scopeCommand('View in undocked scope', () => {
      const se = this.newScopeElm(elm);
      if (se === null) return;
      se.setScopeElm(elm);
      this.circuit.elements.push(se);
      added = se;
    });
    // the card comes out of what it shows
    const r = this.renderer;
    if (added !== null && r) {
      const t = scopeAnchor(elm);
      const p = r.viewport.toScreen(t.x, t.y);
      this.animateCard((added as ScopeElm).elmScope, {
        x: p.x - 12,
        y: p.y - 8,
        width: 24,
        height: 16,
      });
    }
    this.circuitChanged();
    this.showScopeOnPhone();
  }

  /** Scope menu: Undock Scope. The docked scope moves onto the circuit, beside what it shows. */
  undockScope(i: number): void {
    const mgr = this.circuit.scopes;
    const s = mgr.scopes[i];
    const elm = s?.getElm() ?? null;
    if (s === undefined || elm === null) return;
    const from = { ...s.slot };
    this.scopeCommand('Undock scope', () => {
      const se = this.newScopeElm(elm);
      if (se === null) return;
      se.setElmScope(s);
      // setupScopes() closes the gap
      mgr.scopes.splice(i, 1);
      this.circuit.elements.push(se);
    });
    this.animateCard(s, from);
    this.circuitChanged();
  }

  /** Scope menu on an undocked scope: Dock Scope, into a new column. */
  dockScope(u: ScopeElm): void {
    const mgr = this.circuit.scopes;
    if (mgr.scopeCount >= MAX_SCOPES) return;
    const from = { ...u.elmScope.slot };
    this.scopeCommand('Dock scope', () => {
      const s = u.elmScope;
      s.position = mgr.scopeCount;
      mgr.scopes.push(s);
      this.circuit.elements = this.circuit.elements.filter((e) => e !== u);
      u.selected = false;
    });
    this.animateCard(u.elmScope, from);
    if (this.hoverUndocked === u) this.clearScopeHover();
    this.circuitChanged();
    this.publishEditor();
  }

  /** Remove an undocked scope (its card's close button, or Remove Scope). */
  private removeUndocked(s: Scope): void {
    const u = this.circuit.scopeElms().find((e) => e.elmScope === s);
    if (u === undefined) return;
    this.scopeCommand('Remove scope', () => {
      this.circuit.elements = this.circuit.elements.filter((e) => e !== u);
    });
    if (this.hoverUndocked === u) this.clearScopeHover();
    this.circuitChanged();
    this.publishEditor();
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
    const label = this.editor.history.undoLabel;
    this.editor.history.undo();
    if (label !== null) showToast(`Undid ${label.toLowerCase()}`);
  }

  redo(): void {
    const label = this.editor.history.redoLabel;
    this.editor.history.redo();
    if (label !== null) showToast(`Redid ${label.toLowerCase()}`);
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
  /** An edit dialog button or loaded file acting on its element, undoably. */
  runEditAction(action: () => void): void {
    this.editor.history.record('Edit', action);
    this.circuitChanged();
  }

  applyEdit(e: CircuitElm, n: number, ei: EditInfo): void {
    this.editor.history.record('Edit', () => e.setEditValue(n, ei));
    // upstream EditDialog.apply: a slider on this value moves to it
    if (ei.error === null) findAdjustable(this.circuit.adjustables, e, n)?.setSliderValue(ei.value);
    this.circuitChanged();
  }

  // ---- keyboard selection ------------------------------------------------------------------

  /**
   * Select the next (or previous) element in circuit order, for keyboard users (`]` and `[`):
   * brings it into view and tells screen readers what it is.
   */
  selectNext(dir: 1 | -1): void {
    const els = this.circuit.elements;
    if (els.length === 0) return;
    const cur = this.editor.selectedElements();
    const at = cur.length === 1 && cur[0] ? els.indexOf(cur[0]) : -1;
    const i = at < 0 ? (dir > 0 ? 0 : els.length - 1) : (at + dir + els.length) % els.length;
    const e = els[i];
    if (e === undefined) return;
    this.editor.select(e);
    this.renderer?.reveal(e);
    this.publishEditor();
    useApp.setState({ announcement: `${describeElement(e)}. ${i + 1} of ${els.length}.` });
  }

  private keyboardMenuElm: CircuitElm | null = null;

  /** Open the element menu on the selected element (keyboard). Returns whether it opened. */
  openMenuAtSelection(): boolean {
    const r = this.renderer;
    const e = this.editor.selectedElements()[0];
    if (!r || e === undefined) return false;
    r.reveal(e);
    this.keyboardMenuElm = e;
    const mid = r.viewport.toScreen((e.x + e.x2) / 2, (e.y + e.y2) / 2);
    const rect = r.canvas.getBoundingClientRect();
    r.canvas.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + mid.x,
        clientY: rect.top + mid.y,
      }),
    );
    return true;
  }

  // ---- sliders -------------------------------------------------------------------------------

  /** The sliders to show (upstream's side panel), rebuilt on each call. */
  sliders(): SliderEntry[] {
    return sliderEntries(this.circuit.elements, this.circuit.adjustables, () => {
      this.circuit.sim.analyzeFlag = true;
      this.unsavedChanges = true;
    });
  }

  /** Tell the slider panel to read the sliders again. */
  slidersChanged(): void {
    useApp.setState((s) => ({ sliderRevision: s.sliderRevision + 1 }));
  }

  /** A slider drag starts: everything until it ends is one undoable edit. */
  beginSliderDrag(): void {
    this.editor.history.begin('Slider');
  }

  setSlider(entry: SliderEntry, position: number): void {
    if (!this.editor.history.inEdit) this.editor.history.begin('Slider');
    entry.set(position);
    this.editor.history.touch();
    this.slidersChanged();
    this.publishEditor(true);
  }

  endSliderDrag(): void {
    this.editor.history.commit();
    this.publishEditor();
  }

  /** Hovering a slider highlights its element and shows its info (upstream). */
  setSliderHover(elm: CircuitElm | null): void {
    this.sliderHoverElm = elm;
    if (this.renderer) this.renderer.hovered = this.editor.mouseElm ?? this.scopeHoverElm ?? elm;
  }

  /** Element menu "Sliders…" is offered (upstream MouseManager.sliderItemEnabled). */
  canAddSliders(elm: CircuitElm): boolean {
    // prevent confusion: these have sliders of their own
    if (elm instanceof VarRailElm || elm instanceof PotElm) return false;
    for (let i = 0; ; i++) {
      const ei = elm.getEditInfo(i);
      if (ei === null) return false;
      if (ei.canCreateAdjustable()) return true;
    }
  }

  // ---- teaching tools: pencil, laser and eraser (not upstream; never saved) ---------------------

  /** Strokes and the laser trail drawn over the circuit and scopes. */
  readonly annotations = new AnnotationLayer();

  private drawAnnotations(): void {
    const r = this.renderer;
    const a = this.annotations;
    if (!r || (a.strokes.length === 0 && !a.active)) return;
    const ctx = r.canvas.getContext('2d');
    if (ctx === null) return;
    a.draw(ctx, r.viewport, window.devicePixelRatio || 1, r.theme, performance.now());
  }

  private publishTeach(): void {
    const a = this.annotations;
    useApp.setState((s) => ({
      teach: { ...s.teach, strokes: a.strokes.length, canUndo: a.canUndo },
    }));
  }

  /** Pick a teaching tool, or null to go back to editing. */
  setTeachTool(tool: TeachTool | null): void {
    if (tool !== null) {
      // placing an element and drawing don't mix
      this.editor.setSelectMode();
      this.editor.leave();
    }
    this.annotations.laserUp();
    useApp.setState((s) => ({ teach: { ...s.teach, tool } }));
    this.publishTeach();
    const c = this.renderer?.canvas;
    if (c) c.style.cursor = teachCursor(tool);
  }

  setTeachPen(pen: number): void {
    useApp.setState((s) => ({
      teach: { ...s.teach, pen, tool: s.teach.tool === 'laser' ? s.teach.tool : 'pencil' },
    }));
    const c = this.renderer?.canvas;
    if (c) c.style.cursor = teachCursor(useApp.getState().teach.tool);
  }

  teachUndo(): void {
    this.annotations.undo();
  }

  teachClear(): void {
    this.annotations.clear();
  }

  // ---- subcircuits (upstream EditCompositeModelDialog, CirSim contexts, SubcircuitBar) --------

  /** What the pin layout dialog edits. */
  subcircuitDialog: {
    model: CustomCompositeModel;
    /** A new model: the dialog asks for its name. */
    askName: boolean;
    /** Saving a model's edited circuit: OK goes back to the circuit that uses it. */
    popContext: boolean;
  } | null = null;

  /** Circuits set aside while a subcircuit's own circuit is edited (upstream contextStack). */
  private readonly contextStack: {
    circuitDump: string;
    title: string;
    history: ReturnType<Editor['history']['stash']>;
    view: { scale: number; offsetX: number; offsetY: number } | null;
    modelName: string;
    changedModels: CustomCompositeModel[];
  }[] = [];

  /** Subcircuits whose parts are shown, outermost first (upstream `subcircuitStack`). */
  viewStack: CustomCompositeElm[] = [];

  private publishSubcircuits(): void {
    const lib = modelsFor(this.circuit.sim).composite;
    useApp.setState({
      subcircuitBar: {
        viewing: this.viewStack.map((e) => e.modelName),
        editing: this.contextStack.at(-1)?.modelName ?? null,
      },
      subcircuitModels: lib.getModelList(this.circuit.sim).map((m) => m.name),
    });
  }

  /** File > Create Subcircuit: the circuit (or selection) as a new model, then its pin layout. */
  createSubcircuit(): void {
    const model = this.circuitAsModel();
    if (model === null) return;
    this.openSubcircuitDialog(model, true, false);
  }

  /** The circuit as a laid-out model without a name, or null (after telling the user why). */
  private circuitAsModel(): CustomCompositeModel | null {
    const r = getCircuitAsComposite(this.circuit);
    // the nodes were numbered for the model: analyze again before running
    this.circuitChanged();
    if (!('model' in r)) {
      if (r.error !== null) window.alert(t(r.error));
      return null;
    }
    const err = layoutNewModel(r.model);
    if (err !== null) {
      window.alert(t(err));
      return null;
    }
    return r.model;
  }

  editPinLayout(e: CustomCompositeElm): void {
    if (e.model === null) return;
    this.openSubcircuitDialog(e.model, false, false);
  }

  private openSubcircuitDialog(model: CustomCompositeModel, askName: boolean, pop: boolean): void {
    this.subcircuitDialog = { model, askName, popContext: pop };
    useApp.setState({ dialog: 'subcircuit' });
  }

  /** Where a model lives: 0 this circuit, 1 this session, 2 saved across sessions. */
  subcircuitScope(model: CustomCompositeModel): number {
    const lib = modelsFor(this.circuit.sim).composite;
    if (lib.isSaved(model)) return 2;
    if (model.name.length > 0 && lib.globalModelMap.has(model.name)) return 1;
    return 0;
  }

  /**
   * The pin layout dialog's OK (upstream `enterPressed`): name the model, put it where the user
   * chose, and have every subcircuit refetch its model. Returns an error message, or null.
   */
  commitSubcircuit(model: CustomCompositeModel, name: string | null, scope: number): string | null {
    const lib = modelsFor(this.circuit.sim).composite;
    if (name !== null) {
      if (name.length === 0) return 'Please enter a model name.';
      lib.lastModelName = name;
      lib.setName(model, name);
    }
    const popContext = this.subcircuitDialog?.popContext ?? false;
    this.subcircuitDialog = null;
    const place = (): void => {
      lib.localModelMap.delete(model.name);
      lib.globalModelMap.delete(model.name);
      lib.setSaved(model, false);
      if (scope === 0) lib.localModelMap.set(model.name, model);
      else if (scope === 1) lib.globalModelMap.set(model.name, model);
      else lib.setSaved(model, true);
      lib.sequenceNumber++;
    };
    if (!popContext) {
      this.editor.history.record('Subcircuit', () => {
        place();
        this.updateModels();
        return true;
      });
      this.circuitChanged();
      const top = this.contextStack.at(-1);
      // remembered, so the change survives going back to the outer circuit
      if (top !== undefined) top.changedModels.push(model);
    } else {
      place();
      // back to the circuit that uses the model, then put the new model (and any changed deeper
      // down) in place of the old ones it brings back
      const changed = this.popContext();
      changed.push(model);
      for (const m of changed) {
        lib.replaceModel(m);
        this.refreshModels(m.name);
      }
      this.contextStack.at(-1)?.changedModels.push(...changed);
      this.circuitChanged();
    }
    this.publishSubcircuits();
    this.publishEditor(true);
    return null;
  }

  /** Upstream `refreshModels`: subcircuits using this model fetch it again. */
  private refreshModels(modelName: string): void {
    for (const e of this.circuit.elements)
      if (e instanceof CustomCompositeElm && e.modelName === modelName) {
        e.model = null;
        e.updateModels();
      }
  }

  /** Edit Model: open the model's own circuit, setting this one aside. */
  editSubcircuitModel(e: CustomCompositeElm): void {
    const model = e.model;
    if (model === null) return;
    this.pushContext(model.name);
    if (model.modelCircuit !== null && model.modelCircuit.length > 0)
      this.circuit.read(model.modelCircuit);
    else this.circuit.readElementsDoc(model.elmDoc);
    this.afterLoad(useApp.getState().title, useApp.getState().running);
    this.publishSubcircuits();
  }

  private pushContext(modelName: string): void {
    const r = this.renderer;
    this.contextStack.push({
      circuitDump: this.circuit.dumpXml(),
      title: useApp.getState().title,
      history: this.editor.history.stash(),
      view: r
        ? { scale: r.viewport.scale, offsetX: r.viewport.offsetX, offsetY: r.viewport.offsetY }
        : null,
      modelName,
      changedModels: [],
    });
    this.circuit.keepLocalModels = true;
  }

  /** Back to the circuit set aside; returns the models changed while it was away. */
  popContext(): CustomCompositeModel[] {
    const ctx = this.contextStack.pop();
    if (ctx === undefined) return [];
    this.circuit.keepLocalModels = this.contextStack.length > 0;
    try {
      this.circuit.read(ctx.circuitDump);
    } catch {
      // it was saved by this app a moment ago
    }
    this.afterLoad(ctx.title, useApp.getState().running, ctx.view === null);
    const r = this.renderer;
    if (r && ctx.view !== null) {
      r.viewport.scale = ctx.view.scale;
      r.viewport.offsetX = ctx.view.offsetX;
      r.viewport.offsetY = ctx.view.offsetY;
    }
    this.editor.history.unstash(ctx.history);
    this.publishSubcircuits();
    return ctx.changedModels;
  }

  /** The subcircuit bar's Save (keep the name) and Save Copy (a new name). */
  saveSubcircuitModel(copy: boolean): void {
    const modelName = this.contextStack.at(-1)?.modelName;
    if (modelName === undefined) return;
    const model = this.circuitAsModel();
    if (model === null) return;
    const lib = modelsFor(this.circuit.sim).composite;
    // look up the old model before setName puts the new one under its name
    const existing = lib.getModelWithName(modelName, this.circuit.sim);
    if (!copy) lib.setName(model, modelName);
    if (existing !== null) preservePinLayout(model, existing);
    this.openSubcircuitDialog(model, copy, true);
  }

  /** View Components: show the subcircuit's parts, running, until Back. */
  viewComponents(e: CustomCompositeElm): void {
    this.viewStack.push(e);
    this.showViewed();
  }

  /** Back from viewing a subcircuit's parts, or from editing a model's circuit. */
  subcircuitBack(): void {
    if (this.viewStack.length > 0) {
      this.viewStack.pop();
      this.showViewed();
    } else this.popContext();
  }

  private showViewed(): void {
    const top = this.viewStack.at(-1);
    const list = top === undefined ? this.circuit.elements : top.buildDisplayElmList();
    this.editor.clearSelection();
    this.editor.leave();
    this.renderer?.setElements(list);
    this.needsFit = true;
    this.publishSubcircuits();
    this.publishEditor();
  }

  /** Subcircuit Manager: the models a user can delete (not built-in ones). */
  userSubcircuitModels(): CustomCompositeModel[] {
    return modelsFor(this.circuit.sim)
      .composite.getModelList(this.circuit.sim)
      .filter((m) => !m.builtin);
  }

  /** Subcircuit Manager's Delete: forget the model here, in this session and in storage. */
  deleteSubcircuitModel(model: CustomCompositeModel): void {
    modelsFor(this.circuit.sim).composite.remove(model);
    this.publishSubcircuits();
  }

  /** The model the model dialog edits. */
  modelRequest: ModelEditRequest | null = null;

  /**
   * Change a model (the model dialog) as one undoable edit, then have every element refetch its
   * model (upstream `CirSim.updateModels`). `fn` returns false when it changed nothing.
   */
  editModel(fn: () => boolean): void {
    this.editor.history.record('Edit model', () => {
      if (!fn()) return false;
      this.updateModels();
      return true;
    });
    this.circuitChanged();
    // upstream resets the element's dialog when the model dialog closes
    this.publishEditor(true);
  }

  /** Upstream `CirSim.updateModels`: every element refetches its model by name. */
  updateModels(): void {
    for (const e of this.circuit.elements) (e as { updateModels?: () => void }).updateModels?.();
  }

  /** The element the Sliders dialog edits. */
  sliderDialogElm: CircuitElm | null = null;

  openSliderDialog(elm: CircuitElm): void {
    this.sliderDialogElm = elm;
    useApp.setState({ dialog: 'sliders' });
  }

  /** Replace the circuit's sliders with what `build` returns (the Sliders dialog), undoably. */
  setAdjustables(build: () => Adjustable[]): void {
    this.editor.history.record('Sliders', () => {
      this.circuit.adjustables = reorderAdjustables(build());
      return true;
    });
    this.unsavedChanges = true;
    this.slidersChanged();
    this.publishEditor();
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
    // compact: a sideways swipe over the scopes shows the next column
    let swipe: { x: number; y: number; id: number } | null = null;
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
        if (
          s !== undefined &&
          !m.dialogShowing &&
          e.button === 0 &&
          m.look === 'cards' &&
          cardHitTest(s, p.x, p.y)?.kind === 'handle'
        ) {
          // drag a docked card by its handle to stack, move or combine it
          this.scopeMove = { id: e.pointerId, from: s, x: p.x, y: p.y, to: null, where: null };
          scopeGesture = e.pointerId;
          // compact: a sideways swipe on the title still switches columns (see move)
          if (m.compact && e.pointerType === 'touch') swipe = { x: p.x, y: p.y, id: e.pointerId };
          canvas.style.cursor = 'grabbing';
          try {
            canvas.setPointerCapture(e.pointerId);
          } catch {
            // the pointer is already gone
          }
          e.preventDefault();
          return true;
        }
        if (s !== undefined && !m.dialogShowing && e.button === 0 && this.cardClick(s, p.x, p.y))
          return true;
        if (s !== undefined && !m.dialogShowing && s.cursorInSettingsWheel()) {
          this.openScopeProperties(s);
          return true;
        }
        // compact: a swipe on the header switches columns; on the plot a drag measures
        if (
          m.compact &&
          e.pointerType === 'touch' &&
          s !== undefined &&
          !(
            p.x >= s.rect.x &&
            p.x < s.rect.x + s.rect.width &&
            p.y >= s.rect.y &&
            p.y < s.rect.y + s.rect.height
          )
        )
          swipe = { x: p.x, y: p.y, id: e.pointerId };
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
        const sc = m.scopes[m.scopeSelected];
        if (e.pointerType === 'touch' && sc !== undefined)
          scopeTouches.set(e.pointerId, { ...p, scope: sc });
      } else return false;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone
      }
      e.preventDefault();
      return true;
    };
    /** Touch: a long press opens the context menu, as a right click does with a mouse. */
    const startLongPress = (e: PointerEvent, p: { x: number; y: number }): void => {
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
    };
    /**
     * A press on an undocked card (card look): its handle and resize grip move and resize it
     * through the editor; its buttons and chips work as a docked card's; the plot measures.
     */
    const undockedDown = (e: PointerEvent, p: { x: number; y: number }): boolean => {
      const m = mgr();
      if (m.look !== 'cards' || ed.mouseMode !== MouseMode.SELECT || m.dialogShowing) return false;
      const u = this.undockedAt(p.x, p.y);
      if (u === null) return false;
      const s = u.elmScope;
      m.mouseCursorX = p.x;
      m.mouseCursorY = p.y;
      this.hoverScopes(p.x, p.y);
      const hit = cardHitTest(s, p.x, p.y);
      if (e.button === 0 && hit !== null && (hit.kind === 'handle' || hit.kind === 'resize')) {
        const post = hit.kind === 'resize' ? bottomRightPost(u) : -1;
        const g = grid(p);
        ed.pointerDown(g.x, g.y, mods(e), false, { elm: u, post });
        gestureId = e.pointerId;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          // the pointer is already gone
        }
        canvas.style.cursor = post >= 0 ? 'nwse-resize' : 'grabbing';
        this.publishEditor();
        e.preventDefault();
        return true;
      }
      if (e.button === 0 && this.cardClick(s, p.x, p.y)) {
        e.preventDefault();
        return true;
      }
      if (e.button === 0 && !e.altKey) s.mousePressed(p.x, p.y);
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        s.selectScope(p.x, p.y);
        s.startDragPlotY(p.x, p.y);
      }
      scopeGesture = e.pointerId;
      if (e.pointerType === 'touch') {
        scopeTouches.set(e.pointerId, { ...p, scope: s });
        startLongPress(e, p);
      }
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone
      }
      e.preventDefault();
      return true;
    };
    // touch: two fingers on one scope pinch its time scale (not upstream)
    const scopeTouches = new Map<number, { x: number; y: number; scope: Scope }>();
    let scopePinch: { scope: Scope; dist: number } | null = null;
    const scopeUnder = (p: { x: number; y: number }): Scope | null => {
      const m = mgr();
      const u = m.look === 'cards' ? this.undockedAt(p.x, p.y) : null;
      if (u !== null) return u.elmScope;
      return inScopes(p) ? (m.scopes[this.scopeAt(p.x, p.y)] ?? null) : null;
    };
    const touchDist = (): number => {
      const [a, b] = [...scopeTouches.values()];
      return a !== undefined && b !== undefined ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    /** A second finger on the scope the first one is on: start a pinch. */
    const scopePinchDown = (e: PointerEvent, p: { x: number; y: number }): boolean => {
      if (e.pointerType !== 'touch' || scopeTouches.size !== 1) return false;
      const s = scopeUnder(p);
      const first = [...scopeTouches.values()][0];
      if (s === null || first === undefined || first.scope !== s) return false;
      scopeTouches.set(e.pointerId, { ...p, scope: s });
      cancelPress();
      swipe = null;
      // the first finger's measuring or plot drag gives way to the pinch
      endScopeGesture();
      scopePinch = { scope: s, dist: Math.max(1, touchDist()) };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone
      }
      e.preventDefault();
      return true;
    };
    /** Pinch apart for a shorter time span (speedUp), together for a longer one. */
    const scopePinchMove = (id: number, p: { x: number; y: number }): boolean => {
      const t = scopeTouches.get(id);
      if (t === undefined) return false;
      t.x = p.x;
      t.y = p.y;
      if (scopePinch === null) return false;
      // one finger lifted: the other does nothing until it lifts too
      if (scopeTouches.size < 2) return true;
      const ratio = touchDist() / scopePinch.dist;
      if (ratio > PINCH_STEP) {
        scopePinch.scope.speedUp();
        scopePinch.dist = touchDist();
      } else if (ratio < 1 / PINCH_STEP) {
        scopePinch.scope.slowDown();
        scopePinch.dist = Math.max(1, touchDist());
      }
      return true;
    };
    /** A press on an undocked card's leader end picks it up, to drop on a post. */
    const leaderDown = (e: PointerEvent, p: { x: number; y: number }): boolean => {
      if (e.button !== 0 || ed.mouseMode !== MouseMode.SELECT || mgr().dialogShowing) return false;
      if (e.pointerType === 'touch' && touches.size > 0) return false;
      const reach = e.pointerType === 'touch' ? LEADER_GRAB_TOUCH : LEADER_GRAB;
      const u = this.leaderAt(p.x, p.y, reach);
      if (u === null || this.undockedAt(p.x, p.y) !== null) return false;
      this.leaderDrag = { elm: u, x: p.x, y: p.y, id: e.pointerId };
      if (ed.mouseElm !== null) ed.leave();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone
      }
      canvas.style.cursor = 'grabbing';
      this.publishEditor();
      e.preventDefault();
      return true;
    };
    // where ends met when an edit gesture began: new meeting points get a ripple when it ends
    let joinedBefore: Set<string> | null = null;
    const endScopeGesture = (): void => {
      const m = mgr();
      m.dragStartTime = -1;
      m.dragStartFreq = -1;
      m.dragFreqScope = null;
      if (m.draggingPlotYScope !== null) m.draggingPlotYScope.draggingPlotY = false;
      m.draggingPlotYScope = null;
      scopeGesture = null;
      split = null;
    };

    // Teaching tools: while one is picked, the first finger, pen or left button draws (or points,
    // or erases) instead of editing; a second finger cancels the stroke and pinches as usual.
    let teachId: number | null = null;
    const teachDown = (e: PointerEvent, p: { x: number; y: number }): boolean => {
      const { tool, pen } = useApp.getState().teach;
      const r = this.renderer;
      if (tool === null || !r) return false;
      if (teachId !== null) {
        if (e.pointerType !== 'touch') return true;
        // a second finger: this was a pinch, not a stroke
        if (tool === 'pencil') this.annotations.cancelStroke();
        else if (tool === 'eraser') this.annotations.endErase();
        else this.annotations.laserUp();
        teachId = null;
        return false;
      }
      if (e.button !== 0) return false;
      const c = r.viewport.toCircuit(p.x, p.y);
      const now = performance.now();
      if (tool === 'pencil') this.annotations.beginStroke(c, pen, r.viewport.scale);
      else if (tool === 'eraser') this.annotations.eraseAt(c, r.viewport.scale);
      else this.annotations.laserTo(c, now);
      teachId = e.pointerId;
      // remembered so a second finger becomes a pinch
      if (e.pointerType === 'touch') touches.set(e.pointerId, p);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // already released
      }
      e.preventDefault();
      return true;
    };
    const teachMove = (e: PointerEvent, p: { x: number; y: number }): boolean => {
      const tool = useApp.getState().teach.tool;
      const r = this.renderer;
      if (tool === null || !r) return false;
      if (e.pointerType === 'touch') touches.set(e.pointerId, p);
      const c = r.viewport.toCircuit(p.x, p.y);
      if (teachId === e.pointerId) {
        if (tool === 'pencil') this.annotations.extendStroke(c);
        else if (tool === 'eraser') this.annotations.eraseAt(c, r.viewport.scale);
        else this.annotations.laserTo(c, performance.now());
        return true;
      }
      // a mouse points with the laser without pressing a button
      if (tool === 'laser' && e.pointerType === 'mouse' && teachId === null) {
        this.annotations.laserTo(c, performance.now());
        return true;
      }
      // a pinch goes on as usual; hovering does nothing while drawing
      return teachId === null && e.pointerType !== 'touch';
    };
    const teachUp = (e: PointerEvent): boolean => {
      if (teachId !== e.pointerId) return false;
      teachId = null;
      touches.delete(e.pointerId);
      const tool = useApp.getState().teach.tool;
      this.annotations.endStroke();
      this.annotations.endErase();
      if (tool !== 'laser' || e.pointerType !== 'mouse') this.annotations.laserUp();
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      return true;
    };
    const down = (e: PointerEvent): void => {
      if (e.button === 2) return; // the context menu handles it
      canvas.focus({ preventScroll: true });
      const p = local(e);
      this.mouse = p;
      if (teachDown(e, p)) return;
      if (scopePinchDown(e, p)) return;
      if (leaderDown(e, p)) return;
      if (
        !(e.pointerType === 'touch' && touches.size > 0) &&
        (undockedDown(e, p) || scopeDown(e, p))
      )
        return;
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
        !useApp.getState().boxSelect &&
        ed.pick(g.x, g.y).elm === null;
      joinedBefore = this.renderer?.connectionKeys() ?? null;
      // a subcircuit's parts can be looked at, not edited
      const res =
        this.viewStack.length > 0
          ? 'pan'
          : ed.pointerDown(g.x, g.y, mods(e), e.button === 1 || touchPan);
      if (res === 'pan') pan = { x: p.x, y: p.y, id: e.pointerId };
      gestureId = e.pointerId;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone (released before this handler ran)
      }
      if (e.pointerType === 'touch' && ed.mouseMode === MouseMode.SELECT) startLongPress(e, p);
      this.publishEditor();
      updateCursor(g.x, g.y);
      e.preventDefault();
    };
    const move = (e: PointerEvent): void => {
      const r = this.renderer;
      if (!r) return;
      const p = local(e);
      this.mouse = p;
      this.mouseType = e.pointerType;
      if (teachMove(e, p)) return;
      if (split === e.pointerId) {
        const f = 1 - p.y / Math.max(1, this.cssHeight);
        this.scopeHeightFraction = Math.min(0.9, Math.max(0.1, f));
        return;
      }
      if (scopePinchMove(e.pointerId, p) && scopePinch !== null) return;
      const drag = this.leaderDrag;
      if (drag !== null && drag.id === e.pointerId) {
        drag.x = p.x;
        drag.y = p.y;
        return;
      }
      const sm = this.scopeMove;
      if (sm !== null && sm.id === e.pointerId) {
        if (swipe !== null && swipe.id === e.pointerId) {
          const dx = Math.abs(p.x - swipe.x);
          const dy = Math.abs(p.y - swipe.y);
          // sideways first: a swipe between columns, not a drag
          if (dx > 10 && dx > dy * 2) {
            this.scopeMove = null;
            return;
          }
          if (dy > 10) swipe = null;
        }
        sm.x = p.x;
        sm.y = p.y;
        Object.assign(sm, this.scopeDropAt(sm.from, p.x, p.y));
        return;
      }
      if (scopeGesture === e.pointerId) {
        if (
          press !== null &&
          press.id === e.pointerId &&
          Math.hypot(p.x - press.x, p.y - press.y) > LONG_PRESS_SLOP
        )
          cancelPress();
        mgr().draggingPlotYScope?.dragPlotY(p.y);
        this.hoverScopes(p.x, p.y);
        return;
      }
      if (gestureId === null && pan === null && pinch === null) {
        if (
          e.pointerType === 'mouse' &&
          this.undockedAt(p.x, p.y) === null &&
          this.leaderAt(p.x, p.y, LEADER_GRAB) !== null
        ) {
          if (ed.mouseElm !== null) ed.leave();
          canvas.style.cursor = 'grab';
          this.publishEditor();
          return;
        }
        const u = mgr().look === 'cards' ? this.undockedAt(p.x, p.y) : null;
        if (u !== null) {
          this.splitterHot = false;
          if (ed.mouseElm !== null) ed.leave();
          const m = mgr();
          m.mouseCursorX = p.x;
          m.mouseCursorY = p.y;
          this.hoverScopes(p.x, p.y);
          const hit = cardHitTest(u.elmScope, p.x, p.y);
          canvas.style.cursor =
            hit === null
              ? 'default'
              : hit.kind === 'handle'
                ? 'grab'
                : hit.kind === 'resize'
                  ? bottomRightPost(u) >= 0
                    ? 'nwse-resize'
                    : 'grab'
                  : 'pointer';
          this.publishEditor();
          return;
        }
        if (this.hoverUndocked !== null) this.clearScopeHover();
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
            : s !== undefined &&
                (s.cursorInSettingsWheel() ||
                  (m.look === 'cards' && cardHitTest(s, p.x, p.y) !== null))
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
      else if (!ed.isDragging && this.viewStack.length === 0) ed.hover(g.x, g.y);
      this.publishEditor();
      updateCursor(g.x, g.y);
    };
    const up = (e: PointerEvent): void => {
      if (teachUp(e)) return;
      const drag = this.leaderDrag;
      if (drag !== null && drag.id === e.pointerId) {
        this.leaderDrag = null;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        if (e.type === 'pointerup') {
          const p = local(e);
          const post = this.leaderSnap(drag.elm, p.x, p.y);
          this.setLeaderPost(drag.elm, post);
          const shown = drag.elm.elmScope.getElm();
          if (shown !== null) {
            const at = scopeAnchor(shown, post);
            this.renderer?.ripple(at.x, at.y);
          }
        }
        canvas.style.cursor = 'grab';
        this.publishEditor();
        return;
      }
      if (scopeTouches.delete(e.pointerId) && scopePinch !== null) {
        if (scopeTouches.size === 0) scopePinch = null;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        if (scopeGesture === e.pointerId) endScopeGesture();
        return;
      }
      if (split === e.pointerId || scopeGesture === e.pointerId) {
        if (press !== null && press.id === e.pointerId) cancelPress();
        const sm = this.scopeMove;
        if (sm !== null && sm.id === e.pointerId) {
          this.scopeMove = null;
          if (e.type === 'pointerup' && sm.to !== null && sm.where !== null)
            this.dropScope(sm.from, sm.to, sm.where);
          canvas.style.cursor = 'default';
        }
        if (swipe !== null && swipe.id === e.pointerId) {
          const p = local(e);
          const dx = p.x - swipe.x;
          if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(p.y - swipe.y) * 2)
            this.swipeScopes(dx < 0 ? 1 : -1);
        }
        swipe = null;
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
      this.rippleNewJoins(joinedBefore);
      joinedBefore = null;
      this.publishEditor();
      const g = grid(local(e));
      updateCursor(g.x, g.y);
    };
    const leave = (e: PointerEvent): void => {
      if (e.pointerId !== teachId && useApp.getState().teach.tool === 'laser')
        this.annotations.laserTo(null, performance.now());
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
      const u = mgr().look === 'cards' ? this.undockedAt(p.x, p.y) : null;
      // a trackpad pinch (ctrl) sends small steps: scale them up to about a step per pinch
      const scopeWheel = e.ctrlKey && !isMouseWheel(e) ? dy / 4 : dy / 16;
      if (u !== null && (isMouseWheel(e) || e.ctrlKey)) {
        u.elmScope.onMouseWheel(scopeWheel);
        return;
      }
      if (inScopes(p)) {
        // the wheel over a scope changes its time scale (about one step per notch)
        const i = this.scopeAt(p.x, p.y);
        if (i >= 0) mgr().scopes[i]?.onMouseWheel(scopeWheel);
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
      if (this.viewStack.length > 0) {
        e.preventDefault();
        return;
      }
      // the browser's own long-press menu event: same as ours, so the timer is not needed
      if (press !== null) {
        const id = press.id;
        cancelPress();
        abandonGesture(id);
      }
      const lp = local(e);
      this.menuScope = -1;
      this.menuUndocked = null;
      const u = this.undockedAt(lp.x, lp.y);
      if (u !== null) {
        const s = u.elmScope;
        this.menuElm = null;
        if (s.canMenu()) {
          this.menuUndocked = u;
          this.menuPlot = s.selectedPlot;
        }
        this.publishEditor();
        return;
      }
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
      // pick what is under the mouse now (a touch long-press has no hover before it), or the
      // selected element for a menu opened from the keyboard
      const g = grid(lp);
      ed.hover(g.x, g.y);
      this.menuElm = this.keyboardMenuElm ?? ed.mouseElm;
      this.keyboardMenuElm = null;
      this.menuPos = g;
      this.publishEditor();
    };
    const dblclick = (e: MouseEvent): void => {
      if (useApp.getState().teach.tool !== null) return;
      const lp = local(e);
      const u = this.undockedAt(lp.x, lp.y);
      if (u !== null) {
        const s = u.elmScope;
        if (!(mgr().look === 'cards' && cardHitTest(s, lp.x, lp.y) !== null))
          this.openScopeProperties(s);
        return;
      }
      if (inScopes(lp)) {
        const s = mgr().scopes[this.scopeAt(lp.x, lp.y)];
        // a double click on a card's buttons or chips is two clicks on them
        if (s !== undefined && !(mgr().look === 'cards' && cardHitTest(s, lp.x, lp.y) !== null))
          this.openScopeProperties(s);
        return;
      }
      if (this.viewStack.length > 0) return;
      const g = grid(lp);
      const elm = ed.pick(g.x, g.y).elm;
      if (elm === null || elm instanceof SwitchElm) return;
      // upstream: a subcircuit with part positions opens to show them
      if (elm instanceof CustomCompositeElm && elm.canViewComponents()) {
        this.viewComponents(elm);
        return;
      }
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

  /** The theme on screen. */
  get theme(): Theme {
    return shownTheme(useApp.getState());
  }

  /** Screen position (CSS px, canvas relative) of a circuit point, for tests. */
  toScreen(x: number, y: number): { x: number; y: number } | null {
    return this.renderer?.viewport.toScreen(x, y) ?? null;
  }
}

/** Size of a new undocked scope (circuit units). */
/** The canvas cursor for a teaching tool (the laser draws its own dot). */
function teachCursor(tool: TeachTool | null): string {
  if (tool === 'pencil' || tool === 'eraser') return 'crosshair';
  if (tool === 'laser') return 'none';
  return 'default';
}

const UNDOCKED_WIDTH = 224;
const UNDOCKED_HEIGHT = 144;

/**
 * The circuit point an undocked scope's leader line goes to: the post of a one-post element
 * (a labeled node, an output), else the middle of the element.
 */
function scopeAnchor(elm: CircuitElm, post = -1): { x: number; y: number } {
  if (post >= 0 && post < elm.getPostCount()) return elm.getPost(post);
  if (elm.getPostCount() === 1) return elm.getPost(0);
  const b = viewFor(elm)?.bbox(elm);
  if (b === undefined) return { x: (elm.x + elm.x2) / 2, y: (elm.y + elm.y2) / 2 };
  return { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
}

/** An element in words for screen readers: its info lines, without the fixed-width padding. */
export function describeElement(e: CircuitElm): string {
  const arr: string[] = [];
  e.getInfo(arr);
  const lines: string[] = [];
  for (const l of arr) {
    if (typeof l !== 'string') break;
    lines.push(l.replace(/\s+/g, ' ').trim());
  }
  return lines.join(', ') || e.getClassName();
}

/** Width of the info card beside docked scopes in the card look. */
const CARD_INFO_WIDTH = 200;
/** Advance of one character of the 12 px monospace info font (about 0.6 em). */
const MONO_CHAR_WIDTH = 7.5;

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

/** Which point of an undocked scope is its bottom right corner (its resize grip), or -1. */
function bottomRightPost(u: ScopeElm): number {
  const b = u.box();
  if (u.x2 === b.x2 && u.y2 === b.y2) return 1;
  if (u.x === b.x2 && u.y === b.y2) return 0;
  return -1;
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
}

/** How long a touch must stay still to open the context menu, and how far it may wander (px). */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 8;
/** Canvas narrower than this shows one scope column at a time (CSS px). */
const COMPACT_WIDTH = 600;
/** How near a post a dropped leader snaps to it, and how near its end a press grabs it (px). */
const LEADER_SNAP = 20;
const LEADER_GRAB = 7;
const LEADER_GRAB_TOUCH = 14;
/** Finger distance ratio for one time scale step in a scope pinch. */
const PINCH_STEP = 1.4;

/** Sideways travel that counts as a swipe between scope columns (CSS px). */
const SWIPE_MIN = 40;

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

/** Play an audio output element's recording (upstream builds a WAV blob; Web Audio is enough). */
function playSamples(samples: Int16Array, samplingRate: number): void {
  const ctx = new AudioContext();
  const buffer = ctx.createBuffer(1, samples.length, samplingRate);
  const ch = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 32768;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.onended = () => void ctx.close();
  src.start();
}
