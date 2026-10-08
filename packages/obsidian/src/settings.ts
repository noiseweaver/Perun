// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { DEFAULT_FRAME, type FrameState } from '@perun/render';
import { DEFAULT_THEME_ID, builtinTheme, parseTheme, type Theme } from '@perun/theme';

/** What the plugin keeps in its data.json, in the vault's .obsidian folder. */
export interface PluginData {
  /** Use Perun's Obsidian Dark and Light themes, following Obsidian's mode. */
  followObsidian: boolean;
  /** The editor's local storage (its settings), see EmbedConfig.storage. */
  storage: Record<string, string>;
}

export const DEFAULT_DATA: PluginData = { followObsidian: true, storage: {} };

export function readData(raw: unknown): PluginData {
  const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<PluginData>;
  const storage: Record<string, string> = {};
  if (typeof d.storage === 'object' && d.storage !== null) {
    for (const [k, v] of Object.entries(d.storage)) if (typeof v === 'string') storage[k] = v;
  }
  return {
    followObsidian: typeof d.followObsidian === 'boolean' ? d.followObsidian : true,
    storage,
  };
}

/** The public web app: "Open in Perun" links and the editor's exported links point here. */
export const SITE_URL = 'https://noiseweaver.github.io/Perun/';

// The editor's own storage keys (packages/app/src/store.ts), named before the rename to Perun.
const SETTINGS_KEY = 'circuitjs-next.settings.v2';
const ACTIVE_THEME_KEY = 'circuitjs-next.activeTheme';
const USER_THEME_PREFIX = 'user:';

/** The built-in theme that matches Obsidian's mode, or null when the user turned that off. */
export function obsidianThemeId(data: PluginData, dark: boolean): string | null {
  if (!data.followObsidian) return null;
  return dark ? 'obsidian-dark' : 'obsidian-light';
}

interface StoredSettings {
  themeId?: unknown;
  euroResistors?: unknown;
  euroGates?: unknown;
  showOhm?: unknown;
  conventionalCurrent?: unknown;
  junctionDots?: unknown;
  valueSize?: unknown;
}

function storedSettings(data: PluginData): StoredSettings {
  try {
    const v = JSON.parse(data.storage[SETTINGS_KEY] ?? '{}') as unknown;
    return typeof v === 'object' && v !== null ? (v as StoredSettings) : {};
  } catch {
    return {};
  }
}

/** The theme circuit blocks use: Obsidian's mode, else the theme chosen in the editor. */
export function blockTheme(data: PluginData, dark: boolean): Theme {
  const fallback = builtinTheme(DEFAULT_THEME_ID) as Theme;
  const follow = obsidianThemeId(data, dark);
  if (follow !== null) return builtinTheme(follow) ?? fallback;
  const id = storedSettings(data).themeId;
  if (typeof id !== 'string') return fallback;
  const builtin = builtinTheme(id);
  if (builtin !== null) return builtin;
  if (!id.startsWith(USER_THEME_PREFIX)) return fallback;
  // a library theme: the editor keeps a copy of the active one next to its settings
  try {
    const cached = JSON.parse(data.storage[ACTIVE_THEME_KEY] ?? 'null') as {
      id?: unknown;
      theme?: unknown;
    } | null;
    if (cached?.id === id.slice(USER_THEME_PREFIX.length)) {
      const r = parseTheme(cached.theme);
      if (r.ok) return r.theme;
    }
  } catch {
    // damaged: the default theme
  }
  return fallback;
}

/** The editor's drawing settings (Options menu) that circuit blocks follow too. */
export interface DrawSettings {
  frame: Pick<
    FrameState,
    'euroResistors' | 'euroGates' | 'showOhm' | 'junctionDots' | 'valueScale'
  >;
  conventionalCurrent: boolean;
}

export function drawSettings(data: PluginData): DrawSettings {
  const s = storedSettings(data);
  const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
  return {
    frame: {
      euroResistors: bool(s.euroResistors, DEFAULT_FRAME.euroResistors),
      euroGates: bool(s.euroGates, DEFAULT_FRAME.euroGates),
      showOhm: bool(s.showOhm, DEFAULT_FRAME.showOhm),
      junctionDots: bool(s.junctionDots, DEFAULT_FRAME.junctionDots),
      // the editor's default value size (Options > Value text size)
      valueScale: typeof s.valueSize === 'number' ? s.valueSize : 0.875,
    },
    conventionalCurrent: bool(s.conventionalCurrent, true),
  };
}
