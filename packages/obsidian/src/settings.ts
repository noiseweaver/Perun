// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { DrawingSettings } from '@perun/app/drawing';
import {
  ACTIVE_THEME_KEY,
  USER_THEME_PREFIX,
  readSettings,
  type UserSettings,
} from '@perun/app/settings';
import { DEFAULT_THEME_ID, builtinTheme, parseTheme, type Theme } from '@perun/theme';

/** What the plugin keeps in its data.json, in the vault's .obsidian folder. */
export interface PluginData {
  /** Use Perun's Obsidian Dark and Light themes, following Obsidian's mode. */
  followObsidian: boolean;
  /** Opening a circuit that is open in another tab goes to that tab. */
  reuseTabs: boolean;
  /** The editor's stored data (its settings), see EmbedConfig.storage. */
  storage: Record<string, string>;
}

export const DEFAULT_DATA: PluginData = { followObsidian: true, reuseTabs: true, storage: {} };

export function readData(raw: unknown): PluginData {
  const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<PluginData>;
  const storage: Record<string, string> = {};
  if (typeof d.storage === 'object' && d.storage !== null) {
    for (const [k, v] of Object.entries(d.storage)) if (typeof v === 'string') storage[k] = v;
  }
  return {
    followObsidian: typeof d.followObsidian === 'boolean' ? d.followObsidian : true,
    reuseTabs: typeof d.reuseTabs === 'boolean' ? d.reuseTabs : true,
    storage,
  };
}

/** The public web app: "Open in Perun" links and the editor's exported links point here. */
export const SITE_URL = 'https://noiseweaver.github.io/Perun/';

/** The built-in theme that matches Obsidian's mode, or null when the user turned that off. */
export function obsidianThemeId(data: PluginData, dark: boolean): string | null {
  if (!data.followObsidian) return null;
  return dark ? 'obsidian-dark' : 'obsidian-light';
}

/** The editor's settings (Options menu), read as the editor reads them. */
function editorSettings(data: PluginData): UserSettings {
  return readSettings((key) => data.storage[key] ?? null);
}

/** The theme circuit blocks use: Obsidian's mode, else the theme chosen in the editor. */
export function blockTheme(data: PluginData, dark: boolean): Theme {
  const fallback = builtinTheme(DEFAULT_THEME_ID) as Theme;
  const follow = obsidianThemeId(data, dark);
  if (follow !== null) return builtinTheme(follow) ?? fallback;
  const id = editorSettings(data).themeId;
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

/** The editor's drawing settings, which circuits in notes follow too (packages/app/src/drawing.ts). */
export function drawSettings(data: PluginData): DrawingSettings {
  return editorSettings(data);
}
