// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import { cents, nearestNote } from './pitch.ts';

describe('pitch', () => {
  it('counts 1200 cents to the octave', () => {
    expect(cents(880, 440)).toBeCloseTo(1200, 9);
    expect(cents(440, 880)).toBeCloseTo(-1200, 9);
    expect(cents(440 * 2 ** (1 / 12), 440)).toBeCloseTo(100, 9);
  });

  it('names notes with A4 = 440 Hz and middle C as C4', () => {
    expect(nearestNote(440)).toEqual({ name: 'A4', cents: 0 });
    expect(nearestNote(261.6256)?.name).toBe('C4');
    expect(nearestNote(27.5)?.name).toBe('A0');
    expect(nearestNote(277.1826)?.name).toBe('C#4');
    expect(nearestNote(8.1758)?.name).toBe('C-1');
  });

  it('says how far off the nearest note a frequency is', () => {
    const n = nearestNote(440 * 2 ** (10 / 1200));
    expect(n?.name).toBe('A4');
    expect(n?.cents).toBeCloseTo(10, 9);
    const m = nearestNote(440 * 2 ** (-60 / 1200));
    expect(m?.name).toBe('G#4');
    expect(m?.cents).toBeCloseTo(40, 9);
  });

  it('has no note for zero or a bad value', () => {
    expect(nearestNote(0)).toBeNull();
    expect(nearestNote(Number.NaN)).toBeNull();
    expect(nearestNote(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
