// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/OptocouplerElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Point } from '@circuitjs-next/engine';
import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import type { DiodeModel } from '../models/DiodeModel.ts';
import { modelsFor } from '../models/ModelLibrary.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getCurrentText, showFormat } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter, XmlDocWriter } from '../xml.ts';
import { ChipElm } from './ChipElm.ts';
import { CompositeElm } from './CompositeElm.ts';
import type { DiodeElm } from './DiodeElm.ts';
import type { TransistorElm } from './TransistorElm.ts';
import type { CCCSElm } from './VCCSElm.ts';

const MODEL_STRING = 'DiodeElm 6 1\rCCCSElm 1 2 3 4\rNTransistorElm 3 4 5';
const MODEL_EXTERNAL_NODES = [6, 2, 4, 5];

/**
 * An optocoupler: an LED whose current drives, through a current-controlled source fitted to a
 * real device, the base of a phototransistor.
 */
export class OptocouplerElm extends CompositeElm {
  csize = 2;
  cspc = 16;
  cspc2 = 32;
  /** Current transfer ratio (1.0 = 100%). */
  ctr = 1.0;
  rectPoints: Point[] = [];
  stubs: Point[] = [];
  /** Where the two little arrows from the LED to the transistor go. */
  arrows: [Point, Point][] = [];
  models: DiodeModel[] = [];

  override getClassName(): string {
    return 'OptocouplerElm';
  }
  override getDumpType(): number {
    return 407;
  }

  get diode(): DiodeElm {
    return this.compElmList[0] as DiodeElm;
  }
  get transistor(): TransistorElm {
    return this.compElmList[2] as TransistorElm;
  }

  override initNew(): void {
    this.initComposite(MODEL_STRING, MODEL_EXTERNAL_NODES);
    this.noDiagonal = true;
    this.initOptocoupler();
    this.diode.modelName = 'default-optocoupler-led';
    this.diode.setup();
  }

  // upstream passes no tokenizer: the parts are not saved in the text format
  override undump(_st: StringTokenizer): void {
    this.loadComposite(null, MODEL_STRING, MODEL_EXTERNAL_NODES);
    this.buildCompNodeList();
    this.allocNodes();
    this.noDiagonal = true;
    this.initOptocoupler();
  }

  override dumpXmlModels(doc: XmlDocWriter): void {
    const model = this.diode.model;
    if (model !== null && !(model.builtIn || model.dumped)) model.dumpXml(doc);
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('ctr', this.ctr);
    w.dumpAttr('dmo', this.diode.modelName);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.ctr = r.parseDoubleAttr('ctr', this.ctr);
    // "ix" is set on state-restore calls (from CompositeElm.dumpXmlState); absent on top-level
    // loads, where a missing "dmo" falls back to "default"
    const defaultDmo = r.parseStringAttr('ix', null) !== null ? this.diode.modelName : 'default';
    this.diode.modelName = r.parseStringAttr('dmo', defaultDmo);
    this.initOptocoupler();
    this.diode.setup();
  }

  private initOptocoupler(): void {
    this.csize = 2;
    this.cspc = 8 * 2;
    this.cspc2 = this.cspc * 2;
    const cccs = this.compElmList[1] as CCCSElm;
    // from http://www.cel.com/pdf/appnotes/an3017.pdf
    // the base expression models a ~100% CTR device; we scale by ctr
    cccs.setExpr(
      String(this.ctr) +
        '*max(0,min(.0001, select(i-.003, (-80000000000*(i)^5+800000000*(i)^4-3000000*(i)^3+5177.2*(i)^2+.2453*(i)-.00005)*1.04/700, (9000000*(i)^5-998113*(i)^4+42174*(i)^3-861.32*(i)^2+9.0836*(i)-.0078)*.945/700)))',
    );
    this.transistor.setBeta(700);
  }

  override getConnection(n1: number, n2: number): boolean {
    return Math.trunc(n1 / 2) === Math.trunc(n2 / 2);
  }

  override setPoints(): void {
    super.setPoints();
    // adapted from ChipElm
    const cspc = this.cspc;
    const cspc2 = this.cspc2;
    const x0 = this.x + cspc2;
    const y0 = this.y;
    const xr = x0 - cspc;
    const yr = y0 - cspc / 2;
    const xs = 2 * cspc2;
    const ys = 2 * cspc2 - cspc;
    this.rectPoints = [
      new Point(xr, yr),
      new Point(xr + xs, yr),
      new Point(xr + xs, yr + ys),
      new Point(xr, yr + ys),
    ];
    this.stubs = new Array<Point>(4);
    this.setPin(0, x0, y0, 0, 1, -1, 0, 0, 0);
    this.setPin(1, x0, y0, 0, 1, -1, 0, 0, 0);
    this.setPin(2, x0, y0, 0, 1, 1, 0, xs - cspc2, 0);
    this.setPin(3, x0, y0, 0, 1, 1, 0, xs - cspc2, 0);
    const dx = this.isFlippedX() ? -1 : 1;
    const posts = this.posts;
    const diode = this.diode;
    diode.setPosition(posts[0].x + 32 * dx, posts[0].y, posts[1].x + 32 * dx, posts[1].y);
    this.stubs[0] = diode.getPost(0);
    this.stubs[1] = diode.getPost(1);
    const midp = Math.trunc((posts[2].y + posts[3].y) / 2);
    const transistor = this.transistor;
    transistor.setFlipped(this.isFlippedY());
    transistor.setPosition(posts[2].x - 40 * dx, midp, posts[2].x - 24 * dx, midp);
    this.stubs[2] = transistor.getPost(1);
    this.stubs[3] = transistor.getPost(2);
    // little arrows from the LED toward the transistor
    const sx = this.stubs[0].x + 2 * dx;
    const sy = Math.trunc((this.stubs[0].y + this.stubs[1].y) / 2);
    this.arrows = [];
    for (let i = 0; i !== 2; i++) {
      const y = sy + i * 10 - 5;
      this.arrows.push([new Point(sx, y), new Point(sx + 20 * dx, y)]);
    }
  }

  isFlippedX(): boolean {
    return (this.flags & ChipElm.FLAG_FLIP_X) !== 0;
  }
  isFlippedY(): boolean {
    return (this.flags & ChipElm.FLAG_FLIP_Y) !== 0;
  }
  override canFlipXY(): boolean {
    return false;
  }

  override flipX(center2: number, count: number): void {
    this.flags ^= ChipElm.FLAG_FLIP_X;
    if (count !== 1) {
      const xs = 3 * this.cspc2;
      this.x = center2 - this.x - xs;
      this.x2 = center2 - this.x2;
    }
    this.setPoints();
  }

  override flipY(center2: number, count: number): void {
    this.flags ^= ChipElm.FLAG_FLIP_Y;
    if (count !== 1) {
      const ys = 1 * this.cspc2;
      this.y = center2 - this.y - ys;
      this.y2 = center2 - this.y2;
    }
    this.setPoints();
  }

  setPin(
    n: number,
    px: number,
    py: number,
    dx: number,
    dy: number,
    dax: number,
    day: number,
    sx: number,
    sy: number,
  ): void {
    const pos = n % 2;
    const cspc2 = this.cspc2;
    if (this.isFlippedX()) {
      dx = -dx;
      dax = -dax;
      px += cspc2;
      sx = -sx;
    }
    if (this.isFlippedY()) {
      dy = -dy;
      day = -day;
      py += cspc2;
      sy = -sy;
    }
    const xa = px + cspc2 * dx * pos + sx;
    const ya = py + cspc2 * dy * pos + sy;
    this.setPost(n, new Point(xa + dax * cspc2, ya + day * cspc2));
    this.stubs[n] = new Point(xa + dax * this.cspc, ya + day * this.cspc);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'optocoupler';
    arr[1] = 'CTR Scale = ' + showFormat(this.ctr);
    arr[2] = 'Iin = ' + getCurrentText(this.getCurrentIntoNode(0));
    arr[3] = 'Iout = ' + getCurrentText(this.getCurrentIntoNode(2));
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0) return new EditInfo('CTR Scale', this.ctr, 0, 0).setDimensionless();
    if (n === 1) {
      this.models = modelsFor(this.sim).diode.getModelList(false);
      const sel = this.models.indexOf(this.diode.model as DiodeModel);
      const ei = EditInfo.createChoice(
        'LED Model',
        this.models.map((m) => m.getDescription()),
        sel < 0 ? 0 : sel,
      );
      ei.value = 0;
      return ei;
    }
    return null;
  }

  updateModels(): void {
    this.diode.setup();
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 0 && ei.value > 0) {
      this.ctr = ei.value;
      this.initOptocoupler();
    }
    if (n === 1 && ei.choice !== null) {
      const diode = this.diode;
      diode.model = this.models[ei.choice.selected] ?? diode.model;
      if (diode.model !== null) diode.modelName = diode.model.name;
      diode.setup();
    }
  }
}

export const OptocouplerElmType = elementType('OptocouplerElm', OptocouplerElm);
