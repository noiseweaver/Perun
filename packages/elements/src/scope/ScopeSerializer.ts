// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ScopeSerializer.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { CircuitElm } from '../CircuitElm.ts';
import { unescapeToken } from '../escape.ts';
import { NumberFormatException, parseJavaDouble, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import {
  UNITS_A,
  UNITS_C,
  UNITS_OHMS,
  UNITS_V,
  UNITS_W,
  VAL_POWER,
  VAL_POWER_OLD,
} from './constants.ts';
import { setLastManDivisions, type Scope } from './Scope.ts';
import { ScopePlot } from './ScopePlot.ts';
import { DEFAULT_TRAIL_PERSISTENCE } from './ScopePlot2d.ts';

export const FLAG_YELM = 32;
export const FLAG_IVALUE = 2048;
export const FLAG_PLOTS = 4096;
export const FLAG_MAN_SCALE = 16;
export const FLAG_PERPLOTFLAGS = 1 << 18;
export const FLAG_PERPLOT_MAN_SCALE = 1 << 19;
export const FLAG_DIVISIONS = 1 << 21;
export const FLAG_TRIGGER = 1 << 24;

/** Where "Save as default" settings live (upstream: localStorage key `scopeDefaults`). */
export interface ScopeDefaultsStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** `Integer.parseInt(s, 16)`. */
function parseJavaHex(s: string): number {
  if (!/^[+-]?[0-9a-fA-F]+$/.test(s)) throw new NumberFormatException(s);
  const n = parseInt(s, 16);
  if (n < -2147483648 || n > 2147483647) throw new NumberFormatException(s);
  return n;
}

function exportAsDecOrHex(v: number, thresh: number): string {
  // Integer.toHexString of a non-negative int
  if (v >= thresh) return 'x' + (v >>> 0).toString(16);
  return String(v);
}

function importDecOrHex(s: string): number {
  if (s.charAt(0) === 'x') return parseJavaHex(s.substring(1));
  return parseJavaInt(s);
}

/** Reads and writes a scope's `o` record (text and XML) and its saved defaults. */
export class ScopeSerializer {
  readonly scope: Scope;
  /**
   * The last record read refers to an element this port couldn't load (upstream has every
   * element); the loader drops such scopes rather than show part of one.
   */
  missingElement = false;

  constructor(scope: Scope) {
    this.scope = scope;
  }

  private getElm(n: number): CircuitElm | null {
    const mgr = this.scope.mgr;
    if (mgr.isSkippedElement(n)) this.missingElement = true;
    return mgr.getElm(n);
  }

  getFlags(): number {
    const scope = this.scope;
    let flags =
      (scope.showI ? 1 : 0) |
      (scope.showV ? 2 : 0) |
      (scope.showMax ? 0 : 4) | // showMax used to be always on
      (scope.showFreq ? 8 : 0) |
      // in this version we always dump manual settings using the PERPLOT format
      (scope.isManualScale() ? FLAG_MAN_SCALE | FLAG_PERPLOT_MAN_SCALE : 0) |
      (scope.plot2d.enabled ? 64 : 0) |
      (scope.plot2d.plotXY ? 128 : 0) |
      (scope.showMin ? 256 : 0) |
      (scope.showScale ? 512 : 0) |
      (scope.fftPlot.enabled ? 1024 : 0) |
      (scope.maxScale ? 8192 : 0) |
      (scope.showRMS ? 16384 : 0) |
      (scope.showDutyCycle ? 32768 : 0) |
      (scope.fftPlot.logSpectrum ? 65536 : 0) |
      (scope.showAverage ? 1 << 17 : 0) |
      (scope.showElmInfo ? 1 << 20 : 0) |
      (scope.showP2P ? 1 << 22 : 0) |
      (scope.fftPlot.showPhaseAngle ? 1 << 23 : 0);
    flags |= FLAG_PLOTS;
    let allPlotFlags = 0;
    for (const p of scope.plots) allPlotFlags |= p.getPlotFlags();
    flags |= allPlotFlags !== 0 ? FLAG_PERPLOTFLAGS : 0;
    if (scope.isManualScale()) flags |= FLAG_DIVISIONS;
    if (scope.trigger.isActive()) flags |= FLAG_TRIGGER;
    return flags;
  }

  setFlags(flags: number): void {
    const scope = this.scope;
    scope.showI = (flags & 1) !== 0;
    scope.showV = (flags & 2) !== 0;
    scope.showMax = (flags & 4) === 0;
    scope.showFreq = (flags & 8) !== 0;
    scope.manualScale = (flags & FLAG_MAN_SCALE) !== 0;
    scope.plot2d.enabled = (flags & 64) !== 0;
    scope.plot2d.plotXY = (flags & 128) !== 0;
    scope.showMin = (flags & 256) !== 0;
    scope.showScale = (flags & 512) !== 0;
    scope.fftPlot.show((flags & 1024) !== 0);
    scope.maxScale = (flags & 8192) !== 0;
    scope.showRMS = (flags & 16384) !== 0;
    scope.showDutyCycle = (flags & 32768) !== 0;
    scope.fftPlot.logSpectrum = (flags & 65536) !== 0;
    scope.showAverage = (flags & (1 << 17)) !== 0;
    scope.showElmInfo = (flags & (1 << 20)) !== 0;
    scope.showP2P = (flags & (1 << 22)) !== 0;
    scope.fftPlot.showPhaseAngle = (flags & (1 << 23)) !== 0;
  }

  /** Append this scope's `<o>` record to root (the document root, or a ScopeElm). */
  dumpXml(root: XmlAttrWriter): void {
    const scope = this.scope;
    const mgr = scope.mgr;
    const vPlot = scope.plots[0];
    if (vPlot === undefined) return;
    const elm = vPlot.elm;
    if (elm === null) return;
    const plot2d = scope.plot2d;
    // sync scale[] from scaleX/scaleY for 2d plots so they get saved correctly
    if (plot2d.enabled && scope.plots.length >= 2) {
      const px = plot2d.validPlotIndex(plot2d.plotX, 0);
      const py = plot2d.validPlotIndex(plot2d.plotY, 1);
      scope.scale[scope.plots[px].units] = plot2d.scaleX;
      scope.scale[scope.plots[py].units] = plot2d.scaleY;
    }
    const flags = this.getFlags();
    const eno = mgr.locateElm(elm);
    if (eno < 0) return;
    const x = root.addChild('o');
    x.dumpAttr('en', eno);
    x.dumpAttr('sp', vPlot.scopePlotSpeed);
    // strip flags that belong to the old text format or are superseded by explicit attributes
    const f = flags & ~(FLAG_PERPLOTFLAGS | FLAG_PERPLOT_MAN_SCALE | FLAG_PLOTS | FLAG_TRIGGER);
    x.dumpAttr('f', exportAsDecOrHex(f, 0));
    x.dumpAttr('p', scope.position);
    if (scope.manDivisions !== 8) x.dumpAttr('md', scope.manDivisions);
    scope.trigger.dumpXml(x);
    if (plot2d.plotXY) {
      if (plot2d.plotX !== 0) x.dumpAttr('xy2x', plot2d.plotX);
      if (plot2d.plotY !== 1) x.dumpAttr('xy2y', plot2d.plotY);
      if (plot2d.plotBrightness >= 0) x.dumpAttr('xy2br', plot2d.plotBrightness);
      if (plot2d.plotColorR >= 0) x.dumpAttr('xy2r', plot2d.plotColorR);
      if (plot2d.plotColorG >= 0) x.dumpAttr('xy2g', plot2d.plotColorG);
      if (plot2d.plotColorB >= 0) x.dumpAttr('xy2b', plot2d.plotColorB);
    }
    for (const p of scope.plots) {
      const pw = x.addChild('p');
      if (p.getPlotFlags() > 0) pw.dumpAttr('f', (p.getPlotFlags() >>> 0).toString(16));
      if (p.elm !== elm) pw.dumpAttr('e', mgr.locateElm(p.elm));
      pw.dumpAttr('v', p.value);
      pw.dumpAttr('sc', scope.scale[p.units]);
      if (scope.isManualScale()) {
        pw.dumpAttr('ms', p.manScale);
        pw.dumpAttr('mp', p.manVPosition);
      }
    }
    // upstream sets this one directly, without dumpAttr's escaping
    if (scope.text !== null) x.setAttribute('x', scope.text);
    if (plot2d.trailPersistence !== DEFAULT_TRAIL_PERSISTENCE)
      x.dumpAttr('tp', plot2d.trailPersistence);
  }

  undumpXml(xml: XmlAttrReader): void {
    const scope = this.scope;
    this.missingElement = false;
    const e = xml.parseIntAttr('en', -1);
    if (e === -1) return;
    const ce = this.getElm(e);
    scope.setElm(ce);
    scope.plots = [];
    scope.speed = xml.parseIntAttr('sp', 64);
    const fs = xml.parseStringAttr('f', '0');
    const flags = importDecOrHex(fs);
    scope.position = xml.parseIntAttr('p', 0);
    scope.manDivisions = xml.parseIntAttr('md', 8);
    scope.text = xml.parseStringAttr('x', null);
    scope.plot2d.trailPersistence = xml.parseIntAttr('tp', DEFAULT_TRAIL_PERSISTENCE);
    scope.trigger.undumpXml(xml);
    const xy2x = xml.parseIntAttr('xy2x', 0);
    const xy2y = xml.parseIntAttr('xy2y', 1);
    const xy2br = xml.parseIntAttr('xy2br', -1);
    const xy2r = xml.parseIntAttr('xy2r', -1);
    const xy2g = xml.parseIntAttr('xy2g', -1);
    const xy2b = xml.parseIntAttr('xy2b', -1);
    for (const px of xml.getChildElements()) {
      const plotFlags = parseJavaHex(px.parseStringAttr('f', '0'));
      const plotElm = this.getElm(px.parseIntAttr('e', e));
      const val = px.parseIntAttr('v', -1);
      // an element this port can't load yet (upstream always has one here)
      if (plotElm === null) continue;
      const u = plotElm.getScopeUnits(val);
      const sc = px.parseDoubleAttr('sc', -1);
      if (sc >= 0) scope.scale[u] = sc;
      const p = new ScopePlot(plotElm, u, val, scope.getManScaleFromMaxScale(u, false));
      scope.plots.push(p);
      p.acCoupled = (plotFlags & ScopePlot.FLAG_AC) !== 0;
      const ms = px.parseDoubleAttr('ms', -1);
      if (ms >= 0) {
        p.manScaleSet = true;
        p.manScale = ms;
        p.manVPosition = px.parseIntAttr('mp', 0);
      }
    }
    // setFlags after plots are loaded so hasPlotValue checks work correctly
    this.setFlags(flags);
    const plot2d = scope.plot2d;
    if (plot2d.plotXY) {
      plot2d.plotX = xy2x;
      plot2d.plotY = xy2y;
      plot2d.plotBrightness = xy2br;
      plot2d.plotColorR = xy2r;
      plot2d.plotColorG = xy2g;
      plot2d.plotColorB = xy2b;
    }
    // restore scaleX/scaleY for 2d plots
    if (plot2d.enabled && scope.plots.length >= 1) {
      const px = plot2d.validPlotIndex(plot2d.plotX, 0);
      const py = plot2d.validPlotIndex(plot2d.plotY, Math.min(1, scope.plots.length - 1));
      plot2d.scaleX = scope.scale[scope.plots[px].units];
      plot2d.scaleY = scope.scale[scope.plots[py].units];
    }
  }

  /** Read a text-format `o` line (after the `o`). */
  undump(st: StringTokenizer): void {
    const scope = this.scope;
    const mgr = scope.mgr;
    this.missingElement = false;
    scope.initialize();
    const e = parseJavaInt(st.nextToken());
    if (e === -1) return;
    const ce = this.getElm(e);
    scope.setElm(ce);
    scope.speed = parseJavaInt(st.nextToken());
    let value = parseJavaInt(st.nextToken());
    // fix old value for VAL_POWER which doesn't work for transistors
    if (!(ce !== null && mgr.kinds.isTransistor(ce)) && value === VAL_POWER_OLD) value = VAL_POWER;
    const flags = importDecOrHex(st.nextToken());
    const sc = scope.scale;
    sc[UNITS_V] = parseJavaDouble(st.nextToken());
    sc[UNITS_A] = parseJavaDouble(st.nextToken());
    if (sc[UNITS_V] === 0) sc[UNITS_V] = 0.5;
    if (sc[UNITS_A] === 0) sc[UNITS_A] = 1;
    scope.plot2d.scaleX = sc[UNITS_V];
    scope.plot2d.scaleY = sc[UNITS_A];
    sc[UNITS_OHMS] = sc[UNITS_W] = sc[UNITS_C] = sc[UNITS_V];
    scope.text = null;
    const plot2dFlag = (flags & 64) !== 0;
    const hasPlotFlags = (flags & FLAG_PERPLOTFLAGS) !== 0;
    if ((flags & FLAG_PLOTS) !== 0) {
      // new-style dump
      try {
        scope.position = parseJavaInt(st.nextToken());
        const sz = parseJavaInt(st.nextToken());
        scope.manDivisions = 8;
        if ((flags & FLAG_DIVISIONS) !== 0) {
          scope.manDivisions = parseJavaInt(st.nextToken());
          setLastManDivisions(scope.manDivisions);
        }
        if (ce === null) throw new Error('no element');
        let u = ce.getScopeUnits(value);
        if (u > UNITS_A) sc[u] = parseJavaDouble(st.nextToken());
        scope.setValue(value);
        // setValue(0) creates an extra plot for current, so remove that
        scope.plots.length = Math.min(scope.plots.length, 1);
        let plotFlags = 0;
        for (let i = 0; i !== sz; i++) {
          if (hasPlotFlags) plotFlags = parseJavaHex(st.nextToken());
          if (i !== 0) {
            const ne = parseJavaInt(st.nextToken());
            const val = parseJavaInt(st.nextToken());
            const elm: CircuitElm | null = this.getElm(ne);
            if (elm === null) throw new Error('no element');
            u = elm.getScopeUnits(val);
            if (u > UNITS_A) sc[u] = parseJavaDouble(st.nextToken());
            scope.plots.push(new ScopePlot(elm, u, val, scope.getManScaleFromMaxScale(u, false)));
          }
          const p = scope.plots[i];
          p.acCoupled = (plotFlags & ScopePlot.FLAG_AC) !== 0;
          if ((flags & FLAG_PERPLOT_MAN_SCALE) !== 0) {
            p.manScaleSet = true;
            p.manScale = parseJavaDouble(st.nextToken());
            p.manVPosition = parseJavaInt(st.nextToken());
          }
        }
        while (st.hasMoreTokens()) {
          if (scope.text === null) scope.text = st.nextToken();
          else scope.text += ' ' + st.nextToken();
        }
      } catch {
        // upstream ignores a short or broken line and keeps what it read
      }
    } else {
      // old-style dump
      let yElm: CircuitElm | null = null;
      let ivalue = 0;
      scope.manDivisions = 8;
      try {
        scope.position = parseJavaInt(st.nextToken());
        let ye = -1;
        if ((flags & FLAG_YELM) !== 0) {
          ye = parseJavaInt(st.nextToken());
          if (ye !== -1) yElm = this.getElm(ye);
          // sinediode.txt has yElm set to something even though there's no xy plot
          if (!plot2dFlag) yElm = null;
        }
        if ((flags & FLAG_IVALUE) !== 0) ivalue = parseJavaInt(st.nextToken());
        while (st.hasMoreTokens()) {
          if (scope.text === null) scope.text = st.nextToken();
          else scope.text += ' ' + st.nextToken();
        }
      } catch {
        // as above
      }
      scope.setValues(value, ivalue, this.getElm(e), yElm);
    }
    if (scope.text !== null) scope.text = unescapeToken(scope.text);
    scope.plot2d.enabled = plot2dFlag;
    this.setFlags(flags);
  }

  saveAsDefault(): void {
    const stor = this.scope.mgr.defaultsStore;
    if (stor === null) return;
    const vPlot = this.scope.plots[0];
    if (vPlot === undefined) return;
    const flags = this.getFlags();
    let s = `1 ${flags} ${vPlot.scopePlotSpeed}`;
    if ((flags & FLAG_TRIGGER) !== 0) s += ' ' + String(this.scope.trigger.level);
    stor.setItem('scopeDefaults', s);
  }

  loadDefaults(): boolean {
    const stor = this.scope.mgr.defaultsStore;
    if (stor === null) return false;
    const str = stor.getItem('scopeDefaults');
    if (str === null) return false;
    const arr = str.split(' ');
    try {
      const flags = parseJavaInt(arr[1] ?? '');
      this.setFlags(flags);
      this.scope.speed = parseJavaInt(arr[2] ?? '');
      if (arr.length > 3 && (flags & FLAG_TRIGGER) !== 0)
        this.scope.trigger.level = parseJavaDouble(arr[3] ?? '');
    } catch {
      return false;
    }
    return true;
  }
}
