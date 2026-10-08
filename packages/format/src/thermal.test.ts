// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Self-heating and the ambient ramp (PLAN.md Phase 17): parts heat by their own power and cool
// to ambient, and circuits without either save and run exactly as before.

import { DiodeElm, ResistorElm, TransistorElm, temperatureOf } from '@perun/elements';
import { describe, expect, it } from 'vitest';
import { readCircuit, type Circuit } from './circuit.ts';

const HEADER = '$ 1 0.000005 10.2 50 5 50 5e-11\n';

/** 10 V across one resistor. */
const HEATER =
  HEADER +
  'v 96 320 96 96 0 0 40.0 10.0 0.0 0.0 0.5\n' +
  'r 96 96 256 96 0 100\n' +
  'w 256 96 256 320 0\n' +
  'w 256 320 96 320 0\n' +
  'g 96 320 96 352 0\n';

/** An NPN transistor with its base held at `vb`, collector through 10 Ω to 20 V. */
function bjtCircuit(vb: number, emitterR = 0): string {
  return (
    HEADER +
    't 208 224 256 224 0 1 0 0 100 default\n' +
    `R 208 224 160 224 0 0 40.0 ${vb} 0 0 0.5\n` +
    'r 256 208 256 112 0 10\n' +
    'R 256 112 256 80 0 0 40.0 20 0 0 0.5\n' +
    (emitterR > 0 ? `r 256 240 256 288 0 ${emitterR}\n` : 'w 256 240 256 288 0\n') +
    'g 256 288 256 320 0\n'
  );
}

function start(c: Circuit): void {
  c.sim.setElements(c.elements);
}

const resistor = (c: Circuit): ResistorElm =>
  c.elements.find((e) => e instanceof ResistorElm) as ResistorElm;

describe('self-heating', () => {
  it('heats a resistor towards ambient + P Rth with its time constant', () => {
    const c = readCircuit(HEATER);
    c.sim.selfHeating = true;
    const r = resistor(c);
    const th = r.thermal;
    if (th === null) throw new Error('no heat path');
    th.resistance = 30;
    th.timeConstant = 1e-3;
    start(c);
    // 1 W: after one time constant 63% of the way to 57 °C
    c.sim.step(200);
    expect(temperatureOf(r)).toBeCloseTo(27 + 30 * (1 - Math.exp(-1)), 1);
    c.sim.step(2000);
    expect(temperatureOf(r)).toBeCloseTo(57, 2);
  });

  it('settles where a resistor with a coefficient dissipates what its heat path removes', () => {
    const c = readCircuit(HEATER);
    c.sim.selfHeating = true;
    const r = resistor(c);
    r.tempco = 4000;
    if (r.thermal === null) throw new Error('no heat path');
    r.thermal.resistance = 30;
    r.thermal.timeConstant = 1e-3;
    start(c);
    c.sim.step(3000);
    // T = 27 + 30 V²/R(T), R(T) = 100 (1 + 0.004 (T - 27))
    let t = 27;
    for (let k = 0; k < 100; k++) t = 27 + (30 * 100) / (100 * (1 + 0.004 * (t - 27)));
    expect(temperatureOf(r)).toBeCloseTo(t, 1);
    // the current follows the hot resistance (stamped again as it warmed)
    expect(Math.abs(r.current)).toBeCloseTo(10 / (100 * (1 + 0.004 * (t - 27))), 4);
  });

  it('runs a transistor at a fixed base voltage away, and an emitter resistor stops it', () => {
    const run = (vb: number, re: number, heat: boolean): { ic: number; t: number } => {
      const c = readCircuit(bjtCircuit(vb, re));
      c.sim.selfHeating = heat;
      const q = c.elements[0] as TransistorElm;
      if (q.thermal === null) throw new Error('no heat path');
      q.thermal.timeConstant = 1e-3;
      start(c);
      c.sim.step(2000);
      expect(c.sim.stopMessage).toBeNull();
      return { ic: q.ic, t: temperatureOf(q) };
    };
    const cold = run(0.62, 0, false);
    const hot = run(0.62, 0, true);
    expect(cold.t).toBe(27);
    // the current grows until the 10 Ω collector resistor limits it
    expect(hot.ic).toBeGreaterThan(cold.ic * 20);
    expect(hot.t).toBeGreaterThan(100);
    // with 100 Ω in the emitter it warms a little and stays put
    const coldRe = run(1.4, 100, false);
    const hotRe = run(1.4, 100, true);
    expect(hotRe.t).toBeGreaterThan(40);
    expect(hotRe.ic / coldRe.ic).toBeLessThan(1.15);
  });

  it('starts from ambient again after a reset', () => {
    const c = readCircuit(HEATER);
    c.sim.selfHeating = true;
    const r = resistor(c);
    start(c);
    c.sim.step(2000);
    expect(temperatureOf(r)).toBeGreaterThan(28);
    c.sim.resetTime();
    expect(temperatureOf(r)).toBe(27);
    // one 5 µs step of 1 W into the default 250 °C/W and 10 ms
    c.sim.step(1);
    expect(temperatureOf(r)).toBeCloseTo(27 + 250 * (1 - Math.exp(-5e-6 / 0.01)), 6);
  });

  it('does nothing while it is off', () => {
    const c = readCircuit(HEATER);
    const r = resistor(c);
    start(c);
    c.sim.step(2000);
    expect(temperatureOf(r)).toBe(27);
  });
});

describe('ambient ramp', () => {
  it('moves the ambient temperature over simulated time, then holds it', () => {
    const c = readCircuit(HEATER);
    c.sim.temperatureRamp = { to: 85, duration: 0.01 };
    start(c);
    expect(c.sim.ambientTemperature()).toBe(27);
    c.sim.step(1000);
    expect(c.sim.ambientTemperature()).toBeCloseTo(27 + 58 / 2, 6);
    c.sim.step(2000);
    expect(c.sim.ambientTemperature()).toBe(85);
  });

  it('carries a diode drop down as it warms', () => {
    const c = readCircuit(
      HEADER +
        'i 96 96 96 192 0 0.001\n' +
        'd 96 192 96 288 2 spice-default\n' +
        'w 96 96 96 64 0\nw 96 64 96 288 0\n' +
        'g 96 288 96 320 0\n',
    );
    c.sim.temperatureRamp = { to: 77, duration: 0.01 };
    start(c);
    const d = c.elements.find((e) => e instanceof DiodeElm) as DiodeElm;
    const drop = (): number => Math.abs(d.volts[0] - d.volts[1]);
    c.sim.step(100);
    const early = drop();
    c.sim.step(2000);
    // about 2 mV per degree over the 50 degrees
    expect(c.sim.ambientTemperature()).toBe(77);
    expect(drop()).toBeLessThan(early - 0.08);
    expect(drop()).toBeGreaterThan(early - 0.13);
  });
});

describe('saving', () => {
  it('writes nothing new for a circuit without them', () => {
    const xml = readCircuit(HEATER).dumpXml();
    expect(xml).not.toMatch(/heat=|tramp=|rth=|tth=/);
  });

  it('reads back the ramp, self-heating and a part heat path', () => {
    const c = readCircuit(HEATER);
    c.sim.selfHeating = true;
    c.sim.temperatureRamp = { to: -40, duration: 0.5 };
    const th = resistor(c).thermal;
    if (th === null) throw new Error('no heat path');
    th.resistance = 12;
    const xml = c.dumpXml();
    expect(xml).toMatch(/<cir [^>]*tramp="-40 0.5"/);
    expect(xml).toMatch(/<cir [^>]*heat="1"/);
    expect(xml).toMatch(/rth="12" tth="0.01"/);
    const d = readCircuit(xml);
    expect(d.sim.selfHeating).toBe(true);
    expect(d.sim.temperatureRamp).toEqual({ to: -40, duration: 0.5 });
    expect(resistor(d).thermal?.resistance).toBe(12);
    // a new circuit has neither
    const e = readCircuit(HEATER);
    expect(e.sim.selfHeating).toBe(false);
    expect(e.sim.temperatureRamp).toBeNull();
  });
});
