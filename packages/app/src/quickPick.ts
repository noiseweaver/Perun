// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// The quick pick: components pinned as favorites and the ones placed most recently, kept in this
// browser's storage and shown in a strip beside the canvas (not upstream).

import { create } from 'zustand';
import { paletteItem, type PaletteItem } from './editor/catalog.ts';

const FAVORITES_KEY = 'circuitjs-next.paletteFavorites';
const RECENTS_KEY = 'circuitjs-next.paletteRecents';

/** The favorites before any are pinned: what most circuits are drawn with. */
export const DEFAULT_FAVORITES: readonly string[] = [
  'WireElm',
  'GroundElm',
  'ResistorElm',
  'CapacitorElm',
  'InductorElm',
  'DiodeElm',
  'NTransistorElm',
  'OpAmpElm',
  'DCVoltageElm',
];

/** Recent components shown; a few more are kept so unpinning a favorite leaves the list full. */
export const RECENTS_SHOWN = 5;
const RECENTS_KEPT = 16;

const SUBCIRCUIT = 'CustomCompositeElm:';

interface QuickPickState {
  favorites: string[];
  recents: string[];
}

function load(key: string, fallback: readonly string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return [...fallback];
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [...fallback];
  }
}

function save(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // storage disabled: the list lasts for this page
  }
}

export const useQuickPick = create<QuickPickState>(() => ({
  favorites: load(FAVORITES_KEY, DEFAULT_FAVORITES),
  recents: load(RECENTS_KEY, []),
}));

/** Pin a component to the favorites, or unpin it. */
export function toggleFavorite(className: string): void {
  const { favorites } = useQuickPick.getState();
  const next = favorites.includes(className)
    ? favorites.filter((c) => c !== className)
    : [...favorites, className];
  useQuickPick.setState({ favorites: next });
  save(FAVORITES_KEY, next);
}

/** A component was placed on the canvas: it goes to the front of the recent list. */
export function notePlaced(className: string): void {
  const { recents } = useQuickPick.getState();
  if (recents[0] === className) return;
  const next = [className, ...recents.filter((c) => c !== className)].slice(0, RECENTS_KEPT);
  useQuickPick.setState({ recents: next });
  save(RECENTS_KEY, next);
}

/** The palette entry for a class, or a subcircuit model of this circuit; undefined if neither. */
export function quickItem(className: string, models: readonly string[]): PaletteItem | undefined {
  if (className.startsWith(SUBCIRCUIT)) {
    const name = className.slice(SUBCIRCUIT.length);
    return models.includes(name)
      ? { className, label: name, keywords: 'subcircuit', shortcut: null }
      : undefined;
  }
  return paletteItem(className);
}

/**
 * What the quick pick shows: the favorites in the order they were pinned, then the most recent
 * components that aren't favorites. Classes this build or circuit can't place are left out.
 */
export function quickPickItems(
  favorites: readonly string[],
  recents: readonly string[],
  models: readonly string[],
): { favorites: PaletteItem[]; recents: PaletteItem[] } {
  const resolve = (list: readonly string[]): PaletteItem[] =>
    list.flatMap((c) => {
      const it = quickItem(c, models);
      return it === undefined ? [] : [it];
    });
  return {
    favorites: resolve(favorites),
    recents: resolve(recents.filter((c) => !favorites.includes(c))).slice(0, RECENTS_SHOWN),
  };
}
