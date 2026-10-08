// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { EditInfo } from './edit/EditInfo.ts';
import { CapacitorElm } from './elm/CapacitorElm.ts';
import { InductorElm } from './elm/InductorElm.ts';
import { ResistorElm } from './elm/ResistorElm.ts';
import type { CircuitElm } from './CircuitElm.ts';

/**
 * Part tolerances for Monte Carlo runs (PLAN.md Phase 12). Not in upstream (DEVIATIONS.md): the
 * value lives on resistors, capacitors and inductors as `tolerance` and is saved as the XML
 * attribute `tol`, which upstream ignores. Nothing in the simulation reads it.
 */

export type TolerancedElm = ResistorElm | CapacitorElm | InductorElm;

/** The usual tolerances, in percent; 0 is none. */
export const TOLERANCES: readonly number[] = [0, 0.1, 0.5, 1, 2, 5, 10, 20];

export function hasTolerance(e: CircuitElm): e is TolerancedElm {
  return e instanceof ResistorElm || e instanceof CapacitorElm || e instanceof InductorElm;
}

/**
 * The toleranced value: resistance, capacitance or inductance. It is edit item 0 on all three
 * (and on the polarized capacitor), so it is set through `setEditValue` like the edit panel does.
 */
export function toleranceItem(_e: TolerancedElm): number {
  return 0;
}

/** The tolerance as a drop-down for the edit panel, keeping an unusual value from a file. */
export function toleranceEditInfo(e: TolerancedElm): EditInfo {
  const list = TOLERANCES.includes(e.tolerance)
    ? [...TOLERANCES]
    : [...TOLERANCES, e.tolerance].sort((a, b) => a - b);
  const ei = EditInfo.createChoice(
    'Tolerance',
    list.map((v) => (v === 0 ? 'None' : `±${v}%`)),
    list.indexOf(e.tolerance),
  );
  ei.value = e.tolerance;
  toleranceValues.set(ei, list);
  return ei;
}

const toleranceValues = new WeakMap<EditInfo, number[]>();

/** The tolerance an edited drop-down from `toleranceEditInfo` stands for. */
export function toleranceFromEditInfo(ei: EditInfo): number {
  const list = toleranceValues.get(ei) ?? [...TOLERANCES];
  return list[ei.choice?.selected ?? 0] ?? 0;
}
