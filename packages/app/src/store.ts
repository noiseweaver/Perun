// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { CircuitElm } from '@perun/elements';
import {
  BUILTIN_THEMES,
  DEFAULT_THEME_ID,
  builtinTheme,
  parseTheme,
  type Theme,
} from '@perun/theme';
import type { LoadIssue } from '@perun/format';
import { create } from 'zustand';
import { embedConfig } from './embedConfig.ts';
import type { ExampleList } from './examples.ts';
import { platform } from './platform/index.ts';
import {
  ACTIVE_THEME_KEY,
  SETTINGS_KEY,
  USER_THEME_PREFIX,
  readSettings,
  type UserSettings,
} from './settings.ts';

export { ACTIVE_THEME_KEY, USER_THEME_PREFIX, VALUE_SIZES, type UserSettings } from './settings.ts';
/** Circuit options shown in the Options menu (saved with the circuit). */
export interface CircuitDisplay {
  showDots: boolean;
  voltageColors: boolean;
  showValues: boolean;
  smallGrid: boolean;
}

export interface SimStatus {
  t: number;
  timeStep: number;
  /** Ambient temperature in °C now (27 is the default; a ramp moves it). */
  temperature: number;
  /** A ramp or self-heating is on, so the temperature readout shows even at 27 °C. */
  thermal: boolean;
  /** Self-heating is on (parts have their own temperatures). */
  selfHeating: boolean;
  stopMessage: string | null;
  badConnections: number;
}

/** Editor state the UI shows (the editor itself lives in the controller). */
export interface EditorState {
  /** Class placed by dragging on the canvas, or null in select mode. */
  addClass: string | null;
  selectionCount: number;
  /** The one selected element, else null. */
  selected: CircuitElm | null;
  /**
   * What the property panel shows: the selection less undocked scope cards (moving a card selects
   * it, and its settings are behind its cog), and the one element of it, else null.
   */
  panelCount: number;
  panelElm: CircuitElm | null;
  canUndo: boolean;
  canRedo: boolean;
  canPaste: boolean;
  /** Bumped when the selected element's properties may have changed. */
  revision: number;
  /** A drag on the canvas is moving something: the phone property sheet steps aside. */
  moving: boolean;
  /** Selected parts that Align and Spread would move (everything but wires). */
  alignCount: number;
}

/** The rewind timeline: the frames kept of the last seconds of the run, and the one shown. */
export interface RewindState {
  /** The timeline bar is showing. */
  open: boolean;
  /** Frames kept. */
  frames: number;
  /** The frame shown (the last one while live). */
  index: number;
  /** Showing the run as it is now, not a recorded frame. */
  live: boolean;
  /** Simulated time of the frame shown. */
  t: number;
}

export type TeachTool = 'pencil' | 'laser' | 'eraser';

export interface AppState {
  title: string;
  /** The circuit changed since it was opened or saved (a dot beside the title). */
  unsaved: boolean;
  /** The circuit on screen is this one of My circuits: Ctrl+S saves over it. */
  savedAs: { id: string; name: string } | null;
  running: boolean;
  /** Simulation speed slider, 0..259 (upstream scale, in quarter notches or finer). */
  speed: number;
  /** Current speed slider, 1..99. */
  currentSpeed: number;
  display: CircuitDisplay;
  settings: UserSettings;
  status: SimStatus;
  /** What the last load left out; cleared when the notice is dismissed. */
  loadIssues: LoadIssue[];
  /** Load or fetch error to show. */
  error: string | null;
  examples: ExampleList | null;
  editor: EditorState;
  /** The palette panel is open (it closes itself on narrow screens). */
  paletteOpen: boolean;
  /** Text of a short notice ("Link copied"), or null. */
  toast: string | null;
  /** Bumped when the sliders or their values change (the slider panel reads them again). */
  sliderRevision: number;
  /** How the app can be installed: the browser's prompt, iOS's Add to Home Screen, or not. */
  install: 'none' | 'prompt' | 'ios';
  /** A new version has been downloaded and waits for a reload. */
  updateReady: boolean;
  /** This run is the first of a newer version (its number): offer its notes once. */
  updatedTo: string | null;
  /** Every file is cached: the app works offline. */
  offlineReady: boolean;
  /** The DC operating point panel is open. */
  dcPanel: boolean;
  /** Open dialog (commands.ts DialogKind). */
  dialog:
    | 'save'
    | 'myCircuits'
    | 'exportLink'
    | 'exportText'
    | 'importText'
    | 'shortcuts'
    | 'simSettings'
    | 'params'
    | 'scopeProperties'
    | 'sliders'
    | 'model'
    | 'subcircuit'
    | 'about'
    | 'subcircuitManager'
    | 'install'
    | 'themes'
    | 'themeEditor'
    | 'bode'
    | 'sweep'
    | 'exportImage'
    | 'partsList'
    | 'scopeCsv'
    | 'whatsNew'
    | 'feedback'
    | 'loadIssues'
    | null;
  /** Bumped to move keyboard focus to the property panel (double-click, Enter). */
  inspectorFocus: number;
  /** Subcircuits whose parts are shown, and the model whose circuit is being edited. */
  subcircuitBar: { viewing: string[]; editing: string | null };
  /** Subcircuit models that can be placed, by name. */
  subcircuitModels: string[];
  /** Teaching tools: the tool in use (null: editing as usual), the pen and the strokes' state. */
  teach: { tool: TeachTool | null; pen: number; strokes: number; canUndo: boolean };
  /** Rewind and scrub (PLAN.md Phase 20): the timeline bar and what it shows. */
  rewind: RewindState;
  /**
   * Touch box select: one finger dragging on empty canvas draws a selection box instead of
   * panning (two fingers still pan and zoom). A mouse drag always selects.
   */
  boxSelect: boolean;
  /** Text for screen readers (a polite live region): what keyboard selection picked. */
  announcement: string;
  /**
   * The value list shown while the mouse wheel steps a part's value on the canvas: where (canvas
   * px), the field's name, and the values around the current one (the middle one is current).
   */
  wheelValue: { x: number; y: number; name: string; values: (string | null)[]; seq: number } | null;
  /** The catalog the interface shows (`en`, `de`, ...); the app tree is keyed by it. */
  language: string;
  /** The user's theme (settings.themeId resolved). */
  theme: Theme;
  /**
   * In the Obsidian plugin, whether the theme follows Obsidian's light and dark mode (picking a
   * theme stops it); null on the web.
   */
  followsHost: boolean | null;
  /**
   * A theme shown in place of the user's without being chosen: one from a link, or one being
   * edited. Never saved on its own (PLAN.md section 6).
   */
  preview: ThemePreview | null;
  /** Themes the user saved (themes.ts keeps them in IndexedDB). */
  library: SavedTheme[];
  /** Theme the editor opens on, and the library entry it would replace on save, if any. */
  editing: { theme: Theme; id: string | null } | null;
}

export interface ThemePreview {
  theme: Theme;
  /** `link`: from a `theme=` link, with Apply and Save offered; `editor`: the theme editor's draft. */
  source: 'link' | 'editor';
}

export interface SavedTheme {
  id: string;
  theme: Theme;
  /** When it was saved (ms since the epoch). */
  saved: number;
}

/** The theme on screen: a preview if there is one, else the user's. */
export function shownTheme(s: Pick<AppState, 'theme' | 'preview'>): Theme {
  return s.preview?.theme ?? s.theme;
}

// Storage keys (here and elsewhere) keep the project's old name, circuitjs-next, so settings,
// themes and the last circuit saved before the rename to Perun are still found.
function loadSettings(): UserSettings {
  return readSettings((key) => {
    try {
      return platform.storage.getItem(key);
    } catch {
      return null;
    }
  });
}

export function saveSettings(s: UserSettings): void {
  try {
    platform.storage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // private mode or storage disabled: settings last for this page only
  }
}

/** The theme `themeId` names, from the library, the cached active theme or the built-ins. */
export function themeFor(themeId: string, library: readonly SavedTheme[]): Theme {
  const builtin = builtinTheme(themeId);
  if (builtin !== null) return builtin;
  const id = themeId.slice(USER_THEME_PREFIX.length);
  const saved = library.find((t) => t.id === id);
  if (saved) return saved.theme;
  try {
    const cached = JSON.parse(platform.storage.getItem(ACTIVE_THEME_KEY) ?? 'null') as {
      id?: unknown;
      theme?: unknown;
    } | null;
    if (cached?.id === id) {
      const r = parseTheme(cached.theme);
      if (r.ok) return r.theme;
    }
  } catch {
    // storage disabled or damaged: fall back to the default
  }
  return BUILTIN_THEMES[DEFAULT_THEME_ID] as Theme;
}

const PALETTE_KEY = 'circuitjs-next.paletteOpen';

/** Open on large screens unless the user slid it away last time; shut on phones. */
function initialPaletteOpen(): boolean {
  if (typeof window === 'undefined') return true;
  // phones, and phones on their side
  if (window.innerWidth < 720 || window.innerHeight < 560) return false;
  try {
    return platform.storage.getItem(PALETTE_KEY) !== 'false';
  } catch {
    return true;
  }
}

const initialSettings = loadSettings();

export const useApp = create<AppState>(() => ({
  title: '',
  unsaved: false,
  savedAs: null,
  running: true,
  speed: 117,
  currentSpeed: 50,
  display: { showDots: true, voltageColors: true, showValues: true, smallGrid: false },
  settings: initialSettings,
  status: {
    t: 0,
    timeStep: 5e-6,
    temperature: 27,
    thermal: false,
    selfHeating: false,
    stopMessage: null,
    badConnections: 0,
  },
  loadIssues: [],
  error: null,
  examples: null,
  editor: {
    addClass: null,
    selectionCount: 0,
    panelCount: 0,
    panelElm: null,
    selected: null,
    canUndo: false,
    canRedo: false,
    canPaste: false,
    revision: 0,
    moving: false,
    alignCount: 0,
  },
  paletteOpen: initialPaletteOpen(),
  toast: null,
  sliderRevision: 0,
  install: 'none',
  updateReady: false,
  updatedTo: null,
  offlineReady: false,
  inspectorFocus: 0,
  subcircuitBar: { viewing: [], editing: null },
  subcircuitModels: [],
  teach: { tool: null, pen: 0, strokes: 0, canUndo: false },
  rewind: { open: false, frames: 0, index: 0, live: true, t: 0 },
  boxSelect: false,
  announcement: '',
  wheelValue: null,
  language: 'en',
  dcPanel: false,
  dialog: null,
  theme: themeFor(initialSettings.themeId, []),
  followsHost: embedConfig === null ? null : embedConfig.themeId !== null,
  preview: null,
  library: [],
  editing: null,
}));

/** Open or shut the palette; on wide screens the choice is remembered. */
export function setPaletteOpen(open: boolean): void {
  useApp.setState({ paletteOpen: open });
  if (window.innerWidth < 720) return;
  try {
    platform.storage.setItem(PALETTE_KEY, String(open));
  } catch {
    // storage disabled: the choice lasts for this page
  }
}

/** Read the settings again (another editor tab in Obsidian changed them). */
export function reloadSettings(): void {
  const settings = loadSettings();
  useApp.setState({ settings, theme: themeFor(settings.themeId, useApp.getState().library) });
}

export function updateSettings(patch: Partial<UserSettings>): void {
  const state = useApp.getState();
  const settings = { ...state.settings, ...patch };
  if (patch.themeId !== undefined) {
    useApp.setState({ settings, theme: themeFor(patch.themeId, state.library) });
  } else useApp.setState({ settings });
  saveSettings(settings);
}

/** A short message at the bottom of the canvas, gone after a moment. */
export function showToast(text: string): void {
  useApp.setState({ toast: text });
  window.setTimeout(() => {
    if (useApp.getState().toast === text) useApp.setState({ toast: null });
  }, 2500);
}
