// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ScopeManager.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, with the scope statics of Scope.java (cursor and drag
// state) and the scope parts of CirSim (getElm, locateElm). Menus are the app's.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { Simulation } from '@circuitjs-next/engine';
import type { CircuitElm } from '../CircuitElm.ts';
import { Scope, type ScopeElementKinds, type ScopeRect } from './Scope.ts';
import { cardPlotRect, CARD_GAP } from './ScopeCardView.ts';
import type { ScopeImage } from './ScopeGraphics.ts';
import type { ScopeDefaultsStore } from './ScopeSerializer.ts';

/** Upstream's fixed scope array size. */
export const MAX_SCOPES = 20;
/** Width kept right of the scopes for the info text (upstream `CirSim.infoWidth`). */
export const INFO_WIDTH = 160;

/** What scopes need from the circuit and the UI around them. */
export interface ScopeHost {
  /** The circuit's elements, in save order. */
  elements(): readonly CircuitElm[];
  /** "Show current" (dots) is on: new scopes then also plot an element's current. */
  dotsEnabled(): boolean;
  /** An offscreen image for X-Y plots, or null when there is nowhere to draw. */
  createImage(width: number, height: number): ScopeImage | null;
  /** "Save as default" storage, or null. */
  readonly defaultsStore: ScopeDefaultsStore | null;
}

const headlessHost: ScopeHost = {
  elements: () => [],
  dotsEnabled: () => false,
  createImage: () => null,
  defaultsStore: null,
};

// Upstream `instanceof` checks, by dump type so new elements are recognised as they are ported.
const DUMP_TRANSISTOR = 116; // 't'
const DUMP_WIRE = 119; // 'w'
const DUMP_OUTPUT = 79; // 'O'
const DUMP_PROBE = 112; // 'p'
const DUMP_LOGIC_OUTPUT = 77; // 'M'
const DUMP_AUDIO_OUTPUT = 211;
const DUMP_TEST_POINT = 368;

export const defaultScopeElementKinds: ScopeElementKinds = {
  isTransistor: (e) => e.getDumpType() === DUMP_TRANSISTOR,
  isOutputLike: (e) =>
    [DUMP_OUTPUT, DUMP_LOGIC_OUTPUT, DUMP_AUDIO_OUTPUT, DUMP_TEST_POINT, DUMP_PROBE].includes(
      e.getDumpType(),
    ),
  isXYCandidate: (e) => e.getDumpType() === DUMP_OUTPUT || e.getDumpType() === DUMP_PROBE,
  isWire: (e) => e.getDumpType() === DUMP_WIRE,
};

/** The docked scopes of one circuit, plus the cursor state all scopes share. */
export class ScopeManager {
  readonly sim: Simulation;
  host: ScopeHost = headlessHost;
  kinds: ScopeElementKinds = defaultScopeElementKinds;

  /** Docked scopes, in order (upstream `scopes` and `scopeCount`). */
  scopes: Scope[] = [];
  private scopeColCount: number[] = new Array<number>(MAX_SCOPES).fill(0);
  /** Scope under the mouse, or -1. */
  scopeSelected = -1;
  /** Scope whose entry is hovered in the "Add to existing scope" menu, or -1. */
  scopeMenuSelected = -1;
  /** Undocked scopes (ScopeElm), counted after the docked ones in scope menus. */
  undockedScopes: () => Scope[] = () => [];

  // UI state the scopes read while drawing (upstream reads it from CirSim and Scope statics)
  mouseCursorX = -1;
  mouseCursorY = -1;
  mouseElm: CircuitElm | null = null;
  dialogShowing = false;
  wheelSensitivity = 1;
  cursorScope: Scope | null = null;
  cursorTime = -1;
  cursorUnits = 0;
  dragStartTime = -1;
  /** Card look: frequency where a drag over a spectrum started (-1: none), and its scope. */
  dragStartFreq = -1;
  dragFreqScope: Scope | null = null;
  draggingPlotYScope: Scope | null = null;

  /** How scopes are drawn: as upstream does, or in cards (ScopeCardView). */
  look: 'classic' | 'cards' = 'classic';
  /** Narrow screens: one column of scopes at a time, picked with tabs or a swipe. */
  compact = false;
  /** The column shown when compact. */
  activeColumn = 0;

  /**
   * While a file loads, its element list with null for records this port can't load yet, so the
   * element numbers in `o` records keep pointing at the right elements.
   */
  loadElements: readonly (CircuitElm | null)[] | null = null;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  get defaultsStore(): ScopeDefaultsStore | null {
    return this.host.defaultsStore;
  }

  get scopeCount(): number {
    return this.scopes.length;
  }

  dotsEnabled(): boolean {
    return this.host.dotsEnabled();
  }

  createImage(width: number, height: number): ScopeImage | null {
    return this.host.createImage(width, height);
  }

  /** Upstream `CirSim.getElm(n)`. */
  getElm(n: number): CircuitElm | null {
    const list = this.loadElements ?? this.host.elements();
    return list[n] ?? null;
  }

  /** Element n of the file being loaded is one this port skipped. */
  isSkippedElement(n: number): boolean {
    const list = this.loadElements;
    return list !== null && n >= 0 && n < list.length && list[n] === null;
  }

  /** Upstream `CirSim.locateElm(elm)`. */
  locateElm(elm: CircuitElm | null): number {
    if (elm === null) return -1;
    return this.host.elements().indexOf(elm);
  }

  elementCount(): number {
    return (this.loadElements ?? this.host.elements()).length;
  }

  newScope(): Scope {
    return new Scope(this);
  }

  scopeMenuIsSelected(s: Scope): boolean {
    if (this.scopeMenuSelected < 0) return false;
    if (this.scopeMenuSelected < this.scopeCount) return this.scopes[this.scopeMenuSelected] === s;
    return this.undockedScopes()[this.scopeMenuSelected - this.scopeCount] === s;
  }

  /** Called after every simulation timestep. */
  timeStep(): void {
    for (const s of this.scopes) s.timeStep();
    for (const s of this.undockedScopes()) s.timeStep();
  }

  /**
   * Drop scopes whose elements are gone, then lay the rest out in columns by position inside
   * area, leaving infoWidth (more with two columns or fewer) on the right for the info text.
   */
  setupScopes(area: ScopeRect, infoWidth = INFO_WIDTH): void {
    const scopes = this.scopes;
    // check scopes to make sure the elements still exist, and remove unused scopes/columns
    let pos = -1;
    for (let i = 0; i < scopes.length; i++) {
      if (scopes[i].needToRemove()) {
        scopes.splice(i--, 1);
        continue;
      }
      if (scopes[i].position > pos + 1) scopes[i].position = pos + 1;
      pos = scopes[i].position;
    }
    while (scopes.length > 0 && scopes[scopes.length - 1].getElm() === null) scopes.pop();
    const h = area.height;
    pos = 0;
    const colCount = this.scopeColCount;
    colCount.fill(0);
    for (const s of scopes) {
      pos = Math.max(s.position, pos);
      colCount[s.position]++;
    }
    const colct = pos + 1;
    if (this.activeColumn >= colct) this.activeColumn = colct - 1;
    if (this.activeColumn < 0) this.activeColumn = 0;
    let iw = infoWidth;
    if (colct <= 2) iw = Math.trunc((iw * 3) / 2);
    // compact: every column gets the whole width, and only the active one is shown
    const cols = this.compact ? 1 : colct;
    let w = Math.trunc((area.width - iw) / cols);
    const marg = 10;
    if (w < marg * 2) w = marg * 2;
    const cards = this.look === 'cards';
    pos = -1;
    let colh = 0;
    let row = 0;
    let speed = 0;
    for (const s of scopes) {
      if (s.position > pos) {
        pos = s.position;
        colh = Math.trunc(h / colCount[pos]);
        row = 0;
        speed = s.speed;
      }
      s.stackCount = colCount[pos];
      if (s.speed !== speed) {
        s.speed = speed;
        s.resetGraph();
      }
      const x = area.x + (this.compact ? 0 : pos) * w;
      let r: ScopeRect;
      if (cards) {
        const g = CARD_GAP / 2;
        s.slot = {
          x: x + g,
          y: area.y + colh * row + g,
          width: w - CARD_GAP,
          height: colh - CARD_GAP,
        };
        r = cardPlotRect(s.slot);
      } else {
        r = { x, y: area.y + colh * row, width: w - marg, height: colh };
        s.slot = r;
      }
      row++;
      const o = s.rect;
      if (r.x !== o.x || r.y !== o.y || r.width !== o.width || r.height !== o.height) s.setRect(r);
    }
  }

  /** Right edge of the last docked scope, where the info text starts (or 0 without scopes). */
  scopesRightEdge(): number {
    let x = 0;
    for (const s of this.scopes) if (this.isShown(s)) x = Math.max(x, s.rightEdge());
    return x;
  }

  /** Number of scope columns. */
  columnCount(): number {
    let n = 0;
    for (const s of this.scopes) n = Math.max(n, s.position + 1);
    return n;
  }

  /** Is the scope on screen? When compact, only the active column is. */
  isShown(s: Scope): boolean {
    return !this.compact || s.position === this.activeColumn;
  }

  /** The shown docked scope whose space holds a point, or -1. */
  scopeIndexAt(x: number, y: number): number {
    return this.scopes.findIndex(
      (s) =>
        this.isShown(s) &&
        x >= s.slot.x &&
        y >= s.slot.y &&
        x < s.slot.x + s.slot.width &&
        y < s.slot.y + s.slot.height,
    );
  }

  /**
   * Wire currents are needed every timestep if a scope shows a wire; otherwise once per frame
   * is enough.
   */
  canDelayWireProcessing(): boolean {
    for (const s of this.scopes) if (s.viewingWire()) return false;
    for (const s of this.undockedScopes()) if (s.viewingWire()) return false;
    return true;
  }

  canStackScope(s: number): boolean {
    if (this.scopeCount < 2) return false;
    if (s === 0) s = 1;
    return this.scopes[s].position !== this.scopes[s - 1].position;
  }

  canCombineScope(): boolean {
    return this.scopeCount >= 2;
  }

  canUnstackScope(s: number): boolean {
    if (this.scopeCount < 2) return false;
    if (s === 0) s = 1;
    const scopes = this.scopes;
    if (scopes[s].position !== scopes[s - 1].position) {
      // allow unstacking by selecting the top scope in the stack
      return s + 1 < this.scopeCount && scopes[s + 1].position === scopes[s].position;
    }
    return true;
  }

  stackScope(s: number): void {
    if (!this.canStackScope(s)) return;
    if (s === 0) s = 1;
    const scopes = this.scopes;
    scopes[s].position = scopes[s - 1].position;
    for (s++; s < this.scopeCount; s++) scopes[s].position--;
  }

  unstackScope(s: number): void {
    if (!this.canUnstackScope(s)) return;
    if (s === 0) s = 1;
    const scopes = this.scopes;
    // allow unstacking by selecting the top scope in the stack
    if (scopes[s].position !== scopes[s - 1].position) s++;
    for (; s < this.scopeCount; s++) scopes[s].position++;
  }

  combineScope(s: number): void {
    if (!this.canCombineScope()) return;
    if (s === 0) s = 1;
    this.scopes[s - 1].combine(this.scopes[s]);
    this.scopes[s].setElm(null);
  }

  stackAll(): void {
    for (const s of this.scopes) {
      s.position = 0;
      s.showMax = s.showMin = false;
    }
  }

  unstackAll(): void {
    this.scopes.forEach((s, i) => {
      s.position = i;
      s.showMax = true;
    });
  }

  combineAll(): void {
    const scopes = this.scopes;
    for (let i = scopes.length - 2; i >= 0; i--) {
      scopes[i].combine(scopes[i + 1]);
      scopes[i + 1].setElm(null);
    }
  }

  separateAll(): void {
    const newscopes: Scope[] = [];
    let ct = 0;
    for (const s of this.scopes) ct = s.separate(newscopes, ct, MAX_SCOPES);
    this.scopes = newscopes.slice(0, ct);
  }

  /** Add a docked scope at the end (in a new column unless it has a position). */
  addScope(sc: Scope): void {
    if (this.scopeCount >= MAX_SCOPES) return;
    if (sc.position < 0) sc.position = this.scopeCount;
    this.scopes.push(sc);
  }

  clearScopes(): void {
    this.scopes = [];
    this.cursorScope = null;
    this.scopeSelected = -1;
  }

  resetGraphs(): void {
    for (const s of this.scopes) s.resetGraph(true);
    for (const s of this.undockedScopes()) s.resetGraph(true);
  }

  /** Element menu "View in New Scope": reuse an empty scope or add one at the end. */
  viewInScope(elm: CircuitElm): Scope | null {
    const scopes = this.scopes;
    let i = scopes.findIndex((s) => s.getElm() === null);
    if (i < 0) {
      if (scopes.length >= MAX_SCOPES) return null;
      i = scopes.length;
      const s = new Scope(this);
      s.position = i;
      scopes.push(s);
    }
    scopes[i].setElm(elm);
    if (i > 0) scopes[i].speed = scopes[i - 1].speed;
    return scopes[i];
  }

  /** Element menu "Add to Existing Scope" n (docked scopes first, then undocked ones). */
  addToScope(n: number, elm: CircuitElm): void {
    if (n < this.scopeCount) {
      this.scopes[n].addElm(elm);
      return;
    }
    this.undockedScopes()[n - this.scopeCount]?.addElm(elm);
  }

  /** Scopes the "Add to Existing Scope" menu lists, with their labels. */
  scopeMenuEntries(): { scope: Scope; undocked: boolean; label: string }[] {
    const out: { scope: Scope; undocked: boolean; label: string }[] = [];
    this.scopes.forEach((s, i) => {
      const l = s.getScopeLabelOrText() ?? '';
      out.push({ scope: s, undocked: false, label: `Scope ${i + 1}${l !== '' ? ` (${l})` : ''}` });
    });
    this.undockedScopes().forEach((s, i) => {
      const l = s.getScopeLabelOrText() ?? '';
      out.push({
        scope: s,
        undocked: true,
        label: `Undocked Scope ${i + 1}${l !== '' ? ` (${l})` : ''}`,
      });
    });
    return out;
  }

  /** Every element shown in a scope, with its X-Y role, for highlighting on the circuit. */
  scopePlotRoles(): Map<CircuitElm, string> {
    const roles = new Map<CircuitElm, string>();
    for (const s of this.scopes) s.addScopePlotRoles(roles);
    for (const s of this.undockedScopes()) s.addScopePlotRoles(roles);
    return roles;
  }
}

const managers = new WeakMap<Simulation, ScopeManager>();

/** The scope manager of a simulation, made on first use (as modelsFor). */
export function scopesFor(sim: Simulation): ScopeManager {
  let m = managers.get(sim);
  if (m === undefined) {
    m = new ScopeManager(sim);
    managers.set(sim, m);
  }
  return m;
}
