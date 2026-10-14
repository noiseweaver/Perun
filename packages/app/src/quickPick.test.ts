// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_FAVORITES,
  RECENTS_SHOWN,
  notePlaced,
  quickPickItems,
  toggleFavorite,
  useQuickPick,
} from './quickPick.ts';

const names = (items: { className: string }[]): string[] => items.map((it) => it.className);

describe('quick pick', () => {
  beforeEach(() => useQuickPick.setState({ favorites: [...DEFAULT_FAVORITES], recents: [] }));

  it('starts with the common components, all of them placeable', () => {
    const { favorites } = quickPickItems(DEFAULT_FAVORITES, [], []);
    expect(names(favorites)).toEqual(DEFAULT_FAVORITES);
  });

  it('pins at the end and unpins', () => {
    toggleFavorite('ZenerElm');
    expect(useQuickPick.getState().favorites.at(-1)).toBe('ZenerElm');
    toggleFavorite('WireElm');
    expect(useQuickPick.getState().favorites).not.toContain('WireElm');
  });

  it('keeps recent components newest first, once each', () => {
    notePlaced('ZenerElm');
    notePlaced('LEDElm');
    notePlaced('ZenerElm');
    expect(useQuickPick.getState().recents).toEqual(['ZenerElm', 'LEDElm']);
  });

  it('shows a few recent components that are not favorites', () => {
    const recents = [
      'ResistorElm',
      'ZenerElm',
      'LEDElm',
      'PotElm',
      'FuseElm',
      'LampElm',
      'SwitchElm',
    ];
    const shown = quickPickItems(DEFAULT_FAVORITES, recents, []).recents;
    expect(shown).toHaveLength(RECENTS_SHOWN);
    expect(names(shown)).not.toContain('ResistorElm');
    expect(names(shown)[0]).toBe('ZenerElm');
  });

  it("leaves out what can't be placed: unknown classes and other circuits' subcircuits", () => {
    const { favorites } = quickPickItems(
      ['NoSuchElm', 'CustomCompositeElm:gone', 'CustomCompositeElm:amp'],
      [],
      ['amp'],
    );
    expect(names(favorites)).toEqual(['CustomCompositeElm:amp']);
    expect(favorites[0]?.label).toBe('amp');
  });
});
