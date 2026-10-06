// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CircuitElm.java (updateDotCount)
// and UIManager.java (currentMult) (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CURRENT_TOO_FAST } from '@circuitjs-next/elements';

/**
 * How far dots move per ampere this frame: `elapsedMs` since the last frame and the current speed
 * slider (1..99). Electron flow runs the dots backwards.
 */
export function currentMultiplier(
  elapsedMs: number,
  currentBar: number,
  conventional: boolean,
): number {
  const c = Math.exp(currentBar / 3.5 - 14.2);
  const m = 1.7 * Math.trunc(elapsedMs) * c;
  return conventional ? m : -m;
}

/** Advance a dot position by one frame of current `cur` (upstream `updateDotCount`). */
export function updateDotCount(cur: number, cc: number, currentMult: number): number {
  let cadd = cur * currentMult;
  if (cadd > 6 || cadd < -6) return CURRENT_TOO_FAST;
  if (cc === CURRENT_TOO_FAST) cc = 0;
  cadd %= 8;
  return cc + cadd;
}

/**
 * Currents below this count as none: their dots are hidden rather than left standing still.
 * Upstream hides dots only at a position of exactly 0, so a branch whose current is rounding
 * noise (around 1e-16 A) kept still dots while one with exactly 0 A showed none (DEVIATIONS.md).
 */
export const NO_CURRENT = 1e-12;

/** Dot positions per element and slot. Upstream keeps them as `curcount` fields on elements. */
export class DotCounters {
  private counts = new Map<object, number[]>();

  clear(): void {
    this.counts.clear();
  }

  get(elm: object, slot: number): number {
    return this.counts.get(elm)?.[slot] ?? 0;
  }

  /** Advance (when running) and return the position for one slot. */
  advance(
    elm: object,
    slot: number,
    current: number,
    currentMult: number,
    running: boolean,
  ): number {
    let arr = this.counts.get(elm);
    if (arr === undefined) {
      arr = [];
      this.counts.set(elm, arr);
    }
    if (running && Math.abs(current) < NO_CURRENT) {
      arr[slot] = 0;
      return 0;
    }
    const cc = arr[slot] ?? 0;
    const next =
      running && Number.isFinite(current) ? updateDotCount(current, cc, currentMult) : cc;
    arr[slot] = next;
    return next;
  }
}
