// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import { SETTING_USE, frameState, type FrameInputs } from './drawing.ts';
import { readSettings, type UserSettings } from './settings.ts';
import { StepClock, type SteppedSim } from './stepClock.ts';

const inputs: FrameInputs = {
  running: true,
  elapsed: 16,
  currentSpeed: 50,
  showDots: true,
  voltageColors: true,
  showValues: false,
  voltageRange: 5,
  gridSize: 16,
};

describe('drawing settings', () => {
  it('every setting says where it applies', () => {
    // a setting missing from SETTING_USE doesn't compile
    // @ts-expect-error newSetting is not listed
    const _check: Record<keyof UserSettings | 'newSetting', string> = SETTING_USE;
    expect(Object.keys(SETTING_USE).sort()).toEqual(
      Object.keys(readSettings(() => null)).sort(),
    );
  });

  it('draws with the user settings and the circuit options', () => {
    const s = readSettings((k) =>
      k === 'circuitjs-next.settings.v2'
        ? JSON.stringify({ euroResistors: true, pausedDots: false, valueSize: 1.25 })
        : null,
    );
    const f = frameState(s, inputs);
    expect(f.euroResistors).toBe(true);
    expect(f.pausedDots).toBe(false);
    expect(f.valueScale).toBe(1.25);
    expect(f.showValues).toBe(false);
    expect(f.gridSize).toBe(16);
    expect(f.currentMult).not.toBe(0);
  });
});

/** A simulation that counts steps, pausing after `pauseAt` of them. */
function sim(pauseAt = Infinity): SteppedSim & { done: number } {
  return {
    done: 0,
    stopMessage: null,
    pauseRequested: false,
    analyzeFlag: false,
    step(n) {
      this.done += n;
      if (this.done >= pauseAt) this.pauseRequested = true;
      return n;
    },
  };
}

describe('the step clock', () => {
  it('runs the steps the elapsed time owes, carrying fractions over', () => {
    const c = new StepClock();
    const s = sim();
    expect(c.advance(s, 1000, 10.5).steps).toBe(10);
    expect(c.advance(s, 1000, 10.5).steps).toBe(11);
  });

  it('pauses on a stop trigger and forgets the backlog', () => {
    const c = new StepClock();
    const s = sim(600);
    expect(c.advance(s, 100_000, 10)).toEqual({ steps: 1000, paused: true });
    expect(s.pauseRequested).toBe(false);
    expect(c.advance(s, 0, 10).steps).toBe(0);
  });
});
