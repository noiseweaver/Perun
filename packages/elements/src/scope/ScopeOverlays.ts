// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ScopeOverlays.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { getUnitText } from '../view/units.ts';
import type { Scope } from './Scope.ts';
import type { ScopeGraphics } from './ScopeGraphics.ts';
import { ScopeDataIterator, type ScopePlot } from './ScopePlot.ts';

/** Text drawn over a scope: scale, peaks, RMS, average, duty cycle, frequency, label, info. */
export class ScopeOverlays {
  readonly scope: Scope;
  textY = 0;
  /** While set, info text is collected here instead of drawn (the card look's header). */
  private collected: string[] | null = null;

  constructor(scope: Scope) {
    this.scope = scope;
  }

  drawInfoText(g: ScopeGraphics, text: string): void {
    if (this.collected !== null) {
      this.collected.push(text);
      return;
    }
    const rect = this.scope.rect;
    if (rect.y + rect.height <= this.textY + 5) return;
    g.drawString(text, 0, this.textY);
    this.textY += 15;
  }

  drawScale(plot: ScopePlot, g: ScopeGraphics): void {
    const scope = this.scope;
    if (!scope.isManualScale()) {
      if (scope.gridStepY !== 0 && !(scope.showV && scope.showI)) {
        const vScaleText = ' V=' + plot.getUnitText(scope.gridStepY) + '/div';
        this.drawInfoText(g, 'H=' + getUnitText(scope.gridStepX, 's') + '/div' + vScaleText);
      }
      return;
    }
    const rect = scope.rect;
    if (rect.y + rect.height <= this.textY + 5) return;
    let x = 0;
    const hs = 'H=' + getUnitText(scope.gridStepX, 's') + '/div';
    g.drawString(hs, 0, this.textY);
    x += g.measureWidth(hs);
    const bulletWidth = 17;
    for (const p of scope.visiblePlots) {
      const vScaleText = '=' + p.getUnitText(p.manScale) + '/div';
      const vScaleWidth = g.measureWidth(vScaleText);
      if (x + bulletWidth + vScaleWidth > rect.width) {
        x = 0;
        this.textY += 15;
        if (rect.y + rect.height <= this.textY + 5) return;
      }
      g.setColor(p.color);
      g.fillOval(Math.trunc(x) + 7, this.textY - 9, 8, 8);
      x += bulletWidth;
      g.setColor('text');
      g.drawString(vScaleText, Math.trunc(x), this.textY);
      x += vScaleWidth;
    }
    this.textY += 15;
  }

  /**
   * Cycle detection shared by average, RMS and duty cycle: onCycleStart at the first rising edge,
   * onSample for each sample after it, onCycleEnd at each later rising edge. Returns the span
   * from the first to the last rising edge, or 0.
   */
  iterateCycles(
    sdi: ScopeDataIterator,
    mid: number,
    onCycleStart: () => void,
    onSample: () => void,
    onCycleEnd: () => void,
  ): number {
    const fnz = sdi.skipNonzeroValues();
    let state = fnz > mid ? 1 : -1;
    let waveCount = 0;
    let start = 0;
    let end = 0;
    for (const i of sdi) {
      let sw = false;
      if (state === 1) {
        if (sdi.getMax() < mid) sw = true;
      } else if (sdi.getMin() > mid) sw = true;
      if (sw) {
        state = -state;
        if (state === 1) {
          if (waveCount === 0) {
            start = i;
            onCycleStart();
          } else {
            end = i;
            onCycleEnd();
          }
          waveCount++;
        }
      }
      if (waveCount > 0) onSample();
    }
    return end - start;
  }

  drawRMS(g: ScopeGraphics): void {
    const scope = this.scope;
    if (!scope.canShowRMS()) {
      // needed for backward compatibility
      scope.showRMS = false;
      scope.showAverage = true;
      this.drawAverage(g);
      return;
    }
    const plot = scope.visiblePlots[0];
    const mid = (scope.maxValue + scope.minValue) / 2;
    const sdi = new ScopeDataIterator(scope, plot);
    let avg = 0;
    let endAvg = 0;
    const span = this.iterateCycles(
      sdi,
      mid,
      () => (avg = 0),
      () => {
        const m = (sdi.getMax() + sdi.getMin()) * 0.5;
        avg += m * m;
      },
      () => (endAvg = avg),
    );
    if (span > 0) this.drawInfoText(g, plot.getUnitText(Math.sqrt(endAvg / span)) + 'rms');
  }

  drawAverage(g: ScopeGraphics): void {
    const scope = this.scope;
    const plot = scope.visiblePlots[0];
    const mid = (scope.maxValue + scope.minValue) / 2;
    const sdi = new ScopeDataIterator(scope, plot);
    let avg = 0;
    let endAvg = 0;
    const span = this.iterateCycles(
      sdi,
      mid,
      () => (avg = 0),
      () => (avg += (sdi.getMax() + sdi.getMin()) * 0.5),
      () => (endAvg = avg),
    );
    if (span > 0) this.drawInfoText(g, plot.getUnitText(endAvg / span) + ' average');
  }

  drawDutyCycle(g: ScopeGraphics): void {
    const scope = this.scope;
    const plot = scope.visiblePlots[0];
    const mid = (scope.maxValue + scope.minValue) / 2;
    const sdi = new ScopeDataIterator(scope, plot);
    let dutyLen = 0;
    let prevDuty = 0;
    const span = this.iterateCycles(
      sdi,
      mid,
      () => (dutyLen = 0),
      () => {
        if (sdi.getMax() > mid) dutyLen++;
      },
      () => (prevDuty = dutyLen),
    );
    // int arithmetic upstream
    if (span > 0) this.drawInfoText(g, `Duty cycle ${Math.trunc((100 * prevDuty) / span)}%`);
  }

  drawFrequency(g: ScopeGraphics): void {
    const scope = this.scope;
    let avg = 0;
    const plot = scope.visiblePlots[0];
    const sdi = new ScopeDataIterator(scope, plot);
    for (const _i of sdi) avg += sdi.getMin() + sdi.getMax();
    avg /= sdi.validCount * 2;
    let state = 0;
    const thresh = avg * 0.05;
    let oi = 0;
    let avperiod = 0;
    let periodct = -1;
    let avperiod2 = 0;
    for (const i of sdi) {
      const q = sdi.getMax() - avg;
      const os = state;
      if (q < thresh) state = 1;
      else if (q > -thresh) state = 2;
      if (state === 2 && os === 1) {
        const pd = i - oi;
        oi = i;
        if (pd < 12) continue;
        if (periodct >= 0) {
          avperiod += pd;
          avperiod2 += pd * pd;
        }
        periodct++;
      }
    }
    avperiod /= periodct;
    avperiod2 /= periodct;
    const periodstd = Math.sqrt(avperiod2 - avperiod * avperiod);
    let freq = 1 / (avperiod * scope.sim.maxTimeStep * scope.speed);
    if (periodct < 1 || periodstd > 2) freq = 0;
    if (freq !== 0) this.drawInfoText(g, getUnitText(freq, 'Hz'));
  }

  drawElmInfo(g: ScopeGraphics): void {
    const info: string[] = [];
    this.scope.getElm()?.getInfo(info);
    for (let i = 0; info[i] !== undefined; i++) this.drawInfoText(g, info[i]);
  }

  /**
   * The readouts draw() would show (peaks, RMS, average, duty cycle, frequency, element info,
   * phase angle), as text, for the card look. Leaves out the scale and the label, which the card
   * shows elsewhere.
   */
  readouts(g: ScopeGraphics): string[] {
    const scope = this.scope;
    const out: string[] = [];
    this.collected = out;
    try {
      const showScale = scope.showScale;
      const text = scope.text;
      // an empty label draws nothing
      scope.showScale = false;
      scope.text = '';
      try {
        this.draw(g);
      } finally {
        scope.showScale = showScale;
        scope.text = text;
      }
    } finally {
      this.collected = null;
    }
    return out;
  }

  draw(g: ScopeGraphics): void {
    const scope = this.scope;
    g.setColor('text');
    this.textY = 10;
    if (scope.visiblePlots.length === 0) {
      if (scope.showElmInfo) this.drawElmInfo(g);
      return;
    }
    const plot = scope.visiblePlots[0];
    if (scope.showScale) this.drawScale(plot, g);
    if (scope.showMax) this.drawInfoText(g, 'Max=' + plot.getUnitText(scope.maxValue));
    if (scope.showMin) {
      const ym = scope.rect.height - 5;
      if (this.collected !== null) this.collected.push('Min=' + plot.getUnitText(scope.minValue));
      else g.drawString('Min=' + plot.getUnitText(scope.minValue), 0, ym);
    }
    if (scope.showP2P)
      this.drawInfoText(g, 'P-P=' + plot.getUnitText(scope.maxValue - scope.minValue));
    if (scope.showRMS) this.drawRMS(g);
    if (scope.showAverage) this.drawAverage(g);
    if (scope.showDutyCycle) this.drawDutyCycle(g);
    const t = scope.getScopeLabelOrText(true);
    if (t !== null && t !== '') this.drawInfoText(g, t);
    if (scope.showFreq) this.drawFrequency(g);
    if (scope.showElmInfo) this.drawElmInfo(g);
    if (scope.fftPlot.showPhaseAngle) scope.fftPlot.drawPhaseAngle(g);
  }
}
