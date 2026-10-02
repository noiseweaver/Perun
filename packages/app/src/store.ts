// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { BUILTIN_THEMES, DEFAULT_THEME_ID } from '@circuitjs-next/theme';
import { create } from 'zustand';
import type { ExampleList } from './examples.ts';

/** Display settings that belong to the user, not the circuit (kept in localStorage). */
export interface UserSettings {
  themeId: string;
  euroResistors: boolean;
  showOhm: boolean;
  conventionalCurrent: boolean;
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
  stopMessage: string | null;
  badConnections: number;
}

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
}

const SETTINGS_KEY = 'circuitjs-next.settings';

function loadSettings(): UserSettings {
  const defaults: UserSettings = {
    themeId: DEFAULT_THEME_ID,
    euroResistors: false,
    showOhm: false,
    conventionalCurrent: true,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return defaults;
    const s = JSON.parse(raw) as Partial<UserSettings>;
    return {
      themeId:
        typeof s.themeId === 'string' && s.themeId in BUILTIN_THEMES ? s.themeId : defaults.themeId,
      euroResistors:
        typeof s.euroResistors === 'boolean' ? s.euroResistors : defaults.euroResistors,
      showOhm: typeof s.showOhm === 'boolean' ? s.showOhm : defaults.showOhm,
      conventionalCurrent:
        typeof s.conventionalCurrent === 'boolean'
          ? s.conventionalCurrent
          : defaults.conventionalCurrent,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(s: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // private mode or storage disabled: settings last for this page only
  }
}

export const useApp = create<AppState>(() => ({
  title: '',
  running: true,
  speed: 117,
  currentSpeed: 50,
  display: { showDots: true, voltageColors: true, showValues: true, smallGrid: false },
  settings: loadSettings(),
  status: { t: 0, timeStep: 5e-6, stopMessage: null, badConnections: 0 },
  warnings: [],
  error: null,
  examples: null,
}));

export function updateSettings(patch: Partial<UserSettings>): void {
  const settings = { ...useApp.getState().settings, ...patch };
  useApp.setState({ settings });
  saveSettings(settings);
}
