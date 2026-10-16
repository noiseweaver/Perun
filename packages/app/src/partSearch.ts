// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// The part search at the pointer (not upstream): Space, or the search button under the radial
// wheel, opens a box to type a part's name into; the part picked goes where it opened. "Replace
// with…" opens the same box to swap a part for another that fits its posts.

import type { CircuitElm } from '@perun/elements';
import { create } from 'zustand';

export interface PartSearchState {
  /** Where it opened, in client pixels. */
  x: number;
  y: number;
  /** Where a part goes, in circuit coordinates. */
  gx: number;
  gy: number;
  /** The part being replaced, or null to place a new one. */
  replace: CircuitElm | null;
}

export const usePartSearch = create<{ search: PartSearchState | null }>(() => ({ search: null }));

export function openPartSearch(s: PartSearchState): void {
  usePartSearch.setState({ search: s });
}

export function closePartSearch(): void {
  if (usePartSearch.getState().search !== null) usePartSearch.setState({ search: null });
}
