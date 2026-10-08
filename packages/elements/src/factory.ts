// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { Simulation } from '@perun/engine';
import type { CircuitElm } from './CircuitElm.ts';
import type { StringTokenizer } from './StringTokenizer.ts';

/**
 * The element registry's constructors, for composite elements that build their parts by class
 * name. The registry fills this in when it loads (importing it directly would be a cycle).
 */
export const elementFactory = {
  construct(_className: string, _x: number, _y: number, _sim: Simulation): CircuitElm | null {
    throw new Error('element registry not loaded');
  },
  createCe(
    _tint: number,
    _x1: number,
    _y1: number,
    _x2: number,
    _y2: number,
    _f: number,
    _st: StringTokenizer,
    _sim: Simulation,
  ): CircuitElm | null {
    throw new Error('element registry not loaded');
  },
  classNameForXmlTag(_tag: string): string | undefined {
    throw new Error('element registry not loaded');
  },
};
