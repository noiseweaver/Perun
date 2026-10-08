// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Fields follow CircuitJS1 SliderDialog (src/com/lushprojects/circuitjs1/client/SliderDialog.java,
// master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: a checkbox per numeric value, then for
// each slider a choice to share another slider, min, max, step, logarithmic and its label. Here
// the choices are a draft applied together with OK, as one undoable edit.

import {
  Adjustable,
  findAdjustable,
  parseUnits,
  sliderBeingShared,
  unitString,
  type EditInfo,
} from '@perun/elements';
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { openDialog } from '../commands.ts';
import { controller } from '../SimController.ts';
import { Shell } from './DialogShell.tsx';
import { t } from '../i18n.ts';

interface Row {
  item: number;
  name: string;
  ei: EditInfo;
  /** The adjustable it has now, if any. */
  adj: Adjustable | null;
  on: boolean;
  /** The slider it shares (an adjustable that owns one), or null for its own. */
  share: Adjustable | null;
  /** Others share this one's slider, so it can't share one itself (upstream hides the choice). */
  shared: boolean;
  min: string;
  max: string;
  step: string;
  log: boolean;
  label: string;
}

/** Upstream's default label: the value's name without a trailing "(unit)". */
const defaultLabel = (name: string): string => name.replace(/ \(.*\)$/, '');
const plainName = (name: string): string => name.replace(/<[^>]*>/g, '');

function initialRows(): Row[] {
  const elm = controller.sliderDialogElm;
  if (elm === null) return [];
  const list = controller.circuit.adjustables;
  const rows: Row[] = [];
  for (let i = 0; ; i++) {
    const ei = elm.getEditInfo(i);
    if (ei === null) break;
    if (!ei.canCreateAdjustable()) continue;
    const adj = findAdjustable(list, elm, i);
    // a new slider takes its range from the edit item, as upstream's Adjustable constructor
    const range = adj ?? new Adjustable(elm, i);
    rows.push({
      item: i,
      name: plainName(ei.name),
      ei,
      adj,
      on: adj !== null,
      share: adj?.sharedSlider ?? null,
      shared: adj !== null && sliderBeingShared(list, adj),
      min: unitString(ei, range.minValue),
      max: unitString(ei, range.maxValue),
      step: unitString(ei, range.sliderStep),
      log: range.logarithmic,
      label: adj?.sliderText || defaultLabel(plainName(ei.name)),
    });
  }
  return rows;
}

export function SliderDialog() {
  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState<string | null>(null);
  const elm = controller.sliderDialogElm;
  if (elm === null) return null;
  const list = controller.circuit.adjustables;
  const set = (i: number, patch: Partial<Row>): void =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const apply = (): boolean => {
    // read every row first: nothing changes unless all of them are good
    const parsed: { r: Row; min: number; max: number; step: number }[] = [];
    for (const r of rows) {
      if (!r.on) continue;
      try {
        const v = { r, min: parseUnits(r.min), max: parseUnits(r.max), step: parseUnits(r.step) };
        if (v.min === v.max) {
          setError(`${r.name}: min and max must differ`);
          return false;
        }
        parsed.push(v);
      } catch {
        setError(`${r.name}: enter numbers for min, max and step`);
        return false;
      }
    }
    controller.setAdjustables(() => {
      const mine = new Set(rows.map((r) => r.adj).filter((a) => a !== null));
      // every other element's sliders stay as they are
      const next = list.filter((a) => !mine.has(a));
      for (const { r, min, max, step } of parsed) {
        const a = r.adj ?? new Adjustable(elm, r.item);
        const wasOwn = r.adj !== null && r.adj.sharedSlider === null;
        a.minValue = min;
        a.maxValue = max;
        a.sliderStep = step;
        // logarithmic needs min > 0 (upstream's guard)
        a.logarithmic = r.log && min > 0;
        a.sharedSlider = r.shared ? null : r.share;
        if (a.sharedSlider === null) {
          a.sliderText = r.label;
          if (wasOwn) a.setSliderValue(r.ei.value);
          else a.createSliderAt(r.ei.value);
        }
        next.push(a);
      }
      // a slider that went away (or now shares another) leaves its users with their own
      const owners = new Set(next.filter((a) => a.sharedSlider === null));
      for (const a of next) {
        if (a.sharedSlider === null || owners.has(a.sharedSlider)) continue;
        const old = a.sharedSlider;
        a.sharedSlider = null;
        if (a.sliderText.length === 0) a.sliderText = old.sliderText;
        a.createSliderAt(a.elm.getEditInfo(a.editItem)?.value ?? 0);
      }
      return next;
    });
    return true;
  };

  return (
    <Shell
      title={t('Sliders')}
      description={t(
        'Choose which values get a slider. Sliders show at the top right of the circuit.',
      )}
    >
      <form
        className="slider-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (apply()) openDialog(null);
        }}
      >
        {rows.length === 0 && <p>{t('This element has no values a slider can set.')}</p>}
        {rows.map((r, i) => {
          // sliders this one can share: those with their own, other than itself
          const choices = list.filter((a) => a.sharedSlider === null && a !== r.adj);
          return (
            <fieldset key={r.item} className="slider-dialog-row" data-testid="slider-dialog-row">
              <label className="field field-check">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={r.on}
                  onChange={(e) => set(i, { on: e.target.checked })}
                  data-testid={`slider-on-${i}`}
                />
                <span>{r.name}</span>
              </label>
              {r.on && (
                <div className="slider-dialog-fields">
                  {!r.shared && choices.length > 0 && (
                    <label className="field">
                      <span className="field-label">{t('Slider')}</span>
                      <select
                        className="select"
                        value={r.share === null ? -1 : choices.indexOf(r.share)}
                        onChange={(e) => {
                          const k = Number(e.target.value);
                          set(i, { share: k < 0 ? null : (choices[k] ?? null) });
                        }}
                      >
                        <option value={-1}>{t('New slider')}</option>
                        {choices.map((a, k) => (
                          <option key={k} value={k}>
                            Share slider: {a.sliderText}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="slider-dialog-range">
                    <TextField
                      label="Min value"
                      value={r.min}
                      onChange={(v) => set(i, { min: v })}
                      testId={`slider-min-${i}`}
                    />
                    <TextField
                      label="Max value"
                      value={r.max}
                      onChange={(v) => set(i, { max: v })}
                      testId={`slider-max-${i}`}
                    />
                    <TextField
                      label="Step (0 = continuous)"
                      value={r.step}
                      onChange={(v) => set(i, { step: v })}
                    />
                  </div>
                  <label className="field field-check">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={r.log}
                      onChange={(e) => set(i, { log: e.target.checked })}
                    />
                    <span>{t('Logarithmic')}</span>
                  </label>
                  {(r.share === null || r.shared) && (
                    <TextField
                      label="Label"
                      value={r.label}
                      onChange={(v) => set(i, { label: v })}
                      testId={`slider-label-${i}`}
                    />
                  )}
                </div>
              )}
            </fieldset>
          );
        })}
        {error !== null && <p className="dialog-problem">{error}</p>}
        <div className="dialog-buttons">
          <Dialog.Close asChild>
            <button type="button" className="button">
              {t('Cancel')}
            </button>
          </Dialog.Close>
          <button type="submit" className="button button-primary" data-testid="slider-dialog-ok">
            {t('OK')}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <input
        className="text-input"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        data-testid={props.testId}
      />
    </label>
  );
}
