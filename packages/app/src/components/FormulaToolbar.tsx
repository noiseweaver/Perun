// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { RefObject } from 'react';
import { flushSync } from 'react-dom';
import { t } from '../i18n.ts';

/**
 * Insert buttons and a short LaTeX legend for a formula box's source (not in upstream,
 * docs/deviations/formula-boxes.md). A button puts its snippet at the cursor; selected text goes
 * into the snippet's first slot, and the cursor lands there.
 */

interface Snippet {
  /** what the button shows */
  readonly label: string;
  readonly title: string;
  /** TeX before the cursor or selection */
  readonly before: string;
  /** TeX after it */
  readonly after?: string;
}

const STRUCTURE: readonly Snippet[] = [
  { label: 'a⁄b', title: 'Fraction', before: '\\frac{', after: '}{}' },
  { label: 'x²', title: 'Superscript', before: '^{', after: '}' },
  { label: 'x₂', title: 'Subscript', before: '_{', after: '}' },
  { label: '√x', title: 'Square root', before: '\\sqrt{', after: '}' },
  { label: '·', title: 'Times (dot)', before: '\\cdot ' },
  { label: '×', title: 'Times (cross)', before: '\\times ' },
  { label: '≈', title: 'Approximately', before: '\\approx ' },
  { label: 'kΩ', title: 'Unit (upright text)', before: '\\,\\mathrm{', after: '}' },
];

const GREEK: readonly Snippet[] = [
  { label: 'Ω', title: 'Omega', before: '\\Omega ' },
  { label: 'μ', title: 'mu', before: '\\mu ' },
  { label: 'π', title: 'pi', before: '\\pi ' },
  { label: 'Δ', title: 'Delta', before: '\\Delta ' },
  { label: 'τ', title: 'tau', before: '\\tau ' },
  { label: 'ω', title: 'omega', before: '\\omega ' },
  { label: 'φ', title: 'phi', before: '\\varphi ' },
];

const LIVE: readonly Snippet[] = [
  { label: '\\V', title: 'Voltage of the first linked part', before: '\\V ' },
  { label: '\\I', title: 'Current of the first linked part', before: '\\I ' },
  { label: '\\P', title: 'Power of the first linked part', before: '\\P ' },
  { label: '\\V{…}', title: 'Voltage at a labeled node', before: '\\V{', after: '}' },
];

const LEGEND: readonly (readonly [string, string])[] = [
  ['\\frac{a}{b}', 'fraction'],
  ['x^{2}  R_{1}', 'superscript, subscript'],
  ['\\sqrt{x}', 'square root'],
  ['\\cdot  \\times  \\approx', '·  ×  ≈'],
  ['\\le  \\ge  \\ne', '≤  ≥  ≠'],
  ['\\Omega \\mu \\pi \\tau', 'Ω μ π τ'],
  ['\\mathrm{k\\Omega}', 'upright text, for units'],
  ['\\left( … \\right)', 'brackets that grow'],
  ['\\V  \\I  \\P', 'first linked part’s voltage, current, power'],
  ['\\V[2]', 'second linked part’s voltage'],
  ['\\V{out}', 'voltage at the labeled node out'],
  ['\\V{a,b}', 'voltage from node b to node a'],
];

export function FormulaToolbar({
  field,
  onInsert,
}: {
  field: RefObject<HTMLTextAreaElement | null>;
  /** the new source, with the cursor already placed */
  onInsert: (text: string) => void;
}) {
  const insert = (s: Snippet): void => {
    const ta = field.current;
    if (ta === null) return;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const picked = value.slice(a, b);
    const text = value.slice(0, a) + s.before + picked + (s.after ?? '') + value.slice(b);
    // inside the first slot, after any selected text
    const cursor = a + s.before.length + picked.length;
    // render the new text now, so the cursor is in place before the next key press
    flushSync(() => onInsert(text));
    ta.focus();
    ta.setSelectionRange(cursor, cursor);
  };
  const group = (snippets: readonly Snippet[], mono = false) => (
    <div className="formula-tools-group">
      {snippets.map((s) => (
        <button
          key={s.label}
          type="button"
          className={mono ? 'formula-tool formula-tool-mono' : 'formula-tool'}
          title={t(s.title)}
          aria-label={t(s.title)}
          // keep the field focused, so this stays one undo step with the typing around it
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => insert(s)}
          data-testid={`formula-insert-${s.title}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
  return (
    <div className="formula-tools" data-testid="formula-tools">
      {group(STRUCTURE)}
      {group(GREEK)}
      {group(LIVE, true)}
    </div>
  );
}

export function FormulaLegend() {
  return (
    <details className="formula-legend" data-testid="formula-legend">
      <summary>{t('LaTeX help')}</summary>
      <table>
        <tbody>
          {LEGEND.map(([tex, what]) => (
            <tr key={tex}>
              <td className="formula-legend-tex">{tex}</td>
              <td>{t(what)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="field-hint">{t('Each line of the box is its own formula.')}</p>
    </details>
  );
}
