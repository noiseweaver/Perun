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

/** Below this the factor rounds to 1.00 and the simulation reads as running in real time. */
const REAL_TIME_FACTOR = 1.005;

/**
 * How simulated time compares with real time, from the simulated seconds per real second:
 * `factor` is how many times slower or faster, in five characters (FACTOR_WIDTH).
 */
export interface Pace {
  kind: 'slower' | 'faster' | 'real' | 'stopped';
  factor: string;
}

/** Characters `Pace.factor` takes: three significant digits and a k, M, G or T ("1.21k"). */
export const FACTOR_WIDTH = 5;

export function paceOf(ratio: number): Pace {
  if (!(ratio > 0) || !Number.isFinite(ratio))
    return { kind: 'stopped', factor: '∞'.padStart(FACTOR_WIDTH) };
  const f = ratio < 1 ? 1 / ratio : ratio;
  if (f < REAL_TIME_FACTOR) return { kind: 'real', factor: '1'.padStart(FACTOR_WIDTH) };
  return { kind: ratio < 1 ? 'slower' : 'faster', factor: factorText(f) };
}

/** A factor of at least 1 with three significant digits and a prefix, padded to FACTOR_WIDTH. */
export function factorText(f: number): string {
  const prefixes = ['', 'k', 'M', 'G', 'T'];
  let k = 0;
  // 999.5 would round to "1000": say 1.00k instead
  while (f >= 999.5 && k < prefixes.length - 1) {
    f /= 1000;
    k++;
  }
  const num = f < 9.995 ? f.toFixed(2) : f < 99.95 ? f.toFixed(1) : f.toFixed(0);
  return `${num}${prefixes[k] ?? ''}`.padStart(FACTOR_WIDTH);
}

/** Characters `percentText` takes, without the % sign ("0.0825", "<0.001", "12345"). */
export const PERCENT_WIDTH = 7;

/** Simulated time as a percentage of real time, three significant digits, padded to PERCENT_WIDTH. */
export function percentText(ratio: number): string {
  const p = ratio * 100;
  let s: string;
  if (!(p > 0) || !Number.isFinite(p)) s = '0';
  else if (p < 0.001) s = '<0.001';
  else if (p >= 99999.5) s = '>99999';
  else if (p >= 99.95) s = p.toFixed(0);
  else s = p.toPrecision(3);
  return s.padStart(PERCENT_WIDTH);
}
