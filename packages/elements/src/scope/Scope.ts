// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/Scope.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, with ScopePropertiesDialog.nextHighestScale. Drawing
// goes through ScopeGraphics with semantic inks instead of upstream's colors; the card look
// (ScopeCardView.ts) is this port's own.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Simulation } from '@perun/engine';
import type { CircuitElm } from '../CircuitElm.ts';
import { OHM, getTimeText } from '../view/units.ts';
import {
  UNITS_A,
  UNITS_C,
  UNITS_COUNT,
  UNITS_OHMS,
  UNITS_V,
  UNITS_W,
  VAL_CHARGE,
  VAL_CURRENT,
  VAL_IB,
  VAL_IC,
  VAL_IE,
  VAL_POWER,
  VAL_R,
  VAL_VBC,
  VAL_VBE,
  VAL_VCE,
  VAL_VOLTAGE,
} from './constants.ts';
import type { ScopeManager } from './ScopeManager.ts';
import { cardHitTest, drawScopeCard } from './ScopeCardView.ts';
import { ScopeFFT } from './ScopeFFT.ts';
import type { ScopeGraphics, ScopeInk } from './ScopeGraphics.ts';
import { ScopeOverlays } from './ScopeOverlays.ts';
import { ScopeDataIterator, ScopePlot, V_POSITION_STEPS } from './ScopePlot.ts';
import { ScopePlot2d, rectContains } from './ScopePlot2d.ts';
import { ScopeSerializer } from './ScopeSerializer.ts';
import { snapToWave } from './ScopeSnap.ts';
import { ScopeTrigger } from './ScopeTrigger.ts';

export const MULTA = [2.0, 2.5, 2.0] as const;
export const MIN_MAN_SCALE = 1e-9;

/** A scope's area in canvas pixels (upstream `Rectangle`). */
export interface ScopeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Element kinds that never get a current plot next to their voltage. */
export interface ScopeElementKinds {
  isTransistor(e: CircuitElm): boolean;
  /** OutputElm, LogicOutputElm, AudioOutputElm, TestPointElm, ProbeElm. */
  isOutputLike(e: CircuitElm): boolean;
  /** OutputElm or ProbeElm, the candidates for an X-Y plot's Y element. */
  isXYCandidate(e: CircuitElm): boolean;
  isWire(e: CircuitElm): boolean;
}

/** The next "nice" scale (1, 2, 5 steps) above d. */
export function nextHighestScale(d: number): number {
  // go just above the last check point
  d = d * 1.001;
  let s = MIN_MAN_SCALE;
  for (let a = 0; s < d; a++) s *= MULTA[a % 3];
  return s;
}

/** Shared by every scope, as upstream's static `lastManDivisions`. */
let lastManDivisions = 8;

export function setLastManDivisions(d: number): void {
  lastManDivisions = d;
}

export function getScaleUnitsText(units: number): string {
  switch (units) {
    case UNITS_A:
      return 'A';
    case UNITS_OHMS:
      return OHM;
    case UNITS_W:
      return 'W';
    case UNITS_C:
      return 'C';
    default:
      return 'V';
  }
}

/** One oscilloscope: plots of element values over time, or against each other. */
export class Scope {
  readonly mgr: ScopeManager;
  scopePointCount = 128;
  position = -1;
  /** Sim timestep units per pixel. */
  speed = 64;
  /** Number of scopes in this column. */
  stackCount = 0;
  text: string | null = null;
  /** The plot area. */
  rect: ScopeRect = { x: 0, y: 0, width: 1, height: 1 };
  /** The scope's whole space: the plot area plus, in the card look, its card and header. */
  slot: ScopeRect = { x: 0, y: 0, width: 1, height: 1 };
  /** Undocked: its element is selected on the circuit (the card gets the selection outline). */
  canvasSelected = false;
  /** Card look: sim time the trace was frozen at, or null while live (not upstream). */
  frozen: number | null = null;
  /** Card look: when (ScopeManager.now) the card last flashed, for freeze feedback. */
  flashAt = -Infinity;
  manualScale = false;
  showI = false;
  showV = false;
  showScale = false;
  showMax = true;
  showMin = false;
  showP2P = false;
  showFreq = false;
  readonly plot2d: ScopePlot2d;
  readonly fftPlot: ScopeFFT;
  readonly overlays: ScopeOverlays;
  readonly serializer: ScopeSerializer;
  maxScale = false;
  showNegative = false;
  showRMS = false;
  showAverage = false;
  showDutyCycle = false;
  showElmInfo = false;
  plots: ScopePlot[] = [];
  visiblePlots: ScopePlot[] = [];
  /** Timestep the graph was set up for; a change resets it when drawing. */
  scopeTimeStep = 0;
  /** Max value to scale the display to, per unit. */
  readonly scale = new Float64Array(UNITS_COUNT);
  readonly reduceRange: boolean[] = new Array<boolean>(UNITS_COUNT).fill(false);
  wheelDeltaY = 0;
  selectedPlot = -1;
  gridStepX = 0;
  gridStepY = 0;
  maxValue = 0;
  minValue = 0;
  /** Number of vertical divisions in manual mode. */
  manDivisions: number;
  drawGridLines = false;
  somethingSelected = false;
  readonly trigger = new ScopeTrigger();
  draggingPlotY = false;
  dragPlotYMouseStart = 0;
  dragPlotYInitialPosition = 0;

  constructor(mgr: ScopeManager) {
    this.mgr = mgr;
    this.manDivisions = lastManDivisions;
    this.plot2d = new ScopePlot2d(this);
    this.fftPlot = new ScopeFFT(this);
    this.overlays = new ScopeOverlays(this);
    this.serializer = new ScopeSerializer(this);
    this.initialize();
  }

  get sim(): Simulation {
    return this.mgr.sim;
  }

  private newPlot(ce: CircuitElm | null, u: number, v: number): ScopePlot {
    return new ScopePlot(ce, u, v, this.getManScaleFromMaxScale(u, false));
  }

  showCurrent(b: boolean): void {
    this.showI = b;
    if (b && !this.hasPlotValue(VAL_CURRENT)) {
      const ce = this.getElm();
      if (ce !== null) this.plots.push(this.newPlot(ce, UNITS_A, VAL_CURRENT));
    }
    this.calcVisiblePlots();
    this.resetGraph();
  }

  showVoltage(b: boolean): void {
    this.showV = b;
    if (b && !this.hasPlotValue(VAL_VOLTAGE)) {
      const ce = this.getElm();
      if (ce !== null) this.plots.push(this.newPlot(ce, UNITS_V, VAL_VOLTAGE));
    }
    this.calcVisiblePlots();
    this.resetGraph();
  }

  /** Does any plot have the given value (unlike showingValue, which checks all plots)? */
  hasPlotValue(v: number): boolean {
    return this.plots.some((p) => p.value === v);
  }

  showPlotValue(val: number, b: boolean): void {
    if (b) {
      if (!this.hasPlotValue(val)) {
        const ce = this.getElm();
        if (ce !== null) {
          const u = ce.getScopeUnits(val);
          this.plots.push(this.newPlot(ce, u, val));
        }
      }
    } else {
      for (let i = this.plots.length - 1; i >= 0; i--)
        if (this.plots[i].value === val && this.plots.length > 1) this.plots.splice(i, 1);
    }
    this.calcVisiblePlots();
    this.resetGraph();
  }

  showCharge(b: boolean): void {
    this.showPlotValue(VAL_CHARGE, b);
  }

  showPower(b: boolean): void {
    this.showPlotValue(VAL_POWER, b);
  }

  setManualScale(value: boolean, roundup: boolean): void {
    if (value !== this.manualScale) this.plot2d.clearView();
    this.manualScale = value;
    for (const p of this.plots) {
      if (!p.manScaleSet) {
        p.manScale = this.getManScaleFromMaxScale(p.units, roundup);
        p.manVPosition = 0;
        p.manScaleSet = true;
      }
    }
  }

  resetGraph(full = false): void {
    // a fresh trace has nothing to hold
    this.frozen = null;
    this.scopePointCount = 1;
    while (this.scopePointCount <= this.rect.width) this.scopePointCount *= 2;
    // double buffer for trigger mode to prevent overwriting displayed data
    if (this.trigger.isActive()) this.scopePointCount *= 2;
    this.showNegative = false;
    for (const p of this.plots) p.reset(this.scopePointCount, this.speed, full, this.sim);
    this.calcVisiblePlots();
    this.scopeTimeStep = this.sim.maxTimeStep;
    this.plot2d.allocImage();
    this.trigger.reset(this.scopePointCount);
    this.plot2d.lastTrailSimTime = -1;
  }

  setManualScaleValue(plotId: number, d: number): void {
    // shouldn't happen, but just in case
    if (plotId >= this.visiblePlots.length) return;
    this.plot2d.clearView();
    this.visiblePlots[plotId].manScale = d;
    this.visiblePlots[plotId].manScaleSet = true;
  }

  getScaleValue(): number {
    if (this.visiblePlots.length === 0) return 0;
    return this.scale[this.visiblePlots[0].units];
  }

  getScaleUnitsText(): string {
    if (this.visiblePlots.length === 0) return 'V';
    return getScaleUnitsText(this.visiblePlots[0].units);
  }

  setManDivisions(d: number): void {
    this.manDivisions = lastManDivisions = d;
  }

  active(): boolean {
    return this.plots.length > 0 && this.plots[0].elm !== null;
  }

  isTriggered(): boolean {
    return this.trigger.isTriggered();
  }

  displayStartIndex(plot: ScopePlot, w: number): number {
    return this.trigger.displayStartIndex(plot, w, this.scopePointCount);
  }

  validDataCount(plot: ScopePlot, ipa: number, w: number): number {
    return this.trigger.validDataCount(plot, ipa, w, this.scopePointCount);
  }

  checkTrigger(): void {
    this.trigger.check(this.visiblePlots, this.plot2d.enabled, this.sim, this.rect.width);
  }

  setTriggerMode(mode: number): void {
    this.trigger.mode = mode;
    this.resetGraph();
  }

  initialize(): void {
    this.resetGraph();
    const sc = this.scale;
    sc[UNITS_W] = sc[UNITS_OHMS] = sc[UNITS_V] = sc[UNITS_C] = 5;
    sc[UNITS_A] = 0.1;
    this.plot2d.scaleX = 5;
    this.plot2d.scaleY = 0.1;
    this.plot2d.enabled = false;
    this.speed = 64;
    this.showMax = true;
    this.showV = this.showI = false;
    this.showScale = this.showFreq = this.manualScale = this.showMin = this.showP2P = false;
    this.showElmInfo = false;
    this.fftPlot.enabled = false;
    if (!this.serializer.loadDefaults()) {
      // set showV and showI appropriately depending on what plots are present
      for (const plot of this.plots) {
        if (plot.units === UNITS_V) this.showV = true;
        if (plot.units === UNITS_A) this.showI = true;
      }
    }
  }

  calcVisiblePlots(): void {
    this.visiblePlots = [];
    let vc = 0;
    let ac = 0;
    let oc = 0;
    if (!this.plot2d.enabled) {
      for (const plot of this.plots) {
        if (plot.value === VAL_VOLTAGE) {
          if (this.showV) {
            this.visiblePlots.push(plot);
            plot.assignColor(vc++);
          }
        } else if (plot.value === VAL_CURRENT) {
          if (this.showI) {
            this.visiblePlots.push(plot);
            plot.assignColor(ac++);
          }
        } else {
          this.visiblePlots.push(plot);
          plot.assignColor(oc++);
        }
      }
    } else {
      // in 2D mode show all plots so scales can be adjusted for any
      for (const plot of this.plots) this.visiblePlots.push(plot);
    }
  }

  setRect(r: ScopeRect): void {
    const w = this.rect.width;
    const h = this.rect.height;
    this.rect = r;
    // (upstream resets only X/Y plots on a height change; any 2D plot's image needs the new size)
    if (r.width !== w || (this.plot2d.enabled && r.height !== h)) this.resetGraph();
  }

  getWidth(): number {
    return this.rect.width;
  }

  rightEdge(): number {
    return Math.max(this.rect.x + this.rect.width, this.slot.x + this.slot.width);
  }

  setElm(ce: CircuitElm | null): void {
    this.plots = [];
    if (ce !== null && this.mgr.kinds.isTransistor(ce)) this.setValueOf(VAL_VCE, ce);
    else this.setValueOf(0, ce);
    this.initialize();
  }

  addElm(ce: CircuitElm): void {
    if (this.mgr.kinds.isTransistor(ce)) this.addValue(VAL_VCE, ce);
    else this.addValue(0, ce);
  }

  setValue(val: number): void {
    if (this.plots.length > 2 || this.plots.length === 0) return;
    const ce = this.plots[0].elm;
    if (this.plots.length === 2 && this.plots[1].elm !== ce) return;
    this.plot2d.enabled = this.plot2d.plotXY = false;
    this.setValueOf(val, ce);
  }

  addValue(val: number, ce: CircuitElm | null): void {
    if (val === 0) {
      this.plots.push(this.newPlot(ce, UNITS_V, VAL_VOLTAGE));
      // create plot for current if applicable
      if (ce !== null && this.mgr.dotsEnabled() && !this.mgr.kinds.isOutputLike(ce))
        this.plots.push(this.newPlot(ce, UNITS_A, VAL_CURRENT));
    } else if (ce !== null) {
      const u = ce.getScopeUnits(val);
      this.plots.push(this.newPlot(ce, u, val));
      if (u === UNITS_V) this.showV = true;
      if (u === UNITS_A) this.showI = true;
    }
    this.calcVisiblePlots();
    this.resetGraph();
  }

  /** Upstream `setValue(int val, CircuitElm ce)`. */
  setValueOf(val: number, ce: CircuitElm | null): void {
    this.plots = [];
    this.addValue(val, ce);
  }

  setValues(val: number, ival: number, ce: CircuitElm | null, yelm: CircuitElm | null): void {
    if (ival > 0 && ce !== null) {
      this.plots = [
        this.newPlot(ce, ce.getScopeUnits(val), val),
        this.newPlot(ce, ce.getScopeUnits(ival), ival),
      ];
      return;
    }
    if (yelm !== null && ce !== null) {
      this.plots = [
        this.newPlot(ce, ce.getScopeUnits(val), 0),
        new ScopePlot(
          yelm,
          ce.getScopeUnits(ival),
          0,
          this.getManScaleFromMaxScale(ce.getScopeUnits(val), false),
        ),
      ];
      return;
    }
    this.setValue(val);
  }

  /** Do all plots show value v? */
  showingValue(v: number): boolean {
    return this.plots.every((p) => p.value === v);
  }

  /**
   * True with a voltage plot and nothing else but current or charge: the default voltage and
   * current case.
   */
  showingVoltageAndMaybeCurrent(): boolean {
    let gotv = false;
    for (const sp of this.plots) {
      if (sp.value === VAL_VOLTAGE) gotv = true;
      else if (sp.value !== VAL_CURRENT && sp.value !== VAL_CHARGE) return false;
    }
    return gotv;
  }

  combine(s: Scope): void {
    this.plots = this.visiblePlots;
    this.plots.push(...s.visiblePlots);
    s.plots.length = 0;
    this.calcVisiblePlots();
  }

  /**
   * Split this scope's plots into separate scopes in arr[pos], arr[pos+1] ... and return the new
   * length. A voltage plot followed by its own element's current stays together.
   */
  separate(arr: Scope[], pos: number, maxScopes: number): number {
    let lastPlot: ScopePlot | null = null;
    for (const sp of this.visiblePlots) {
      if (pos >= maxScopes) return pos;
      const s = new Scope(this.mgr);
      if (
        lastPlot !== null &&
        lastPlot.elm === sp.elm &&
        lastPlot.value === VAL_VOLTAGE &&
        sp.value === VAL_CURRENT
      )
        continue;
      s.setValueOf(sp.value, sp.elm);
      s.position = pos;
      arr[pos++] = s;
      lastPlot = sp;
      s.serializer.setFlags(this.serializer.getFlags());
      s.setSpeed(this.speed);
    }
    return pos;
  }

  removePlot(plot: number): void {
    if (plot < this.visiblePlots.length) {
      const p = this.visiblePlots[plot];
      const i = this.plots.indexOf(p);
      if (i >= 0) this.plots.splice(i, 1);
      this.calcVisiblePlots();
    }
  }

  /** The time at the right edge of the trace: the freeze time while frozen. */
  displayT(): number {
    return this.frozen ?? this.sim.t;
  }

  /** Hold the trace while the simulation runs on; unfreezing starts a new trace. */
  setFrozen(b: boolean): void {
    if (b === (this.frozen !== null)) return;
    this.flashAt = this.mgr.now;
    if (b) this.frozen = this.sim.t;
    else this.resetGraph(true);
  }

  /** Called for each timestep. */
  timeStep(): void {
    if (this.frozen !== null) return;
    for (const p of this.plots) p.timeStep(this.sim);
    this.checkTrigger();
    // for 2d plots we draw here rather than in the drawing routine
    if (this.plot2d.enabled) this.plot2d.timeStep();
  }

  setMaxScale(s: boolean): void {
    // call the toggle first for its side effects, then set the value explicitly
    this.toggleMaxScale();
    this.maxScale = s;
  }

  /** Upstream `maxScale()`: toggle the auto scale fixed at the maximum. */
  toggleMaxScale(): void {
    if (this.plot2d.enabled) {
      this.plot2d.maxScale();
      return;
    }
    // Not on by default: for the examples we sometimes want two plots matched to the same scale,
    // and for fast-moving scopes the amplitude change is hidden if the scale keeps adjusting.
    this.maxScale = !this.maxScale;
    this.showNegative = false;
  }

  drawSettingsWheel(g: ScopeGraphics): void {
    const outR = 8;
    const inR = 5;
    const inR45 = 4;
    const outR45 = 6;
    if (!this.showSettingsWheel()) return;
    g.save();
    g.setColor(this.cursorInSettingsWheel() ? 'selection' : 'settings');
    g.translate(this.rect.x + 18, this.rect.y + this.rect.height - 18);
    g.drawThickCircle(0, 0, inR);
    g.drawLine(-outR, 0, -inR, 0, 3);
    g.drawLine(outR, 0, inR, 0, 3);
    g.drawLine(0, -outR, 0, -inR, 3);
    g.drawLine(0, outR, 0, inR, 3);
    g.drawLine(-outR45, -outR45, -inR45, -inR45, 3);
    g.drawLine(outR45, -outR45, inR45, -inR45, 3);
    g.drawLine(-outR45, outR45, -inR45, inR45, 3);
    g.drawLine(outR45, outR45, inR45, inR45, 3);
    g.restore();
  }

  showSettingsWheel(): boolean {
    // the card look has its settings button in the header
    if (this.mgr.look === 'cards') return false;
    return this.rect.height > 100 && this.rect.width > 100;
  }

  cursorInSettingsWheel(): boolean {
    const mx = this.mgr.mouseCursorX;
    const my = this.mgr.mouseCursorY;
    if (this.mgr.look === 'cards') return cardHitTest(this, mx, my)?.kind === 'settings';
    const r = this.rect;
    return (
      this.showSettingsWheel() &&
      mx >= r.x &&
      mx <= r.x + 36 &&
      my >= r.y + r.height - 36 &&
      my <= r.y + r.height
    );
  }

  /** Does another scope have something selected? */
  checkForSelectionElsewhere(): void {
    const mgr = this.mgr;
    // if mouse is here, then selection is already set by checkForSelection()
    if (mgr.cursorScope === this) return;
    // don't hijack the plot being dragged
    if (this.draggingPlotY) return;
    if (mgr.cursorScope === null || this.visiblePlots.length === 0) {
      this.selectedPlot = -1;
      return;
    }
    // find a plot with same units as selected plot
    for (let i = 0; i !== this.visiblePlots.length; i++) {
      if (this.visiblePlots[i].units === mgr.cursorUnits) {
        this.selectedPlot = i;
        return;
      }
    }
    // default if we can't find anything with matching units
    this.selectedPlot = 0;
  }

  draw(g: ScopeGraphics): void {
    if (this.plots.length === 0) return;
    const mgr = this.mgr;
    const sim = this.sim;
    // reset if timestep changed
    if (this.scopeTimeStep !== sim.maxTimeStep) {
      this.scopeTimeStep = sim.maxTimeStep;
      this.resetGraph();
    }
    if (mgr.look === 'cards') {
      drawScopeCard(this, g);
      return;
    }
    if (this.plot2d.enabled) {
      this.plot2d.draw(g);
      return;
    }

    this.drawSettingsWheel(g);
    g.save();
    g.translate(this.rect.x, this.rect.y);
    g.clipRect(0, 0, this.rect.width, this.rect.height);

    if (this.fftPlot.enabled) {
      this.fftPlot.drawVerticalGridLines(g);
      this.fftPlot.draw(g);
    }

    const { sel, highlight, allPlotsSameUnits } = this.prepareDraw();
    if (highlight) {
      g.save();
      g.setGlobalAlpha(0.15);
      g.setColor('selection');
      g.fillRect(0, 0, this.rect.width, this.rect.height);
      g.restore();
    }
    this.drawGridLines = true;
    const vp = this.visiblePlots;

    // draw volt plots on top (last), then current plots underneath, then everything else
    for (let i = 0; i !== vp.length; i++)
      if (vp[i].units > UNITS_A && i !== this.selectedPlot)
        this.drawPlot(g, vp[i], allPlotsSameUnits, false, sel);
    for (let i = 0; i !== vp.length; i++)
      if (vp[i].units === UNITS_A && i !== this.selectedPlot)
        this.drawPlot(g, vp[i], allPlotsSameUnits, false, sel);
    for (let i = 0; i !== vp.length; i++)
      if (vp[i].units === UNITS_V && i !== this.selectedPlot)
        this.drawPlot(g, vp[i], allPlotsSameUnits, false, sel);
    // draw selection on top. only works if selection chosen from scope
    if (this.selectedPlot >= 0 && this.selectedPlot < vp.length)
      this.drawPlot(g, vp[this.selectedPlot], allPlotsSameUnits, true, sel);

    this.trigger.drawIndicator(g, vp, this.rect);
    this.overlays.draw(g);

    g.restore();

    this.drawCursor(g);
    this.finishDraw();
  }

  /**
   * The part of draw() before any plot is drawn: auto scales, which plot is selected, and the
   * max and min. `highlight` asks for the selection tint over the scope.
   */
  prepareDraw(): { sel: boolean; highlight: boolean; allPlotsSameUnits: boolean } {
    const mgr = this.mgr;
    for (let i = 0; i !== UNITS_COUNT; i++) {
      this.reduceRange[i] = false;
      if (this.maxScale && !this.manualScale) this.scale[i] = 1e-4;
    }

    // is one of our plots selected?
    this.somethingSelected = false;
    for (const plot of this.visiblePlots) {
      this.calcPlotScale(plot);
      if (mgr.scopeSelected === -1 && plot.elm !== null && plot.elm === mgr.mouseElm)
        this.somethingSelected = true;
      this.reduceRange[plot.units] = true;
    }

    const sel = mgr.scopeMenuIsSelected(this);
    const somethingSelectedHere = this.somethingSelected;

    this.checkForSelectionElsewhere();
    if (this.selectedPlot >= 0) this.somethingSelected = true;
    const highlight = somethingSelectedHere || sel;
    if (this.getSingleElm() !== null) this.somethingSelected = false;

    let allPlotsSameUnits = true;
    const vp = this.visiblePlots;
    for (let i = 1; i < vp.length; i++) {
      // don't draw horizontal grid lines unless all plots are in same units
      if (vp[i].units !== vp[0].units) allPlotsSameUnits = false;
    }

    if ((allPlotsSameUnits || this.showMax || this.showMin || this.showP2P) && vp.length > 0)
      this.calcMaxAndMin(vp[0].units);
    return { sel, highlight, allPlotsSameUnits };
  }

  /** The part of draw() after the plots: shrink auto scales that have room to spare. */
  finishDraw(): void {
    if (this.plots[0].ptr > 5 && !this.manualScale) {
      for (let i = 0; i !== UNITS_COUNT; i++)
        if (this.scale[i] > 1e-4 && this.reduceRange[i]) this.scale[i] /= 2;
    }
  }

  /** The color a plot is drawn in now: muted while another is selected, or the selection. */
  plotInk(plot: ScopePlot, selected: boolean, allSelected: boolean): ScopeInk {
    const mgr = this.mgr;
    let color: ScopeInk = this.somethingSelected ? 'muted' : plot.color;
    if (
      allSelected ||
      (mgr.scopeSelected === -1 && this.getSingleElm() === null && plot.elm === mgr.mouseElm)
    )
      color = 'selection';
    else if (selected) color = plot.color;
    return color;
  }

  /** Maximum and minimum values for all plots of the given units. */
  calcMaxAndMin(units: number): void {
    this.maxValue = -1e8;
    this.minValue = 1e8;
    for (const plot of this.visiblePlots) {
      if (plot.units !== units) continue;
      const sdi = new ScopeDataIterator(this, plot);
      for (const _i of sdi) {
        if (sdi.getMax() > this.maxValue) this.maxValue = sdi.getMax();
        if (sdi.getMin() < this.minValue) this.minValue = sdi.getMin();
      }
    }
  }

  /** Adjust the auto scale of a plot. */
  calcPlotScale(plot: ScopePlot): void {
    if (this.manualScale) return;
    let max = 0;
    let gridMax = this.scale[plot.units];
    const sdi = new ScopeDataIterator(this, plot);
    for (const _i of sdi) {
      if (sdi.getMax() > max) max = sdi.getMax();
      if (sdi.getMin() < -max) max = -sdi.getMin();
    }
    // scale fixed at maximum?
    if (this.maxScale) gridMax = Math.max(max, gridMax);
    // adjust in powers of two
    else while (max > gridMax) gridMax *= 2;
    this.scale[plot.units] = gridMax;
  }

  calcGridStepX(): number {
    let multptr = 0;
    let gsx = 1e-15;
    const ts = this.sim.maxTimeStep * this.speed;
    while (gsx < ts * 20) gsx *= MULTA[multptr++ % 3];
    return gsx;
  }

  getGridMaxFromManScale(plot: ScopePlot): number {
    return (this.manDivisions / 2 + 0.05) * plot.manScale;
  }

  /**
   * Grid parameters for a plot. Sets plot.plotOffset, plot.gridMult and this.gridStepY; returns
   * gridMid.
   */
  calcGridParams(plot: ScopePlot, allPlotsSameUnits: boolean): number {
    const maxy = Math.trunc((this.rect.height - 1) / 2);
    let gridMid: number;
    let positionOffset: number;
    let gridMax: number;
    if (!this.isManualScale()) {
      gridMax = this.scale[plot.units];
      gridMid = 0;
      positionOffset = 0;
      if (allPlotsSameUnits) {
        // Without overlapping plots of different units we can move zero around. Put it at the
        // bottom if the scope is never negative.
        let mx = gridMax;
        let mn = 0;
        if (this.maxScale) {
          // scale is maxed out, so fix boundaries of scope at maximum and minimum.
          mx = this.maxValue;
          mn = this.minValue;
        } else if (this.showNegative || this.minValue < (mx + mn) * 0.5 - (mx - mn) * 0.55) {
          mn = -gridMax;
          this.showNegative = true;
        }
        gridMid = (mx + mn) * 0.5;
        // leave space at top and bottom
        gridMax = (mx - mn) * 0.55;
      }
      this.gridStepY = 1e-8;
      let multptr = 0;
      while (this.gridStepY < (20 * gridMax) / maxy) this.gridStepY *= MULTA[multptr++ % 3];
    } else {
      gridMid = 0;
      gridMax = this.getGridMaxFromManScale(plot);
      positionOffset = (gridMax * 2.0 * plot.manVPosition) / V_POSITION_STEPS;
      this.gridStepY = plot.manScale;
    }
    plot.plotOffset = -gridMid + positionOffset;
    plot.gridMult = maxy / gridMax;
    return gridMid;
  }

  drawHVGridLines(
    g: ScopeGraphics,
    plot: ScopePlot,
    gridMid: number,
    allPlotsSameUnits: boolean,
    allSelected: boolean,
  ): void {
    const rect = this.rect;
    const sim = this.sim;
    const maxy = Math.trunc((rect.height - 1) / 2);
    const minorDiv: ScopeInk = 'gridMinor';
    const majorDiv: ScopeInk = allSelected ? 'selection' : 'gridMajor';
    const highlightCenter = !this.isManualScale();

    // horizontal gridlines; only show non-center lines if units are unambiguous
    const showHGridLines = this.gridStepY !== 0 && (this.isManualScale() || allPlotsSameUnits);
    for (let ll = -100; ll <= 100; ll++) {
      if (ll !== 0 && !showHGridLines) continue;
      const yl = maxy - Math.trunc((ll * this.gridStepY - gridMid) * plot.gridMult);
      if (yl < 0 || yl >= rect.height - 1) continue;
      g.setColor(ll === 0 && highlightCenter ? majorDiv : minorDiv);
      g.drawLine(0, yl, rect.width - 1, yl);
    }

    // vertical (time) gridlines
    const ts = sim.maxTimeStep * this.speed;
    const tRight = this.isTriggered() ? this.trigger.time + (ts * rect.width) / 2 : this.displayT();
    const tstart = tRight - ts * rect.width;
    const gsx = this.gridStepX;
    const tx = tRight - (tRight % gsx);
    for (let ll = 0; ; ll++) {
      const tl = tx - gsx * ll;
      const gx = Math.trunc((tl - tstart) / ts);
      if (gx < 0) break;
      if (gx >= rect.width || tl < 0) continue;
      g.setColor((tl + gsx / 4) % (gsx * 10) < gsx ? majorDiv : minorDiv);
      g.drawLine(gx, 0, gx, rect.height - 1);
    }
  }

  drawPlot(
    g: ScopeGraphics,
    plot: ScopePlot,
    allPlotsSameUnits: boolean,
    selected: boolean,
    allSelected: boolean,
  ): void {
    if (plot.elm === null) return;
    const rect = this.rect;
    const maxy = Math.trunc((rect.height - 1) / 2);

    const color = this.plotInk(plot, selected, allSelected);

    const ipa = this.displayStartIndex(plot, rect.width);
    const maxV = plot.maxValues;
    const minV = plot.minValues;

    const gridMid = this.calcGridParams(plot, allPlotsSameUnits);
    let minRangeLo = -10 - Math.trunc(gridMid * plot.gridMult);
    let minRangeHi = 10 - Math.trunc(gridMid * plot.gridMult);

    this.gridStepX = this.calcGridStepX();
    if (this.drawGridLines) this.drawHVGridLines(g, plot, gridMid, allPlotsSameUnits, allSelected);
    this.drawGridLines = false;

    g.setColor(color);
    if (this.isManualScale()) {
      const y0 = maxy - Math.trunc(plot.gridMult * plot.plotOffset);
      g.drawLine(0, y0, 8, y0);
      g.drawString('0', 0, y0 - 2);
    }

    // In triggered mode, only draw up to the current write pointer. Data beyond that is stale
    // (old circular buffer contents).
    const drawWidth = this.validDataCount(plot, ipa, rect.width);
    let ox = -1;
    let oy = -1;
    let i: number;
    const spc = this.scopePointCount;
    for (i = 0; i !== drawWidth; i++) {
      const ip = (i + ipa) & (spc - 1);
      const minvy = javaRound(plot.gridMult * (minV[ip] + plot.plotOffset));
      const maxvy = javaRound(plot.gridMult * (maxV[ip] + plot.plotOffset));
      if (minvy <= maxy) {
        if (minvy < minRangeLo || maxvy > minRangeHi) {
          // value outside min range; no need to rescale later
          this.reduceRange[plot.units] = false;
          minRangeLo = -1000;
          minRangeHi = 1000;
        }
        if (ox !== -1) {
          if (minvy === oy && maxvy === oy) continue;
          g.drawLine(ox, maxy - oy, i, maxy - oy);
          ox = oy = -1;
        }
        if (minvy === maxvy) {
          ox = i;
          oy = minvy;
          continue;
        }
        g.drawLine(i, maxy - minvy, i, maxy - maxvy);
      }
    }
    if (ox !== -1) g.drawLine(ox, maxy - oy, i - 1, maxy - oy);
  }

  mouseXToTime(mouseX: number): number {
    const sim = this.sim;
    if (this.isTriggered())
      return (
        this.trigger.time +
        sim.maxTimeStep * this.speed * (mouseX - this.rect.x - Math.trunc(this.rect.width / 2))
      );
    return (
      this.displayT() - sim.maxTimeStep * this.speed * (this.rect.x + this.rect.width - mouseX)
    );
  }

  selectScope(mouseX: number, mouseY: number): void {
    if (!rectContains(this.rect, mouseX, mouseY)) return;
    const mgr = this.mgr;
    this.checkForSelection(mouseX, mouseY);
    mgr.cursorSnap = null;
    if (this.plot2d.enabled || this.visiblePlots.length === 0) mgr.cursorTime = -1;
    else mgr.cursorTime = this.mouseXToTime(this.snapX(mouseX, true));
    mgr.cursorScope = this;
  }

  mousePressed(mouseX: number, mouseY: number): void {
    if (!rectContains(this.rect, mouseX, mouseY)) return;
    // the card look measures between frequencies on a spectrum (not upstream)
    if (this.fftPlot.enabled && this.mgr.look === 'cards' && !this.plot2d.enabled) {
      this.mgr.dragStartFreq = this.fftPlot.cursorFrequency(mouseX - this.rect.x);
      this.mgr.dragFreqScope = this;
      return;
    }
    if (this.plot2d.enabled || this.fftPlot.enabled || this.visiblePlots.length === 0) return;
    this.mgr.dragStartTime = this.mouseXToTime(this.snapX(mouseX, false));
  }

  /** Card look: a time cursor at x snaps to the trace's peaks and crossings (not upstream). */
  private snapX(mouseX: number, record: boolean): number {
    if (this.mgr.look !== 'cards' || this.fftPlot.enabled) return mouseX;
    const s = snapToWave(this, mouseX);
    if (s === null) return mouseX;
    if (record) this.mgr.cursorSnap = s.snap;
    return s.x;
  }

  /** Find the plot nearest the mouse. */
  checkForSelection(mouseX: number, mouseY: number): void {
    const mgr = this.mgr;
    if (mgr.dialogShowing) return;
    if (this.draggingPlotY) return;
    if (!rectContains(this.rect, mouseX, mouseY) || this.plots.length === 0) {
      this.selectedPlot = -1;
      return;
    }
    const ipa = this.displayStartIndex(this.plots[0], this.rect.width);
    const ip = (mouseX - this.rect.x + ipa) & (this.scopePointCount - 1);
    const y = Math.trunc((this.rect.height - 1) / 2);
    let bestdist = 10000;
    let best = -1;
    for (let i = 0; i !== this.visiblePlots.length; i++) {
      const plot = this.visiblePlots[i];
      const maxvy = Math.trunc(plot.gridMult * (plot.maxValues[ip] + plot.plotOffset));
      const dist = Math.abs(mouseY - (this.rect.y + y - maxvy));
      if (dist < bestdist) {
        bestdist = dist;
        best = i;
      }
    }
    this.selectedPlot = best;
    if (this.selectedPlot >= 0) mgr.cursorUnits = this.visiblePlots[this.selectedPlot].units;
  }

  timeToX(t: number): number {
    const sim = this.sim;
    const r = this.rect;
    if (this.isTriggered())
      return Math.trunc(
        r.x + Math.trunc(r.width / 2) + (t - this.trigger.time) / (sim.maxTimeStep * this.speed),
      );
    return -Math.trunc((this.displayT() - t) / (sim.maxTimeStep * this.speed) - r.x - r.width);
  }

  /** Dot on the plot at pixel x; returns the plot value there, or NaN when out of range. */
  drawPlotDot(g: ScopeGraphics, plot: ScopePlot, x: number): number {
    const r = this.rect;
    if (x < r.x || x >= r.x + r.width) return NaN;
    const ipa = this.displayStartIndex(this.plots[0], r.width);
    const ip = (x - r.x + ipa) & (this.scopePointCount - 1);
    const value = plot.maxValues[ip];
    const vy = Math.trunc(plot.gridMult * (value + plot.plotOffset));
    const dotY = r.y + Math.trunc((r.height - 1) / 2) - vy;
    g.setColor(plot.color);
    if (dotY >= r.y && dotY < r.y + r.height) g.fillOval(x - 2, dotY - 2, 5, 5);
    return value;
  }

  drawCursor(g: ScopeGraphics): void {
    const mgr = this.mgr;
    if (mgr.dialogShowing) return;
    if (mgr.cursorScope === null) return;
    const info: string[] = [];
    let cursorX = -1;
    let cursorValue = NaN;
    const vp = this.visiblePlots;
    const plot = vp.length > 0 ? vp[this.selectedPlot >= 0 ? this.selectedPlot : 0] : null;
    if (mgr.cursorTime >= 0) {
      cursorX = this.timeToX(mgr.cursorTime);
      if (plot !== null) {
        cursorValue = this.drawPlotDot(g, plot, cursorX);
        if (mgr.dragStartTime < 0 && !Number.isNaN(cursorValue))
          info.push(plot.getUnitText(cursorValue));
      }
    }

    // show FFT even if there's no plots (in which case cursorTime/cursorX will be invalid)
    if (this.fftPlot.enabled && mgr.cursorScope === this) {
      if (cursorX < 0) cursorX = mgr.mouseCursorX;
      this.fftPlot.addCursorInfo(info, mgr.mouseCursorX);
    } else if (cursorX < this.rect.x) return;

    // drag-start cursor and delta readout
    if (
      mgr.dragStartTime >= 0 &&
      mgr.cursorScope === this &&
      plot !== null &&
      !this.plot2d.enabled &&
      !this.fftPlot.enabled
    ) {
      const dragX = this.timeToX(mgr.dragStartTime);
      if (dragX >= this.rect.x && dragX < this.rect.x + this.rect.width) {
        g.setColor('measure');
        g.drawLine(dragX, this.rect.y, dragX, this.rect.y + this.rect.height);
        const startValue = this.drawPlotDot(g, plot, dragX);
        const deltaT = mgr.cursorTime - mgr.dragStartTime;
        info.push('Δt=' + getTimeText(Math.abs(deltaT)));
        if (!Number.isNaN(cursorValue) && !Number.isNaN(startValue)) {
          info.push('Δ=' + plot.getUnitText(cursorValue - startValue));
          info.push(plot.getUnitText(cursorValue));
        }
      }
    }

    if (vp.length > 0) info.push(getTimeText(mgr.cursorTime));

    if (mgr.cursorScope !== this) {
      // don't show cursor info if not enough room, or stacked with selected one
      // (position == -1 for embedded scopes)
      if (
        this.rect.height < 40 ||
        (this.position >= 0 && mgr.cursorScope.position === this.position)
      ) {
        this.drawCursorInfo(g, [], cursorX, false);
        return;
      }
    }
    this.drawCursorInfo(g, info, cursorX, false);
  }

  drawCursorInfo(g: ScopeGraphics, info: readonly string[], x: number, drawY: boolean): void {
    let szw = 0;
    const szh = 15 * info.length;
    for (const s of info) {
      const w = Math.trunc(g.measureWidth(s));
      if (w > szw) szw = w;
    }
    const r = this.rect;
    g.setColor('text');
    g.drawLine(x, r.y, x, r.y + r.height);
    if (drawY) g.drawLine(r.x, this.mgr.mouseCursorY, r.x + r.width, this.mgr.mouseCursorY);
    g.setColor('background');
    let bx = x;
    if (bx < szw / 2) bx = Math.trunc(szw / 2);
    g.fillRect(bx - Math.trunc(szw / 2), r.y - szh, szw, szh);
    g.setColor('text');
    for (let i = 0; i !== info.length; i++) {
      const w = Math.trunc(g.measureWidth(info[i]));
      g.drawString(info[i], bx - Math.trunc(w / 2), r.y - 2 - (info.length - 1 - i) * 15);
    }
  }

  canShowRMS(): boolean {
    if (this.visiblePlots.length === 0) return false;
    const u = this.visiblePlots[0].units;
    return u === UNITS_V || u === UNITS_A;
  }

  drawInfoText(g: ScopeGraphics, text: string): void {
    this.overlays.drawInfoText(g, text);
  }

  getScopeText(): string | null {
    // stacked scopes? don't show text
    if (this.stackCount !== 1) return null;
    // multiple elms? don't show text (unless one is selected)
    if (this.selectedPlot < 0 && this.getSingleElm() === null) return null;
    // no visible plots?
    if (this.visiblePlots.length === 0) return null;
    let plot = this.visiblePlots[0];
    if (this.selectedPlot >= 0 && this.visiblePlots.length > this.selectedPlot)
      plot = this.visiblePlots[this.selectedPlot];
    if (plot.elm === null) return '';
    return plot.elm.getScopeText(plot.value);
  }

  getScopeLabelOrText(forInfo = false): string | null {
    const t = this.text;
    if (t === null) {
      // When drawing the info with showElmInfo on, return null so the info isn't repeated. Not
      // when getting the label for the "Add to Existing Scope" menu.
      if (forInfo && this.showElmInfo) return null;
      return this.getScopeText() ?? '';
    }
    return t;
  }

  setSpeed(sp: number): void {
    if (sp < 1) sp = 1;
    if (sp > 1024) sp = 1024;
    this.speed = sp;
    this.resetGraph();
  }

  /** The visible plots as CSV: time, then min and max per plot (upstream `exportCSV`). */
  exportCSV(): string | null {
    const vp = this.visiblePlots;
    if (vp.length === 0) return null;
    let sb = 'time';
    for (const plot of vp) {
      const name = plot.elm?.getClassName().replace('Elm', '') ?? '';
      const unit = getScaleUnitsText(plot.units);
      sb += `,"${name} ${unit} min"`;
      sb += `,"${name} ${unit} max"`;
    }
    sb += '\n';
    // all visible plots share the same scopePointCount and speed
    const w = this.rect.width;
    const ts = this.sim.maxTimeStep * this.speed;
    const tStart = this.displayT() - ts * w;
    for (let i = 0; i !== w; i++) {
      const t = tStart + ts * i;
      if (t < 0) continue;
      sb += String(t);
      for (const plot of vp) {
        const ip = (i + plot.startIndex(w)) & (plot.scopePointCount - 1);
        sb += ',' + String(plot.minValues[ip]);
        sb += ',' + String(plot.maxValues[ip]);
      }
      sb += '\n';
    }
    return sb;
  }

  speedUp(): void {
    if (this.speed > 1) {
      this.speed = Math.trunc(this.speed / 2);
      this.resetGraph();
    }
  }

  slowDown(): void {
    if (this.speed < 1024) this.speed *= 2;
    this.resetGraph();
  }

  setPlotPosition(plot: number, v: number): void {
    this.visiblePlots[plot].manVPosition = v;
  }

  /** Start dragging the selected plot up or down (manual scale mode only). */
  startDragPlotY(mouseX: number, mouseY: number): boolean {
    if (!rectContains(this.rect, mouseX, mouseY)) return false;
    if (
      !this.isManualScale() ||
      this.selectedPlot < 0 ||
      this.selectedPlot >= this.visiblePlots.length
    )
      return false;
    this.draggingPlotY = true;
    this.dragPlotYMouseStart = mouseY;
    this.dragPlotYInitialPosition = this.visiblePlots[this.selectedPlot].manVPosition;
    this.mgr.draggingPlotYScope = this;
    return true;
  }

  dragPlotY(mouseY: number): void {
    if (this.selectedPlot < 0 || this.selectedPlot >= this.visiblePlots.length) return;
    const maxy = Math.max(1, Math.trunc((this.rect.height - 1) / 2));
    const dy = mouseY - this.dragPlotYMouseStart;
    let newPos = this.dragPlotYInitialPosition - javaRound((dy * V_POSITION_STEPS) / (2.0 * maxy));
    newPos = Math.max(-V_POSITION_STEPS, Math.min(V_POSITION_STEPS, newPos));
    this.visiblePlots[this.selectedPlot].manVPosition = newPos;
  }

  /** The scope's element, or null if it shows more than one. */
  getSingleElm(): CircuitElm | null {
    const elm = this.plots[0]?.elm ?? null;
    for (let i = 1; i < this.plots.length; i++) if (this.plots[i].elm !== elm) return null;
    return elm;
  }

  canMenu(): boolean {
    return (this.plots[0]?.elm ?? null) !== null;
  }

  canShowResistance(): boolean {
    const elm = this.getSingleElm();
    return elm !== null && elm.canShowValueInScope(VAL_R);
  }

  isShowingVceAndIc(): boolean {
    return (
      this.plot2d.enabled &&
      this.plots.length === 2 &&
      this.plots[0].value === VAL_VCE &&
      this.plots[1].value === VAL_IC
    );
  }

  /** The scope menu and properties dialog commands (upstream `handleMenu`). */
  handleMenu(mi: string, state: boolean): void {
    switch (mi) {
      case 'maxscale':
        this.toggleMaxScale();
        break;
      case 'showvoltage':
        this.showVoltage(state);
        break;
      case 'showcurrent':
        this.showCurrent(state);
        break;
      case 'showscale':
        this.showScale = state;
        break;
      case 'showpeak':
        this.showMax = state;
        break;
      case 'shownegpeak':
        this.showMin = state;
        break;
      case 'showp2p':
        this.showP2P = state;
        break;
      case 'showfreq':
        this.showFreq = state;
        break;
      case 'showfft':
        this.fftPlot.show(state);
        break;
      case 'logspectrum':
        this.fftPlot.logSpectrum = state;
        break;
      case 'showrms':
        this.showRMS = state;
        break;
      case 'showaverage':
        this.showAverage = state;
        break;
      case 'showduty':
        this.showDutyCycle = state;
        break;
      case 'showphaseangle':
        this.fftPlot.showPhaseAngle = state;
        break;
      case 'showelminfo':
        this.showElmInfo = state;
        break;
      case 'showpower':
        this.showPower(state);
        break;
      case 'showib':
        this.showPlotValue(VAL_IB, state);
        break;
      case 'showic':
        this.showPlotValue(VAL_IC, state);
        break;
      case 'showie':
        this.showPlotValue(VAL_IE, state);
        break;
      case 'showvbe':
        this.showPlotValue(VAL_VBE, state);
        break;
      case 'showvbc':
        this.showPlotValue(VAL_VBC, state);
        break;
      case 'showvce':
        this.showPlotValue(VAL_VCE, state);
        break;
      case 'showvcevsic':
        this.plot2d.enabled = true;
        this.plot2d.plotXY = false;
        this.setValues(VAL_VCE, VAL_IC, this.getElm(), null);
        this.resetGraph();
        break;
      case 'showvvsi':
        this.plot2d.enabled = state;
        this.plot2d.plotXY = false;
        this.resetGraph();
        break;
      case 'manualscale':
        this.setManualScale(state, true);
        break;
      case 'plotxy': {
        const p2 = this.plot2d;
        p2.plotXY = p2.enabled = state;
        if (p2.enabled) {
          this.plots = this.visiblePlots;
          p2.plotX = 0;
          p2.plotY = Math.min(1, this.plots.length - 1);
          p2.plotBrightness = p2.plotColorR = p2.plotColorG = p2.plotColorB = -1;
        }
        if (p2.enabled && this.plots.length === 1) this.selectY();
        this.resetGraph();
        break;
      }
      case 'showresistance':
        this.showPlotValue(VAL_R, state);
        break;
      case 'showcharge':
        this.showCharge(state);
        break;
    }
  }

  /** Pick the next output or probe as the Y element of an X-Y plot. */
  selectY(): void {
    const mgr = this.mgr;
    let yElm = this.plots.length === 2 ? this.plots[1].elm : null;
    let e = yElm === null ? -1 : mgr.locateElm(yElm);
    let firstE = e;
    for (;;) {
      for (e++; e < mgr.elementCount(); e++) {
        const ce = mgr.getElm(e);
        if (ce !== null && mgr.kinds.isXYCandidate(ce) && ce !== this.plots[0].elm) {
          yElm = ce;
          if (this.plots.length === 1) this.plots.push(new ScopePlot(yElm, UNITS_V));
          else {
            this.plots[1].elm = yElm;
            this.plots[1].units = UNITS_V;
          }
          return;
        }
      }
      if (firstE === -1) return;
      e = firstE = -1;
    }
  }

  /** Mouse wheel over the scope: change its time scale. */
  onMouseWheel(deltaY: number): void {
    this.wheelDeltaY += deltaY * this.mgr.wheelSensitivity;
    if (this.wheelDeltaY > 5) {
      this.slowDown();
      this.wheelDeltaY = 0;
    }
    if (this.wheelDeltaY < -5) {
      this.speedUp();
      this.wheelDeltaY = 0;
    }
  }

  getElm(): CircuitElm | null {
    const vp = this.visiblePlots;
    if (this.selectedPlot >= 0 && vp.length > this.selectedPlot) return vp[this.selectedPlot].elm;
    return vp.length > 0 ? vp[0].elm : (this.plots[0]?.elm ?? null);
  }

  showingElm(e: CircuitElm): boolean {
    return this.plots.some((p) => p.elm === e);
  }

  viewingWire(): boolean {
    return this.plots.some((p) => p.elm !== null && this.mgr.kinds.isWire(p.elm));
  }

  /**
   * Elements this scope shows, for highlighting on the circuit: in X-Y mode labelled by axis
   * role, otherwise with an empty label.
   */
  addScopePlotRoles(roles: Map<CircuitElm, string>): void {
    const p2 = this.plot2d;
    if (p2.plotXY) {
      this.addPlotRole(roles, p2.plotX, 'X');
      this.addPlotRole(roles, p2.plotY, 'Y');
      this.addPlotRole(roles, p2.plotBrightness, 'Br');
      this.addPlotRole(roles, p2.plotColorR, 'R');
      this.addPlotRole(roles, p2.plotColorG, 'G');
      this.addPlotRole(roles, p2.plotColorB, 'B');
    } else {
      for (const p of this.visiblePlots) if (p.elm !== null) addElmRole(roles, p.elm, '');
    }
  }

  private addPlotRole(roles: Map<CircuitElm, string>, idx: number, role: string): void {
    if (idx < 0 || idx >= this.plots.length) return;
    const elm = this.plots[idx].elm;
    if (elm !== null) addElmRole(roles, elm, role);
  }

  /** Drop plots of deleted elements; true when none are left. */
  needToRemove(): boolean {
    let ret = true;
    let removed = false;
    for (let i = 0; i !== this.plots.length; i++) {
      const plot = this.plots[i];
      if (this.mgr.locateElm(plot.elm) < 0) {
        this.plots.splice(i--, 1);
        removed = true;
      } else ret = false;
    }
    if (removed) this.calcVisiblePlots();
    return ret;
  }

  isManualScale(): boolean {
    return this.manualScale;
  }

  /**
   * A manual "/div" scale from the auto scale. Switching to manual asks for a rounded-up
   * sensible value; importing a legacy file keeps as close as possible to the old look.
   */
  getManScaleFromMaxScale(units: number, roundUp: boolean): number {
    let s = this.scale[units];
    if (units > UNITS_A) s = 0.5 * s;
    if (roundUp) return nextHighestScale((2 * s) / this.manDivisions);
    return (2 * s) / this.manDivisions;
  }
}

function addElmRole(roles: Map<CircuitElm, string>, elm: CircuitElm, role: string): void {
  const existing = roles.get(elm);
  roles.set(elm, existing === undefined ? role : existing + '/' + role);
}

/** Java `Math.round` (half up, also for negative numbers), cast to int. */
export function javaRound(v: number): number {
  return Math.floor(v + 0.5) | 0;
}
