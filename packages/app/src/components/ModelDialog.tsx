// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Follows CircuitJS1 EditDialog (src/com/lushprojects/circuitjs1/client/EditDialog.java, master)
// at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, as upstream opens it on a model: the values apply
// together with OK (or Apply), while checkboxes and choices apply as soon as they change.

import { parseUnits, unitString, type EditInfo } from '@perun/elements';
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { openDialog } from '../commands.ts';
import { controller } from '../SimController.ts';
import { Shell } from './DialogShell.tsx';
import { t } from '../i18n.ts';

/** A field's name without the HTML of a help link. */
const plainName = (name: string): string => t(name).replace(/<[^>]*>/g, '');

interface Field {
  ei: EditInfo;
  /** Text box contents (numbers as typed); unused for checkboxes and choices. */
  text: string;
}

function buildFields(): Field[] {
  const target = controller.modelRequest?.target;
  const fields: Field[] = [];
  if (!target) return fields;
  for (let i = 0; i < 60; i++) {
    const ei = target.getEditInfo(i);
    if (ei === null) break;
    fields.push({ ei, text: ei.text ?? (ei.isNumeric() ? unitString(ei, ei.value) : '') });
  }
  return fields;
}

export function ModelDialog() {
  const req = controller.modelRequest;
  const [fields, setFields] = useState(buildFields);
  const [error, setError] = useState<string | null>(null);
  if (req === null) return null;
  const target = req.target;

  /** Upstream EditDialog.apply: every field in order, stopping at the first error. */
  const applyFields = (list: Field[]): boolean => {
    for (let i = 0; i !== list.length; i++) {
      const { ei, text } = list[i];
      ei.error = null;
      if (ei.text !== null) ei.text = text;
      else if (ei.isNumeric()) {
        try {
          ei.value = parseUnits(text);
        } catch {
          // upstream keeps the old value when a number can't be read
        }
      }
      if (ei.positive && ei.value <= 0) ei.setError('must be > 0');
      if (ei.nonNegative && ei.value < 0) ei.setError('must be >= 0');
      // choices apply when they change, and buttons are not pressed
      if (ei.button !== null || ei.choice !== null) continue;
      if (ei.error === null) target.setEditValue(i, ei);
      if (ei.error !== null) {
        const field = ei.errorFieldName ?? ei.name;
        setError(field ? `${plainName(field)}: ${t(ei.error)}` : t(ei.error));
        return false;
      }
      if (ei.newDialog) break;
    }
    setError(null);
    return true;
  };

  const apply = (): boolean => {
    let ok = false;
    controller.editModel(() => {
      ok = applyFields(fields);
      if (ok) req.onApply?.();
      return ok;
    });
    if (ok) setFields(buildFields());
    return ok;
  };

  /** A checkbox or choice changed: set it now, rebuilding the fields if the list changes. */
  const changed = (i: number): void => {
    const ei = fields[i].ei;
    controller.editModel(() => {
      target.setEditValue(i, ei);
      if (ei.newDialog) applyFields(fields);
      return true;
    });
    if (ei.newDialog) setFields(buildFields());
  };

  const setText = (i: number, text: string): void =>
    setFields(fields.map((f, j) => (j === i ? { ...f, text } : f)));

  return (
    <Shell
      title={t(target.getDialogTitle())}
      wide={fields.length > 6}
      onClose={() => (controller.modelRequest = null)}
    >
      <form
        className="model-dialog"
        data-testid="model-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (apply()) {
            controller.modelRequest = null;
            openDialog(null);
          }
        }}
      >
        <div className="model-dialog-fields">
          {fields.map((f, i) => {
            const { ei } = f;
            const id = `model-field-${i}`;
            if (ei.button !== null) return null;
            if (ei.checkbox !== null) {
              const cb = ei.checkbox;
              return (
                <label key={i} className="field field-check">
                  <input
                    type="checkbox"
                    className="checkbox"
                    defaultChecked={cb.state}
                    onChange={(e) => {
                      cb.state = e.target.checked;
                      changed(i);
                    }}
                    data-testid={id}
                  />
                  <span>{t(cb.label)}</span>
                </label>
              );
            }
            if (ei.choice !== null) {
              const ch = ei.choice;
              return (
                <div key={i} className="field">
                  <label className="field-label" htmlFor={id}>
                    {plainName(ei.name)}
                  </label>
                  <select
                    id={id}
                    className="select"
                    defaultValue={ch.selected}
                    onChange={(e) => {
                      ch.selected = Number(e.target.value);
                      ei.value = ch.selected;
                      changed(i);
                    }}
                    data-testid={id}
                  >
                    {ch.items.map((it, k) => (
                      <option key={k} value={k}>
                        {t(it)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }
            const common = {
              id,
              className: 'text-input',
              value: f.text,
              spellCheck: false,
              'data-testid': id,
            };
            return (
              <div key={i} className={`field${ei.multiline ? ' model-dialog-wide' : ''}`}>
                <label className="field-label" htmlFor={id}>
                  {plainName(ei.name)}
                </label>
                {ei.multiline ? (
                  <textarea
                    {...common}
                    className="text-input model-dialog-textarea"
                    rows={8}
                    onChange={(e) => setText(i, e.target.value)}
                  />
                ) : (
                  <input {...common} onChange={(e) => setText(i, e.target.value)} />
                )}
              </div>
            );
          })}
        </div>
        {error !== null && (
          <p className="dialog-problem" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-buttons">
          <Dialog.Close asChild>
            <button type="button" className="button">
              {t('Cancel')}
            </button>
          </Dialog.Close>
          {req.applyButton && (
            <button
              type="button"
              className="button"
              onClick={() => apply()}
              data-testid="model-dialog-apply"
            >
              {t('Apply')}
            </button>
          )}
          <button type="submit" className="button button-primary" data-testid="model-dialog-ok">
            {t('OK')}
          </button>
        </div>
      </form>
    </Shell>
  );
}
