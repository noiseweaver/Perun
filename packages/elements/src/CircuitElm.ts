// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CircuitElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: construction, positioning and XML dump. The
// simulation half is SimElement in @circuitjs-next/engine.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitNode, Point, SimElement, type Simulation } from '@circuitjs-next/engine';
import type { StringTokenizer } from './StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter, XmlDocWriter } from './xml.ts';

/**
 * Base of every element class. Upstream has two constructors per element: one for a new element
 * placed by the user, one that reads the text format. Here construction only sets the position;
 * `initNew()` and `undump()` hold what those two constructors do (see ElementType).
 */
export abstract class CircuitElm extends SimElement {
  /** Defaults of a newly placed element (upstream `CircuitElm(int xx, int yy)` constructors). */
  initNew(): void {}

  /** Read the rest of a text-format line (upstream `CircuitElm(xa, ya, xb, yb, f, st)`). */
  undump(_st: StringTokenizer): void {}

  getDefaultFlags(): number {
    return 0;
  }

  /** XML tag: the dump type letter, else the class name without "Elm". */
  getXmlDumpType(): string {
    const t = this.getDumpType();
    if (t > 64 && t < 127) return String.fromCharCode(t);
    return this.getClassName().replace('Elm', '');
  }

  dumpXml(w: XmlAttrWriter): void {
    w.dumpAttr('x', `${this.x} ${this.y} ${this.x2} ${this.y2}`);
    // always written: some elements set nonzero flags in their constructor
    w.dumpAttr('f', this.flags);
  }

  /** Simulation state saved after the settings (capacitor voltage, inductor current). */
  dumpXmlState(_w: XmlAttrWriter): void {}

  undumpXml(r: XmlAttrReader): void {
    this.flags = r.parseIntAttr('f', this.flags);
  }

  /**
   * Model and other records this element needs written before it (upstream elements append
   * them to the document from inside `dumpXml`, so they land just before the element).
   */
  dumpXmlModels(_doc: XmlDocWriter): void {}

  /**
   * Voltages read from a file (transistor junction voltages, op-amp inputs). Upstream keeps a
   * copy of the node voltages per element and the loader writes into it; here they wait on
   * placeholder nodes, and `setNode` carries them onto the real nodes during analysis (the
   * ground node excepted, which master also zeroes).
   */
  protected setLoadedVoltage(n: number, v: number): void {
    const nodes = [...this.nodes];
    for (let i = nodes.length; i < this.getNodeCount(); i++) nodes.push(placeholderNode(0));
    nodes[n] = placeholderNode(v);
    this.nodes = nodes;
  }

  /** Upstream `interpPoint2`: points fraction f from a to b, offset +g and -g across the line. */
  interpPoint2(a: Point, b: Point, f: number, g: number): [Point, Point] {
    const gx = b.y - a.y;
    const gy = a.x - b.x;
    g /= Math.sqrt(gx * gx + gy * gy);
    return [
      new Point(
        Math.floor(a.x * (1 - f) + b.x * f + g * gx + 0.48),
        Math.floor(a.y * (1 - f) + b.y * f + g * gy + 0.48),
      ),
      new Point(
        Math.floor(a.x * (1 - f) + b.x * f - g * gx + 0.48),
        Math.floor(a.y * (1 - f) + b.y * f - g * gy + 0.48),
      ),
    ];
  }

  setPosition(x: number, y: number, x2: number, y2: number): void {
    this.x = x;
    this.y = y;
    this.x2 = x2;
    this.y2 = y2;
    this.setPoints();
  }
}

function placeholderNode(v: number): CircuitNode {
  const n = new CircuitNode();
  n.index = -1;
  n.v = v;
  return n;
}

/** How to build one element class, for the loaders. */
export interface ElementType {
  /** Upstream class name (`getClassName()`). */
  className: string;
  /**
   * A new element at (x, y), as the user would place it. `sim` is the simulation it will join;
   * elements with models look them up there (upstream's model maps are global).
   */
  create(x: number, y: number, sim: Simulation): CircuitElm;
  /** An element read from a text-format line; `st` is past the five common fields. */
  load(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    f: number,
    st: StringTokenizer,
    sim: Simulation,
  ): CircuitElm;
}

type ElmConstructor = new (x: number, y: number, x2: number, y2: number, f: number) => CircuitElm;

/** The usual ElementType for a class whose constructor only takes the position. */
export function elementType(className: string, ctor: ElmConstructor): ElementType {
  return {
    className,
    create(x, y, sim) {
      const e = new ctor(x, y, x, y, 0);
      e.sim = sim;
      e.flags = e.getDefaultFlags();
      e.initNew();
      return e;
    },
    load(x1, y1, x2, y2, f, st, sim) {
      const e = new ctor(x1, y1, x2, y2, f);
      e.sim = sim;
      e.undump(st);
      return e;
    },
  };
}
