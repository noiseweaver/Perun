// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { CircuitElm, TextFont } from '@perun/elements';
import {
  BUILTIN_THEMES,
  DEFAULT_THEME_ID,
  builtinTheme,
  parseTheme,
  type Theme,
} from '@perun/theme';
import { ALL_FIELDS, NO_FIELDS, type FieldOptions } from '@perun/render';
import { create } from 'zustand';
import type { ExampleList } from './examples.ts';

/** Options > Value text size: how big component values are drawn, against upstream's 12 px. */
export const VALUE_SIZES = [
  { scale: 0.75, label: 'Small' },
  { scale: 0.875, label: 'Medium' },
  { scale: 1, label: 'Large' },
  { scale: 1.25, label: 'Extra large' },
] as const;

/** Display settings that belong to the user, not the circuit (kept in localStorage). */
export interface UserSettings {
  /** A built-in theme id, or `user:` and the id of a theme in the library (themes.ts). */
  themeId: string;
  euroResistors: boolean;
  /** IEC (box) logic gate symbols (upstream "European Gates"). */
  euroGates: boolean;
  showOhm: boolean;
  conventionalCurrent: boolean;
  /** Mark every connection: a dot where two ends meet, a larger one where three or more do. */
  junctionDots: boolean;
  /** Keep current dots on screen, standing still, while the simulation is paused (upstream hides them). */
  pausedDots: boolean;
  /** Options > Visualizations: field, charge and energy overlays. */
  fields: FieldOptions;
  /** Size of component value text on the canvas, as a fraction of 12 px (VALUE_SIZES). */
  valueSize: number;
  /** The mouse wheel over a resistor, capacitor or inductor steps its value (upstream option). */
  wheelEdit: boolean;
  /** Wire ends on a dragged part's posts move with it (not in upstream; Alt detaches). */
  wiresFollow: boolean;
  /** Font for text boxes; a display choice, not saved with circuits. */
  textFont: TextFont;
  /** Interface language: `auto` (the browser's) or an upstream catalog code (i18n.ts). */
  language: string;
}

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
  running: boolean;
  /** Simulation speed slider, 0..259 (upstream scale). */
  speed: number;
  /** Current speed slider, 1..99. */
  currentSpeed: number;
  display: CircuitDisplay;
  settings: UserSettings;
  status: SimStatus;
  warnings: string[];
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
const SETTINGS_KEY = 'circuitjs-next.settings.v2';
/**
 * Version 1 saved the default theme (Classic) along with any other setting, so its theme is not
 * a choice the user made. Its other settings carry over; the theme starts at the new default.
 */
const SETTINGS_KEY_V1 = 'circuitjs-next.settings';

function loadSettings(): UserSettings {
  const defaults: UserSettings = {
    themeId: DEFAULT_THEME_ID,
    euroResistors: false,
    euroGates: false,
    showOhm: false,
    conventionalCurrent: true,
    junctionDots: false,
    pausedDots: true,
    fields: NO_FIELDS,
    wheelEdit: true,
    wiresFollow: true,
    valueSize: 0.875,
    textFont: { family: 'default', bold: false, italic: false },
    language: 'auto',
  };
  try {
    let raw = localStorage.getItem(SETTINGS_KEY);
    let fromV1 = false;
    if (raw === null) {
      raw = localStorage.getItem(SETTINGS_KEY_V1);
      fromV1 = true;
    }
    if (raw === null) return defaults;
    const s = JSON.parse(raw) as Partial<UserSettings>;
    if (fromV1) delete s.themeId;
    return {
      themeId:
        typeof s.themeId === 'string' &&
        (builtinTheme(s.themeId) !== null || s.themeId.startsWith(USER_THEME_PREFIX))
          ? s.themeId
          : defaults.themeId,
      euroResistors:
        typeof s.euroResistors === 'boolean' ? s.euroResistors : defaults.euroResistors,
      euroGates: typeof s.euroGates === 'boolean' ? s.euroGates : defaults.euroGates,
      showOhm: typeof s.showOhm === 'boolean' ? s.showOhm : defaults.showOhm,
      conventionalCurrent:
        typeof s.conventionalCurrent === 'boolean'
          ? s.conventionalCurrent
          : defaults.conventionalCurrent,
      junctionDots: typeof s.junctionDots === 'boolean' ? s.junctionDots : defaults.junctionDots,
      pausedDots: typeof s.pausedDots === 'boolean' ? s.pausedDots : defaults.pausedDots,
      fields: readFields(s) ?? defaults.fields,
      wheelEdit: typeof s.wheelEdit === 'boolean' ? s.wheelEdit : defaults.wheelEdit,
      wiresFollow: typeof s.wiresFollow === 'boolean' ? s.wiresFollow : defaults.wiresFollow,
      valueSize: VALUE_SIZES.some((v) => v.scale === s.valueSize)
        ? (s.valueSize as number)
        : defaults.valueSize,
      textFont: readTextFont(s.textFont) ?? defaults.textFont,
      language: typeof s.language === 'string' ? s.language : defaults.language,
    };
  } catch {
    return defaults;
  }
}

function readFields(s: Partial<UserSettings> & { showFields?: unknown }): FieldOptions | null {
  // the first prototype had one switch for everything
  if (s.showFields === true) return { ...ALL_FIELDS };
  const v = s.fields as unknown;
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const out = { ...NO_FIELDS };
  for (const k of Object.keys(out) as (keyof FieldOptions)[]) out[k] = o[k] === true;
  return out;
}

function readTextFont(v: unknown): TextFont | null {
  if (typeof v !== 'object' || v === null) return null;
  const f = v as Partial<Record<keyof TextFont, unknown>>;
  const family = f.family === 'serif' || f.family === 'mono' ? f.family : 'default';
  return { family, bold: f.bold === true, italic: f.italic === true };
}

export function saveSettings(s: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // private mode or storage disabled: settings last for this page only
  }
}

/** Prefix of library theme ids in `settings.themeId`. */
export const USER_THEME_PREFIX = 'user:';
/**
 * The active library theme, kept in localStorage too so the first frame already has it (the
 * library itself loads from IndexedDB a moment later).
 */
export const ACTIVE_THEME_KEY = 'circuitjs-next.activeTheme';

/** The theme `themeId` names, from the library, the cached active theme or the built-ins. */
export function themeFor(themeId: string, library: readonly SavedTheme[]): Theme {
  const builtin = builtinTheme(themeId);
  if (builtin !== null) return builtin;
  const id = themeId.slice(USER_THEME_PREFIX.length);
  const saved = library.find((t) => t.id === id);
  if (saved) return saved.theme;
  try {
    const cached = JSON.parse(localStorage.getItem(ACTIVE_THEME_KEY) ?? 'null') as {
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
    return localStorage.getItem(PALETTE_KEY) !== 'false';
  } catch {
    return true;
  }
}

const initialSettings = loadSettings();

export const useApp = create<AppState>(() => ({
  title: '',
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
  warnings: [],
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
  preview: null,
  library: [],
  editing: null,
}));

/** Open or shut the palette; on wide screens the choice is remembered. */
export function setPaletteOpen(open: boolean): void {
  useApp.setState({ paletteOpen: open });
  if (window.innerWidth < 720) return;
  try {
    localStorage.setItem(PALETTE_KEY, String(open));
  } catch {
    // storage disabled: the choice lasts for this page
  }
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
