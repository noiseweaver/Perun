// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { Simulation } from '@perun/engine';
import type { CircuitElm } from './CircuitElm.ts';
import { getFixedUnitText, MU } from './view/units.ts';

/**
 * Live values in formula boxes (TextElm in math mode; not in upstream, see
 * docs/deviations/formula-boxes.md). Before typesetting, these macros become the value now:
 *
 * - `\V{out}`: the voltage at the labeled node "out"; `\V{a,b}` the voltage from b to a.
 * - `\V`, `\I`, `\P`: voltage across, current through and power of the first linked part;
 *   `\V[2]` and so on for the others.
 *
 * Each value has a fixed width (CLAUDE.md, live values on screen): room for the sign, three
 * integer digits, three decimals and a unit prefix, so the formula never moves as it changes.
 */

const MACRO = /\\([VIP])(?![A-Za-z])(?:\[(\d+)\])?(?:\{([^{}]*)\})?/g;

/** Whether a line of TeX has live values. */
export function hasLiveValues(tex: string): boolean {
  MACRO.lastIndex = 0;
  return MACRO.test(tex);
}

/**
 * A value as TeX of fixed width: `getFixedUnitText`'s budget, with the minus sign hung left of
 * the digits into a slot reserved for it and the prefix right-aligned in a slot as wide as `M`.
 * TeX's digits all have the same width.
 */
export function fixedTex(v: number, unit: string): string {
  const s = getFixedUnitText(v, unit);
  const m = /^\s*(-?)(\d+)\.(\d+) (.)(.*)$/u.exec(s);
  if (m === null) return `{\\mathrm{${texText(s.trim())}}}`;
  const [, neg = '', int = '', dec = '', prefix = ' ', u = ''] = m;
  const pad = '\\phantom{0}'.repeat(Math.max(0, 3 - int.length));
  const p = prefix === ' ' ? '' : `\\llap{\\mathrm{${texText(prefix)}}}`;
  return (
    `{\\phantom{-}${pad}${neg === '' ? '' : '\\llap{-}'}${int}.${dec}` +
    `\\,\\phantom{\\mathrm{M}}${p}\\mathrm{${texText(u)}}}`
  );
}

function texText(s: string): string {
  return s
    .replace(/[{}\\#%&$_^~]/g, (c) => `\\${c}`)
    .replaceAll(MU, '\\upmu ')
    .replaceAll('Ω', '\\Omega ');
}

/** `\text{?}`: a name or part that isn't there. */
const UNKNOWN = '\\text{?}';

/** A line of formula TeX with its live-value macros replaced by the values now. */
export function liveTex(
  tex: string,
  links: readonly CircuitElm[],
  sim: Simulation | undefined,
): string {
  return tex.replace(
    MACRO,
    (_all, q: string, index: string | undefined, arg: string | undefined) => {
      const name = arg?.trim() ?? '';
      if (name !== '') {
        if (q !== 'V' || sim === undefined) return UNKNOWN;
        const [a = '', b] = name.split(',').map((x) => x.trim());
        const va = nodeVoltage(sim, a);
        const vb = b === undefined ? 0 : nodeVoltage(sim, b);
        return va === null || vb === null ? UNKNOWN : fixedTex(va - vb, 'V');
      }
      const e = links[(index === undefined ? 1 : Number(index)) - 1];
      // a deleted part keeps its number, so the others' don't change
      if (e === undefined || (sim !== undefined && !sim.elmList.includes(e))) return UNKNOWN;
      if (q === 'V') return fixedTex(e.getVoltageDiff(), 'V');
      if (q === 'I') return fixedTex(e.getCurrent(), 'A');
      return fixedTex(e.getPower(), 'W');
    },
  );
}

function nodeVoltage(sim: Simulation, name: string): number | null {
  if (name === 'gnd' || name === 'GND' || name === '0') return 0;
  const le = sim.labelList.get(name);
  if (le === undefined) return null;
  return le.node?.v ?? 0;
}
