// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import {
  CapacitorElm,
  CustomTransformerElm,
  DCMotorElm,
  DiodeElm,
  GraphicElm,
  InductorElm,
  LEDElm,
  MosfetElm,
  PolarCapacitorElm,
  RelayElm,
  TappedTransformerElm,
  TransformerElm,
  VaractorElm,
  WireElm,
  diodeGeometry,
  mosfetGeometry,
  temperatureOf,
  type CircuitElm,
} from '@circuitjs-next/elements';
import { parseColor, toCss } from '@circuitjs-next/theme';
import type { Palette } from './palette.ts';

/**
 * The field overlay ("Show fields", not in upstream). Display only: it reads voltages and currents
 * the engine already computed and never touches the simulation. Each picture is the idea, not a
 * field solution:
 *
 * - capacitors: charge marks and electric field lines between the plates (following a polarized
 *   capacitor's curved plate);
 * - inductors, relay coils and DC motors: magnetic field loops that flow with the field, plus an
 *   arrow for the voltage a coil induces against a change in its current (Lenz's law);
 * - transformers (plain, center-tapped and custom): the shared flux around the core, and leakage
 *   loops when coupling is below 1;
 * - diodes and LEDs: the depletion region widening under reverse voltage, and light leaving a lit
 *   LED; varactors: the depletion region widening as the capacitance falls; MOSFETs: the channel
 *   filling in past threshold;
 * - energy: a glow on parts that store it (one scale for the whole circuit, so energy can be seen
 *   moving between them) and chevrons running into parts that absorb power and out of parts that
 *   deliver it;
 * - heat: a glow on parts warmer than ambient, labeled with their temperature. With self-heating
 *   on (PLAN.md Phase 17) that is the part's simulated temperature; off, it is where the part
 *   would settle, ambient plus its average power times its thermal resistance.
 */

interface Pt {
  readonly x: number;
  readonly y: number;
}
/** One winding of a transformer, from p1 to p2, with its flux (square-root inductance times current). */
interface Winding {
  readonly p1: Pt;
  readonly p2: Pt;
  readonly flux: number;
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
/** A part this much warmer than ambient (°C) glows at full strength. */
const HEAT_FULL_RISE = 100;
/** Rises below this (°C) draw nothing; from HEAT_LABEL_RISE up the part gets a label. */
const HEAT_MIN_RISE = 1;
const HEAT_LABEL_RISE = 3;
/** Time constant (ms) of the average power behind the settle estimate, so AC parts read steady. */
const HEAT_AVERAGE_MS = 500;

/** Length of the coil body (upstream InductorElm calcLeads(32)). */
const COIL_LEN = 32;
/** Radius of the DC motor body (dcMotorView). */
const MOTOR_R = 18;
/** Spacing of energy flow chevrons along a lead. */
const CHEVRON_GAP = 7;

/** Which visualizations to draw (Options > Visualizations). */
export interface FieldOptions {
  /** Capacitor charge marks and electric field lines. */
  charge: boolean;
  /** Magnetic field of coils, transformers, relays and motors. */
  magnetic: boolean;
  /** Lenz's law: the EMF a coil induces against a change in its current. */
  emf: boolean;
  /** Glow on parts that store energy. */
  energy: boolean;
  /** Chevrons into parts that absorb power and out of parts that deliver it. */
  energyFlow: boolean;
  /** MOSFET channel and diode depletion region. */
  semiconductors: boolean;
  /** Parts warmer than ambient glow, with their temperature. */
  heat: boolean;
}

export const NO_FIELDS: FieldOptions = {
  charge: false,
  magnetic: false,
  emf: false,
  energy: false,
  energyFlow: false,
  semiconductors: false,
  heat: false,
};

export const ALL_FIELDS: FieldOptions = {
  charge: true,
  magnetic: true,
  emf: true,
  energy: true,
  energyFlow: true,
  semiconductors: true,
  heat: true,
};

/** Whether any visualization is on. */
export function anyFields(o: FieldOptions): boolean {
  return Object.values(o).some((v) => v);
}

interface Frame {
  readonly show: FieldOptions;
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
  /** Average power of each heating part (W), for the settle estimate. */
  private heatPower = new WeakMap<object, number>();
  /** Temperature labels to draw over the parts (heat), from the last draw. */
  private heatLabels: { x: number; y: number; text: string; level: number }[] = [];

  /** The heating parts warmer than ambient at the last draw, with their labels (heat). */
  get heat(): readonly { readonly x: number; readonly y: number; readonly text: string }[] {
    return this.heatLabels;
  }

  /** A new circuit: forget remembered peaks. */
  clear(): void {
    this.peaks = new WeakMap();
    this.phases = new WeakMap();
    this.heatPower = new WeakMap();
    this.heatLabels = [];
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
    this.heatLabels = [];
    if (frame.show.heat) this.measureHeat(elements, dt, frame.running);
    if (frame.scale < MIN_SCALE) return;

    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const show = frame.show;
    if (show.heat) for (const h of this.heatLabels) this.heatGlow(c, h, palette);
    if (show.energy && this.energyPeak > NO_ENERGY)
      for (const [e, en] of energies) this.energyGlow(c, e, en / this.energyPeak, palette);
    for (const e of elements) {
      if (e.dn < 1) continue;
      if (e instanceof CapacitorElm) {
        if (show.charge) this.capacitor(c, e, palette, frame);
      } else if (e instanceof InductorElm) this.inductor(c, e, palette, frame, dt, decay);
      else if (e instanceof TransformerElm) {
        if (show.magnetic) this.transformer(c, e, palette, frame, dt, decay);
      } else if (e instanceof TappedTransformerElm) {
        if (show.magnetic) this.tappedTransformer(c, e, palette, frame, dt, decay);
      } else if (e instanceof CustomTransformerElm) {
        if (show.magnetic) this.customTransformer(c, e, palette, frame, dt, decay);
      } else if (e instanceof RelayElm) {
        if (show.magnetic) this.relay(c, e, palette, frame, dt);
      } else if (e instanceof DCMotorElm) {
        if (show.magnetic) this.motor(c, e, palette, frame, dt, decay);
      } else if (e instanceof MosfetElm) {
        if (show.semiconductors) this.mosfet(c, e, palette, frame);
      } else if (e instanceof LEDElm) {
        if (show.semiconductors) this.led(c, e, palette, frame);
      } else if (e instanceof VaractorElm) {
        if (show.semiconductors) this.varactor(c, e, palette);
      } else if (e instanceof DiodeElm) {
        if (show.semiconductors) this.diode(c, e, palette, frame);
      }
    }
    if (show.energyFlow && this.powerPeak > NO_POWER)
      for (const [e, p] of powers) this.energyFlow(c, e, p / this.powerPeak, palette, frame, dt);
    c.restore();
  }

  /**
   * Each heating part's temperature, kept as a label to draw (and a glow under it) when it is
   * warmer than ambient. Labels have a fixed width so they don't shift as the value changes.
   */
  private measureHeat(elements: readonly CircuitElm[], dt: number, running: boolean): void {
    const k = running ? 1 - Math.exp(-dt / HEAT_AVERAGE_MS) : 0;
    for (const e of elements) {
      const th = e.thermal;
      if (th === null || e.dn < 1) continue;
      const sim = e.sim as CircuitElm['sim'] | undefined;
      if (sim === undefined) continue;
      const ambient = sim.ambientTemperature();
      let temp: number;
      if (sim.selfHeating) temp = temperatureOf(e);
      else {
        const p = Math.max(0, e.getPower());
        const prev = this.heatPower.get(e);
        const avg = prev === undefined || !Number.isFinite(prev) ? p : prev + (p - prev) * k;
        this.heatPower.set(e, avg);
        temp = ambient + avg * th.resistance;
      }
      const rise = temp - ambient;
      if (!Number.isFinite(rise) || rise < HEAT_MIN_RISE) continue;
      const ctr = elementCenter(e);
      const level = Math.min(1, rise / HEAT_FULL_RISE);
      const shown = Math.min(9999, Math.round(temp));
      this.heatLabels.push({
        x: ctr.x,
        y: ctr.y,
        text: rise >= HEAT_LABEL_RISE ? `${String(shown).padStart(5)} °C` : '',
        level,
      });
    }
  }

  private heatGlow(
    c: CanvasRenderingContext2D,
    h: { x: number; y: number; level: number },
    palette: Palette,
  ): void {
    const a = 0.15 + 0.5 * Math.sqrt(h.level);
    const r = 14 + 16 * Math.sqrt(h.level);
    const color = palette.theme.circuit.heat;
    const g = c.createRadialGradient(h.x, h.y, 0, h.x, h.y, r);
    g.addColorStop(0, withAlpha(color, a));
    g.addColorStop(0.6, withAlpha(color, a * 0.45));
    g.addColorStop(1, withAlpha(color, 0));
    c.globalAlpha = 1;
    c.fillStyle = g;
    c.beginPath();
    c.arc(h.x, h.y, r, 0, 2 * Math.PI);
    c.fill();
  }

  /**
   * Temperature labels over the parts (heat), after the parts are drawn: in the monospace font,
   * on a backing in the canvas color so they read over wires.
   */
  drawHeatLabels(c: CanvasRenderingContext2D, palette: Palette, scale: number): void {
    if (scale < MIN_SCALE || this.heatLabels.length === 0) return;
    const theme = palette.theme;
    c.save();
    c.font = `9px ${theme.style.monoFont}`;
    // right-aligned at the end of the full budget, so the digits never move the unit
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    for (const h of this.heatLabels) {
      if (h.text === '') continue;
      const budget = c.measureText(h.text).width;
      const w = c.measureText(h.text.trimStart()).width;
      const x = h.x + budget / 2;
      const y = h.y + 22;
      c.globalAlpha = 0.85;
      c.fillStyle = theme.canvas.background;
      c.fillRect(x - w - 2, y - 6, w + 4, 12);
      c.globalAlpha = 1;
      c.fillStyle = theme.circuit.heat;
      c.fillText(h.text, x, y);
    }
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
    // a polarized capacitor's negative plate (the second) curves away from the first at its ends
    const bow = e instanceof PolarCapacitorElm ? polarPlateBow : () => 0;
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
      c.lineTo(...at(s2 - 1 + bow(t), t));
      c.stroke();
      arrowHead(c, at(e.dn / 2 - dir * 1.5, t), at(e.dn / 2 + dir * 1.5, t), 1.3);
    }
    // fringing field bulging out past the plate ends
    c.globalAlpha = 0.6 * fadeIn(level, 2, 3);
    for (const side of [1, -1]) {
      c.beginPath();
      c.moveTo(...at(s1, 12 * side));
      c.quadraticCurveTo(...at(e.dn / 2, 18 * side), ...at(s2 + bow(12), 12 * side));
      c.stroke();
    }

    // charge marks just outside each plate: up to four, never on the lead
    const pos = palette.theme.circuit.voltage.positive;
    const neg = palette.theme.circuit.voltage.negative;
    // marks beside the second plate follow its curve
    const sPlus = (t: number): number => (v > 0 ? s1 - 4 : s2 + 4 + bow(t));
    const sMinus = (t: number): number => (v > 0 ? s2 + 4 + bow(t) : s1 - 4);
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
      const [px, py] = at(sPlus(t), t);
      c.strokeStyle = pos;
      c.beginPath();
      c.moveTo(px - r, py);
      c.lineTo(px + r, py);
      c.moveTo(px, py - r);
      c.lineTo(px, py + r);
      c.stroke();
      const [mx, my] = at(sMinus(t), t);
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
    if (frame.show.magnetic)
      coilField(c, fr, a, b, level, phase, dir, [1, -1], palette.theme.circuit.magneticField);
    // Lenz's law: the coil's voltage is the EMF it induces against the change in current
    const v = e.volts[0] - e.volts[1];
    if (frame.show.emf)
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
    const [i1, i2] = e.currents;
    const primary = [{ p1: pc[0] as Pt, p2: pc[2] as Pt, flux: Math.sqrt(l1) * i1 }];
    const secondary = [{ p1: pc[1] as Pt, p2: pc[3] as Pt, flux: Math.sqrt(l2) * i2 }];
    this.core(c, e, primary, secondary, e.couplingCoef, palette, frame, dt, decay);
  }

  /** A center-tapped transformer: the secondary is two windings in series. */
  private tappedTransformer(
    c: CanvasRenderingContext2D,
    e: TappedTransformerElm,
    palette: Palette,
    frame: Frame,
    dt: number,
    decay: number,
  ): void {
    const pc = e.ptCoil;
    if (pc.length < 5) return;
    const l1 = e.inductance;
    const half = Math.sqrt((l1 * e.ratio * e.ratio) / 4);
    const [i0, i1, i2] = e.currents;
    const primary = [{ p1: pc[0] as Pt, p2: pc[1] as Pt, flux: Math.sqrt(l1) * i0 }];
    const secondary = [
      { p1: pc[2] as Pt, p2: pc[3] as Pt, flux: half * i1 },
      { p1: pc[3] as Pt, p2: pc[4] as Pt, flux: half * i2 },
    ];
    this.core(c, e, primary, secondary, e.couplingCoef, palette, frame, dt, decay);
  }

  /** A custom transformer: any number of windings on each side, some of them reversed. */
  private customTransformer(
    c: CanvasRenderingContext2D,
    e: CustomTransformerElm,
    palette: Palette,
    frame: Frame,
    dt: number,
    decay: number,
  ): void {
    const primary: Winding[] = [];
    const secondary: Winding[] = [];
    for (let i = 0; i !== e.coilCount; i++) {
      const n = e.coilNodes[i] ?? 0;
      const p1 = e.nodeTaps[n];
      const p2 = e.nodeTaps[n + 1];
      if (p1 === undefined || p2 === undefined) return;
      const flux =
        (e.coilPolarities[i] ?? 1) *
        Math.sqrt(e.coilInductances[i] ?? 0) *
        (e.coilCurrents[i] ?? 0);
      (i < e.primaryCoils ? primary : secondary).push({ p1, p2, flux });
    }
    this.core(c, e, primary, secondary, e.couplingCoef, palette, frame, dt, decay);
  }

  /**
   * The flux of a transformer: the shared part around the core, from the windings on the
   * primary side down and across to the secondary side and back, and the leakage loops (when
   * coupling `k` is below 1) outside each winding that never reach the other side. A winding's
   * flux is its square-root inductance times its current, signed by which way it is wound.
   */
  private core(
    c: CanvasRenderingContext2D,
    key: object,
    primary: readonly Winding[],
    secondary: readonly Winding[],
    k: number,
    palette: Palette,
    frame: Frame,
    dt: number,
    decay: number,
  ): void {
    const windings = [...primary, ...secondary];
    const core = k * windings.reduce((sum, w) => sum + w.flux, 0);
    const mag = windings.reduce((m, w) => Math.max(m, Math.abs((1 - k) * w.flux)), Math.abs(core));
    const peakNow = this.peakLevel(key, mag, decay, NO_CURRENT);
    if (peakNow === 0) return;
    const peak = mag / peakNow;
    const color = palette.theme.circuit.magneticField;
    const first = primary[0];
    const last = primary[primary.length - 1];
    const sFirst = secondary[0];
    const sLast = secondary[secondary.length - 1];
    const level = Math.abs(core) / peak;
    const dir = core > 0 ? 1 : -1;
    const phase = this.flow(key, dir * level, frame, dt);
    if (first === undefined || last === undefined || sFirst === undefined || sLast === undefined) {
      // windings on one side only: each is a plain coil
      for (const w of windings) {
        const fr = lineFrame(w.p1, w.p2);
        const lv = Math.abs(w.flux) / peak;
        coilField(c, fr, 0, fr.len, lv, phase, w.flux > 0 ? 1 : -1, [1, -1], color);
      }
      return;
    }

    // core loop: down the primary side, across, back up the secondary side
    const a = first.p1;
    const b = last.p2;
    const near = dist(sFirst.p1, a) < dist(sLast.p2, a);
    const tr = near ? sFirst.p1 : sLast.p2;
    const br = near ? sLast.p2 : sFirst.p1;
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
    // leakage: loops outside each winding that never reach the other side
    const mid1: Pt = lerp(a, b, 0.5);
    const mid2: Pt = lerp(tr, br, 0.5);
    for (const [side, other] of [
      [primary, mid2],
      [secondary, mid1],
    ] as const) {
      for (const w of side) {
        const leak = (1 - k) * w.flux;
        const lv = Math.abs(leak) / peak;
        if (lv < MIN_LEVEL) continue;
        const fr = lineFrame(w.p1, w.p2);
        const d = leak > 0 ? 1 : -1;
        coilField(c, fr, 0, fr.len, lv, phase, d, [sideAwayFrom(w.p1, w.p2, other)], color);
      }
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
    const { lead1, lead2 } = diodeGeometry(e);
    const fr = lineFrame(lead1, lead2);
    depletion(c, fr, fr.len, 10, Math.min(1, vr / frame.voltageRange), palette);
  }

  /**
   * A varactor's depletion region is its capacitor: it widens as reverse voltage pulls the
   * capacitance down, so its width follows the capacitance (width goes as 1 / C).
   */
  private varactor(c: CanvasRenderingContext2D, e: VaractorElm, palette: Palette): void {
    const ratio = e.capacitance > 0 ? e.baseCapacitance / e.capacitance : 1;
    // full width at a third of the zero-bias capacitance
    const level = Number.isFinite(ratio) ? Math.min(1, (ratio - 1) / 2) : 0;
    // the junction is the diode bar, 0.6 of the way along the 16-long body (varactorView)
    const fr = lineFrame(e.point1, e.point2);
    depletion(c, fr, e.dn / 2 - 8 + 0.6 * 16, 9, level, palette);
  }

  /**
   * An LED: the depletion region across the lens under reverse voltage, and light
   * leaving it as the current makes it glow (on the same log scale as its brightness).
   */
  private led(c: CanvasRenderingContext2D, e: LEDElm, palette: Palette, frame: Frame): void {
    const fr = lineFrame(e.point1, e.point2);
    const mid = e.dn / 2;
    const vr = (e.volts[1] ?? 0) - (e.volts[0] ?? 0);
    // the lens is filled over the overlay, so the region reaches out past its rim
    depletion(c, fr, mid, 15, Math.min(1, vr / frame.voltageRange), palette);
    // ledView: brightness is 1 + 0.2 ln(I / Imax), full at the maximum brightness current
    const b = e.maxBrightnessCurrent > 0 ? e.current / e.maxBrightnessCurrent : 0;
    const light = b > 0 ? Math.min(1, Math.max(0, 1 + 0.2 * Math.log(b))) : 0;
    const alpha = fadeIn(light, 0, 1);
    if (alpha < MIN_LEVEL) return;
    const color = palette.theme.circuit.energy;
    c.globalAlpha = alpha;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 1.2;
    c.setLineDash([]);
    // rays out of the lens, clear of the leads
    const len = 3 + 6 * light;
    for (const deg of [45, 90, 135, -45, -90, -135]) {
      const r = (deg * Math.PI) / 180;
      const from = fr.at(mid + 15 * Math.cos(r), 15 * Math.sin(r));
      const to = fr.at(mid + (15 + len) * Math.cos(r), (15 + len) * Math.sin(r));
      c.beginPath();
      c.moveTo(...from);
      c.lineTo(...to);
      c.stroke();
      arrowHead(c, from, to, 1.8);
    }
  }

  private energyGlow(
    c: CanvasRenderingContext2D,
    e: CircuitElm,
    level: number,
    palette: Palette,
  ): void {
    // faint: it sits behind the parts as a hint, not on top of them
    const a = 0.22 * fadeIn(Math.sqrt(Math.max(0, level)), 0, 1);
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
  if (e instanceof TappedTransformerElm) {
    // primary and the two secondary halves (TappedTransformerElm.stamp)
    const l1 = e.inductance;
    const l2 = (l1 * e.ratio * e.ratio) / 4;
    const m1 = e.couplingCoef * Math.sqrt(l1 * l2);
    const m2 = e.couplingCoef * l2;
    const [i0, i1, i2] = e.currents;
    return 0.5 * (l1 * i0 * i0 + l2 * i1 * i1 + l2 * i2 * i2) + m1 * i0 * (i1 + i2) + m2 * i1 * i2;
  }
  if (e instanceof CustomTransformerElm) {
    // half i·M·i, M the inductance matrix of CustomTransformerElm.stamp
    const L = e.coilInductances;
    const pol = e.coilPolarities;
    const cur = e.coilCurrents;
    let w = 0;
    for (let i = 0; i !== e.coilCount; i++)
      for (let j = 0; j !== e.coilCount; j++) {
        const m =
          i === j
            ? (L[i] ?? 0)
            : e.couplingCoef * Math.sqrt((L[i] ?? 0) * (L[j] ?? 0)) * (pol[i] ?? 1) * (pol[j] ?? 1);
        w += 0.5 * m * (cur[i] ?? 0) * (cur[j] ?? 0);
      }
    return w;
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
  if (e instanceof TappedTransformerElm || e instanceof CustomTransformerElm) {
    const p = e.ptCore;
    if (p.length > 0)
      return {
        x: p.reduce((s, q) => s + q.x, 0) / p.length,
        y: p.reduce((s, q) => s + q.y, 0) / p.length,
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

/** How far beside a coil's axis the arrow for the field inside it is drawn. */
const INSIDE_T = 4;

/**
 * Field loops of a coil lying from s = a to s = b along `fr`: through the coil, out past its end and
 * back outside, on the given sides. Up to three loops per side fade in as `level` grows; the dashes
 * flow with the field. Inside the coil the field runs with the current (`dir`, a convention: the
 * real direction depends on which way the wire is wound) and comes back the other way outside, so
 * the arrows on the loops point against the current and the arrows inside point with it.
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
  // the field inside, beside the axis where the coil symbol leaves room
  c.globalAlpha = fadeIn(level, 0, 3);
  for (const side of sides) {
    const t = INSIDE_T * side;
    c.beginPath();
    c.moveTo(...at(mid - dir * 7, t));
    c.lineTo(...at(mid + dir * 7, t));
    c.stroke();
    arrowHead(c, at(mid - dir * 7, t), at(mid + dir * 7, t), 2);
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

/**
 * How far a polarized capacitor's curved plate sits back from straight at t across it
 * (polarCapacitorView: a circular arc 5 deep at the plate's ends).
 */
export function polarPlateBow(t: number): number {
  const q = (Math.min(12, Math.abs(t)) / 12) * 0.9;
  return 5 * (1 - Math.sqrt(1 - q * q));
}

/**
 * A junction's depletion region at s = `bar` along `fr`, `h` either side of the axis, at `level`
 * (0..1) of its widest, with its field pointing from the n side (+s) back to the p side.
 */
function depletion(
  c: CanvasRenderingContext2D,
  fr: LineFrame,
  bar: number,
  h: number,
  level: number,
  palette: Palette,
): void {
  const a = fadeIn(level, 0, 1);
  if (a < MIN_LEVEL) return;
  const w = 1.5 + 6.5 * level;
  const color = palette.theme.circuit.electricField;
  // the region straddles the bar, more of it on the lightly doped side
  const s0 = bar - w * 0.7;
  const s1 = bar + w * 0.3;
  c.globalAlpha = 0.35 * a;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(...fr.at(s0, -h));
  c.lineTo(...fr.at(s1, -h));
  c.lineTo(...fr.at(s1, h));
  c.lineTo(...fr.at(s0, h));
  c.closePath();
  c.fill();
  c.globalAlpha = a;
  for (const t of [-(h + 1.5), h + 1.5]) {
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
