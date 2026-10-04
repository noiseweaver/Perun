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
