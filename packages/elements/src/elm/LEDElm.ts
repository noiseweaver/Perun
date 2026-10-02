// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/LEDElm.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType } from '../CircuitElm.ts';
import { parseJavaDouble } from '../java.ts';
import { modelsFor } from '../models/ModelLibrary.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { DiodeElm } from './DiodeElm.ts';

export class LEDElm extends DiodeElm {
  /** Upstream `LEDElm.lastLEDModelName`. */
  static readonly defaultLEDModelName: string = 'default-led';

  colorR = 0;
  colorG = 0;
  colorB = 0;
  maxBrightnessCurrent = 0;

  override getClassName(): string {
    return 'LEDElm';
  }
  override getDumpType(): number {
    return 162;
  }

  override initNew(): void {
    super.initNew();
    this.modelName = LEDElm.defaultLEDModelName;
    this.setup();
    this.maxBrightnessCurrent = 0.01;
    this.colorR = 1;
    this.colorG = this.colorB = 0;
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    if ((this.flags & (DiodeElm.FLAG_MODEL | DiodeElm.FLAG_FWDROP)) === 0) {
      const fwdrop = 2.1024259;
      this.model = modelsFor(this.sim).diode.getModelWithParameters(fwdrop, 0);
      this.modelName = this.model.name;
      this.setup();
    }
    this.colorR = parseJavaDouble(st.nextToken());
    this.colorG = parseJavaDouble(st.nextToken());
    this.colorB = parseJavaDouble(st.nextToken());
    this.maxBrightnessCurrent = 0.01;
    try {
      this.maxBrightnessCurrent = parseJavaDouble(st.nextToken());
    } catch {
      // optional
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('cr', this.colorR);
    w.dumpAttr('cg', this.colorG);
    w.dumpAttr('cb', this.colorB);
    w.dumpAttr('mbc', this.maxBrightnessCurrent);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.colorR = r.parseDoubleAttr('cr', this.colorR);
    this.colorG = r.parseDoubleAttr('cg', this.colorG);
    this.colorB = r.parseDoubleAttr('cb', this.colorB);
    this.maxBrightnessCurrent = r.parseDoubleAttr('mbc', this.maxBrightnessCurrent);
  }
}

export const LEDElmType = elementType('LEDElm', LEDElm);
