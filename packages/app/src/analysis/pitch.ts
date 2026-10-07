// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

/**
 * Frequencies as musical pitch, for the sweep dialog's Frequency | Pitch readout: twelve-tone equal
 * temperament with A4 = 440 Hz and middle C called C4 (scientific pitch notation, MIDI note 60).
 */

const A4 = 440;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Cents from `ref` to `f`: 100 per semitone, 1200 per octave. */
export function cents(f: number, ref: number): number {
  return 1200 * Math.log2(f / ref);
}

/** The nearest note to `f` ("A4", "C#3") and how many cents `f` is off it (-50 to +50). */
export function nearestNote(f: number): { name: string; cents: number } | null {
  if (!(f > 0) || !Number.isFinite(f)) return null;
  const midi = 69 + 12 * Math.log2(f / A4);
  const n = Math.round(midi);
  const octave = Math.floor(n / 12) - 1;
  return { name: `${NAMES[((n % 12) + 12) % 12] ?? 'C'}${octave}`, cents: 100 * (midi - n) };
}
