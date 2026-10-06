// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import {
  GraphicElm,
  GroundElm,
  RailElm,
  VoltageElm,
  WireElm,
  type CircuitElm,
} from '@circuitjs-next/elements';
import { readCircuit, type Circuit } from '@circuitjs-next/format';

/**
 * AC analysis by transient simulation (PLAN.md Phase 10). For each test frequency the input
 * source plays a sine and the normal engine runs until the output settles; one period at a time,
 * the input and the output are correlated with that frequency (a single-bin DFT) and their ratio
 * is the gain and phase. The sweep runs on its own copy of the circuit, so the live simulation,
 * its engine and the golden tests are untouched.
 */

export interface BodeSettings {
  /** Index in the circuit's element list of the voltage source that plays the test sine. */
  source: number;
  /** Index of the element whose voltage is the output (one post: node voltage, else across). */
  output: number;
  fStart: number;
  fStop: number;
  pointsPerDecade: number;
  /** Peak amplitude of the test sine, in volts. */
  amplitude: number;
}

export interface BodePoint {
  f: number;
  /** Output over input, as a magnitude. */
  mag: number;
  gainDb: number;
  /** Degrees, unwrapped along the sweep so the curve has no 360° jumps. */
  phaseDeg: number;
  /** False when the output was still changing after the per-point limit. */
  settled: boolean;
}

/** Timesteps per period of the test sine, at least (the circuit's own timestep may be finer). */
export const SAMPLES_PER_PERIOD = 64;
/** Whole periods measured before a point can count as settled. */
const MIN_PERIODS = 4;
/** Settled once the estimated remaining change is below this share of the gain (~0.01 dB). */
const SETTLE_TOLERANCE = 1e-3;
/** Gains below this (-160 dB) count as zero when judging settling. */
const GAIN_FLOOR = 1e-8;
const MAX_PERIODS = 4000;
const MAX_STEPS_PER_POINT = 2_000_000;

/** Log-spaced test frequencies from fStart to fStop, both included. */
export function sweepFrequencies(fStart: number, fStop: number, pointsPerDecade: number): number[] {
  if (!(fStart > 0) || !(fStop > fStart) || !(pointsPerDecade > 0)) return [];
  const decades = Math.log10(fStop / fStart);
  const n = Math.max(1, Math.round(decades * pointsPerDecade));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(fStart * Math.pow(10, (decades * i) / n));
  return out;
}

/** A source can play the test sine when it uses VoltageElm's own waveforms. */
export function isBodeSource(e: CircuitElm): e is VoltageElm {
  return (
    e instanceof VoltageElm &&
    e.getVoltage === VoltageElm.prototype.getVoltage &&
    e.waveform !== VoltageElm.WF_NOISE
  );
}

/** Anything with posts that has a voltage worth plotting: not wires, grounds or drawings. */
export function isBodeOutput(e: CircuitElm): boolean {
  if (e instanceof WireElm || e instanceof GroundElm || e instanceof GraphicElm) return false;
  const posts = e.getPostCount();
  return posts === 1 || posts === 2;
}

/** The source's own voltage: the ideal source, before any internal resistance. */
function inputVoltage(e: VoltageElm): number {
  if (e.internalResistance > 0) {
    if (e instanceof RailElm) return e.volts[1] ?? 0;
    return (e.volts[2] ?? 0) - (e.volts[0] ?? 0);
  }
  return e.getVoltageDiff();
}

/** The output: a node voltage for one-post elements, the voltage across for two posts. */
export function outputVoltage(e: CircuitElm): number {
  return e.getPostCount() === 1 ? (e.volts[0] ?? 0) : e.getVoltageDiff();
}

/** Default test amplitude: an AC source keeps its own, anything else gets a small signal. */
export function defaultAmplitude(e: VoltageElm): number {
  return e.waveform === VoltageElm.WF_AC && e.maxVoltage > 0 ? e.maxVoltage : 0.1;
}

type State = 'running' | 'done' | 'error';

/** One frequency sweep. Call `run()` repeatedly (a slice per animation frame) until it is done. */
export class BodeSweep {
  readonly freqs: number[];
  readonly points: BodePoint[] = [];
  state: State = 'running';
  error: string | null = null;
  /** Timesteps simulated so far, over all points. */
  steps = 0;

  private readonly circuit: Circuit;
  private readonly src: VoltageElm;
  private readonly out: CircuitElm;
  private readonly baseMaxStep: number;
  private index = -1;
  // the point being measured
  private f = 0;
  private period = 0;
  private dt = 0;
  private tz = 0;
  private blockStart = 0;
  private inRe = 0;
  private inIm = 0;
  private outRe = 0;
  private outIm = 0;
  private periods = 0;
  private pointSteps = 0;
  /** Gains (re, im) of the last three periods. */
  private history: [number, number][] = [];
  private calmBlocks = 0;
  private pointDone = false;
  private settled = false;

  /** `circuit` is saved circuit text, or a circuit copy the sweep may change and own. */
  constructor(circuit: string | Circuit, settings: BodeSettings) {
    this.freqs = sweepFrequencies(settings.fStart, settings.fStop, settings.pointsPerDecade);
    this.circuit = typeof circuit === 'string' ? readCircuit(circuit) : circuit;
    const els = this.circuit.elements;
    const src = els[settings.source];
    const out = els[settings.output];
    if (src === undefined || !isBodeSource(src)) throw new Error('Pick a voltage source as input.');
    if (out === undefined || !isBodeOutput(out)) throw new Error('Pick an output.');
    if (this.freqs.length === 0) throw new Error('Pick a frequency range.');
    this.src = src;
    this.out = out;
    // the source keeps its DC level as the bias the test sine rides on
    if (src.waveform === VoltageElm.WF_DC) src.bias = src.maxVoltage + src.bias;
    src.waveform = VoltageElm.WF_AC;
    src.maxVoltage = settings.amplitude;
    src.phaseShift = 0;
    const sim = this.circuit.sim;
    this.baseMaxStep = sim.maxTimeStep;
    sim.onTimeStep = () => this.sample();
    // no scope or wire current is read: let the engine skip per-step wire work
    sim.canDelayWireProcessing = () => true;
    this.circuit.reset();
  }

  /** Share of the points finished, 0 to 1. */
  get progress(): number {
    return this.freqs.length === 0 ? 1 : this.points.length / this.freqs.length;
  }

  /** Simulate up to `maxSteps` timesteps. Returns true while there is more to do. */
  run(maxSteps: number): boolean {
    const sim = this.circuit.sim;
    let budget = maxSteps;
    while (this.state === 'running' && budget > 0) {
      if (this.index < 0 || this.pointDone) {
        if (this.index >= 0) this.finishPoint();
        if (this.index + 1 >= this.freqs.length) {
          this.state = 'done';
          break;
        }
        this.startPoint(this.index + 1);
      }
      const n = Math.min(budget, 4096);
      const done = sim.step(n);
      sim.pauseRequested = false;
      budget -= Math.max(done, 1);
      this.steps += done;
      if (sim.stopMessage !== null) {
        this.state = 'error';
        this.error = sim.stopMessage;
      }
    }
    if (this.state === 'running' && this.pointDone && this.index + 1 >= this.freqs.length) {
      this.finishPoint();
      this.state = 'done';
    }
    return this.state === 'running';
  }

  private startPoint(i: number): void {
    const sim = this.circuit.sim;
    const f = this.freqs[i] ?? 1;
    this.index = i;
    this.f = f;
    this.period = 1 / f;
    // whole timesteps per period, never coarser than the circuit's own timestep
    const n = Math.max(SAMPLES_PER_PERIOD, Math.ceil(this.period / this.baseMaxStep - 1e-9));
    this.dt = this.period / n;
    sim.maxTimeStep = this.dt;
    sim.timeStep = this.dt;
    if (sim.matrices !== null && !sim.needsStamp && !sim.analyzeFlag) sim.stampCircuit();
    // start the sine at the zero crossing the previous point ended on
    this.src.frequency = f;
    this.tz = sim.t;
    this.src.freqTimeZero = sim.t;
    this.blockStart = sim.t;
    this.resetBlock();
    this.periods = 0;
    this.pointSteps = 0;
    this.history = [];
    this.calmBlocks = 0;
    this.pointDone = false;
    this.settled = false;
  }

  private resetBlock(): void {
    this.inRe = this.inIm = this.outRe = this.outIm = 0;
  }

  /** Called by the engine after every timestep. */
  private sample(): void {
    if (this.pointDone || this.index < 0) return;
    const sim = this.circuit.sim;
    const t = sim.t;
    const w = 2 * Math.PI * this.f * (t - this.tz);
    const c = Math.cos(w) * sim.timeStep;
    const s = Math.sin(w) * sim.timeStep;
    const vin = inputVoltage(this.src);
    const vout = outputVoltage(this.out);
    this.inRe += vin * c;
    this.inIm -= vin * s;
    this.outRe += vout * c;
    this.outIm -= vout * s;
    this.pointSteps++;
    if (t - this.blockStart >= this.period - this.dt / 2) {
      this.blockStart += this.period;
      this.endPeriod();
      this.resetBlock();
    }
  }

  private endPeriod(): void {
    this.periods++;
    const d = this.inRe * this.inRe + this.inIm * this.inIm;
    if (d === 0) {
      this.history.push([0, 0]);
    } else {
      // H = out / in
      const re = (this.outRe * this.inRe + this.outIm * this.inIm) / d;
      const im = (this.outIm * this.inRe - this.outRe * this.inIm) / d;
      this.history.push([re, im]);
    }
    if (this.history.length > 3) this.history.shift();
    if (this.isSettled()) {
      this.settled = true;
      this.pointDone = true;
    } else if (this.periods >= MAX_PERIODS || this.pointSteps >= MAX_STEPS_PER_POINT) {
      this.pointDone = true;
    }
    // stop the engine at this period's end, so the next point starts on a zero crossing
    if (this.pointDone) this.circuit.sim.requestPause();
  }

  /**
   * The gain changes geometrically while a transient dies away, so the last two changes give the
   * decay ratio and an estimate of how far the gain still has to go (Aitken). Settled when that
   * is within the tolerance twice running.
   */
  private isSettled(): boolean {
    if (this.periods < MIN_PERIODS || this.history.length < 3) return false;
    const [a, b, c] = this.history as [[number, number], [number, number], [number, number]];
    const mag = Math.hypot(c[0], c[1]);
    const tol = SETTLE_TOLERANCE * mag + GAIN_FLOOR;
    const d1r = c[0] - b[0];
    const d1i = c[1] - b[1];
    const d0r = b[0] - a[0];
    const d0i = b[1] - a[1];
    const d1 = Math.hypot(d1r, d1i);
    const d0 = Math.hypot(d0r, d0i);
    let remaining: number;
    if (d1 <= tol * 1e-3) remaining = d1;
    else if (d0 === 0) remaining = Infinity;
    else {
      // rho = d1 / d0, remaining = |d1 * rho / (1 - rho)|
      const dd = d0 * d0;
      const rr = (d1r * d0r + d1i * d0i) / dd;
      const ri = (d1i * d0r - d1r * d0i) / dd;
      const rho = Math.hypot(rr, ri);
      remaining = rho >= 0.98 ? Infinity : (d1 * rho) / Math.hypot(1 - rr, ri);
    }
    if (remaining <= tol) this.calmBlocks++;
    else this.calmBlocks = 0;
    return this.calmBlocks >= 2;
  }

  private finishPoint(): void {
    if (this.index < this.points.length) return;
    const last = this.history[this.history.length - 1] ?? [0, 0];
    const [re, im] = last;
    const mag = Math.hypot(re, im);
    let phase = (Math.atan2(im, re) * 180) / Math.PI;
    const prev = this.points[this.points.length - 1];
    if (prev !== undefined) {
      while (phase - prev.phaseDeg > 180) phase -= 360;
      while (phase - prev.phaseDeg < -180) phase += 360;
    }
    this.points.push({
      f: this.f,
      mag,
      gainDb: mag > 0 ? 20 * Math.log10(mag) : -Infinity,
      phaseDeg: phase,
      settled: this.settled,
    });
  }
}

/** Where the gain crosses 3 dB below its peak, interpolated on the log frequency axis. */
export function cutoffFrequencies(points: readonly BodePoint[]): number[] {
  if (points.length < 2) return [];
  let peak = -Infinity;
  for (const p of points) if (p.gainDb > peak) peak = p.gainDb;
  if (!Number.isFinite(peak)) return [];
  const level = peak - 3.0103;
  const out: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as BodePoint;
    const b = points[i] as BodePoint;
    if (a.gainDb >= level === b.gainDb >= level) continue;
    if (!Number.isFinite(a.gainDb) || !Number.isFinite(b.gainDb)) continue;
    const k = (level - a.gainDb) / (b.gainDb - a.gainDb);
    out.push(Math.pow(10, Math.log10(a.f) + k * (Math.log10(b.f) - Math.log10(a.f))));
  }
  return out;
}

/** The gain and phase at any frequency inside the sweep, interpolated on the log axis. */
export function interpolate(
  points: readonly BodePoint[],
  f: number,
): { gainDb: number; phaseDeg: number } | null {
  if (points.length === 0) return null;
  const first = points[0] as BodePoint;
  if (f <= first.f) return first;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as BodePoint;
    const b = points[i] as BodePoint;
    if (f > b.f) continue;
    const k = (Math.log10(f) - Math.log10(a.f)) / (Math.log10(b.f) - Math.log10(a.f));
    return {
      gainDb: a.gainDb + k * (b.gainDb - a.gainDb),
      phaseDeg: a.phaseDeg + k * (b.phaseDeg - a.phaseDeg),
    };
  }
  return points[points.length - 1] as BodePoint;
}

/** The results as CSV: frequency, gain, phase, settled. */
export function bodeCsv(points: readonly BodePoint[]): string {
  const rows = ['frequency_hz,gain_db,phase_deg,settled'];
  for (const p of points)
    rows.push(`${p.f},${p.gainDb.toFixed(4)},${p.phaseDeg.toFixed(3)},${p.settled ? 1 : 0}`);
  return rows.join('\n') + '\n';
}
