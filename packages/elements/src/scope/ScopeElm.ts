// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/ScopeElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: an undocked scope, kept in the element list. The app
// lays it out and draws it (upstream draws it from ScopeElm.draw in screen coordinates).
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitElm, type ElementType } from '../CircuitElm.ts';
import { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { Scope } from './Scope.ts';
import { scopesFor } from './ScopeManager.ts';

export const SCOPE_ELM_DUMP_TYPE = 403;

/** A scope on the circuit canvas, filling the rectangle between its two points. */
export class ScopeElm extends CircuitElm {
  private scope: Scope | null = null;

  /** The scope (made on first use: the simulation is only known after construction). */
  get elmScope(): Scope {
    if (this.scope === null) {
      this.scope = new Scope(scopesFor(this.sim));
      this.scope.position = -1;
    }
    return this.scope;
  }

  /** Put a scope here (upstream setElmScope, used by Undock). */
  setElmScope(s: Scope): void {
    this.scope = s;
    s.position = -1;
  }

  /** Upstream setScopeElm: show an element. */
  setScopeElm(e: CircuitElm): void {
    this.elmScope.setElm(e);
    this.elmScope.resetGraph();
  }

  override getClassName(): string {
    return 'ScopeElm';
  }

  override getDumpType(): number {
    return SCOPE_ELM_DUMP_TYPE;
  }

  override initNew(): void {
    this.noDiagonal = false;
    this.x2 = this.x + 128;
    this.y2 = this.y + 64;
    this.setPoints();
  }

  override undump(st: StringTokenizer): void {
    this.noDiagonal = false;
    // the scope's own record, with underscores for spaces
    const sst = new StringTokenizer(st.nextToken(), '_');
    this.elmScope.serializer.undump(sst);
    this.elmScope.position = -1;
    this.setPoints();
    this.elmScope.resetGraph();
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    this.elmScope.serializer.dumpXml(w);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    for (const child of r.getChildElements()) {
      if (child.getTagName() === 'o') {
        this.elmScope.serializer.undumpXml(child);
        break;
      }
    }
    this.elmScope.position = -1;
    this.elmScope.resetGraph();
  }

  /** The scope shows an element this port can't load yet (it is then dropped). */
  get missingElement(): boolean {
    return this.elmScope.serializer.missingElement || this.elmScope.getElm() === null;
  }

  override reset(): void {
    super.reset();
    this.elmScope.resetGraph(true);
  }

  override getPostCount(): number {
    return 0;
  }

  override getNumHandles(): number {
    return 2;
  }

  override canViewInScope(): boolean {
    return false;
  }

  /** The rectangle in circuit coordinates. */
  box(): { x1: number; y1: number; x2: number; y2: number } {
    return {
      x1: Math.min(this.x, this.x2),
      y1: Math.min(this.y, this.y2),
      x2: Math.max(this.x, this.x2),
      y2: Math.max(this.y, this.y2),
    };
  }
}

export const ScopeElmType: ElementType = {
  className: 'ScopeElm',
  create(x, y, sim) {
    const e = new ScopeElm(x, y, x, y, 0);
    e.sim = sim;
    e.initNew();
    return e;
  },
  load(x1, y1, x2, y2, f, st, sim) {
    const e = new ScopeElm(x1, y1, x2, y2, f);
    e.sim = sim;
    e.undump(st);
    return e;
  },
};
