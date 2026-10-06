// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { CapacitorElm, InductorElm, type CircuitElm } from '@circuitjs-next/elements';
import type { Palette } from './palette.ts';

/**
 * The field overlay ("Show fields", not in upstream): charge marks and electric field lines on
 * capacitors, magnetic field loops around inductors. Display only: it reads the voltage and current
 * the engine already computed and never touches the simulation. It is a picture of the idea, not
 * a field solution.
 */

/** Below this zoom the overlay is hidden: it would only blur the parts. */
const MIN_SCALE = 0.5;
/** Fractions below this draw nothing. */
const MIN_LEVEL = 0.01;
/** Half-life of an inductor's remembered peak current (ms). */
const PEAK_HALF_LIFE = 4000;
/** Currents below this count as none. */
const NO_CURRENT = 1e-9;
/** Speed of the flowing dashes on a magnetic loop at full level (circuit units per second). */
const FLOW_SPEED = 24;
/** Length of the coil body (upstream InductorElm calcLeads(32)). */
const COIL_LEN = 32;

interface Frame {
  readonly running: boolean;
  /** Full-scale voltage of the voltage colors; a capacitor at this voltage draws at full level. */
  readonly voltageRange: number;
  /** Viewport scale (CSS pixels per circuit unit). */
  readonly scale: number;
}

/** Map local coordinates (s along the element from point1, t across it) to circuit points. */
function frameOf(e: CircuitElm): { at: (s: number, t: number) => [number, number]; rot: number } {
  const ux = (e.point2.x - e.point1.x) / e.dn;
  const uy = (e.point2.y - e.point1.y) / e.dn;
  const x0 = e.point1.x;
  const y0 = e.point1.y;
  return {
    at: (s, t) => [x0 + ux * s + uy * t, y0 + uy * s - ux * t],
    rot: Math.atan2(uy, ux),
  };
}

export class FieldOverlay {
  private peaks = new WeakMap<CircuitElm, number>();
  private phases = new WeakMap<CircuitElm, number>();
  private last = 0;

  /** A new circuit: forget remembered peaks. */
  clear(): void {
    this.peaks = new WeakMap();
    this.phases = new WeakMap();
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
    if (frame.scale < MIN_SCALE) return;
    c.save();
    c.lineCap = 'round';
    for (const e of elements) {
      if (e.dn < 1) continue;
      if (e instanceof CapacitorElm) this.capacitor(c, e, palette, frame);
      else if (e instanceof InductorElm) this.inductor(c, e, palette, frame, dt);
    }
    c.restore();
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
    const { at } = frameOf(e);
    // plates sit 4 units either side of the middle and reach 12 to each side (capacitorView)
    const s1 = e.dn / 2 - 4;
    const s2 = e.dn / 2 + 4;
    // the field runs from the positive plate to the negative one
    const dir = v > 0 ? 1 : -1;
    const alpha = 0.3 + 0.7 * level;

    c.strokeStyle = palette.theme.circuit.electricField;
    c.fillStyle = palette.theme.circuit.electricField;
    c.lineWidth = 1;
    c.setLineDash([]);
    c.globalAlpha = alpha;
    // more lines for a stronger field: 1, 3 or 5
    const offsets = level < 0.34 ? [0] : level < 0.67 ? [-7, 0, 7] : [-9, -4.5, 0, 4.5, 9];
    for (const t of offsets) {
      c.beginPath();
      c.moveTo(...at(s1 + 1, t));
      c.lineTo(...at(s2 - 1, t));
      c.stroke();
      arrowHead(c, at(e.dn / 2 - dir * 1.5, t), at(e.dn / 2 + dir * 1.5, t), 1.3);
    }
    // fringing field bulging out past the plate ends
    c.globalAlpha = alpha * 0.6;
    for (const side of [1, -1]) {
      c.beginPath();
      c.moveTo(...at(s1, 12 * side));
      c.quadraticCurveTo(...at(e.dn / 2, 18 * side), ...at(s2, 12 * side));
      c.stroke();
    }

    // charge marks just outside each plate: up to four, never on the lead
    const marks = [5, -5, 10, -10].slice(0, Math.max(1, Math.round(level * 4)));
    const pos = palette.theme.circuit.voltage.positive;
    const neg = palette.theme.circuit.voltage.negative;
    const sPlus = v > 0 ? s1 - 4 : s2 + 4;
    const sMinus = v > 0 ? s2 + 4 : s1 - 4;
    c.globalAlpha = alpha;
    c.lineWidth = 1.2;
    const r = 2;
    for (const t of marks) {
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
  ): void {
    const i = e.current;
    const mag = Math.abs(i);
    // scale against the coil's own recent peak: inductor currents span many decades
    const decay = Math.pow(0.5, dt / PEAK_HALF_LIFE);
    const peak = Math.max(mag, (this.peaks.get(e) ?? 0) * decay);
    this.peaks.set(e, peak);
    if (!Number.isFinite(peak) || peak < NO_CURRENT) return;
    const level = mag / peak;
    if (!(level >= MIN_LEVEL)) return;
    // the field inside the coil runs along the current; outside it loops back
    const dir = i > 0 ? 1 : -1;
    let phase = this.phases.get(e) ?? 0;
    if (frame.running) phase += (dir * level * FLOW_SPEED * dt) / 1000;
    this.phases.set(e, phase % 1e4);

    const { at } = frameOf(e);
    const len = Math.min(COIL_LEN, e.dn);
    const a = e.dn / 2 - len / 2;
    const b = e.dn / 2 + len / 2;
    const mid = e.dn / 2;
    c.strokeStyle = palette.theme.circuit.magneticField;
    c.fillStyle = palette.theme.circuit.magneticField;
    c.lineWidth = 1;
    c.globalAlpha = 0.3 + 0.7 * level;
    // one, two or three loops on each side as the current grows
    const loops = level < 0.34 ? 1 : level < 0.67 ? 2 : 3;
    for (let k = 0; k !== loops; k++) {
      const h = 11 + 6 * k;
      const over = 5 + 5 * k;
      for (const side of [1, -1]) {
        // through the coil from point1 to point2, out past the end, back outside, in again
        c.beginPath();
        c.moveTo(...at(a, 0));
        c.lineTo(...at(b, 0));
        c.bezierCurveTo(...at(b + over, 0), ...at(b + over, h * side), ...at(mid, h * side));
        c.bezierCurveTo(...at(a - over, h * side), ...at(a - over, 0), ...at(a, 0));
        c.setLineDash([3, 3]);
        c.lineDashOffset = -phase;
        c.stroke();
        c.setLineDash([]);
        // outside, the field runs against the current
        arrowHead(c, at(mid + dir * 1.5, h * side), at(mid - dir * 1.5, h * side), 2.5);
      }
    }
  }
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
