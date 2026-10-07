// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Live formula cards (PLAN.md Phase 19, not in upstream): the law a part follows, with the
// numbers the engine has for it right now. Display only: it reads element state and changes
// nothing. Every value has a fixed width (getFixedUnitText), so a card never shifts as the
// numbers change (owner's rule for live values, CLAUDE.md).

import type { CircuitElm } from './CircuitElm.ts';
import { CapacitorElm } from './elm/CapacitorElm.ts';
import { DiodeElm } from './elm/DiodeElm.ts';
import { InductorElm } from './elm/InductorElm.ts';
import { LampElm } from './elm/LampElm.ts';
import { ResistorElm } from './elm/ResistorElm.ts';
import { TransistorElm } from './elm/TransistorElm.ts';
import { VaractorElm } from './elm/VaractorElm.ts';
import { OHM, formatNumber, getFixedUnitText } from './view/units.ts';

/** One line under a law: `=` (or `≈`) and its tokens, which wrap only between tokens. */
export interface FormulaLine {
  rel: '=' | '≈';
  tokens: string[];
}

/** A law: its name, the formula in symbols, then the numbers put in and the result. */
export interface FormulaLaw {
  name: string;
  formula: string;
  lines: FormulaLine[];
}

/** Width of a bare number, as in getFixedUnitText: a sign and up to three integer digits. */
const PLAIN_WIDTH = 8;

/** A dimensionless value with one decimal in a fixed width; a dash when it is undefined. */
export function fixedPlain(v: number): string {
  if (!Number.isFinite(v) || Math.abs(v) >= 1e4) return '—'.padStart(PLAIN_WIDTH);
  let s = formatNumber(v, 1, true);
  if (s === '-0.0') s = '0.0';
  return s.padStart(PLAIN_WIDTH);
}

const u = getFixedUnitText;

function line(rel: FormulaLine['rel'], ...tokens: string[]): FormulaLine {
  return { rel, tokens };
}

function ohm(v: number, i: number, r: number): FormulaLaw[] {
  return [
    {
      name: "Ohm's law",
      formula: 'I = V / R',
      lines: [line('=', u(v, 'V'), '/', u(r, OHM)), line('=', u(i, 'A'))],
    },
    {
      name: 'Power',
      formula: 'P = V · I',
      lines: [line('=', u(v, 'V'), '·', u(i, 'A')), line('=', u(v * i, 'W'))],
    },
  ];
}

function capacitor(elm: CapacitorElm): FormulaLaw[] {
  const c = elm.simCapacitance();
  const v = elm.voltdiff;
  const i = elm.getCurrent();
  return [
    {
      name: 'Charge',
      formula: 'Q = C · V',
      lines: [line('=', u(c, 'F'), '·', u(v, 'V')), line('=', u(c * v, 'C'))],
    },
    {
      name: 'Capacitor current',
      formula: 'I = C · dV/dt',
      lines: [line('=', u(c, 'F'), '·', u(i / c, 'V/s')), line('=', u(i, 'A'))],
    },
  ];
}

function inductor(elm: InductorElm): FormulaLaw[] {
  const i = elm.getCurrent();
  const l = elm.ind.calcEffectiveInductance(i);
  const v = elm.getVoltageDiff();
  return [
    {
      name: 'Inductor voltage',
      formula: 'V = L · dI/dt',
      lines: [line('=', u(l, 'H'), '·', u(v / l, 'A/s')), line('=', u(v, 'V'))],
    },
  ];
}

function diode(elm: DiodeElm): FormulaLaw[] {
  const d = elm.diode;
  const i = elm.getCurrent();
  const vj = (elm.volts[0] ?? 0) - (elm.volts[elm.diodeEndNode] ?? 0);
  const laws: FormulaLaw[] = [];
  const name = elm.hasResistance ? 'Vj' : 'V';
  if (elm.hasResistance) {
    const rs = elm.getModel().seriesResistance;
    const v = elm.getVoltageDiff();
    laws.push({
      name: 'Series resistance',
      formula: 'Vj = V − I · Rs',
      lines: [line('=', u(v, 'V'), '−', u(i, 'A'), '·', u(rs, OHM)), line('=', u(vj, 'V'))],
    });
  }
  // past half the breakdown voltage the reverse curve takes over from Shockley's
  if (d.zvoltage > 0 && vj < -d.zvoltage / 2) {
    laws.push({
      name: 'Zener breakdown',
      formula: `${name} ≈ −Vz`,
      lines: [line('≈', u(-d.zvoltage, 'V'))],
    });
    return laws;
  }
  laws.push({
    name: 'Shockley diode equation',
    formula: `I = Is · (e^(${name} / n·Vt) − 1)`,
    lines: [
      line('=', u(d.leakage, 'A'), '· (e^(', u(vj, 'V'), '/', u(d.vscale, 'V'), ') − 1)'),
      line('=', u(d.leakage * (Math.exp(vj * d.vdcoef) - 1), 'A')),
    ],
  });
  return laws;
}

function transistor(elm: TransistorElm): FormulaLaw[] {
  // pnp currents flipped, so both types read positive in the active region
  const ib = elm.pnp * elm.ib;
  const ic = elm.pnp * elm.ic;
  const ie = -elm.pnp * elm.ie;
  return [
    {
      name: 'Current gain',
      formula: 'β = Ic / Ib',
      lines: [
        line('=', u(ic, 'A'), '/', u(ib, 'A')),
        line('=', fixedPlain(Math.abs(ib) < 1e-12 ? Number.NaN : ic / ib)),
      ],
    },
    {
      name: "Kirchhoff's current law",
      formula: 'Ie = Ib + Ic',
      lines: [line('=', u(ib, 'A'), '+', u(ic, 'A')), line('=', u(ie, 'A'))],
    },
  ];
}

/**
 * The laws to show for a part with its live values, or an empty list for parts without a card.
 * Signs follow the part's own voltage and current (post 1 to post 2), as in the readouts above.
 */
export function formulasFor(elm: CircuitElm): FormulaLaw[] {
  if (elm instanceof ResistorElm)
    return ohm(elm.getVoltageDiff(), elm.getCurrent(), elm.simResistance());
  if (elm instanceof LampElm) return ohm(elm.getVoltageDiff(), elm.getCurrent(), elm.resistance);
  if (elm instanceof CapacitorElm) return capacitor(elm);
  if (elm instanceof InductorElm) return inductor(elm);
  if (elm instanceof DiodeElm && !(elm instanceof VaractorElm)) return diode(elm);
  if (elm instanceof TransistorElm) return transistor(elm);
  return [];
}
