// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import {
  CapacitorElm,
  DCMotorElm,
  DiodeElm,
  GraphicElm,
  InductorElm,
  LEDElm,
  MosfetElm,
  RelayElm,
  TransformerElm,
  VaractorElm,
  WireElm,
  diodeGeometry,
  mosfetGeometry,
  type CircuitElm,
} from '@circuitjs-next/elements';
import { parseColor, toCss } from '@circuitjs-next/theme';
import type { Palette } from './palette.ts';

/**
 * The field overlay ("Show fields", not in upstream). Display only: it reads voltages and currents
 * the engine already computed and never touches the simulation. Each picture is the idea, not a
 * field solution:
 *
 * - capacitors: charge marks and electric field lines between the plates;
 * - inductors, relay coils and DC motors: magnetic field loops that flow with the field, plus an
 *   arrow for the voltage a coil induces against a change in its current (Lenz's law);
 * - transformers: the shared flux around the core, and leakage loops when coupling is below 1;
 * - diodes: the depletion region widening under reverse voltage; MOSFETs: the channel filling in
 *   past threshold;
 * - energy: a glow on parts that store it (one scale for the whole circuit, so energy can be seen
 *   moving between them) and chevrons running into parts that absorb power and out of parts that
 *   deliver it.
 */

interface Pt {
  readonly x: number;
  readonly y: number;
}
type XY = [number, number];

/** Below this zoom the overlay is hidden: it would only blur the parts. */
const MIN_SCALE = 0.5;
/** Fractions below this draw nothing. */
const MIN_LEVEL = 0.01;
/** Half-life of a remembered peak (ms): currents, energies and powers span many decades. */
const PEAK_HALF_LIFE = 4000;
/** Values below these count as none. */
const NO_CURRENT = 1e-9;
const NO_ENERGY = 1e-15;
const NO_POWER = 1e-9;
/** Speed of flowing dashes and chevrons at full level (circuit units per second). */
const FLOW_SPEED = 24;
/** Length of the coil body (upstream InductorElm calcLeads(32)). */
const COIL_LEN = 32;
/** Radius of the DC motor body (dcMotorView). */
const MOTOR_R = 18;
/** Spacing of energy flow chevrons along a lead. */
const CHEVRON_GAP = 7;

interface Frame {
  readonly running: boolean;
  /** Full-scale voltage of the voltage colors; a capacitor at this voltage draws at full level. */
  readonly voltageRange: number;
  /** Viewport scale (CSS pixels per circuit unit). */
  readonly scale: number;
}

interface LineFrame {
  /** Local coordinates (s along the line from p1, t across it) to a circuit point. */
  at: (s: number, t: number) => XY;
  len: number;
}

function lineFrame(p1: Pt, p2: Pt): LineFrame {
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
  const ux = (p2.x - p1.x) / len;
  const uy = (p2.y - p1.y) / len;
  return { at: (s, t) => [p1.x + ux * s + uy * t, p1.y + uy * s - ux * t], len };
}

/** Side (+1 or -1 in `fr`'s t) of a line facing away from point q. */
function sideAwayFrom(p1: Pt, p2: Pt, q: Pt): number {
  const cross = (p2.x - p1.x) * (q.y - p1.y) - (p2.y - p1.y) * (q.x - p1.x);
  // t points to (uy, -ux), so a positive cross product puts q on the -t side
  return cross > 0 ? 1 : -1;
}

/** `css` at opacity `a` (theme colors are validated, so they parse). */
function withAlpha(css: string, a: number): string {
  const c = parseColor(css) ?? { r: 0, g: 0, b: 0, a: 1 };
  return toCss({ ...c, a: c.a * a });
}

export class FieldOverlay {
  private peaks = new WeakMap<object, number>();
  private phases = new WeakMap<object, number>();
  private energyPeak = 0;
  private powerPeak = 0;
  private last = 0;

  /** A new circuit: forget remembered peaks. */
  clear(): void {
    this.peaks = new WeakMap();
    this.phases = new WeakMap();
    this.energyPeak = this.powerPeak = 0;
  }

  draw(
    c: CanvasRenderingContext2D,
    elements: readonly CircuitElm[],
    palette: Palette,
    frame: Frame,
  ): void {
    const now = performance.now();
    const dt = this.last === 0 ? 0 : Math.min(100, now - this.last);
    this.last = now;
    const decay = Math.pow(0.5, dt / PEAK_HALF_LIFE);

    // one energy scale and one power scale for the whole circuit
    let maxEnergy = 0;
    let maxPower = 0;
    const energies = new Map<CircuitElm, number>();
    const powers = new Map<CircuitElm, number>();
    for (const e of elements) {
      const en = storedEnergy(e);
      if (en !== null && Number.isFinite(en)) {
        energies.set(e, en);
        maxEnergy = Math.max(maxEnergy, en);
      }
      const p = flowPower(e);
      if (p !== null && Number.isFinite(p)) {
        powers.set(e, p);
        maxPower = Math.max(maxPower, Math.abs(p));
      }
    }
    this.energyPeak = Math.max(maxEnergy, this.energyPeak * decay);
    this.powerPeak = Math.max(maxPower, this.powerPeak * decay);
    if (frame.scale < MIN_SCALE) return;

    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (this.energyPeak > NO_ENERGY)
      for (const [e, en] of energies) this.energyGlow(c, e, en / this.energyPeak, palette);
    for (const e of elements) {
      if (e.dn < 1) continue;
      if (e instanceof CapacitorElm) this.capacitor(c, e, palette, frame);
      else if (e instanceof InductorElm) this.inductor(c, e, palette, frame, dt, decay);
      else if (e instanceof TransformerElm) this.transformer(c, e, palette, frame, dt, decay);
      else if (e instanceof RelayElm) this.relay(c, e, palette, frame, dt);
      else if (e instanceof DCMotorElm) this.motor(c, e, palette, frame, dt, decay);
      else if (e instanceof MosfetElm) this.mosfet(c, e, palette, frame);
      else if (e instanceof DiodeElm && !(e instanceof LEDElm) && !(e instanceof VaractorElm))
        this.diode(c, e, palette, frame);
    }
    if (this.powerPeak > NO_POWER)
      for (const [e, p] of powers) this.energyFlow(c, e, p / this.powerPeak, palette, frame, dt);
    c.restore();
  }

  /** Level of `mag` against `key`'s own recent peak, 0 when there is nothing to show. */
  private peakLevel(key: object, mag: number, decay: number, floor: number): number {
    const peak = Math.max(mag, (this.peaks.get(key) ?? 0) * decay);
    this.peaks.set(key, peak);
    if (!Number.isFinite(peak) || peak < floor) return 0;
    return mag / peak;
  }

  /** Advance and return `key`'s flow phase (circuit units along its path). */
  private flow(key: object, speed: number, frame: Frame, dt: number): number {
    let phase = this.phases.get(key) ?? 0;
    if (frame.running) phase = (phase + (speed * FLOW_SPEED * dt) / 1000) % 1e4;
    this.phases.set(key, phase);
    return phase;
  }

  private capacitor(
    c: CanvasRenderingContext2D,
    e: CapacitorElm,
    palette: Palette,
    frame: Frame,
  ): void {
    const v = e.voltdiff;
    const level = Math.min(1, Math.abs(v) / frame.voltageRange);
    if (!(level >= MIN_LEVEL)) return;
    const { at } = lineFrame(e.point1, e.point2);
    // plates sit 4 units either side of the middle and reach 12 to each side (capacitorView)
    const s1 = e.dn / 2 - 4;
    const s2 = e.dn / 2 + 4;
    // the field runs from the positive plate to the negative one
    const dir = v > 0 ? 1 : -1;
    c.strokeStyle = palette.theme.circuit.electricField;
    c.fillStyle = palette.theme.circuit.electricField;
    c.lineWidth = 1;
    c.setLineDash([]);
    // more lines for a stronger field: the middle one fades in first, then the pairs either side
    for (const [t, k] of [
      [0, 0],
      [-4.5, 1],
      [4.5, 1],
      [-9, 2],
      [9, 2],
    ] as const) {
      const a = fadeIn(level, k, 3);
      if (a === 0) continue;
      c.globalAlpha = a;
      c.beginPath();
      c.moveTo(...at(s1 + 1, t));
      c.lineTo(...at(s2 - 1, t));
      c.stroke();
      arrowHead(c, at(e.dn / 2 - dir * 1.5, t), at(e.dn / 2 + dir * 1.5, t), 1.3);
    }
    // fringing field bulging out past the plate ends
    c.globalAlpha = 0.6 * fadeIn(level, 2, 3);
    for (const side of [1, -1]) {
      c.beginPath();
      c.moveTo(...at(s1, 12 * side));
      c.quadraticCurveTo(...at(e.dn / 2, 18 * side), ...at(s2, 12 * side));
      c.stroke();
    }

    // charge marks just outside each plate: up to four, never on the lead
    const pos = palette.theme.circuit.voltage.positive;
    const neg = palette.theme.circuit.voltage.negative;
    const sPlus = v > 0 ? s1 - 4 : s2 + 4;
    const sMinus = v > 0 ? s2 + 4 : s1 - 4;
    c.lineWidth = 1.2;
    const r = 2;
    for (const [t, k] of [
      [5, 0],
      [-5, 0],
      [10, 1],
      [-10, 1],
    ] as const) {
      const a = fadeIn(level, k, 2);
      if (a === 0) continue;
      c.globalAlpha = a;
      // glyphs stay upright whatever way the capacitor points
      const [px, py] = at(sPlus, t);
      c.strokeStyle = pos;
      c.beginPath();
      c.moveTo(px - r, py);
      c.lineTo(px + r, py);
      c.moveTo(px, py - r);
      c.lineTo(px, py + r);
      c.stroke();
      const [mx, my] = at(sMinus, t);
      c.strokeStyle = neg;
      c.beginPath();
      c.moveTo(mx - r, my);
      c.lineTo(mx + r, my);
      c.stroke();
    }
  }

  private inductor(
    c: CanvasRenderingContext2D,
    e: InductorElm,
    palette: Palette,
    frame: Frame,
    dt: number,
    decay: number,
  ): void {
    const len = Math.min(COIL_LEN, e.dn);
    const a = e.dn / 2 - len / 2;
    const b = e.dn / 2 + len / 2;
    const fr = lineFrame(e.point1, e.point2);
    const level = this.peakLevel(e, Math.abs(e.current), decay, NO_CURRENT);
    const dir = e.current > 0 ? 1 : -1;
    const phase = this.flow(e, dir * level, frame, dt);
    coilField(c, fr, a, b, level, phase, dir, [1, -1], palette.theme.circuit.magneticField);
    // Lenz's law: the coil's voltage is the EMF it induces against the change in current
    const v = e.volts[0] - e.volts[1];
    lenzArrow(
      c,
      fr,
      a,
      b,
      v,
      frame.voltageRange,
      palette.theme.circuit.text,
      palette.theme.style.font,
    );
  }

  private transformer(
    c: CanvasRenderingContext2D,
    e: TransformerElm,
    palette: Palette,
    frame: Frame,
    dt: number,
    decay: number,
  ): void {
    const pc = e.ptCoil;
    if (pc.length < 4) return;
    const l1 = e.inductance;
    const l2 = l1 * e.ratio * e.ratio;
    const k = e.couplingCoef;
    const [i1, i2] = e.currents;
    // flux per turn: the shared part through the core, and what each winding leaks
    const core = Math.sqrt(l1) * i1 + k * Math.sqrt(l2) * i2;
    const leak1 = (1 - k) * Math.sqrt(l1) * i1;
    const leak2 = (1 - k) * Math.sqrt(l2) * i2;
    const mag = Math.max(Math.abs(core), Math.abs(leak1), Math.abs(leak2));
    const peakNow = this.peakLevel(e, mag, decay, NO_CURRENT);
    if (peakNow === 0) return;
    const peak = mag / peakNow;
    const color = palette.theme.circuit.magneticField;

    // core loop: down the first winding, across, back up the second
    const a = pc[0] as Pt;
    const b = pc[2] as Pt;
    const near = dist(pc[1] as Pt, a) < dist(pc[3] as Pt, a);
    const tr = (near ? pc[1] : pc[3]) as Pt;
    const br = (near ? pc[3] : pc[1]) as Pt;
    const level = Math.abs(core) / peak;
    const dir = core > 0 ? 1 : -1;
    const phase = this.flow(e, dir * level, frame, dt);
    for (let n = 0; n !== 3; n++) {
      const alpha = fadeIn(level, n, 3);
      if (alpha === 0) continue;
      // nested loops: the inner one along the coils, the outer ones a little wider
      const g = 3 * n;
      const pts = inflate([a, b, br, tr], g);
      c.globalAlpha = alpha;
      c.strokeStyle = color;
      c.fillStyle = color;
      c.lineWidth = 1;
      c.setLineDash([3, 3]);
      c.lineDashOffset = -phase;
      c.beginPath();
      pts.forEach((q, i) => (i === 0 ? c.moveTo(q.x, q.y) : c.lineTo(q.x, q.y)));
      c.closePath();
      c.stroke();
      c.setLineDash([]);
      // arrows across the bottom and top, along the flux
      const [pa, pb, pbr, ptr] = pts as [Pt, Pt, Pt, Pt];
      arrowOn(c, pb, pbr, dir, 2.2);
      arrowOn(c, ptr, pa, dir, 2.2);
    }
    // leakage: loops outside each winding that never reach the other one
    const mid2: Pt = { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 };
    const mid1: Pt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const windings: [Pt, Pt, number, Pt][] = [
      [a, b, leak1, mid2],
      [pc[1] as Pt, pc[3] as Pt, leak2, mid1],
    ];
    for (const [p1, p2, leak, other] of windings) {
      const lv = Math.abs(leak) / peak;
      if (lv < MIN_LEVEL) continue;
      const fr = lineFrame(p1, p2);
      const d = leak > 0 ? 1 : -1;
      coilField(c, fr, 0, fr.len, lv, phase, d, [sideAwayFrom(p1, p2, other)], color);
    }
  }

  private relay(
    c: CanvasRenderingContext2D,
    e: RelayElm,
    palette: Palette,
    frame: Frame,
    dt: number,
  ): void {
    const leads = e.coilLeads;
    if (leads.length < 2) return;
    const p1 = leads[0] as Pt;
    const p2 = leads[1] as Pt;
    const fr = lineFrame(p1, p2);
    // scaled to the pull-in current: full field is what it takes to throw the contacts
    const on = e.onCurrent();
    const level = on > 0 ? Math.min(1, Math.abs(e.coilCurrent) / on) : 0;
    if (level < MIN_LEVEL) return;
    const dir = e.coilCurrent > 0 ? 1 : -1;
    const phase = this.flow(e, dir * level, frame, dt);
    const color = palette.theme.circuit.magneticField;
    coilField(c, fr, 0, fr.len, level, phase, dir, [1, -1], color);
    // the pull on each blade grows with the square of the coil current
    const pull = fadeIn(level * level, 0, 1);
    if (pull === 0) return;
    const mid: Pt = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    c.globalAlpha = pull;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 1.5;
    for (const poles of e.swpoles) {
      if (poles.length < 3) continue;
      const tip = lerp(poles[1] as Pt, poles[2] as Pt, e.d_position);
      const d = dist(tip, mid) || 1;
      const len = Math.min(10, d * 0.4);
      const ux = (mid.x - tip.x) / d;
      const uy = (mid.y - tip.y) / d;
      const from: XY = [tip.x + ux * 3, tip.y + uy * 3];
      const to: XY = [tip.x + ux * (3 + len), tip.y + uy * (3 + len)];
      c.beginPath();
      c.moveTo(...from);
      c.lineTo(...to);
      c.stroke();
      arrowHead(c, from, to, 2.2);
    }
  }

  private motor(
    c: CanvasRenderingContext2D,
    e: DCMotorElm,
    palette: Palette,
    frame: Frame,
    dt: number,
    decay: number,
  ): void {
    const level = this.peakLevel(e, Math.abs(e.current), decay, NO_CURRENT);
    if (level < MIN_LEVEL) return;
    const dir = e.current > 0 ? 1 : -1;
    const phase = this.flow(e, dir * level, frame, dt);
    const fr = lineFrame(e.point1, e.point2);
    const mid = e.dn / 2;
    const color = palette.theme.circuit.magneticField;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 1;
    // field lines straight across the rotor, bowing out a little away from the middle
    for (const [s, k] of [
      [0, 0],
      [-9, 1],
      [9, 1],
      [-16, 2],
      [16, 2],
    ] as const) {
      const alpha = fadeIn(level, k, 3);
      if (alpha === 0) continue;
      c.globalAlpha = alpha;
      const reach = MOTOR_R + 8;
      const bow = s * 0.25;
      c.setLineDash([3, 3]);
      c.lineDashOffset = -phase;
      c.beginPath();
      c.moveTo(...fr.at(mid + s, -reach * dir));
      c.quadraticCurveTo(...fr.at(mid + s + bow, 0), ...fr.at(mid + s, reach * dir));
      c.stroke();
      c.setLineDash([]);
      arrowHead(c, fr.at(mid + s, (reach - 3) * dir), fr.at(mid + s, (reach + 1) * dir), 2);
    }
  }

  private mosfet(c: CanvasRenderingContext2D, e: MosfetElm, palette: Palette, frame: Frame): void {
    const [vg, vs, vd] = [e.volts[0] ?? 0, e.volts[1] ?? 0, e.volts[2] ?? 0];
    // the channel forms from whichever of source and drain is further from the gate
    const vgs = e.pnp > 0 ? vg - Math.min(vs, vd) : Math.max(vs, vd) - vg;
    const over = vgs - e.vt * e.pnp;
    const level = Math.min(1, over / (frame.voltageRange / 2));
    const alpha = 0.55 * fadeIn(level, 0, 1);
    if (alpha < MIN_LEVEL) return;
    const g = mosfetGeometry(e);
    const src1 = g.src[1] as Pt;
    const drn1 = g.drn[1] as Pt;
    // electrons in an n-channel device, holes in a p-channel one
    const color =
      e.pnp > 0 ? palette.theme.circuit.voltage.negative : palette.theme.circuit.voltage.positive;
    c.globalAlpha = alpha;
    c.strokeStyle = color;
    c.lineWidth = 2 + 4 * level;
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(src1.x, src1.y);
    c.lineTo(drn1.x, drn1.y);
    c.stroke();
  }

  private diode(c: CanvasRenderingContext2D, e: DiodeElm, palette: Palette, frame: Frame): void {
    // reverse voltage widens the depletion region at the junction
    const vr = (e.volts[1] ?? 0) - (e.volts[0] ?? 0);
    const level = Math.min(1, vr / frame.voltageRange);
    const a = fadeIn(level, 0, 1);
    if (a < MIN_LEVEL) return;
    const { lead1, lead2 } = diodeGeometry(e);
    const fr = lineFrame(lead1, lead2);
    const w = 1.5 + 6.5 * level;
    const color = palette.theme.circuit.electricField;
    // the region straddles the bar, more of it on the lightly doped side
    const s0 = fr.len - w * 0.7;
    const s1 = fr.len + w * 0.3;
    const h = 10;
    c.globalAlpha = 0.35 * a;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(...fr.at(s0, -h));
    c.lineTo(...fr.at(s1, -h));
    c.lineTo(...fr.at(s1, h));
    c.lineTo(...fr.at(s0, h));
    c.closePath();
    c.fill();
    // its field points from the cathode (n) side back to the anode (p) side
    c.globalAlpha = a;
    for (const t of [-11.5, 11.5]) {
      const from = fr.at(s1, t);
      const to = fr.at(s0, t);
      c.strokeStyle = color;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(...from);
      c.lineTo(...to);
      c.stroke();
      arrowHead(c, from, to, 1.3);
    }
  }

  private energyGlow(
    c: CanvasRenderingContext2D,
    e: CircuitElm,
    level: number,
    palette: Palette,
  ): void {
    const a = 0.55 * fadeIn(Math.sqrt(Math.max(0, level)), 0, 1);
    if (a < MIN_LEVEL) return;
    const ctr = elementCenter(e);
    const r = 14 + 10 * Math.sqrt(level);
    const color = palette.theme.circuit.energy;
    const g = c.createRadialGradient(ctr.x, ctr.y, 0, ctr.x, ctr.y, r);
    g.addColorStop(0, withAlpha(color, a));
    g.addColorStop(1, withAlpha(color, 0));
    c.globalAlpha = 1;
    c.fillStyle = g;
    c.beginPath();
    c.arc(ctr.x, ctr.y, r, 0, 2 * Math.PI);
    c.fill();
  }

  /** Chevrons along both leads: inward into a part that absorbs power, outward from a source. */
  private energyFlow(
    c: CanvasRenderingContext2D,
    e: CircuitElm,
    level: number,
    palette: Palette,
    frame: Frame,
    dt: number,
  ): void {
    const mag = Math.abs(level);
    const alpha = fadeIn(mag, 0, 1);
    if (alpha < MIN_LEVEL || e.dn < 24) return;
    // positive power is absorbed: the chevrons run from the posts toward the body
    const inward = level > 0 ? 1 : -1;
    const phase = this.flow(this.flowKey(e), mag, frame, dt);
    const fr = lineFrame(e.point1, e.point2);
    // a run of chevrons just outside each end of the body, not out at the posts of a long part
    const body = Math.min(bodyHalf(e), e.dn / 2 - 4);
    const reach = Math.min(16, e.dn / 2 - body);
    if (reach < 6) return;
    const t = -6;
    c.strokeStyle = palette.theme.circuit.energy;
    c.lineWidth = 1.5;
    c.setLineDash([]);
    for (const end of [0, 1]) {
      for (let k = 0; k < reach + CHEVRON_GAP; k += CHEVRON_GAP) {
        // distance travelled along the run, wrapping at its end
        let d = (k + phase) % (reach + CHEVRON_GAP);
        if (inward < 0) d = reach - d;
        if (d < 0 || d > reach) continue;
        // fade in and out at the ends of the run
        const edge = Math.min(d, reach - d) / 3;
        c.globalAlpha = alpha * Math.min(1, edge);
        // d runs from the outer end of the run (0) to the body (reach)
        const s = end === 0 ? e.dn / 2 - body - reach + d : e.dn / 2 + body + reach - d;
        // pointing toward the middle when inward, toward the post when outward
        const toward = (end === 0 ? 1 : -1) * inward;
        chevron(c, fr, s, t, toward, 2.6);
      }
    }
  }

  /** A separate phase key for the energy flow, so it does not share the element's field phase. */
  private flowKeys = new WeakMap<CircuitElm, object>();
  private flowKey(e: CircuitElm): object {
    let k = this.flowKeys.get(e);
    if (k === undefined) {
      k = {};
      this.flowKeys.set(e, k);
    }
    return k;
  }
}

/** Energy stored in a part (J), or null for parts that store none. */
function storedEnergy(e: CircuitElm): number | null {
  if (e instanceof CapacitorElm) return 0.5 * e.capacitance * e.voltdiff * e.voltdiff;
  if (e instanceof InductorElm) return 0.5 * e.inductance * e.current * e.current;
  if (e instanceof TransformerElm) {
    const l1 = e.inductance;
    const l2 = l1 * e.ratio * e.ratio;
    const m = e.couplingCoef * Math.sqrt(l1 * l2);
    const [i1, i2] = e.currents;
    return 0.5 * l1 * i1 * i1 + 0.5 * l2 * i2 * i2 + m * i1 * i2;
  }
  return null;
}

/** Half the length of a part's body along its axis (most bodies are 32 long). */
function bodyHalf(e: CircuitElm): number {
  if (e instanceof CapacitorElm) return 6;
  if (e instanceof DiodeElm) return 9;
  return 17;
}

/** Power a two-ended part absorbs (W, negative when it delivers), or null to skip it. */
function flowPower(e: CircuitElm): number | null {
  if (e instanceof WireElm || e instanceof GraphicElm || e.getPostCount() !== 2) return null;
  return e.getPower();
}

function elementCenter(e: CircuitElm): Pt {
  if (e instanceof TransformerElm && e.ptCoil.length === 4) {
    const p = e.ptCoil;
    return {
      x: ((p[0]?.x ?? 0) + (p[1]?.x ?? 0) + (p[2]?.x ?? 0) + (p[3]?.x ?? 0)) / 4,
      y: ((p[0]?.y ?? 0) + (p[1]?.y ?? 0) + (p[2]?.y ?? 0) + (p[3]?.y ?? 0)) / 4,
    };
  }
  return { x: (e.point1.x + e.point2.x) / 2, y: (e.point1.y + e.point2.y) / 2 };
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a: Pt, b: Pt, f: number): Pt {
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** Push each corner of a quadrilateral `g` units away from its centre. */
function inflate(pts: readonly Pt[], g: number): Pt[] {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return pts.map((p) => {
    const d = Math.hypot(p.x - cx, p.y - cy) || 1;
    return { x: p.x + ((p.x - cx) / d) * g, y: p.y + ((p.y - cy) / d) * g };
  });
}

/**
 * Field loops of a coil lying from s = a to s = b along `fr`: through the coil, out past its end and
 * back outside, on the given sides. Up to three loops per side fade in as `level` grows; the dashes
 * flow with the field and the arrows outside point against it.
 */
function coilField(
  c: CanvasRenderingContext2D,
  fr: LineFrame,
  a: number,
  b: number,
  level: number,
  phase: number,
  dir: number,
  sides: readonly number[],
  color: string,
): void {
  if (level < MIN_LEVEL) return;
  const { at } = fr;
  const mid = (a + b) / 2;
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = 1;
  for (let k = 0; k !== 3; k++) {
    const alpha = fadeIn(level, k, 3);
    if (alpha === 0) continue;
    c.globalAlpha = alpha;
    const h = 11 + 6 * k;
    const over = 5 + 5 * k;
    for (const side of sides) {
      c.beginPath();
      c.moveTo(...at(a, 0));
      c.lineTo(...at(b, 0));
      c.bezierCurveTo(...at(b + over, 0), ...at(b + over, h * side), ...at(mid, h * side));
      c.bezierCurveTo(...at(a - over, h * side), ...at(a - over, 0), ...at(a, 0));
      c.setLineDash([3, 3]);
      c.lineDashOffset = -phase;
      c.stroke();
      c.setLineDash([]);
      arrowHead(c, at(mid + dir * 1.5, h * side), at(mid - dir * 1.5, h * side), 2.5);
    }
  }
}

/**
 * Lenz's law: a solid arrow beside a coil (from s = a to b) showing which way the induced voltage
 * `v` (node 0 minus node 1) pushes current: against the change that caused it.
 */
function lenzArrow(
  c: CanvasRenderingContext2D,
  fr: LineFrame,
  a: number,
  b: number,
  v: number,
  range: number,
  color: string,
  font: string,
): void {
  const level = Math.min(1, Math.abs(v) / range);
  const alpha = fadeIn(level, 0, 1);
  if (alpha < MIN_LEVEL) return;
  // v > 0 means the current is rising from node 0 to node 1; the EMF pushes back toward node 0
  const dir = v > 0 ? -1 : 1;
  const mid = (a + b) / 2;
  const half = 4 + 8 * level;
  const t = -29;
  const from = fr.at(mid - dir * half, t);
  const to = fr.at(mid + dir * half, t);
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = 1.5;
  c.setLineDash([]);
  c.beginPath();
  c.moveTo(...from);
  c.lineTo(...to);
  c.stroke();
  arrowHead(c, from, to, 2.5);
  const [lx, ly] = fr.at(mid, t - 11);
  c.font = `8px ${font}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('EMF', lx, ly);
}

/** An arrowhead halfway from p to q, pointing toward q (dir 1) or p (dir -1). */
function arrowOn(c: CanvasRenderingContext2D, p: Pt, q: Pt, dir: number, size: number): void {
  const m = lerp(p, q, 0.5);
  const d = dist(p, q) || 1;
  const ux = ((q.x - p.x) / d) * dir;
  const uy = ((q.y - p.y) / d) * dir;
  arrowHead(c, [m.x - ux * 2, m.y - uy * 2], [m.x + ux * 2, m.y + uy * 2], size);
}

/** An open chevron at (s, t) pointing along +s (dir 1) or -s (dir -1). */
function chevron(
  c: CanvasRenderingContext2D,
  fr: LineFrame,
  s: number,
  t: number,
  dir: number,
  size: number,
): void {
  c.beginPath();
  c.moveTo(...fr.at(s - dir * size, t - size));
  c.lineTo(...fr.at(s, t));
  c.lineTo(...fr.at(s - dir * size, t + size));
  c.stroke();
}

/**
 * Opacity of the `k`th of `n` staggered marks at `level` (0..1): mark k fades in smoothly while the
 * level goes from k/n to (k+1)/n, so the picture never jumps as the value changes.
 */
export function fadeIn(level: number, k: number, n: number): number {
  const t = Math.min(1, Math.max(0, level * n - k));
  return t * t * (3 - 2 * t);
}

/** A filled arrowhead at `tip`, pointing away from `from`. */
function arrowHead(
  c: CanvasRenderingContext2D,
  from: [number, number],
  tip: [number, number],
  size: number,
): void {
  const dx = tip[0] - from[0];
  const dy = tip[1] - from[1];
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const bx = tip[0] - ux * size * 1.6;
  const by = tip[1] - uy * size * 1.6;
  c.beginPath();
  c.moveTo(tip[0], tip[1]);
  c.lineTo(bx + uy * size, by - ux * size);
  c.lineTo(bx - uy * size, by + ux * size);
  c.closePath();
  c.fill();
}
