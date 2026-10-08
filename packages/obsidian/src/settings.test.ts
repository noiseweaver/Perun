// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { builtinTheme } from '@perun/theme';
import { describe, expect, it } from 'vitest';
import { blockTheme, drawSettings, obsidianThemeId, readData } from './settings.ts';

describe('plugin settings', () => {
  it('reads damaged data as the defaults', () => {
    expect(readData(null)).toEqual({ followObsidian: true, storage: {} });
    expect(readData({ followObsidian: 'no', storage: { a: 1, b: 'x' } })).toEqual({
      followObsidian: true,
      storage: { b: 'x' },
    });
  });

  it("follows Obsidian's mode, else the editor's theme", () => {
    const follow = readData({});
    expect(obsidianThemeId(follow, true)).toBe('obsidian-dark');
    expect(blockTheme(follow, false)).toBe(builtinTheme('obsidian-light'));
    const own = readData({
      followObsidian: false,
      storage: { 'circuitjs-next.settings.v2': JSON.stringify({ themeId: 'classic' }) },
    });
    expect(obsidianThemeId(own, true)).toBeNull();
    expect(blockTheme(own, true)).toBe(builtinTheme('classic'));
  });

  it("draws with the editor's symbol settings", () => {
    const d = readData({
      storage: {
        'circuitjs-next.settings.v2': JSON.stringify({ euroResistors: true, valueSize: 1.25 }),
      },
    });
    const s = drawSettings(d);
    expect(s.frame.euroResistors).toBe(true);
    expect(s.frame.valueScale).toBe(1.25);
    expect(s.conventionalCurrent).toBe(true);
  });
});
