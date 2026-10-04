// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ScopePlot2d.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { UNITS_A, UNITS_C, UNITS_OHMS, UNITS_V, UNITS_W } from './constants.ts';
import type { Scope } from './Scope.ts';
import type { ScopeGraphics, ScopeImage, ScopeInk } from './ScopeGraphics.ts';
import { V_POSITION_STEPS } from './ScopePlot.ts';

export const DEFAULT_TRAIL_PERSISTENCE = 0;

/** X-Y and V-vs-I plots: one value against another, drawn into a fading image. */
export class ScopePlot2d {
  readonly scope: Scope;
  enabled = false;
  plotXY = false;
  scaleX = 5;
  scaleY = 0.1;

  /** X/Y axis plot indices (into scope.plots). */
  plotX = 0;
  plotY = 1;
  /** Modulator plot indices (-1 = none). */
  plotBrightness = -1;
  plotColorR = -1;
  plotColorG = -1;
  plotColorB = -1;
  /** Auto scales for the modulator plots. */
  scaleBrightness = 5;
  scaleR = 5;
  scaleG = 5;
  scaleB = 5;

  image: ScopeImage | null = null;
  drawOx = -1;
  drawOy = -1;
  private alphaCounter = 0;
  trailPersistence = DEFAULT_TRAIL_PERSISTENCE;
  lastTrailSimTime = -1;

  constructor(scope: Scope) {
    this.scope = scope;
  }

  allocImage(): void {
    if (!this.enabled) return;
    const rect = this.scope.rect;
    this.image ??= this.scope.mgr.createImage(rect.width, rect.height);
    this.image?.resize(rect.width, rect.height);
    this.clearView();
  }

  clearView(): void {
    this.image?.clear();
    this.drawOx = this.drawOy = -1;
  }

  calcGridPx(width: number, height: number): number {
    const m = width < height ? width : height;
    return m / 2 / (this.scope.manDivisions / 2 + 0.05);
  }

  drawTo(x2: number, y2: number, color: ScopeInk, alpha: number): void {
    if (this.drawOx === -1) {
      this.drawOx = x2;
      this.drawOy = y2;
      return;
    }
    this.image?.segment(this.drawOx, this.drawOy, x2, y2, color, alpha);
    this.drawOx = x2;
    this.drawOy = y2;
  }

  /** The draw color from the R/G/B modulator plots. */
  computeColor(): ScopeInk {
    const plots = this.scope.plots;
    if (this.plotColorR < 0 && this.plotColorG < 0 && this.plotColorB < 0) return 'text';
    let r = 0;
    let g = 0;
    let b = 0;
    if (this.plotColorR >= 0 && this.plotColorR < plots.length) {
      const rv = plots[this.plotColorR].lastValue;
      while (rv > this.scaleR) this.scaleR *= 2;
      r = Math.trunc(Math.max(0, Math.min(255, (rv / this.scaleR) * 255)));
    }
    if (this.plotColorG >= 0 && this.plotColorG < plots.length) {
      const gv = plots[this.plotColorG].lastValue;
      while (gv > this.scaleG) this.scaleG *= 2;
      g = Math.trunc(Math.max(0, Math.min(255, (gv / this.scaleG) * 255)));
    }
    if (this.plotColorB >= 0 && this.plotColorB < plots.length) {
      const bv = plots[this.plotColorB].lastValue;
      while (bv > this.scaleB) this.scaleB *= 2;
      b = Math.trunc(Math.max(0, Math.min(255, (bv / this.scaleB) * 255)));
    }
    return { rgb: [r, g, b] };
  }

  /** Draw alpha from the brightness modulator plot (0 = off, 1 = full). */
  computeAlpha(): number {
    const plots = this.scope.plots;
    if (this.plotBrightness < 0 || this.plotBrightness >= plots.length) return 1.0;
    const bv = Math.abs(plots[this.plotBrightness].lastValue);
    while (bv > this.scaleBrightness) this.scaleBrightness *= 2;
    return this.scaleBrightness > 0 ? bv / this.scaleBrightness : 0;
  }

  /** Clamp a plot index to the valid range. */
  validPlotIndex(idx: number, defaultIdx: number): number {
    const n = this.scope.plots.length;
    if (n === 0) return 0;
    if (idx < 0 || idx >= n) return Math.min(defaultIdx, n - 1);
    return idx;
  }

  timeStep(): void {
    const scope = this.scope;
    const plots = scope.plots;
    if (this.image === null || plots.length < 1) return;
    const px = this.validPlotIndex(this.plotX, 0);
    const py = this.validPlotIndex(this.plotY, Math.min(1, plots.length - 1));
    const v = plots[px].lastValue;
    const yval = plots[py].lastValue;
    const rect = scope.rect;
    let x: number;
    let y: number;
    if (!scope.isManualScale()) {
      let newscale = false;
      while (v > this.scaleX || v < -this.scaleX) {
        this.scaleX *= 2;
        newscale = true;
      }
      while (yval > this.scaleY || yval < -this.scaleY) {
        this.scaleY *= 2;
        newscale = true;
      }
      if (newscale) this.clearView();
      const xa = v / this.scaleX;
      const ya = yval / this.scaleY;
      x = Math.trunc(rect.width * (1 + xa) * 0.499);
      y = Math.trunc(rect.height * (1 - ya) * 0.499);
    } else {
      const gridPx = this.calcGridPx(rect.width, rect.height);
      const md = scope.manDivisions;
      x = Math.trunc(
        rect.width * 0.499 +
          (v / plots[px].manScale) * gridPx +
          (gridPx * md * plots[px].manVPosition) / V_POSITION_STEPS,
      );
      y = Math.trunc(
        rect.height * 0.499 -
          (yval / plots[py].manScale) * gridPx -
          (gridPx * md * plots[py].manVPosition) / V_POSITION_STEPS,
      );
    }
    this.drawTo(x, y, this.computeColor(), this.computeAlpha());
  }

  maxScale(): void {
    const x = 1e-8;
    const sc = this.scope.scale;
    sc[UNITS_V] *= x;
    sc[UNITS_A] *= x;
    sc[UNITS_OHMS] *= x;
    sc[UNITS_W] *= x;
    sc[UNITS_C] *= x;
    this.scaleX *= x;
    this.scaleY *= x;
    this.scaleBrightness *= x;
    this.scaleR *= x;
    this.scaleG *= x;
    this.scaleB *= x;
  }

  draw(g: ScopeGraphics): void {
    const scope = this.scope;
    const sim = scope.sim;
    const rect = scope.rect;
    const image = this.image;
    if (image === null) return;
    g.save();
    g.translate(rect.x, rect.y);
    g.clipRect(0, 0, rect.width, rect.height);

    this.alphaCounter++;
    if (this.alphaCounter > 2) {
      this.alphaCounter = 0;
      let fadeAlpha: number;
      if (this.trailPersistence <= 0) fadeAlpha = 0.01;
      else {
        // Sim-time exponential fade; time constant = trailPersistence * maxTimeStep. Don't
        // advance lastTrailSimTime until fadeAlpha is large enough; sub-pixel alphas have no
        // effect on an 8-bit canvas and the trail would never fade at low speed.
        if (this.lastTrailSimTime < 0 || sim.t < this.lastTrailSimTime)
          this.lastTrailSimTime = sim.t;
        const elapsed = sim.t - this.lastTrailSimTime;
        const timeConst = this.trailPersistence * sim.maxTimeStep;
        fadeAlpha = 1.0 - Math.exp(-elapsed / timeConst);
        if (fadeAlpha >= 3.0 / 255) this.lastTrailSimTime = sim.t;
        else fadeAlpha = 0;
      }
      if (fadeAlpha > 0) image.fade(fadeAlpha);
    }

    g.drawImage(image, 0, 0);
    g.setColor('text');
    g.fillOval(this.drawOx - 2, this.drawOy - 2, 5, 5);
    g.setColor('voltage');
    g.drawLine(0, Math.trunc(rect.height / 2), rect.width - 1, Math.trunc(rect.height / 2));
    if (!this.plotXY) g.setColor('current');
    g.drawLine(Math.trunc(rect.width / 2), 0, Math.trunc(rect.width / 2), rect.height - 1);
    if (scope.isManualScale()) {
      const gridPx = this.calcGridPx(rect.width, rect.height);
      g.setColor('gridMinor');
      for (let i = -scope.manDivisions; i <= scope.manDivisions; i++) {
        const gx = Math.trunc(gridPx * i) + Math.trunc(rect.width / 2);
        const gy = Math.trunc(gridPx * i) + Math.trunc(rect.height / 2);
        if (i !== 0) g.drawLine(gx, 0, gx, rect.height);
        g.drawLine(0, gy, rect.width, gy);
      }
    }
    scope.overlays.textY = 10;
    g.setColor('text');
    if (scope.text !== null) scope.drawInfoText(g, scope.text);
    const plots = scope.plots;
    const px = this.validPlotIndex(this.plotX, 0);
    const py = this.validPlotIndex(this.plotY, Math.min(1, plots.length - 1));
    const havePlots = plots.length >= 1 && px < plots.length && py < plots.length;
    if (scope.showScale && havePlots && scope.isManualScale()) {
      const spx = plots[px];
      const spy = plots[py];
      scope.drawInfoText(
        g,
        `X=${spx.getUnitText(spx.manScale)}/div, Y=${spy.getUnitText(spy.manScale)}/div`,
      );
    }
    g.restore();
    scope.drawSettingsWheel(g);
    const mgr = scope.mgr;
    const mx = mgr.mouseCursorX;
    const my = mgr.mouseCursorY;
    if (!mgr.dialogShowing && rectContains(rect, mx, my) && havePlots) {
      const gridPx = this.calcGridPx(rect.width, rect.height);
      const spx = plots[px];
      const spy = plots[py];
      let xValue: number;
      let yValue: number;
      if (scope.isManualScale()) {
        const md = scope.manDivisions;
        xValue =
          spx.manScale *
          ((mx - rect.x - Math.trunc(rect.width / 2)) / gridPx -
            (md * spx.manVPosition) / V_POSITION_STEPS);
        yValue =
          spy.manScale *
          ((-my + rect.y + Math.trunc(rect.height / 2)) / gridPx -
            (md * spy.manVPosition) / V_POSITION_STEPS);
      } else {
        xValue = ((mx - rect.x) / (0.499 * rect.width) - 1.0) * this.scaleX;
        yValue = -((my - rect.y) / (0.499 * rect.height) - 1.0) * this.scaleY;
      }
      scope.drawCursorInfo(g, [spx.getUnitText(xValue), spy.getUnitText(yValue)], mx, true);
    }
  }
}

export function rectContains(
  r: { x: number; y: number; width: number; height: number },
  x: number,
  y: number,
): boolean {
  // java.awt.Rectangle.contains: inclusive left/top, exclusive right/bottom
  return (
    r.width > 0 && r.height > 0 && x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height
  );
}
