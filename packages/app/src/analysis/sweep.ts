// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import {
  hasTolerance,
  toleranceItem,
  type CircuitElm,
  type EditInfo,
} from '@circuitjs-next/elements';
import { readCircuit, type Circuit } from '@circuitjs-next/format';
import { BodeSweep, interpolate, isBodeOutput, outputVoltage, type BodePoint } from './bode.ts';
import type { BodeSettings } from './bode.ts';

/**
 * Parameter sweeps and Monte Carlo runs (PLAN.md Phases 11 and 12). Each run loads its own copy
 * of the circuit, changes some part values, and measures it: a transient from reset to a stop
 * time, or an AC sweep (Phase 10). The live circuit, its engine and the golden tests are
 * untouched, and Monte Carlo draws from its own seeded generator, never the engine's.
 */

/**
 * `SweepTarget.element` for the circuit temperature instead of a part (PLAN.md Phase 15): each
 * run sets its copy's temperature in °C.
 */
export const TEMPERATURE_TARGET = -2;

/** One numeric property of one part: its index in the circuit and its edit item. */
export interface SweepTarget {
  element: number;
  item: number;
}

/** What one run changes, and how the results name it. */
export interface RunSpec {
  label: string;
  /** The unchanged circuit (Monte Carlo draws it on top of the spread). */
  nominal: boolean;
  /** The values this run uses, for the CSV: part name index and value. */
  params: { element: number; value: number }[];
}

export interface TransientMeasure {
  kind: 'transient';
  /** Element whose voltage (one post: node voltage, else across) or current is recorded. */
  output: number;
  quantity: 'voltage' | 'current';
  /** Simulated time per run, in seconds, from reset. */
  duration: number;
}

export interface AcMeasure {
  kind: 'ac';
  bode: BodeSettings;
}

export type Measure = TransientMeasure | AcMeasure;

/** Points recorded per transient run, evenly spaced from 0 to the stop time. */
export const TRANSIENT_SAMPLES = 401;

export interface RunResult {
  spec: RunSpec;
  /** Transient: the output at each of `times`. */
  y: number[];
  /** AC: gain and phase per frequency. */
  points: BodePoint[];
  done: boolean;
  /**
   * Transient: the output's frequency once the run is done, from its rising crossings after the
   * first fifth of the run (time to start up and settle); null when it does not oscillate.
   */
  frequency: number | null;
}

// ---- what to run ----------------------------------------------------------------------------

/** The numeric properties of a part that a sweep can step (those a slider could drive). */
export function sweepItems(e: CircuitElm): { item: number; ei: EditInfo }[] {
  const out: { item: number; ei: EditInfo }[] = [];
  for (let i = 0; i < 40; i++) {
    const ei = e.getEditInfo(i);
    if (ei === null) break;
    if (ei.canCreateAdjustable()) out.push({ item: i, ei });
  }
  return out;
}

export function canSweep(e: CircuitElm): boolean {
  return sweepItems(e).length > 0;
}

/** `n` values from `from` to `to`, evenly spaced, or evenly on a log scale. */
export function rangeValues(from: number, to: number, n: number, log: boolean): number[] {
  if (!(n >= 1) || !Number.isFinite(from) || !Number.isFinite(to)) return [];
  if (n === 1) return [from];
  if (log && !(from > 0 && to > 0)) return [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    out.push(
      log ? Math.exp(Math.log(from) + k * (Math.log(to) - Math.log(from))) : from + k * (to - from),
    );
  }
  return out;
}

/** One run per value of the target property. */
export function valueRuns(
  target: SweepTarget,
  values: readonly number[],
  label: (v: number) => string,
): RunSpec[] {
  return values.map((v) => ({
    label: label(v),
    nominal: false,
    params: [{ element: target.element, value: v }],
  }));
}

export type Distribution = 'uniform' | 'gaussian';

/**
 * A small seeded generator (mulberry32) for Monte Carlo, kept apart from the engine's
 * `JavaRandom` so normal runs and goldens never see a different sequence.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A factor in [-1, 1]: uniform, or a normal with the tolerance at 3σ, cut at the tolerance
 * (parts outside it would be rejected).
 */
function deviation(rnd: () => number, dist: Distribution): number {
  if (dist === 'uniform') return 2 * rnd() - 1;
  for (;;) {
    // Box-Muller
    const u = 1 - rnd();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
    const d = z / 3;
    if (d >= -1 && d <= 1) return d;
  }
}

/** The parts Monte Carlo varies: those with a tolerance, by index. */
export function tolerancedParts(els: readonly CircuitElm[]): number[] {
  const out: number[] = [];
  els.forEach((e, i) => {
    if (hasTolerance(e) && e.tolerance > 0) out.push(i);
  });
  return out;
}

/** The value Monte Carlo varies on a part (edit item `toleranceItem`). */
function nominalValue(e: CircuitElm): number {
  if (!hasTolerance(e)) return 0;
  return e.getEditInfo(toleranceItem(e))?.value ?? 0;
}

/**
 * The nominal run, then `runs` runs that each give every toleranced part a value within its
 * tolerance. Run i only depends on the seed and i, so the same seed gives the same runs.
 */
export function monteCarloRuns(
  els: readonly CircuitElm[],
  runs: number,
  seed: number,
  dist: Distribution,
  label: (i: number) => string,
  nominalLabel: string,
): RunSpec[] {
  const parts = tolerancedParts(els);
  const out: RunSpec[] = [{ label: nominalLabel, nominal: true, params: [] }];
  for (let r = 1; r <= runs; r++) {
    const rnd = seededRandom(Math.imul(seed ^ 0x5bd1e995, 0x9e3779b1) + r * 0x85ebca6b);
    const params = parts.map((i) => {
      const e = els[i] as CircuitElm;
      const tol = hasTolerance(e) ? e.tolerance / 100 : 0;
      return { element: i, value: nominalValue(e) * (1 + tol * deviation(rnd, dist)) };
    });
    out.push({ label: label(r), nominal: false, params });
  }
  return out;
}

/** Apply a run's values to its circuit copy, through each part's edit item. */
function applyRun(c: Circuit, spec: RunSpec, target: SweepTarget | null): void {
  for (const p of spec.params) {
    if (p.element === TEMPERATURE_TARGET) {
      c.sim.temperature = p.value;
      continue;
    }
    const e = c.elements[p.element];
    if (e === undefined) continue;
    const item =
      target !== null && p.element === target.element
        ? target.item
        : hasTolerance(e)
          ? toleranceItem(e)
          : -1;
    const ei = item >= 0 ? e.getEditInfo(item) : null;
    if (ei === null) continue;
    ei.value = p.value;
    e.setEditValue(item, ei);
  }
}

// ---- running ----------------------------------------------------------------------------------

/** The recorded quantity of the output element. */
function measure(e: CircuitElm, quantity: 'voltage' | 'current'): number {
  return quantity === 'current' ? e.getCurrent() : outputVoltage(e);
}

/** Share of a transient run left out of the frequency measurement, for start-up. */
const FREQUENCY_SETTLE = 0.2;
/** Most steps the frequency measurement keeps (later ones are left out). */
const FREQUENCY_MAX_POINTS = 2_000_000;

/**
 * The frequency of a waveform sampled at every step: rising crossings of the middle of its range,
 * with 10% hysteresis so noise near the level does not count, interpolated between steps. Null
 * with fewer than three crossings (not oscillating, or too few cycles).
 */
export function measureFrequency(ts: ArrayLike<number>, vs: ArrayLike<number>): number | null {
  const n = Math.min(ts.length, vs.length);
  if (n < 3) return null;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = vs[i] as number;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  if (!(span > 1e-9 * Math.max(1, Math.abs(max)))) return null;
  const level = (min + max) / 2;
  const low = level - 0.1 * span;
  let armed = false;
  let first = NaN;
  let last = NaN;
  let count = 0;
  for (let i = 1; i < n; i++) {
    const a = vs[i - 1] as number;
    const b = vs[i] as number;
    if (b < low) armed = true;
    if (armed && a < level && b >= level) {
      const ta = ts[i - 1] as number;
      const tb = ts[i] as number;
      const t = ta + ((level - a) / (b - a)) * (tb - ta);
      if (count === 0) first = t;
      last = t;
      count++;
      armed = false;
    }
  }
  return count >= 3 && last > first ? (count - 1) / (last - first) : null;
}

/** Collects every step's output after the start-up share, for `measureFrequency`. */
class FrequencyMeter {
  private ts: number[] = [];
  private vs: number[] = [];

  constructor(private readonly from: number) {}

  record(t: number, v: number): void {
    if (t < this.from || this.ts.length >= FREQUENCY_MAX_POINTS) return;
    this.ts.push(t);
    this.vs.push(v);
  }

  frequency(): number | null {
    return measureFrequency(this.ts, this.vs);
  }
}

/** One transient run: reset, then step to the stop time, sampling on an even grid. */
class TransientRun {
  readonly circuit: Circuit;
  private readonly out: CircuitElm;
  private readonly meter: FrequencyMeter;
  private k = 0;
  private tPrev = 0;
  private yPrev = 0;
  private started = false;
  done = false;

  constructor(
    circuit: Circuit,
    private readonly m: TransientMeasure,
    private readonly times: readonly number[],
    private readonly y: number[],
  ) {
    this.circuit = circuit;
    const out = circuit.elements[m.output];
    if (out === undefined || !isBodeOutput(out)) throw new Error('Pick an output.');
    this.out = out;
    this.meter = new FrequencyMeter(m.duration * FREQUENCY_SETTLE);
    const sim = circuit.sim;
    sim.onTimeStep = () => this.sample();
    sim.canDelayWireProcessing = () => true;
    circuit.reset();
  }

  private sample(): void {
    const sim = this.circuit.sim;
    const t = sim.t;
    const v = measure(this.out, this.m.quantity);
    this.meter.record(t, v);
    const n = this.times.length;
    if (!this.started) {
      // the first step stands for everything before it
      this.started = true;
      this.tPrev = t;
      this.yPrev = v;
      while (this.k < n && (this.times[this.k] ?? 0) <= t) this.y[this.k++] = v;
    } else {
      while (this.k < n && (this.times[this.k] ?? 0) <= t) {
        const tk = this.times[this.k] ?? 0;
        const f = t > this.tPrev ? (tk - this.tPrev) / (t - this.tPrev) : 1;
        this.y[this.k++] = this.yPrev + f * (v - this.yPrev);
      }
      this.tPrev = t;
      this.yPrev = v;
    }
    if (this.k >= n) {
      this.done = true;
      sim.requestPause();
    }
  }

  /** The output's frequency over the run so far (see `measureFrequency`). */
  frequency(): number | null {
    return this.meter.frequency();
  }

  /** Simulate up to `maxSteps` steps; returns the number done. */
  run(maxSteps: number): number {
    const sim = this.circuit.sim;
    const done = sim.step(Math.min(maxSteps, 4096));
    sim.pauseRequested = false;
    if (sim.stopMessage !== null) throw new Error(sim.stopMessage);
    if (done === 0 && !this.done) throw new Error('The circuit did not simulate.');
    return done;
  }
}

/** A whole sweep: every run, one after another. Call `run()` a slice per animation frame. */
export class MultiRun {
  readonly results: RunResult[];
  /** Transient sample times (empty for AC). */
  readonly times: number[] = [];
  /** AC test frequencies (empty for a transient). */
  freqs: number[] = [];
  state: 'running' | 'done' | 'error' = 'running';
  error: string | null = null;
  steps = 0;
  private index = 0;
  private transient: TransientRun | null = null;
  private bode: BodeSweep | null = null;

  constructor(
    private readonly text: string,
    runs: readonly RunSpec[],
    readonly measure: Measure,
    readonly target: SweepTarget | null = null,
  ) {
    if (runs.length === 0) throw new Error('Nothing to run.');
    if (measure.kind === 'transient') {
      if (!(measure.duration > 0)) throw new Error('Pick a stop time.');
      for (let i = 0; i < TRANSIENT_SAMPLES; i++)
        this.times.push((measure.duration * i) / (TRANSIENT_SAMPLES - 1));
    }
    this.results = runs.map((spec) => ({ spec, y: [], points: [], done: false, frequency: null }));
    // check the settings on the first run now, so a bad pick fails before anything runs
    this.startRun();
  }

  /** Share of the work done, 0 to 1. */
  get progress(): number {
    const n = this.results.length;
    let part = 0;
    const r = this.results[this.index];
    if (r !== undefined && !r.done) {
      if (this.measure.kind === 'transient') part = r.y.length / TRANSIENT_SAMPLES;
      else part = this.bode?.progress ?? 0;
    }
    return Math.min(1, (this.results.filter((x) => x.done).length + part) / n);
  }

  /** Runs finished so far. */
  get finished(): number {
    return this.results.filter((r) => r.done).length;
  }

  private startRun(): void {
    const res = this.results[this.index] as RunResult;
    const c = readCircuit(this.text);
    applyRun(c, res.spec, this.target);
    if (this.measure.kind === 'transient') {
      this.transient = new TransientRun(c, this.measure, this.times, res.y);
    } else {
      this.bode = new BodeSweep(c, this.measure.bode);
      this.freqs = this.bode.freqs;
      res.points = this.bode.points;
    }
  }

  /** Simulate up to `maxSteps` timesteps. Returns true while there is more to do. */
  run(maxSteps: number): boolean {
    let budget = maxSteps;
    try {
      while (this.state === 'running' && budget > 0) {
        const res = this.results[this.index] as RunResult;
        if (this.transient !== null) {
          const n = this.transient.run(budget);
          budget -= Math.max(n, 1);
          this.steps += n;
          if (this.transient.done) this.finishRun(res);
        } else if (this.bode !== null) {
          const before = this.bode.steps;
          this.bode.run(budget);
          const n = this.bode.steps - before;
          budget -= Math.max(n, 1);
          this.steps += n;
          if (this.bode.state === 'error') throw new Error(this.bode.error ?? 'Simulation error');
          if (this.bode.state === 'done') this.finishRun(res);
        }
      }
    } catch (e) {
      this.state = 'error';
      this.error = e instanceof Error ? e.message : String(e);
    }
    return this.state === 'running';
  }

  private finishRun(res: RunResult): void {
    res.done = true;
    if (this.transient !== null) res.frequency = this.transient.frequency();
    this.transient = null;
    this.bode = null;
    this.index++;
    if (this.index >= this.results.length) this.state = 'done';
    else this.startRun();
  }

  /** Stop after what is finished; a run cut short keeps what it has. */
  stop(): void {
    if (this.state === 'running') this.state = 'done';
    this.transient = null;
    this.bode = null;
  }
}

// ---- reading the results ------------------------------------------------------------------------

/** A transient run's value at time `t`, interpolated; null outside what it recorded. */
export function valueAt(times: readonly number[], y: readonly number[], t: number): number | null {
  if (y.length === 0 || times.length < 2) return null;
  const dt = (times[times.length - 1] ?? 0) / (times.length - 1);
  const x = t / dt;
  const i = Math.floor(x);
  if (i < 0 || i >= y.length) return null;
  const a = y[i] as number;
  const b = y[i + 1];
  return b === undefined ? a : a + (x - i) * (b - a);
}

export interface Spread {
  min: number;
  mean: number;
  max: number;
  count: number;
}

/** Min, mean and max of the values, ignoring the missing ones. */
export function spread(values: readonly (number | null)[]): Spread | null {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    min = Math.min(min, v);
    max = Math.max(max, v);
    sum += v;
    count++;
  }
  return count === 0 ? null : { min, mean: sum / count, max, count };
}

/** Each run's gain and phase at frequency `f`. */
export function acAt(
  results: readonly RunResult[],
  f: number,
): ({ gainDb: number; phaseDeg: number } | null)[] {
  return results.map((r) => interpolate(r.points, f));
}

/** The time constant of a rising or falling step: when the output is 63.2% of the way. */
export function timeConstant(times: readonly number[], y: readonly number[]): number | null {
  if (y.length < 2) return null;
  const y0 = y[0] as number;
  const y1 = y[y.length - 1] as number;
  const level = y0 + (1 - Math.exp(-1)) * (y1 - y0);
  for (let i = 1; i < y.length; i++) {
    const a = y[i - 1] as number;
    const b = y[i] as number;
    if ((a - level) * (b - level) <= 0 && a !== b) {
      const ta = times[i - 1] as number;
      const tb = times[i] as number;
      return ta + ((level - a) / (b - a)) * (tb - ta);
    }
  }
  return null;
}

/** The results as CSV: one column per run (gain and phase per run for AC). */
export function sweepCsv(sweep: MultiRun): string {
  const res = sweep.results.filter((r) => r.y.length > 0 || r.points.length > 0);
  const q = (s: string): string => `"${s.replaceAll('"', '""')}"`;
  const rows: string[] = [];
  if (sweep.measure.kind === 'transient') {
    rows.push(['time_s', ...res.map((r) => q(r.spec.label))].join(','));
    sweep.times.forEach((t, i) => {
      rows.push(
        [String(t), ...res.map((r) => (r.y[i] === undefined ? '' : String(r.y[i])))].join(','),
      );
    });
  } else {
    rows.push(
      [
        'frequency_hz',
        ...res.flatMap((r) => [q(`${r.spec.label} gain_db`), q(`${r.spec.label} phase_deg`)]),
      ].join(','),
    );
    sweep.freqs.forEach((f, i) => {
      rows.push(
        [
          String(f),
          ...res.flatMap((r) => {
            const p = r.points[i];
            return p === undefined ? ['', ''] : [p.gainDb.toFixed(4), p.phaseDeg.toFixed(3)];
          }),
        ].join(','),
      );
    });
  }
  return rows.join('\n') + '\n';
}
