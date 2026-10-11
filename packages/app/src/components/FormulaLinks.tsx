// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { GraphicElm, ScopeElm, TextElm, WireElm, type CircuitElm } from '@perun/elements';
import { controller } from '../SimController.ts';
import { t } from '../i18n.ts';
import { elementNames } from './elementNames.ts';
import { Icon } from './Icon.tsx';

/** Parts a formula can show values of: not wires, text, boxes or scopes. */
function linkable(e: CircuitElm): boolean {
  return !(
    e instanceof WireElm ||
    e instanceof TextElm ||
    e instanceof GraphicElm ||
    e instanceof ScopeElm
  );
}

/**
 * A formula box's linked parts (not in upstream, docs/deviations/formula-boxes.md): `\V`, `\I`
 * and `\P` in its LaTeX show the first one's voltage, current and power, `\V[2]` the second's.
 * Hovering a row lights its part up on the canvas.
 */
export function FormulaLinks({ elm }: { elm: TextElm }) {
  const els = controller.circuit.elements;
  const names = elementNames(els);
  const name = (e: CircuitElm): string => names.get(e) ?? t('Deleted part');
  const choices = els.filter((e) => linkable(e) && !elm.links.includes(e));
  const light = (e: CircuitElm | null): void =>
    controller.setAnalysisHighlights(e === null ? [] : [e]);

  return (
    <div className="field formula-links" data-testid="formula-links">
      <span className="field-label">{t('Linked parts')}</span>
      {elm.links.map((e, i) => (
        <div
          key={i}
          className="formula-link"
          onPointerEnter={() => light(e)}
          onPointerLeave={() => light(null)}
        >
          <span className="formula-link-ref">{i === 0 ? '\\V \\I \\P' : `\\V[${i + 1}]`}</span>
          <span className="formula-link-name">{name(e)}</span>
          <button
            type="button"
            className="icon-button icon-button-small"
            aria-label={t('Unlink')}
            onClick={() => {
              light(null);
              controller.setFormulaLinks(
                elm,
                elm.links.filter((_, j) => j !== i),
              );
            }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
      <select
        className="select"
        value=""
        data-testid="formula-link-add"
        aria-label={t('Link a part')}
        onChange={(ev) => {
          const e = choices[Number(ev.target.value)];
          if (e !== undefined) controller.setFormulaLinks(elm, [...elm.links, e]);
        }}
      >
        <option value="">{t('Link a part…')}</option>
        {choices.map((e, i) => (
          <option key={i} value={i}>
            {name(e)}
          </option>
        ))}
      </select>
      <p className="field-hint">
        {t(
          'Live values: \\V, \\I and \\P are the first linked part’s voltage, current and power, \\V[2] the second part’s voltage. \\V{out} is the voltage at the labeled node out.',
        )}
      </p>
    </div>
  );
}
