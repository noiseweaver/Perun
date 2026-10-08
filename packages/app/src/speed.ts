// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

// The simulation speed slider in steps per second. The slider keeps upstream's scale (notches
// 0..259, iterations per frame 0.1 * e^((n - 61) / 24) at 160 frames per second); the app lets it
// sit between notches, and the typed field converts to and from steps per second.

/** Frames per second the speed slider assumes (upstream's `steprate = 160 * getIterCount()`). */
export const STEP_FRAMES = 160;
export const SPEED_MIN = 0;
export const SPEED_MAX = 259;
/** The slider's step: a quarter notch, about 1 % in speed. */
export const SPEED_STEP = 0.25;

/** Steps per second at slider position `speed` (0 stops the simulation). */
export function stepsPerSecond(speed: number): number {
  return speed <= 0 ? 0 : STEP_FRAMES * 0.1 * Math.exp((speed - 61) / 24);
}

/**
 * The slider position for `steps` per second, held to the slider's range (the lowest running
 * notch up to the highest) and two decimals, so a whole notch stays whole and saves as upstream.
 */
export function speedForSteps(steps: number): number {
  if (!(steps > 0)) return 0;
  const pos = Math.log(steps / (STEP_FRAMES * 0.1)) * 24 + 61;
  return Math.min(Math.max(Math.round(pos * 100) / 100, 1), SPEED_MAX);
}

/** Steps per second as shown in the field: three significant digits below 100, whole above. */
export function stepsText(steps: number): string {
  if (steps === 0) return '0';
  if (steps < 10) return steps.toFixed(2);
  if (steps < 100) return steps.toFixed(1);
  return String(Math.round(steps));
}
