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
import { BatteryElm } from './elm/BatteryElm.ts';
import { CurrentElm } from './elm/CurrentElm.ts';
import { JfetElm } from './elm/JfetElm.ts';
import { LampElm } from './elm/LampElm.ts';
import { MosfetElm } from './elm/MosfetElm.ts';
import { OhmMeterElm } from './elm/OhmMeterElm.ts';
import { OpAmpElm } from './elm/OpAmpElm.ts';
import { ResistorElm } from './elm/ResistorElm.ts';
import { TransformerElm } from './elm/TransformerElm.ts';
import { TransistorElm } from './elm/TransistorElm.ts';
import { VaractorElm } from './elm/VaractorElm.ts';
import { VoltageElm } from './elm/VoltageElm.ts';
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

/**
 * A dimensionless value with `digits` decimals (one by default) in a fixed width; a dash when it
 * is undefined or too big for the width.
 */
export function fixedPlain(v: number, digits = 1): string {
  if (!Number.isFinite(v) || Math.abs(v) >= 1e4) return '—'.padStart(PLAIN_WIDTH);
  let s = formatNumber(v, digits, true);
  if (/^-0\.0*$/.test(s)) s = s.slice(1);
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

function mosfet(elm: MosfetElm): FormulaLaw[] {
  // the engine's own reading: source and drain swap when the drain is the lower end (n-channel),
  // and p-channel voltages are flipped, so Vgs and Vds read positive when it conducts
  const [vg = 0, v1 = 0, v2 = 0] = elm.volts;
  const swapped = elm.pnp * v1 > elm.pnp * v2;
  const vs = swapped ? v2 : v1;
  const vd = swapped ? v1 : v2;
  const vgs = elm.pnp * (vg - vs);
  const vds = elm.pnp * (vd - vs);
  const vt = elm.simVt;
  const beta = elm.simBeta;
  const lambda = elm.getModel().lambda;
  const clm = lambda > 0 ? ' · (1 + λ·Vds)' : '';
  const clmTokens =
    lambda > 0 ? ['· (1 +', `${fixedPlain(lambda, 3)} /V`, '·', u(vds, 'V'), ')'] : [];
  const k = lambda > 0 ? 1 + lambda * vds : 1;
  if (vgs < vt) {
    return [
      {
        name: 'Cutoff',
        formula: 'Vgs < Vt, so Id ≈ 0',
        lines: [line('=', u(vgs, 'V'), '<', u(vt, 'V'))],
      },
    ];
  }
  const vov = vgs - vt;
  if (vds < vov) {
    return [
      {
        name: 'Linear region',
        formula: `Id = β · ((Vgs − Vt) · Vds − Vds²/2)${clm}`,
        lines: [
          line(
            '=',
            u(beta, 'A/V²'),
            '· ((',
            u(vov, 'V'),
            '·',
            u(vds, 'V'),
            ') − (',
            u(vds, 'V'),
            ')² / 2)',
            ...clmTokens,
          ),
          line('=', u(beta * (vov * vds - (vds * vds) / 2) * k, 'A')),
        ],
      },
    ];
  }
  return [
    {
      name: 'Saturation (square law)',
      formula: `Id = ½ · β · (Vgs − Vt)²${clm}`,
      lines: [
        line('=', '½ ·', u(beta, 'A/V²'), '·', u(vov, 'V'), '²', ...clmTokens),
        line('=', u(0.5 * beta * vov * vov * k, 'A')),
      ],
    },
  ];
}

function opamp(elm: OpAmpElm): FormulaLaw[] {
  const [vminus = 0, vplus = 0, vout = 0] = elm.volts;
  const vd = vplus - vminus;
  const mid = (elm.maxOut + elm.minOut) / 2;
  const laws: FormulaLaw[] = [
    {
      name: 'Input difference',
      formula: 'Vd = V+ − V−',
      lines: [line('=', u(vplus, 'V'), '−', u(vminus, 'V')), line('=', u(vd, 'V'))],
    },
  ];
  // the engine pins the output to a rail once A·Vd would pass it
  const ideal = elm.gain * vd + mid;
  if (ideal >= elm.maxOut || ideal <= elm.minOut) {
    const rail = ideal >= elm.maxOut ? elm.maxOut : elm.minOut;
    laws.push({
      name: 'Output at its limit',
      formula: ideal >= elm.maxOut ? 'Vout ≈ Vmax' : 'Vout ≈ Vmin',
      lines: [line('≈', u(rail, 'V'))],
    });
    return laws;
  }
  const offset = mid !== 0;
  laws.push({
    name: 'Open-loop gain',
    formula: offset ? 'Vout = A · Vd + Vmid' : 'Vout = A · Vd',
    lines: [
      line('=', u(elm.gain, ''), '·', u(vd, 'V'), ...(offset ? ['+', u(mid, 'V')] : [])),
      line('=', u(vout, 'V')),
    ],
  });
  return laws;
}

function transformer(elm: TransformerElm): FormulaLaw[] {
  const [a = 0, b = 0, c = 0, d = 0] = elm.volts;
  const v1 = a - c;
  const v2 = b - d;
  return [
    {
      name: 'Turns ratio',
      formula: 'V2 ≈ V1 · N2/N1',
      lines: [
        line('≈', u(v1, 'V'), '·', fixedPlain(elm.ratio, 3)),
        line('≈', u(v1 * elm.ratio, 'V')),
        { rel: '=', tokens: [u(v2, 'V'), 'measured'] },
      ],
    },
  ];
}

/** Power a source delivers: its voltage times the current out of its + end. */
function source(v: number, iOut: number): FormulaLaw[] {
  return [
    {
      name: 'Power delivered',
      formula: 'P = V · I',
      lines: [line('=', u(v, 'V'), '·', u(iOut, 'A')), line('=', u(v * iOut, 'W'))],
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
  if (elm instanceof MosfetElm && !(elm instanceof JfetElm)) return mosfet(elm);
  if (elm instanceof OpAmpElm) return opamp(elm);
  if (elm instanceof TransformerElm) return transformer(elm);
  // V·I with their own current is the power they deliver (getPower, -V·I, is what they take)
  if (
    elm instanceof VoltageElm ||
    elm instanceof BatteryElm ||
    (elm instanceof CurrentElm && !(elm instanceof OhmMeterElm))
  )
    return source(elm.getVoltageDiff(), elm.getCurrent());
  return [];
}
