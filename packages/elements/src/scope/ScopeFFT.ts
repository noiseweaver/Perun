// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ScopeFFT.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { getUnitText, showFormat } from '../view/units.ts';
import { UNITS_A, UNITS_V } from './constants.ts';
import { FFT } from './FFT.ts';
import type { Scope } from './Scope.ts';
import type { ScopeGraphics } from './ScopeGraphics.ts';
import type { ScopePlot } from './ScopePlot.ts';

/** The spectrum view of a scope's first plot, and the phase angle readout. */
export class ScopeFFT {
  readonly scope: Scope;
  enabled = false;
  logSpectrum = false;
  showPhaseAngle = false;
  fftMaxMagnitude = 0;
  fftReal: Float64Array | null = null;
  fftImag: Float64Array | null = null;
  private fft: FFT | null = null;

  constructor(scope: Scope) {
    this.scope = scope;
  }

  show(b: boolean): void {
    this.enabled = b;
    if (!this.enabled) this.fft = null;
  }

  private getFft(): FFT {
    if (this.fft === null || this.fft.getSize() !== this.scope.scopePointCount)
      this.fft = new FFT(this.scope.scopePointCount);
    return this.fft;
  }

  drawVerticalGridLines(g: ScopeGraphics): void {
    const scope = this.scope;
    let prevEnd = 0;
    const divs = 20;
    const maxFrequency = 1 / (scope.sim.maxTimeStep * scope.speed * divs * 2);
    for (let i = 0; i < divs; i++) {
      const x = Math.trunc((scope.rect.width * i) / divs);
      if (x < prevEnd) continue;
      const s = String(Math.round(i * maxFrequency)) + 'Hz';
      const sWidth = Math.ceil(g.measureWidth(s));
      prevEnd = x + sWidth + 4;
      if (i > 0) {
        g.setColor('fftGrid');
        g.drawLine(x, 0, x, scope.rect.height);
      }
      g.setColor('fft');
      g.drawString(s, x + 2, scope.rect.height);
    }
  }

  draw(g: ScopeGraphics): void {
    const scope = this.scope;
    const spc = scope.scopePointCount;
    const fft = this.getFft();
    const real = new Float64Array(spc);
    const imag = new Float64Array(spc);
    const plot = scope.visiblePlots.length === 0 ? scope.plots[0] : scope.visiblePlots[0];
    const maxV = plot.maxValues;
    const minV = plot.minValues;
    const ptr = plot.ptr;
    for (let i = 0; i < spc; i++) {
      const ii = (ptr - i + spc) & (spc - 1);
      // average max and min to prevent DC spike from masking rest of spectrum
      real[i] = 0.5 * (maxV[ii] + minV[ii]);
      imag[i] = 0;
    }
    fft.fft(real, imag, true);
    let maxM = 1e-8;
    for (let i = 0; i < spc / 2; i++) {
      const m = fft.magnitude(real[i], imag[i]);
      if (m > maxM) maxM = m;
    }
    this.fftMaxMagnitude = maxM;
    this.fftReal = real;
    this.fftImag = imag;
    let prevX = 0;
    g.setColor('fft');
    const w = scope.rect.width;
    const h = scope.rect.height;
    if (!this.logSpectrum) {
      let prevHeight = 0;
      const y = h - 1 - 12;
      for (let i = 0; i < spc / 2; i++) {
        const x = Math.trunc((2 * i * w) / spc);
        const magnitude = fft.magnitude(real[i], imag[i]);
        const height = Math.trunc((magnitude * y) / maxM);
        if (x !== prevX) g.drawLine(prevX, y - prevHeight, x, y - height);
        prevHeight = height;
        prevX = x;
      }
    } else {
      const dbRange = 80;
      const topMargin = 5;
      const bottomMargin = 12;
      const plotHeight = h - topMargin - bottomMargin;
      const pixelsPerDb = plotHeight / dbRange;
      let prevY = 0;
      for (let db = -20; db >= -80; db -= 20) {
        const y = topMargin + Math.trunc(-db * pixelsPerDb);
        if (y < 0 || y >= h) continue;
        g.setColor('fftGrid');
        g.drawLine(0, y, w, y);
        g.setColor('fft');
        g.drawString(`${db} dB`, 2, y - 2);
      }
      g.setColor('fft');
      for (let i = 0; i < spc / 2; i++) {
        const x = Math.trunc((2 * i * w) / spc);
        const magnitude = fft.magnitude(real[i], imag[i]);
        let db = (20 * Math.log(magnitude / maxM)) / Math.log(10);
        if (db < -dbRange) db = -dbRange;
        const y = topMargin + Math.trunc(-db * pixelsPerDb);
        if (x !== prevX) g.drawLine(prevX, prevY, x, y);
        prevY = y;
        prevX = x;
      }
    }
  }

  drawPhaseAngle(g: ScopeGraphics): void {
    const scope = this.scope;
    let vPlot: ScopePlot | null = null;
    let iPlot: ScopePlot | null = null;
    for (const p of scope.visiblePlots) {
      if (p.units === UNITS_V) {
        if (vPlot !== null) return;
        vPlot = p;
      } else if (p.units === UNITS_A) {
        if (iPlot !== null) return;
        iPlot = p;
      } else return;
    }
    if (vPlot === null || iPlot === null) return;
    const spc = scope.scopePointCount;
    const fft = this.getFft();
    const vReal = new Float64Array(spc);
    const vImag = new Float64Array(spc);
    const iReal = new Float64Array(spc);
    const iImag = new Float64Array(spc);
    const ipa = scope.displayStartIndex(vPlot, scope.rect.width);
    const validCount = scope.validDataCount(vPlot, ipa, scope.rect.width);
    for (let i = 0; i < validCount; i++) {
      const ip = (i + ipa) & (spc - 1);
      vReal[i] = 0.5 * (vPlot.maxValues[ip] + vPlot.minValues[ip]);
      iReal[i] = 0.5 * (iPlot.maxValues[ip] + iPlot.minValues[ip]);
    }
    fft.fft(vReal, vImag, true);
    fft.fft(iReal, iImag, true);
    let fund = 1;
    let maxM = 0;
    for (let i = 1; i < spc / 2; i++) {
      const m = fft.magnitude(vReal[i], vImag[i]);
      if (m > maxM) {
        maxM = m;
        fund = i;
      }
    }
    if (maxM < 1e-8) return;
    const angleV = Math.atan2(vImag[fund], vReal[fund]);
    const angleI = Math.atan2(iImag[fund], iReal[fund]);
    let angle = ((angleV - angleI) * 180) / Math.PI;
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    scope.drawInfoText(g, 'Phase angle: ' + showFormat(angle) + '°');
  }

  // ---- peak finding for the card look's frequency cursor (this port's own) ------------------

  /** Frequency step between spectrum bins (Hz). */
  binFrequency(): number {
    const scope = this.scope;
    return 1 / (scope.sim.maxTimeStep * scope.speed * scope.scopePointCount);
  }

  /** Magnitude of bin i as last drawn, or 0. */
  magnitudeAt(i: number): number {
    const re = this.fftReal;
    const im = this.fftImag;
    if (re === null || im === null || i < 0 || i >= re.length) return 0;
    return this.getFft().magnitude(re[i], im[i]);
  }

  /** Plot-area x (pixels) of a frequency. */
  frequencyToX(f: number): number {
    return (f / this.binFrequency()) * ((2 * this.scope.rect.width) / this.scope.scopePointCount);
  }

  /** Frequency at plot-area x (pixels). */
  xToFrequency(x: number): number {
    return (x * this.scope.scopePointCount * this.binFrequency()) / (2 * this.scope.rect.width);
  }

  /** Plot-area y of a magnitude, as draw() plots it. */
  magnitudeToY(m: number): number {
    const h = this.scope.rect.height;
    const maxM = this.fftMaxMagnitude;
    if (maxM <= 0) return h - 13;
    if (!this.logSpectrum) return h - 1 - 12 - Math.trunc((m * (h - 1 - 12)) / maxM);
    let db = (20 * Math.log(m / maxM)) / Math.log(10);
    if (db < -80) db = -80;
    return 5 + Math.trunc((-db * (h - 17)) / 80);
  }

  /** A peak at bin i, its frequency refined between bins (parabolic interpolation). */
  private peakAt(i: number): { freq: number; magnitude: number; db: number } {
    const a = this.magnitudeAt(i - 1);
    const b = this.magnitudeAt(i);
    const c = this.magnitudeAt(i + 1);
    const den = a - 2 * b + c;
    const d = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
    const maxM = this.fftMaxMagnitude > 0 ? this.fftMaxMagnitude : 1;
    return {
      freq: (i + d) * this.binFrequency(),
      magnitude: b,
      db: (20 * Math.log(b / maxM)) / Math.log(10),
    };
  }

  private isPeak(i: number): boolean {
    const m = this.magnitudeAt(i);
    return m > 0 && m >= this.magnitudeAt(i - 1) && m > this.magnitudeAt(i + 1);
  }

  /**
   * The strongest local peak within `reach` pixels of plot-area x, or null. Bin 0 (DC) is never a
   * peak; nor is anything under 1% of the largest magnitude.
   */
  peakNear(x: number, reach: number): { freq: number; magnitude: number; db: number } | null {
    if (this.fftReal === null) return null;
    const half = this.scope.scopePointCount / 2;
    const perBin = (2 * this.scope.rect.width) / this.scope.scopePointCount;
    const lo = Math.max(1, Math.floor((x - reach) / perBin));
    const hi = Math.min(half - 2, Math.ceil((x + reach) / perBin));
    let best = -1;
    for (let i = lo; i <= hi; i++)
      if (this.isPeak(i) && (best < 0 || this.magnitudeAt(i) > this.magnitudeAt(best))) best = i;
    if (best < 0 || this.magnitudeAt(best) < this.fftMaxMagnitude * 0.01) return null;
    return this.peakAt(best);
  }

  /** Peak reach of the frequency cursor (pixels): it snaps to a peak this close. */
  static readonly SNAP = 8;

  /** Frequency the cursor reads at plot-area x: a nearby peak's, else the frequency there. */
  cursorFrequency(x: number): number {
    return this.peakNear(x, ScopeFFT.SNAP)?.freq ?? this.xToFrequency(x);
  }

  /** The strongest peak above DC, or null. */
  strongestPeak(): { freq: number; magnitude: number; db: number } | null {
    if (this.fftReal === null) return null;
    const half = this.scope.scopePointCount / 2;
    let best = -1;
    for (let i = 1; i < half - 1; i++)
      if (this.isPeak(i) && (best < 0 || this.magnitudeAt(i) > this.magnitudeAt(best))) best = i;
    if (best < 0 || this.magnitudeAt(best) < this.fftMaxMagnitude * 0.01) return null;
    return this.peakAt(best);
  }

  addCursorInfo(info: string[], mouseCursorX: number): void {
    const scope = this.scope;
    const maxFrequency = 1 / (scope.sim.maxTimeStep * scope.speed * 2);
    info.push(getUnitText((maxFrequency * (mouseCursorX - scope.rect.x)) / scope.rect.width, 'Hz'));
    if (this.fft !== null && this.fftReal !== null && this.fftImag !== null) {
      if (this.fftMaxMagnitude <= 0) return;
      const fftIndex = Math.trunc(
        ((mouseCursorX - scope.rect.x) * scope.scopePointCount) / (2 * scope.rect.width),
      );
      if (fftIndex >= 0 && fftIndex < scope.scopePointCount / 2) {
        const mag = this.fft.magnitude(this.fftReal[fftIndex], this.fftImag[fftIndex]);
        const db = (20 * Math.log(mag / this.fftMaxMagnitude)) / Math.log(10);
        info.push(`${Math.round(db)} dB`);
      }
    }
  }
}
