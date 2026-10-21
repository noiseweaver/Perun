// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/*
 * The user's settings (Options menu) and how they are stored. Plain code with no page or store:
 * the Obsidian plugin reads the same settings with it (circuits in notes draw as the editor does).
 */

import type { TextFont } from '@perun/elements';
import { ALL_FIELDS, NO_FIELDS, type FieldOptions } from '@perun/render';
import { DEFAULT_THEME_ID, builtinTheme } from '@perun/theme';

/** Options > Value text size: how big component values are drawn, against upstream's 12 px. */
export const VALUE_SIZES = [
  { scale: 0.75, label: 'Small' },
  { scale: 0.875, label: 'Medium' },
  { scale: 1, label: 'Large' },
  { scale: 1.25, label: 'Extra large' },
] as const;

/** Display settings that belong to the user, not the circuit (kept in platform.storage). */
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
  /** A two-post part dropped along a wire splices into it (not in upstream). */
  spliceOnDrop: boolean;
  /** Alignment guides while dragging (not in upstream). */
  smartGuides: boolean;
  /** A wire being drawn finds its way round parts (not in upstream; Alt draws it straight). */
  routeWires: boolean;
  /** The quick pick bar: the rail beside the canvas and the strip under it on phones. */
  quickPickBar: boolean;
  /** Q, a right-button flick or a long press on empty canvas opens the radial wheel. */
  quickPickWheel: boolean;
  /** Closing the page with changes not saved anywhere asks first (autosave.ts). */
  warnUnsaved: boolean;
  /** Font for text boxes; a display choice, not saved with circuits. */
  textFont: TextFont;
  /** Interface language: `auto` (the browser's) or an upstream catalog code (i18n.ts). */
  language: string;
}

/** Prefix of library theme ids in `settings.themeId`. */
export const USER_THEME_PREFIX = 'user:';

/**
 * The active library theme, kept in platform.storage too so the first frame already has it (the
 * library itself loads from IndexedDB a moment later).
 */
export const ACTIVE_THEME_KEY = 'circuitjs-next.activeTheme';

export const SETTINGS_KEY = 'circuitjs-next.settings.v2';
/**
 * Version 1 saved the default theme (Classic) along with any other setting, so its theme is not
 * a choice the user made. Its other settings carry over; the theme starts at the new default.
 */
const SETTINGS_KEY_V1 = 'circuitjs-next.settings';

/**
 * The user's settings as stored (`get` reads a storage key), each one checked: a missing or
 * damaged value is the default.
 */
export function readSettings(get: (key: string) => string | null): UserSettings {
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
    spliceOnDrop: true,
    smartGuides: true,
    routeWires: true,
    quickPickBar: true,
    quickPickWheel: true,
    warnUnsaved: true,
    valueSize: 0.875,
    textFont: { family: 'default', bold: false, italic: false },
    language: 'auto',
  };
  try {
    let raw = get(SETTINGS_KEY);
    let fromV1 = false;
    if (raw === null) {
      raw = get(SETTINGS_KEY_V1);
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
      spliceOnDrop: typeof s.spliceOnDrop === 'boolean' ? s.spliceOnDrop : defaults.spliceOnDrop,
      smartGuides: typeof s.smartGuides === 'boolean' ? s.smartGuides : defaults.smartGuides,
      routeWires: typeof s.routeWires === 'boolean' ? s.routeWires : defaults.routeWires,
      quickPickBar: typeof s.quickPickBar === 'boolean' ? s.quickPickBar : defaults.quickPickBar,
      quickPickWheel:
        typeof s.quickPickWheel === 'boolean' ? s.quickPickWheel : defaults.quickPickWheel,
      warnUnsaved: typeof s.warnUnsaved === 'boolean' ? s.warnUnsaved : defaults.warnUnsaved,
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
