// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/*
 * What a circuit looks like from the user's settings, wherever it is drawn: the editor's canvas
 * and circuits in Obsidian notes (packages/obsidian) both build their frames here, so a new
 * drawing setting reaches both.
 */

import { currentMultiplier, type FrameState } from '@perun/render';
import type { UserSettings } from './settings.ts';

/**
 * Where each setting applies. "drawn": how circuits look, in the editor and in Obsidian notes
 * (frameState below must use it). "editor": only the editor's behaviour. TypeScript refuses a
 * setting that isn't listed, so each new one gets this decision when it is added.
 */
export const SETTING_USE = {
  // circuits in notes take Obsidian's light or dark theme, else this one (packages/obsidian)
  themeId: 'editor',
  euroResistors: 'drawn',
  euroGates: 'drawn',
  showOhm: 'drawn',
  tidyPots: 'drawn',
  conventionalCurrent: 'drawn',
  junctionDots: 'drawn',
  pausedDots: 'drawn',
  realTimeReadout: 'editor',
  fields: 'drawn',
  wheelEdit: 'editor',
  wiresFollow: 'editor',
  spliceOnDrop: 'editor',
  smartGuides: 'editor',
  routeWires: 'editor',
  editAfterPlace: 'editor',
  quickPickBar: 'editor',
  quickPickWheel: 'editor',
  warnUnsaved: 'editor',
  valueSize: 'drawn',
  textFont: 'drawn',
  language: 'editor',
} as const satisfies Record<keyof UserSettings, 'drawn' | 'editor'>;

type Use = typeof SETTING_USE;
type DrawnKey = { [K in keyof Use]: Use[K] extends 'drawn' ? K : never }[keyof Use];

/** The settings that change how circuits are drawn. */
export type DrawingSettings = Pick<UserSettings, DrawnKey>;

/** This frame's state that isn't a user setting: the run, and the circuit's own options. */
export interface FrameInputs {
  running: boolean;
  /** Milliseconds since the last frame. */
  elapsed: number;
  /** Current speed, 1 to 99 (the circuit's current bar). */
  currentSpeed: number;
  showDots: boolean;
  voltageColors: boolean;
  showValues: boolean;
  voltageRange: number;
  gridSize: number;
}

/** The renderer's frame from the drawing settings and this frame's state. */
export function frameState(s: DrawingSettings, f: FrameInputs): FrameState {
  // every drawn setting is named here: a new one fails to compile until it is used
  const {
    euroResistors,
    euroGates,
    showOhm,
    tidyPots,
    conventionalCurrent,
    junctionDots,
    pausedDots,
    fields,
    valueSize,
    textFont,
    ...unused
  } = s;
  const _none: Record<string, never> = unused;
  return {
    running: f.running,
    currentMult: currentMultiplier(f.elapsed, f.currentSpeed, conventionalCurrent),
    showDots: f.showDots,
    pausedDots,
    voltageColors: f.voltageColors,
    showValues: f.showValues,
    voltageRange: f.voltageRange,
    euroResistors,
    euroGates,
    showOhm,
    tidyPots,
    textFont,
    junctionDots,
    fields,
    gridSize: f.gridSize,
    valueScale: valueSize,
  };
}
