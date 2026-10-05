// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ScopeTrigger.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Simulation } from '@circuitjs-next/engine';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import type { ScopeGraphics } from './ScopeGraphics.ts';
import type { ScopePlot } from './ScopePlot.ts';

export const TRIGGER_FREERUN = 0;
export const TRIGGER_NORMAL = 1;
export const TRIGGER_AUTO = 2;
export const TRIGGER_EDGE_RISING = 0;
export const TRIGGER_EDGE_FALLING = 1;

const TRIG_STATE_ARMED = 0;
const TRIG_STATE_TRIGGERED = 1;
const TRIG_STATE_AUTO_RUN = 2;

/** Edge trigger: holds the display still around the moment the first plot crosses a level. */
export class ScopeTrigger {
  mode = TRIGGER_FREERUN;
  edge = TRIGGER_EDGE_RISING;
  level = 0;

  state = TRIG_STATE_ARMED;
  ptr = 0;
  prevValue = 0;
  holdoff = 0;
  autoTimeout = 0;
  waiting = false;
  time = 0;
  fired = false;
  lastCheckPtr = -1;

  isActive(): boolean {
    return this.mode !== TRIGGER_FREERUN;
  }

  isTriggered(): boolean {
    return this.isActive() && this.fired && this.state !== TRIG_STATE_AUTO_RUN;
  }

  /** Start index for display, accounting for trigger mode. */
  displayStartIndex(plot: ScopePlot, w: number, scopePointCount: number): number {
    if (this.mode === TRIGGER_FREERUN || !this.fired || this.state === TRIG_STATE_AUTO_RUN)
      return plot.startIndex(w);
    // trigger point at center of display
    return this.ptr + scopePointCount - Math.trunc(w / 2);
  }

  /**
   * Number of valid points to display, at most w. In triggered mode data beyond plot.ptr is
   * stale (old circular buffer contents) and must not be drawn or measured.
   */
  validDataCount(plot: ScopePlot, ipa: number, w: number, scopePointCount: number): number {
    if (!this.isTriggered()) return w;
    const count = ((plot.ptr - ipa) & (scopePointCount - 1)) + 1;
    return Math.min(count, w);
  }

  dumpXml(w: XmlAttrWriter): void {
    if (!this.isActive()) return;
    w.dumpAttr('triggerMode', this.mode);
    w.dumpAttr('triggerEdge', this.edge);
    w.dumpAttr('triggerLevel', this.level);
  }

  /** Read before the child elements: the attributes are on the parent. */
  undumpXml(r: XmlAttrReader): void {
    this.mode = r.parseIntAttr('triggerMode', TRIGGER_FREERUN);
    this.edge = r.parseIntAttr('triggerEdge', TRIGGER_EDGE_RISING);
    this.level = r.parseDoubleAttr('triggerLevel', 0);
  }

  /** Reset trigger state; called from Scope.resetGraph(). */
  reset(scopePointCount: number): void {
    this.state = TRIG_STATE_ARMED;
    this.holdoff = 0;
    this.waiting = false;
    this.fired = false;
    this.lastCheckPtr = -1;
    this.autoTimeout = 2 * scopePointCount;
  }

  /** Edge detection and state machine, run every time the plot pointer advances. */
  check(visiblePlots: readonly ScopePlot[], plot2d: boolean, sim: Simulation, rectWidth: number) {
    if (this.mode === TRIGGER_FREERUN || visiblePlots.length === 0 || plot2d) return;
    const plot = visiblePlots[0];
    const currentPtr = plot.ptr;
    // only check when ptr advances (new sample point)
    if (currentPtr === this.lastCheckPtr) return;
    this.lastCheckPtr = currentPtr;

    const val = (plot.maxValues[currentPtr] + plot.minValues[currentPtr]) * 0.5;
    const edgeCrossing =
      this.edge === TRIGGER_EDGE_RISING
        ? this.prevValue < this.level && val >= this.level
        : this.prevValue > this.level && val <= this.level;

    switch (this.state) {
      case TRIG_STATE_ARMED:
        if (edgeCrossing) {
          this.state = TRIG_STATE_TRIGGERED;
          this.ptr = currentPtr;
          this.time = sim.t;
          this.holdoff = 0;
          this.waiting = false;
          this.fired = true;
        } else {
          this.waiting = true;
          if (this.mode === TRIGGER_AUTO) {
            this.holdoff++;
            if (this.holdoff >= this.autoTimeout) {
              this.state = TRIG_STATE_AUTO_RUN;
              this.waiting = false;
            }
          }
        }
        break;
      case TRIG_STATE_TRIGGERED:
        this.holdoff++;
        if (this.holdoff >= rectWidth) {
          this.state = TRIG_STATE_ARMED;
          this.holdoff = 0;
        }
        break;
      case TRIG_STATE_AUTO_RUN:
        if (edgeCrossing) {
          this.state = TRIG_STATE_TRIGGERED;
          this.ptr = currentPtr;
          this.time = sim.t;
          this.holdoff = 0;
          this.fired = true;
        }
        break;
    }
    this.prevValue = val;
  }

  /** Dashed level line, edge mark and state text. */
  drawIndicator(
    g: ScopeGraphics,
    visiblePlots: readonly ScopePlot[],
    rect: { width: number; height: number },
  ): void {
    if (this.mode === TRIGGER_FREERUN || visiblePlots.length === 0) return;
    const plot = visiblePlots[0];
    const maxy = Math.trunc((rect.height - 1) / 2);
    const trigY = maxy - Math.trunc((this.level + plot.plotOffset) * plot.gridMult);
    if (trigY >= 0 && trigY < rect.height) {
      g.setColor('trigger');
      for (let x = 0; x < rect.width; x += 8) {
        const x2 = Math.min(x + 4, rect.width - 1);
        g.drawLine(x, trigY, x2, trigY);
      }
      g.drawString(this.edge === TRIGGER_EDGE_RISING ? 'T↑' : 'T↓', rect.width - 25, trigY - 3);
    }
    let statusText = '';
    switch (this.state) {
      case TRIG_STATE_ARMED:
        statusText = this.waiting ? 'WAIT' : 'ARMED';
        break;
      case TRIG_STATE_TRIGGERED:
        statusText = 'TRIG';
        break;
      case TRIG_STATE_AUTO_RUN:
        statusText = 'AUTO';
        break;
    }
    g.setColor('trigger');
    const sw = Math.trunc(g.measureWidth(statusText));
    g.drawString(statusText, rect.width - sw - 5, rect.height - 5);
  }
}
