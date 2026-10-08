// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { CircuitElm } from '@perun/elements';

/** Outputs in the order people look for them: labels, meters and outputs before parts. */
export function outputRank(e: CircuitElm): number {
  return e.getPostCount() === 1 ? 0 : e.getDumpType() === 'p'.charCodeAt(0) ? 0 : 1;
}
