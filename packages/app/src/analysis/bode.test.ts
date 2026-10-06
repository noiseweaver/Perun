// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import {
  BodeSweep,
  bodeCsv,
  cutoffFrequencies,
  interpolate,
  sweepFrequencies,
  type BodeSettings,
} from './bode.ts';

function sweep(text: string, settings: BodeSettings): BodeSweep {
  const s = new BodeSweep(text, settings);
  while (s.run(1_000_000));
  return s;
}

const deg = (rad: number): number => (rad * 180) / Math.PI;

// 1k into 100n: fc = 1591.5 Hz
const RC_LOWPASS = `$ 1 5.0E-6 10 50 5.0 50
v 96 320 96 96 0 1 1000.0 5.0 0.0 0.0 0.5
r 96 96 256 96 0 1000.0
c 256 96 256 320 0 1.0E-7 0.0
w 96 320 256 320 0
g 96 320 96 352 0
`;

// series RLC, output across the 10 ohm resistor: band-pass at 1/(2 pi sqrt(LC)) = 503.3 Hz
const RLC_BANDPASS = `$ 1 5.0E-6 10 50 5.0 50
v 96 320 96 96 0 1 40.0 1.0 0.0 0.0 0.5
l 96 96 208 96 0 0.01 0.0
c 208 96 320 96 0 1.0E-5 0.0
r 320 96 320 320 0 10.0
w 96 320 320 320 0
g 96 320 96 352 0
`;

// inverting amplifier, gain -2, output on a labeled node
const OPAMP = `$ 1 5.0E-6 10 50 5.0 50
v 96 256 96 112 0 0 40.0 0.0 0.0
g 96 256 96 304 0
r 96 112 192 112 0 1000.0
r 192 144 336 144 0 2000.0
w 336 144 336 192 0
w 192 112 192 144 0
w 192 144 192 176 0
w 96 256 192 256 0
w 192 208 192 256 0
a 192 192 336 192 0 15.0 -15.0 1000000.0
207 336 192 400 192 0 out
`;

describe('sweepFrequencies', () => {
  it('spaces points evenly on a log axis, both ends included', () => {
    const f = sweepFrequencies(10, 100000, 10);
    expect(f).toHaveLength(41);
    expect(f[0]).toBe(10);
    expect(f[40]).toBeCloseTo(100000, 6);
    expect(f[10]).toBeCloseTo(100, 9);
  });
  it('is empty for a bad range', () => {
    expect(sweepFrequencies(100, 10, 10)).toEqual([]);
    expect(sweepFrequencies(0, 10, 10)).toEqual([]);
  });
});

describe('BodeSweep', () => {
  it('matches an RC low-pass filter within 0.05 dB and 0.5 degrees', () => {
    const s = sweep(RC_LOWPASS, {
      source: 0,
      output: 2,
      fStart: 10,
      fStop: 100000,
      pointsPerDecade: 5,
      amplitude: 5,
    });
    expect(s.state).toBe('done');
    expect(s.points).toHaveLength(21);
    const rc = 1000 * 1e-7;
    for (const p of s.points) {
      const x = 2 * Math.PI * p.f * rc;
      const gain = -10 * Math.log10(1 + x * x);
      expect(p.settled).toBe(true);
      expect(Math.abs(p.gainDb - gain)).toBeLessThan(0.05);
      expect(Math.abs(p.phaseDeg - -deg(Math.atan(x)))).toBeLessThan(0.5);
    }
    const [fc] = cutoffFrequencies(s.points);
    expect(fc).toBeDefined();
    expect(Math.abs((fc ?? 0) / (1 / (2 * Math.PI * rc)) - 1)).toBeLessThan(0.02);
  });

  it('finds the resonance of a series RLC band-pass', () => {
    const s = sweep(RLC_BANDPASS, {
      source: 0,
      output: 3,
      fStart: 100,
      fStop: 2500,
      pointsPerDecade: 40,
      amplitude: 1,
    });
    expect(s.state).toBe('done');
    let peak = s.points[0];
    for (const p of s.points) if (peak === undefined || p.gainDb > peak.gainDb) peak = p;
    const f0 = 1 / (2 * Math.PI * Math.sqrt(0.01 * 1e-5));
    expect(Math.abs((peak?.f ?? 0) / f0 - 1)).toBeLessThan(0.03);
    expect(Math.abs(peak?.gainDb ?? -99)).toBeLessThan(0.1);
    // two -3 dB points either side, bandwidth R / (2 pi L) = 159 Hz
    const cut = cutoffFrequencies(s.points);
    expect(cut).toHaveLength(2);
    const bw = (cut[1] ?? 0) - (cut[0] ?? 0);
    expect(Math.abs(bw / (10 / (2 * Math.PI * 0.01)) - 1)).toBeLessThan(0.05);
  });

  it('measures an inverting op-amp as 6 dB and 180 degrees from a DC source', () => {
    const s = sweep(OPAMP, {
      source: 0,
      output: 10,
      fStart: 100,
      fStop: 10000,
      pointsPerDecade: 2,
      amplitude: 0.1,
    });
    expect(s.state).toBe('done');
    for (const p of s.points) {
      expect(Math.abs(p.gainDb - 20 * Math.log10(2))).toBeLessThan(0.05);
      expect(Math.abs(Math.abs(p.phaseDeg) - 180)).toBeLessThan(0.5);
    }
  });

  it('rejects a non-source input', () => {
    expect(
      () =>
        new BodeSweep(RC_LOWPASS, {
          source: 1,
          output: 2,
          fStart: 10,
          fStop: 100,
          pointsPerDecade: 5,
          amplitude: 1,
        }),
    ).toThrow();
  });

  it('can stop between slices and continue', () => {
    const s = new BodeSweep(RC_LOWPASS, {
      source: 0,
      output: 2,
      fStart: 1000,
      fStop: 10000,
      pointsPerDecade: 5,
      amplitude: 5,
    });
    let slices = 0;
    while (s.run(500)) slices++;
    expect(slices).toBeGreaterThan(5);
    expect(s.points).toHaveLength(6);
    expect(s.progress).toBe(1);
  });
});

describe('helpers', () => {
  const pts = [
    { f: 10, mag: 1, gainDb: 0, phaseDeg: 0, settled: true },
    { f: 100, mag: 0.5, gainDb: -6, phaseDeg: -60, settled: true },
  ];
  it('interpolates on the log axis', () => {
    const v = interpolate(pts, Math.sqrt(10 * 100));
    expect(v?.gainDb).toBeCloseTo(-3, 9);
    expect(v?.phaseDeg).toBeCloseTo(-30, 9);
  });
  it('writes CSV', () => {
    expect(bodeCsv(pts).split('\n')[1]).toBe('10,0.0000,0.000,1');
  });
});
