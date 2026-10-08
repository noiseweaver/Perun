// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { Editable } from './EditInfo.ts';

/**
 * A model to edit in a dialog (upstream opens an `EditDialog` on the model, or one of the
 * Edit...ModelDialog subclasses). Values apply together with OK (or Apply), then every element
 * refetches its model (upstream `CirSim.updateModels`).
 */
export interface ModelEditRequest {
  target: Editable;
  /** Show an Apply button as well as OK (upstream's model subclasses remove it). */
  applyButton: boolean;
  /** Runs after the values applied without error (upstream's subclass `apply`). */
  onApply?: () => void;
}

/** The app's model dialog; elements call it from their "Edit Model" buttons. */
export const modelEditor: { open: ((req: ModelEditRequest) => void) | null } = { open: null };

/** A free model name: `base`, or `base-2`, `base-3`... (upstream `pickName`). */
export function pickModelName(base: string, map: ReadonlyMap<string, unknown>): string {
  if (!map.has(base)) return base;
  for (let num = 2; ; num++) {
    const n = base + '-' + num;
    if (!map.has(n)) return n;
  }
}
