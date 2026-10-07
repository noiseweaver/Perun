// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { formulasFor, type CircuitElm, type FormulaLaw } from '@circuitjs-next/elements';
import { useEffect, useState } from 'react';
import { controller } from '../SimController.ts';
import { t } from '../i18n.ts';
import { Icon } from './Icon.tsx';

const OPEN_KEY = 'circuitjs-next.formulaCardOpen';

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== 'false';
  } catch {
    return true;
  }
}

/**
 * The selected part's law with its live numbers (PLAN.md Phase 19), under the live header of the
 * property panel: the formula in symbols, then the values put in, then the result. Every value
 * has a fixed width and the lines wrap only between values, so nothing moves as they change.
 * It follows the main canvas frame by frame; parts without a law show no card.
 */
export function FormulaCard({ elm }: { elm: CircuitElm }) {
  const [laws, setLaws] = useState<FormulaLaw[]>(() => formulasFor(elm));
  const [open, setOpenState] = useState(readOpen);
  const setOpen = (o: boolean): void => {
    setOpenState(o);
    try {
      localStorage.setItem(OPEN_KEY, String(o));
    } catch {
      // private mode: remembered for this page only
    }
  };

  useEffect(() => {
    let last = '';
    const update = (): void => {
      const next = formulasFor(elm);
      const key = JSON.stringify(next);
      if (key === last) return;
      last = key;
      setLaws(next);
    };
    update();
    if (!open) return;
    controller.frameListeners.add(update);
    return () => {
      controller.frameListeners.delete(update);
    };
  }, [elm, open]);

  if (laws.length === 0) return null;

  return (
    <section className="formula-card" data-testid="formula-card" aria-label={t('Formula')}>
      <button
        type="button"
        className="formula-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="functions" size={18} />
        <span className="formula-heading">{laws.map((l) => t(l.name)).join(' · ')}</span>
        <Icon name={open ? 'expandLess' : 'expandMore'} size={18} />
      </button>
      {open &&
        laws.map((law) => (
          <div key={law.name} className="formula-law" data-testid="formula-law">
            <div className="formula-symbols">{law.formula}</div>
            {law.lines.map((ln, n) => (
              <div key={n} className="formula-line" data-testid="formula-line">
                <span className="formula-rel">{ln.rel}</span>
                {ln.tokens.map((tok, k) => (
                  <span key={k} className="formula-token">
                    {tok}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ))}
    </section>
  );
}
