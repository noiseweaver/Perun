// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/**
 * Behavioural op-amps for the "real" op-amp (OpAmpRealElm), built from datasheet figures
 * (models/OpAmpModel.ts) out of existing parts. Not in upstream (docs/deviations/audio-op-amps.md):
 * upstream's real op-amps are only the transistor-level LM741 and LM324.
 *
 * Each model is a single-pole op-amp in the style of the Boyle macromodel:
 * - an input transconductance that saturates (tanh) at `imax`, into a gain node X with R1 and C1
 *   to ground: open-loop gain gm * R1, unity-gain frequency gm / (2 pi C1), slew rate imax / C1;
 * - X is held between the rails minus the output headroom, so the op-amp clips like the datasheet
 *   says and comes out of clipping at once instead of winding up;
 * - an output that copies X through `rout`; X is also held within `ilim` x `rout` of the output,
 *   which limits the output current; the current is drawn from V+ when sourcing and V- when
 *   sinking, plus the quiescent supply current;
 * - input bias currents into both inputs and a differential input resistance.
 * Not modelled: noise, offset voltage, input common-mode limits (the TL072's phase reversal near
 * V-), a second pole, and output swing that depends on the load.
 */

import { CircuitElm } from '../CircuitElm.ts';
import type { OpAmpMacroSpec } from '../models/OpAmpModel.ts';

/** C1 of the gain node. The other values scale from it; 1 nF keeps them all moderate. */
const C1 = 1e-9;
/** How hard X is held at its limits (S). */
const CLAMP_G = 1;
/** Width of the soft corners of those limits (V), so the solver never sits on a kink. */
const CLAMP_W = 0.01;
/**
 * The output current I is split smoothly between the rails, (I + sqrt(I^2 + eps^2)) / 2 from V+
 * and (sqrt(I^2 + eps^2) - I) / 2 into V-. Each rail carries an extra eps / 2 at idle.
 */
const SPLIT_EPS = 1e-6;

/** w * ln(1 + e^(u / w)): 0 below 0, u above, rounded over about w. */
function softplus(u: number): number {
  const z = u / CLAMP_W;
  return z > 0 ? u + CLAMP_W * Math.log1p(Math.exp(-z)) : CLAMP_W * Math.log1p(Math.exp(z));
}

/** The slope of softplus. */
function sigmoid(u: number): number {
  return 1 / (1 + Math.exp(-u / CLAMP_W));
}

/**
 * The nonlinear heart of a behavioural op-amp, with exact derivatives for the solver. Posts: 0
 * inverting input, 1 non-inverting input, 2 output, 3 V+, 4 V-, 5 the gain node X. It drives X
 * and the rail currents; the linear parts (C1, R1, input resistance, the output copy) are ordinary
 * parts of the composite.
 */
export class OpAmpMacroCore extends CircuitElm {
  gm = 0;
  imax = 1;
  headroomHigh = 1.5;
  headroomLow = 1.5;
  /** The output current limit as a voltage across rout. */
  vlim = 1;
  rout = 100;
  ib = 0;
  iq = 0;
  /** Into X, and drawn from V+ and pushed into V- (for the currents shown). */
  private ix = 0;
  private ip = 0;
  private ineg = 0;
  private last = [0, 0, 0, 0, 0, 0];
  /** The input voltage the input stage was last linearised at (see doStep). */
  private lastVd = 0;

  override getClassName(): string {
    return 'OpAmpMacroCore';
  }
  override getPostCount(): number {
    return 6;
  }
  override nonLinear(): boolean {
    return true;
  }

  configure(spec: OpAmpMacroSpec): void {
    this.imax = spec.slewRate * 1e6 * C1;
    this.gm = 2 * Math.PI * spec.gbw * C1;
    this.headroomHigh = spec.headroomHigh;
    this.headroomLow = spec.headroomLow;
    this.rout = spec.rout;
    this.vlim = spec.ilim * spec.rout;
    this.ib = spec.ib;
    this.iq = spec.iq;
  }

  override reset(): void {
    super.reset();
    this.last = [0, 0, 0, 0, 0, 0];
    this.lastVd = 0;
  }

  override stamp(): void {
    const sim = this.sim;
    const n = this.nodes;
    for (const node of n) sim.stampNonLinear(node);
    // quiescent current from V+ to V-, bias currents into the inputs and out through V-
    // (negative: out of the inputs, for PNP input stages)
    sim.stampCurrentSource(n[3], n[4], this.iq);
    if (this.ib !== 0) {
      sim.stampCurrentSource(n[0], n[4], this.ib);
      sim.stampCurrentSource(n[1], n[4], this.ib);
    }
  }

  override doStep(): void {
    const sim = this.sim;
    const n = this.nodes;
    const v = this.volts;
    const last = this.last;
    if (
      Math.abs(v[1] - v[0] - (last[1] - last[0])) > 1e-6 ||
      Math.abs(v[5] - last[5]) > 1e-4 ||
      Math.abs(v[2] - last[2]) > 1e-4 ||
      Math.abs(v[3] - last[3]) > 1e-4 ||
      Math.abs(v[4] - last[4]) > 1e-4
    )
      sim.converged = false;
    for (let i = 0; i !== 6; i++) last[i] = v[i];
    const g = sim.ground;

    // the gain node: the input stage, then X held inside the swing and the current limit.
    // tanh flattens out, so a plain Newton step overshoots and swings back and forth; like a
    // diode's junction limiting, move the input voltage at most two linear ranges per iteration
    const range = this.imax / this.gm;
    let vd = v[1] - v[0];
    if (Math.abs(vd - this.lastVd) > 2 * range) {
      vd = this.lastVd + Math.sign(vd - this.lastVd) * 2 * range;
      sim.converged = false;
    }
    this.lastVd = vd;
    const x = v[5];
    const out = v[2];
    const hi = v[3] - this.headroomHigh;
    const lo = v[4] + this.headroomLow;
    const th = Math.tanh((this.gm / this.imax) * vd);
    const dvd = this.gm * (1 - th * th);
    const sHi = sigmoid(x - hi);
    const sLo = sigmoid(lo - x);
    const sPos = sigmoid(x - out - this.vlim);
    const sNeg = sigmoid(out - x - this.vlim);
    const ix =
      this.imax * th -
      CLAMP_G * (softplus(x - hi) - softplus(lo - x)) -
      CLAMP_G * (softplus(x - out - this.vlim) - softplus(out - x - this.vlim));
    // partial derivatives by node: inverting input, non-inverting input, output, V+, V-, X
    const d = [
      -dvd,
      dvd,
      CLAMP_G * (sPos + sNeg),
      CLAMP_G * sHi,
      CLAMP_G * sLo,
      -CLAMP_G * (sHi + sLo + sPos + sNeg),
    ];
    // linearised at the (limited) input voltage and the other node voltages
    let rhs = ix - dvd * vd;
    for (let i = 0; i !== 6; i++) {
      if (d[i] === 0) continue;
      sim.stampVCCurrentSource(g, n[5], n[i], g, d[i]);
      if (i >= 2) rhs -= d[i] * v[i];
    }
    sim.stampCurrentSource(g, n[5], rhs);
    this.ix = ix;

    // the output current reaches the load from ground through the output copy; take it from V+
    // when sourcing and give it to V- when sinking
    const iout = (x - out) / this.rout;
    const root = Math.sqrt(iout * iout + SPLIT_EPS * SPLIT_EPS);
    const ip = (iout + root) * 0.5;
    const ineg = (root - iout) * 0.5;
    const dip = ((1 + iout / root) * 0.5) / this.rout;
    const din = ((iout / root - 1) * 0.5) / this.rout;
    // ip leaves V+ for ground, ineg leaves ground for V-; both depend on X - out
    sim.stampVCCurrentSource(n[3], g, n[5], n[2], dip);
    sim.stampCurrentSource(n[3], g, ip - dip * (x - out));
    sim.stampVCCurrentSource(g, n[4], n[5], n[2], din);
    sim.stampCurrentSource(g, n[4], ineg - din * (x - out));
    this.ip = ip;
    this.ineg = ineg;
  }

  override getCurrentIntoNode(i: number): number {
    if (i === 0 || i === 1) return -this.ib;
    if (i === 3) return -(this.iq + this.ip);
    if (i === 4) return this.iq + this.ineg + 2 * this.ib;
    if (i === 5) return this.ix;
    return 0;
  }
}

/** The composite parts, their dump values and the external nodes, as loadComposite takes them. */
export interface MacroComposite {
  model: string;
  dump: string;
  externalNodes: number[];
  /** The node list of the OpAmpMacroCore, which the caller adds after loading. */
  coreNodes: string;
}

/**
 * The linear parts of one model. Nodes: 1 inverting input, 2 non-inverting input, 3 output, 4 V+,
 * 5 V-, 6 the gain node X, 7 X copied before the output resistance, 0 ground. The capacitor C1 is
 * always the first part, so its voltage can be saved like upstream's models save theirs.
 */
export function opAmpMacroComposite(spec: OpAmpMacroSpec): MacroComposite {
  const gm = 2 * Math.PI * spec.gbw * C1;
  const r1 = spec.avol / gm;
  const parts: [string, string][] = [
    // backward Euler: the closed loop is far faster than the timestep, and trapezoidal rings
    ['CapacitorElm 6 0', `2 ${C1} 0 0`],
    ['ResistorElm 6 0', `0 ${r1}`],
    ['ResistorElm 1 2', `0 ${spec.rin}`],
    // the output: a copy of X through the output resistance
    ['VCVSElm 6 0 7 0', '0 2 a-b'],
    ['ResistorElm 7 3', `0 ${spec.rout}`],
  ];
  return {
    model: parts.map((p) => p[0]).join('\r'),
    dump: parts.map((p) => p[1]).join('/'),
    externalNodes: [1, 2, 3, 4, 5],
    coreNodes: '1 2 3 4 5 6',
  };
}
