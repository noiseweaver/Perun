// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// The Solver section of Simulation settings: the integration method (not in upstream,
// docs/deviations/integration-method.md), upstream's matrix solver choice, and a short guide to
// both. A scope card's "Solver ringing?" notice opens the dialog here with the guide open.

import { IntegrationMethod, SolverType } from '@perun/elements';
import { useEffect, useRef } from 'react';
import { t } from '../i18n.ts';

const METHOD_HINTS: Record<IntegrationMethod, string> = {
  [IntegrationMethod.PER_PART]:
    'As CircuitJS1: trapezoidal, unless a capacitor or inductor has its own Trapezoidal Approximation turned off.',
  [IntegrationMethod.DAMP_SEMICONDUCTORS]:
    'Backward Euler for transistor junction capacitances only; everything else as CircuitJS1.',
  [IntegrationMethod.BACKWARD_EULER]:
    'Backward Euler for every capacitor, inductor, transformer and transistor junction.',
};

/** A sine with the solver's step-to-step flipping on top, or one that dies away. */
function GuidePicture(props: { kind: 'ringing' | 'damping' }) {
  const n = 60;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * 120;
    const s = Math.sin((i / n) * 4 * Math.PI);
    const y =
      props.kind === 'ringing'
        ? 20 - 9 * s + (i % 2 === 0 ? 6 : -6) * Math.min(1, i / 12)
        : 20 - 14 * s * Math.exp(-i / 22);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return (
    <svg className="solver-guide-picture" viewBox="0 0 120 40" width="120" height="40" aria-hidden>
      <line x1="0" y1="20" x2="120" y2="20" className="solver-guide-axis" />
      <polyline points={pts.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function SolverSection(props: {
  integration: IntegrationMethod;
  solverType: SolverType;
  onIntegration: (m: IntegrationMethod) => void;
  onSolverType: (s: SolverType) => void;
  /** Opened from a scope's ringing notice: scroll here with the guide open. */
  guide: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (props.guide) ref.current?.scrollIntoView({ block: 'start' });
  }, [props.guide]);
  return (
    <section className="solver-section" ref={ref} data-testid="solver-section">
      <h3 className="scope-section-title">{t('Solver')}</h3>
      <div className="field">
        <label className="field-label" htmlFor="sim-integration">
          {t('Integration method')}
        </label>
        <select
          id="sim-integration"
          className="text-input scope-select"
          value={props.integration}
          data-testid="sim-integration"
          onChange={(e) => props.onIntegration(Number(e.target.value) as IntegrationMethod)}
        >
          <option value={IntegrationMethod.PER_PART}>{t('Trapezoidal (CircuitJS1)')}</option>
          <option value={IntegrationMethod.DAMP_SEMICONDUCTORS}>
            {t('Damp transistor capacitances')}
          </option>
          <option value={IntegrationMethod.BACKWARD_EULER}>{t('Backward Euler')}</option>
        </select>
        <span className="field-hint">{t(METHOD_HINTS[props.integration])}</span>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="sim-matrix-solver">
          {t('Matrix solver')}
        </label>
        <select
          id="sim-matrix-solver"
          className="text-input scope-select"
          value={props.solverType}
          data-testid="sim-matrix-solver"
          onChange={(e) => props.onSolverType(Number(e.target.value) as SolverType)}
        >
          <option value={SolverType.AUTO}>{t('Auto')}</option>
          <option value={SolverType.DENSE}>{t("Dense (Crout's LU)")}</option>
          <option value={SolverType.SPARSE}>{t('Sparse (CSC LU)')}</option>
        </select>
      </div>
      <details className="solver-guide" open={props.guide} data-testid="solver-guide">
        <summary>{t('Which one?')}</summary>
        <p>
          {t(
            'The simulator cannot follow a capacitor or inductor smoothly. On every time step it swaps each one for a resistor and a current source worked out from the step before. The integration method is the recipe for that swap.',
          )}
        </p>
        <h4>{t('Trapezoidal (CircuitJS1)')}</h4>
        <div className="solver-guide-row">
          <GuidePicture kind="ringing" />
          <p>
            {t(
              'Averages the start and end of each step. Very accurate, and oscillators and LC tanks keep their level. Its weak spot: a capacitance that charges in far less than one step (a few pF, like a transistor junction) can get stuck flipping up and down on every step. That ringing is not in the real circuit and never dies out. A scope shows it as a solid band.',
            )}
          </p>
        </div>
        <h4>{t('Backward Euler')}</h4>
        <div className="solver-guide-row">
          <GuidePicture kind="damping" />
          <p>
            {t(
              'Uses only the end of each step. Step-to-step ringing dies out at once, but real resonances slowly lose energy too: an LC tank or an oscillator can fade when the time step is coarse for its frequency.',
            )}
          </p>
        </div>
        <h4>{t('Damp transistor capacitances')}</h4>
        <p>
          {t(
            'Backward Euler only for transistor junction capacitances (CJE, CJC), which are always far faster than the time step, and trapezoidal for everything else. Use it when a transistor model with capacitances sits on a node that is held still, such as an op-amp input.',
          )}
        </p>
        <h4>{t('When to switch')}</h4>
        <p>
          {t(
            'Keep Trapezoidal unless a scope shows a trace flipping on every step (a "Solver ringing?" notice, or a solid band). Then try Damp transistor capacitances, and Backward Euler if it keeps ringing. A smaller time step does not stop ringing. Circuits saved with another method open in CircuitJS1 with its own.',
          )}
        </p>
        <h4>{t('Matrix solver')}</h4>
        <p>
          {t(
            'Dense and Sparse give the same results. Sparse is faster for large circuits; Auto picks by size.',
          )}
        </p>
      </details>
    </section>
  );
}
