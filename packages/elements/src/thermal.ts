// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/**
 * Self-heating (PLAN.md Phase 17). Not in upstream (DEVIATIONS.md). With the circuit's
 * self-heating on, a diode, transistor, MOSFET or resistor has its own temperature: it heats
 * from the power it dissipates and cools towards the ambient temperature through a thermal
 * resistance (the package plus any heatsink), with one thermal time constant. Its model then
 * runs at that temperature, so a part whose current grows as it warms (a BJT biased at a fixed
 * base voltage) runs away, live.
 */

import type { SimElement } from '@perun/engine';
import { NOMINAL_TEMPERATURE } from './temperature.ts';

/** Hottest and coldest a part's temperature goes, so a runaway stays a number. */
export const MAX_PART_TEMPERATURE = 1000;
const MIN_PART_TEMPERATURE = -273;

/**
 * The default time constant. A real package takes seconds to minutes to warm up, which a
 * simulation running at microsecond steps would take far too long to show; this one shows the
 * heating within a short run. Parts can be given their real one.
 */
export const DEFAULT_THERMAL_TIME_CONSTANT = 0.01;

/** One part's heat path to ambient: a thermal resistance and a time constant (one RC pole). */
export class Thermal {
  /** Thermal resistance to ambient, °C/W. */
  resistance: number;
  /** Thermal time constant in seconds (thermal resistance times heat capacity). */
  timeConstant: number;
  readonly defaultResistance: number;
  /** The part's temperature in °C, or NaN until it has run a step. */
  temperature = Number.NaN;
  /** The simulated time `temperature` is for; a smaller circuit time means a reset. */
  private time = 0;

  constructor(resistance: number, timeConstant = DEFAULT_THERMAL_TIME_CONSTANT) {
    this.resistance = this.defaultResistance = resistance;
    this.timeConstant = timeConstant;
  }

  isDefault(): boolean {
    return (
      this.resistance === this.defaultResistance &&
      this.timeConstant === DEFAULT_THERMAL_TIME_CONSTANT
    );
  }

  /** The temperature at circuit time `t`, or null before the first step (or after a reset). */
  temperatureAt(t: number): number | null {
    return Number.isNaN(this.temperature) || this.time > t ? null : this.temperature;
  }

  /**
   * Advance by one finished step of `dt` seconds ending at `t`, dissipating `power` watts. The
   * one-pole response is integrated exactly, so any step size is stable.
   */
  step(power: number, ambient: number, dt: number, t: number): void {
    const start = this.temperatureAt(t) ?? ambient;
    const steady = ambient + Math.max(0, power) * this.resistance;
    const k = this.timeConstant > 0 ? Math.exp(-dt / this.timeConstant) : 0;
    const next = steady + (start - steady) * k;
    this.temperature = Math.min(
      MAX_PART_TEMPERATURE,
      Math.max(MIN_PART_TEMPERATURE, Number.isFinite(next) ? next : steady),
    );
    this.time = t;
  }

  /** Back to ambient (a reset or a new run). */
  clear(): void {
    this.temperature = Number.NaN;
    this.time = 0;
  }
}

/** An element that may carry a heat path (CircuitElm's `thermal`). */
interface Heated {
  thermal?: Thermal | null;
}

/**
 * The temperature an element's model runs at: its own with self-heating on, else the ambient
 * temperature; the nominal one for an element not in a simulation yet. Exactly 27 °C, upstream's,
 * unless the circuit sets something else.
 */
export function temperatureOf(e: SimElement): number {
  const sim = e.sim as SimElement['sim'] | undefined;
  if (sim === undefined) return NOMINAL_TEMPERATURE;
  if (sim.selfHeating) {
    const own = (e as Heated).thermal?.temperatureAt(sim.t);
    if (own !== undefined && own !== null) return own;
  }
  return sim.ambientTemperature();
}

/** After a finished step: heat the element by the power it dissipated. */
export function heatStep(e: SimElement & Heated, power: number): void {
  const th = e.thermal;
  const sim = e.sim;
  if (th === undefined || th === null || !sim.selfHeating) return;
  th.step(power, sim.ambientTemperature(), sim.timeStep, sim.t);
}
