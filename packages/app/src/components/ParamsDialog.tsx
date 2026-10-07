// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Not in upstream (PLAN.md Phase 16, DEVIATIONS.md): the open circuit's parameters. Number fields
// bind to them with {name} in the property panel; a subcircuit made from the circuit lets each
// copy set them.

import { getUnitText, isParamName, parseUnits, type ParamDef } from '@circuitjs-next/elements';
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { openDialog } from '../commands.ts';
import { controller } from '../SimController.ts';
import { useApp } from '../store.ts';
import { Shell } from './DialogShell.tsx';
import { Icon } from './Icon.tsx';
import { t } from '../i18n.ts';

interface Row {
  name: string;
  value: string;
}

const valueText = (v: number): string => getUnitText(v, '').replace(' ', '');

function readValue(text: string): number | null {
  try {
    const v = parseUnits(text.trim().replace(/[µμ]/, 'u'));
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** Why a row can't be used, or null. */
function rowError(row: Row, rows: Row[]): string | null {
  const name = row.name.trim();
  if (!isParamName(name)) return t('A name starts with a letter and has letters, digits or _.');
  if (rows.filter((r) => r.name.trim() === name).length > 1) return t('Each name once.');
  if (readValue(row.value) === null) return t('Not a number. Try 4.7k, 100n or 2k2.');
  return null;
}

export function ParamsDialog() {
  const editing = useApp((s) => s.subcircuitBar.editing);
  const [rows, setRows] = useState<Row[]>(() =>
    controller.circuit.params.map((d) => ({ name: d.name, value: valueText(d.value) })),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const bad = rows.map((r) => rowError(r, rows));
  const ok = bad.every((e) => e === null);
  const set = (i: number, patch: Partial<Row>): void =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const nextName = (): string => {
    for (let i = 1; ; i++) if (!rows.some((r) => r.name === `P${i}`)) return `P${i}`;
  };

  return (
    <Shell
      title={editing !== null ? `${t('Parameters of')} ${editing}` : t('Circuit parameters')}
      description={
        editing !== null
          ? t(
              'Each placed copy of this subcircuit can set these. Type {name} or an expression like {R*2} in a part value to use them; the values here are the defaults.',
            )
          : t(
              'Type {name} or an expression like {R*2} in a part value to use them. A subcircuit made from this circuit lets each copy set them.',
            )
      }
    >
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          const defs: ParamDef[] = rows.map((r) => ({
            name: r.name.trim(),
            value: readValue(r.value) ?? 0,
          }));
          const errs = controller.setParams(defs);
          if (errs.length > 0) setErrors(errs);
          else openDialog(null);
        }}
      >
        {rows.length === 0 && <p className="field-hint">{t('No parameters yet.')}</p>}
        {rows.map((row, i) => (
          <div className="param-row" key={i} data-testid={`param-row-${i}`}>
            <input
              className="text-input param-name"
              aria-label={t('Name')}
              value={row.name}
              spellCheck={false}
              autoFocus={i === rows.length - 1 && row.value === ''}
              onChange={(e) => set(i, { name: e.target.value })}
              data-testid={`param-name-${i}`}
            />
            <span className="param-equals">=</span>
            <input
              className="text-input param-value"
              aria-label={t('Value')}
              value={row.value}
              spellCheck={false}
              onChange={(e) => set(i, { value: e.target.value })}
              data-testid={`param-value-${i}`}
            />
            <button
              type="button"
              className="icon-button icon-button-small"
              aria-label={`${t('Delete')} ${row.name}`}
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
            >
              <Icon name="delete" size={18} />
            </button>
            {bad[i] !== null && <span className="field-error param-error">{bad[i]}</span>}
          </div>
        ))}
        <button
          type="button"
          className="button param-add"
          onClick={() => setRows([...rows, { name: nextName(), value: '1' }])}
          data-testid="param-add"
        >
          <Icon name="add" size={18} />
          {t('Add parameter')}
        </button>
        {errors.length > 0 && (
          <div className="field-error" role="alert" data-testid="param-errors">
            {t('Some bound values could not be worked out and kept their old value:')}
            <ul>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="dialog-buttons">
          <Dialog.Close asChild>
            <button type="button" className="button">
              {t(errors.length > 0 ? 'Close' : 'Cancel')}
            </button>
          </Dialog.Close>
          <button
            type="submit"
            className="button button-primary"
            disabled={!ok}
            data-testid="params-ok"
          >
            {t('Apply')}
          </button>
        </div>
      </form>
    </Shell>
  );
}
