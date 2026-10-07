// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import {
  getFixedUnitText,
  hasTolerance,
  parseUnits,
  unitString,
  type CircuitElm,
} from '@circuitjs-next/elements';
import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { defaultAmplitude, isBodeOutput, isBodeSource } from '../analysis/bode.ts';
import { bodeLayout, freqAtX } from '../analysis/bodePlot.ts';
import { outputRank } from '../analysis/names.ts';
import {
  MultiRun,
  acAt,
  monteCarloRuns,
  rangeValues,
  spread,
  sweepCsv,
  sweepItems,
  tolerancedParts,
  valueAt,
  valueRuns,
  type Distribution,
  type Measure,
  type RunSpec,
  type SweepTarget,
} from '../analysis/sweep.ts';
import {
  drawAcRuns,
  drawTransientRuns,
  runColor,
  spreadColors,
  timeAtX,
  timeLayout,
  type RunStyle,
} from '../analysis/sweepPlot.ts';
import { download, openDialog } from '../commands.ts';
import { t } from '../i18n.ts';
import { controller } from '../SimController.ts';
import { shownTheme, useApp } from '../store.ts';
import { NumberField, readPositive, shortNum } from './BodeDialog.tsx';
import { Shell } from './DialogShell.tsx';
import { elementNames } from './elementNames.ts';
import { Icon } from './Icon.tsx';

type Mode = 'values' | 'montecarlo';
type Analysis = 'transient' | 'ac';
type Spacing = 'list' | 'linear' | 'log';

interface Form {
  mode: Mode;
  analysis: Analysis;
  target: SweepTarget;
  spacing: Spacing;
  listText: string;
  fromText: string;
  toText: string;
  count: number;
  runs: number;
  seedText: string;
  dist: Distribution;
  output: number;
  quantity: 'voltage' | 'current';
  durationText: string;
  source: number;
  fStartText: string;
  fStopText: string;
  ppd: number;
  ampText: string;
}

/** The last form and run, kept while the dialog is closed so reopening shows them again. */
let last: { form: Form; sweep: MultiRun | null; style: RunStyle; unit: string } | null = null;
let request: { elm: CircuitElm | null; mode: Mode } | null = null;

/** Open the sweep dialog; `elm` becomes the swept part (or the output) when it can be. */
export function openSweep(mode: Mode, elm: CircuitElm | null = null): void {
  request = { elm, mode };
  openDialog('sweep');
}

export { canSweep } from '../analysis/sweep.ts';

const COUNTS = [2, 3, 4, 5, 6, 8, 10];
const RUN_COUNTS = [10, 20, 50, 100, 200];
const PPD = [5, 10, 20];
const SLICE_MS = 12;
/** More runs than this in a sweep would be unreadable in one plot. */
const MAX_VALUES = 20;

const fmtDb = (v: number): string =>
  Number.isFinite(v) ? `${v.toFixed(2).padStart(8)} dB` : `${'-∞'.padStart(8)} dB`;
const fmtDeg = (v: number): string => `${v.toFixed(1).padStart(7)}°`;
const blank = (n: number): string => ' '.repeat(n);

function readNumber(text: string): number | null {
  try {
    const v = parseUnits(text.trim().replace(/[µμ]/, 'u'));
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function readTime(text: string): number | null {
  return readPositive(text.trim().replace(/s$/i, ''));
}

/** "1k, 2.2k 4.7k": the values of a list, or null if one is not a number. */
function readList(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).filter((s) => s.length > 0);
  const out: number[] = [];
  for (const p of parts) {
    const v = readNumber(p);
    if (v === null) return null;
    out.push(v);
  }
  return out;
}

/** The time the first scope shows, else 1000 timesteps: a sensible default stop time. */
function defaultDuration(): number {
  const c = controller.circuit;
  const s = c.scopes.scopes[0];
  const dt = c.sim.maxTimeStep;
  const span = s !== undefined && s.rect.width > 0 ? dt * s.speed * s.rect.width : 1000 * dt;
  return Number(span.toPrecision(2));
}

function initialForm(els: readonly CircuitElm[]): Form {
  const req = request;
  request = null;
  const base: Form = last?.form ?? {
    mode: 'values',
    analysis: 'transient',
    target: { element: -1, item: 0 },
    spacing: 'list',
    listText: '',
    fromText: '',
    toText: '',
    count: 5,
    runs: 20,
    seedText: '1',
    dist: 'uniform',
    output: -1,
    quantity: 'voltage',
    durationText: shortNum(defaultDuration()) + 's',
    source: -1,
    fStartText: '10',
    fStopText: '100k',
    ppd: 10,
    ampText: '1',
  };
  const f: Form = { ...base, target: { ...base.target } };
  if (req !== null) f.mode = req.mode;
  const valid = (i: number, test: (e: CircuitElm) => boolean): boolean => {
    const e = els[i];
    return e !== undefined && test(e);
  };
  const sweepable = (e: CircuitElm): boolean => sweepItems(e).length > 0;
  if (!valid(f.target.element, sweepable)) f.target = { element: -1, item: 0 };
  if (!valid(f.output, isBodeOutput)) f.output = -1;
  if (!valid(f.source, isBodeSource)) f.source = -1;

  const picked = req?.elm ?? els.find((e) => e.selected) ?? null;
  if (picked !== null) {
    const i = els.indexOf(picked);
    if (f.mode === 'values' && sweepable(picked)) f.target = { element: i, item: 0 };
    else if (isBodeOutput(picked) && !isBodeSource(picked)) f.output = i;
  }
  if (f.target.element < 0) {
    // prefer a part with a value people sweep: resistors, capacitors, inductors
    const r = els.findIndex((e) => hasTolerance(e));
    f.target = { element: r >= 0 ? r : els.findIndex(sweepable), item: 0 };
  }
  const items = sweepItems(els[f.target.element] as CircuitElm);
  if (!items.some((s) => s.item === f.target.item)) f.target.item = items[0]?.item ?? 0;
  if (f.source < 0) f.source = els.findIndex(isBodeSource);
  if (f.output < 0) {
    const ranked = els
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => isBodeOutput(e) && !isBodeSource(e))
      .sort((a, b) => outputRank(a.e) - outputRank(b.e) || a.i - b.i);
    f.output = ranked[0]?.i ?? -1;
  }
  if (last === null || f.target.element !== last.form.target.element) seedValues(f, els);
  if (last === null) {
    const src = els[f.source];
    if (src !== undefined && isBodeSource(src)) f.ampText = shortNum(defaultAmplitude(src));
  }
  return f;
}

/** Start the value fields from the part's own value: half, itself, double and so on. */
function seedValues(f: Form, els: readonly CircuitElm[]): void {
  const e = els[f.target.element];
  const ei = e?.getEditInfo(f.target.item) ?? null;
  if (ei === null) return;
  const v = ei.value;
  const short = (x: number): string => shortNum(x);
  if (v > 0) {
    f.listText = [0.5, 1, 2].map((k) => short(v * k)).join(', ');
    f.fromText = short(v / 2);
    f.toText = short(v * 2);
  } else {
    f.listText = [v - 1, v, v + 1].map(short).join(', ');
    f.fromText = short(v - 1);
    f.toText = short(v + 1);
  }
}

export function SweepDialog() {
  const els = controller.circuit.elements;
  const theme = useApp(shownTheme);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [form, setForm] = useState<Form>(() => initialForm(els));
  const [sweep, setSweep] = useState<MultiRun | null>(() => last?.sweep ?? null);
  const [style, setStyle] = useState<RunStyle>(() => last?.style ?? 'values');
  const [unit, setUnit] = useState(() => last?.unit ?? 'V');
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const set = (p: Partial<Form>): void => setForm((f) => ({ ...f, ...p }));
  const running = sweep !== null && sweep.state === 'running';

  const names = elementNames(els);
  const sweepable = els.map((e, i) => ({ e, i })).filter(({ e }) => sweepItems(e).length > 0);
  const targetElm = els[form.target.element];
  const items = targetElm !== undefined ? sweepItems(targetElm) : [];
  const targetEi = targetElm?.getEditInfo(form.target.item) ?? null;
  const outputs = els
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => isBodeOutput(e))
    .sort((a, b) => outputRank(a.e) - outputRank(b.e) || a.i - b.i);
  const sources = els.filter(isBodeSource);
  const tolerant = tolerancedParts(els);
  const outElm = els[form.output];
  const canCurrent = outElm !== undefined && outElm.getPostCount() === 2;

  // what the form asks for, or why it can't run
  const values =
    form.spacing === 'list'
      ? readList(form.listText)
      : (() => {
          const a = readNumber(form.fromText);
          const b = readNumber(form.toText);
          return a === null || b === null
            ? null
            : rangeValues(a, b, form.count, form.spacing === 'log').map((v) =>
                // three significant digits, so labels read like part values
                Number(v.toPrecision(3)),
              );
        })();
  const duration = readTime(form.durationText);
  const fStart = readPositive(form.fStartText.replace(/hz$/i, ''));
  const fStop = readPositive(form.fStopText.replace(/hz$/i, ''));
  const amp = readPositive(form.ampText.replace(/v$/i, ''));
  const seed = Number.parseInt(form.seedText, 10);
  const valuesOk = values !== null && values.length > 0 && values.length <= MAX_VALUES;
  const problem = ((): string | null => {
    if (form.mode === 'values' && sweepable.length === 0)
      return t('Nothing in this circuit has a value to sweep.');
    if (form.mode === 'montecarlo' && tolerant.length === 0)
      return t(
        'No part has a tolerance yet. Set one in a resistor, capacitor or inductor’s properties.',
      );
    if (form.analysis === 'ac' && sources.length === 0)
      return t('Add a voltage source to drive the circuit first.');
    return null;
  })();
  const ok =
    !running &&
    problem === null &&
    form.output >= 0 &&
    (form.mode === 'values' ? valuesOk && form.target.element >= 0 : Number.isFinite(seed)) &&
    (form.analysis === 'transient'
      ? duration !== null
      : fStart !== null &&
        fStop !== null &&
        fStop > fStart * 1.01 &&
        amp !== null &&
        form.source >= 0 &&
        form.source !== form.output);

  useEffect(() => {
    if (sweep === null || sweep.state !== 'running') return;
    let raf = 0;
    const tick = (): void => {
      const start = performance.now();
      while (performance.now() - start < SLICE_MS && sweep.run(1000));
      if (sweep.state === 'error') setError(sweep.error);
      refresh();
      if (sweep.state === 'running') raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sweep]);

  const isAc = sweep?.measure.kind === 'ac';
  const fLo = sweep?.freqs[0] ?? fStart ?? 10;
  const fHi = sweep?.freqs[sweep.freqs.length - 1] ?? fStop ?? 1e5;
  const results = sweep?.results.filter((r) => r.y.length > 0 || r.points.length > 0) ?? [];

  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0 });
  useEffect(() => {
    const c = canvas.current;
    if (c === null) return;
    const w = Math.max(200, (c.parentElement?.clientWidth ?? 616) - 16);
    const h = w < 480 ? 260 : 300;
    const dpr = window.devicePixelRatio || 1;
    size.current = { w, h };
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
    if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    if (g === null) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (sweep !== null && isAc)
      drawAcRuns(g, w, h, { results, fStart: fLo, fStop: fHi, style, cursor, theme });
    else
      drawTransientRuns(g, w, h, {
        times: sweep?.times ?? [0, duration ?? 1],
        results,
        style,
        unit,
        cursor,
        theme,
      });
  });

  const start = (): void => {
    if (!ok) return;
    setError(null);
    setCursor(null);
    let runs: RunSpec[];
    const target = form.mode === 'values' ? form.target : null;
    if (form.mode === 'values') {
      runs = valueRuns(form.target, values ?? [], (v) => unitString(targetEi, v));
    } else {
      runs = monteCarloRuns(
        els,
        form.runs,
        seed,
        form.dist,
        (i) => `${t('Run')} ${i}`,
        t('Nominal'),
      );
    }
    const measure: Measure =
      form.analysis === 'transient'
        ? {
            kind: 'transient',
            output: form.output,
            quantity: canCurrent ? form.quantity : 'voltage',
            duration: duration ?? 0,
          }
        : {
            kind: 'ac',
            bode: {
              source: form.source,
              output: form.output,
              fStart: fStart ?? 10,
              fStop: fStop ?? 1e5,
              pointsPerDecade: form.ppd,
              amplitude: amp ?? 1,
            },
          };
    try {
      const sw = new MultiRun(controller.saveText(), runs, measure, target);
      const u = measure.kind === 'transient' && measure.quantity === 'current' ? 'A' : 'V';
      last = { form, sweep: sw, style: form.mode, unit: u };
      setStyle(form.mode);
      setUnit(u);
      setSweep(sw);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const stop = (): void => {
    sweep?.stop();
    refresh();
  };
  useEffect(() => {
    if (last !== null) last.form = form;
  }, [form]);

  const onPointer = (clientX: number): void => {
    const c = canvas.current;
    if (c === null || results.length === 0 || sweep === null) return;
    const r = c.getBoundingClientRect();
    const x = clientX - r.left;
    if (isAc) {
      const l = bodeLayout(size.current.w, size.current.h, fLo, fHi);
      setCursor(x < l.left || x > l.right ? null : freqAtX(l, x));
    } else {
      const l = timeLayout(
        size.current.w,
        size.current.h,
        sweep.times[sweep.times.length - 1] ?? 1,
      );
      setCursor(x < l.left || x > l.right ? null : timeAtX(l, x));
    }
  };

  const total = sweep?.results.length ?? 0;
  const done = sweep?.finished ?? 0;
  const fmtV = (v: number | null): string => (v === null ? blank(10) : getFixedUnitText(v, unit));
  const sc = spreadColors(theme);
  const labelWidth = Math.max(4, ...results.map((r) => r.spec.label.length));

  return (
    <Shell
      title={t('Parameter sweep and Monte Carlo')}
      description={t(
        'Runs a copy of the circuit once per value, or with random part values within their tolerances, and overlays the results. The running circuit is not touched.',
      )}
      wide
      className="bode-dialog-content"
    >
      <div className="bode-dialog sweep-dialog" data-testid="sweep-dialog">
        <div className="sweep-modes">
          <Segmented
            label={t('Vary')}
            value={form.mode}
            disabled={running}
            testId="sweep-mode"
            options={[
              ['values', t('Sweep a value')],
              ['montecarlo', t('Monte Carlo')],
            ]}
            onChange={(v) => set({ mode: v })}
          />
          <Segmented
            label={t('Measure')}
            value={form.analysis}
            disabled={running}
            testId="sweep-analysis"
            options={[
              ['transient', t('Transient')],
              ['ac', t('AC (Bode)')],
            ]}
            onChange={(v) => set({ analysis: v })}
          />
        </div>

        {problem !== null && (
          <p className="dialog-problem" data-testid="sweep-problem">
            {problem}
          </p>
        )}

        <div className="bode-form sweep-form">
          {form.mode === 'values' ? (
            <>
              <div className="field sweep-wide">
                <label className="field-label" htmlFor="sweep-part">
                  {t('Part')}
                </label>
                <select
                  id="sweep-part"
                  className="text-input scope-select"
                  value={form.target.element}
                  disabled={running}
                  data-testid="sweep-part"
                  onChange={(e) => {
                    const element = Number(e.target.value);
                    const next = {
                      ...form,
                      target: {
                        element,
                        item: sweepItems(els[element] as CircuitElm)[0]?.item ?? 0,
                      },
                    };
                    seedValues(next, els);
                    setForm(next);
                  }}
                >
                  {form.target.element < 0 && <option value={-1}>{t('None')}</option>}
                  {sweepable.map(({ e, i }) => (
                    <option key={i} value={i}>
                      {names.get(e)}
                    </option>
                  ))}
                </select>
              </div>
              {items.length > 1 && (
                <div className="field sweep-wide">
                  <label className="field-label" htmlFor="sweep-item">
                    {t('Value')}
                  </label>
                  <select
                    id="sweep-item"
                    className="text-input scope-select"
                    value={form.target.item}
                    disabled={running}
                    data-testid="sweep-item"
                    onChange={(e) => {
                      const next = {
                        ...form,
                        target: { ...form.target, item: Number(e.target.value) },
                      };
                      seedValues(next, els);
                      setForm(next);
                    }}
                  >
                    {items.map(({ item, ei }) => (
                      <option key={item} value={item}>
                        {t(ei.name).replace(/<[^>]*>/g, '')}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label className="field-label" htmlFor="sweep-spacing">
                  {t('Steps')}
                </label>
                <select
                  id="sweep-spacing"
                  className="text-input scope-select"
                  value={form.spacing}
                  disabled={running}
                  data-testid="sweep-spacing"
                  onChange={(e) => set({ spacing: e.target.value as Spacing })}
                >
                  <option value="list">{t('List')}</option>
                  <option value="linear">{t('Linear')}</option>
                  <option value="log">{t('Logarithmic')}</option>
                </select>
              </div>
              {form.spacing === 'list' ? (
                <div className="sweep-list">
                  <NumberField
                    id="sweep-values"
                    label={t('Values')}
                    value={form.listText}
                    onChange={(v) => set({ listText: v })}
                    invalid={!valuesOk}
                    disabled={running}
                  />
                </div>
              ) : (
                <>
                  <NumberField
                    id="sweep-from"
                    label={t('From')}
                    value={form.fromText}
                    onChange={(v) => set({ fromText: v })}
                    invalid={!valuesOk}
                    disabled={running}
                  />
                  <NumberField
                    id="sweep-to"
                    label={t('To')}
                    value={form.toText}
                    onChange={(v) => set({ toText: v })}
                    invalid={!valuesOk}
                    disabled={running}
                  />
                  <div className="field">
                    <label className="field-label" htmlFor="sweep-count">
                      {t('Runs')}
                    </label>
                    <select
                      id="sweep-count"
                      className="text-input scope-select"
                      value={form.count}
                      disabled={running}
                      data-testid="sweep-count"
                      onChange={(e) => set({ count: Number(e.target.value) })}
                    >
                      {COUNTS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="field sweep-wide">
                <span className="field-label">{t('Toleranced parts')}</span>
                <span className="sweep-parts" data-testid="sweep-tolerant">
                  {tolerant.length === 0
                    ? t('None')
                    : tolerant
                        .map((i) => {
                          const e = els[i] as CircuitElm;
                          return `${names.get(e) ?? ''} ±${hasTolerance(e) ? e.tolerance : 0}%`;
                        })
                        .join(', ')}
                </span>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="sweep-runs">
                  {t('Runs')}
                </label>
                <select
                  id="sweep-runs"
                  className="text-input scope-select"
                  value={form.runs}
                  disabled={running}
                  data-testid="sweep-runs"
                  onChange={(e) => set({ runs: Number(e.target.value) })}
                >
                  {RUN_COUNTS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <NumberField
                id="sweep-seed"
                label={t('Seed')}
                value={form.seedText}
                onChange={(v) => set({ seedText: v })}
                invalid={!Number.isFinite(seed)}
                disabled={running}
              />
              <div className="field sweep-wide">
                <label className="field-label" htmlFor="sweep-dist">
                  {t('Distribution')}
                </label>
                <select
                  id="sweep-dist"
                  className="text-input scope-select"
                  value={form.dist}
                  disabled={running}
                  data-testid="sweep-dist"
                  onChange={(e) => set({ dist: e.target.value as Distribution })}
                >
                  <option value="uniform">{t('Uniform')}</option>
                  <option value="gaussian">{t('Gaussian (tolerance = 3σ)')}</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div className="bode-form sweep-form">
          {form.analysis === 'ac' && (
            <div className="field sweep-wide">
              <label className="field-label" htmlFor="sweep-source">
                {t('Input source')}
              </label>
              <select
                id="sweep-source"
                className="text-input scope-select"
                value={form.source}
                disabled={running}
                data-testid="sweep-source"
                onChange={(e) => {
                  const i = Number(e.target.value);
                  const src = els[i];
                  set({
                    source: i,
                    ...(src !== undefined && isBodeSource(src)
                      ? { ampText: shortNum(defaultAmplitude(src)) }
                      : {}),
                  });
                }}
              >
                {form.source < 0 && <option value={-1}>{t('None')}</option>}
                {sources.map((e) => (
                  <option key={els.indexOf(e)} value={els.indexOf(e)}>
                    {names.get(e)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field sweep-wide">
            <label className="field-label" htmlFor="sweep-output">
              {t('Output')}
            </label>
            <select
              id="sweep-output"
              className="text-input scope-select"
              value={form.output}
              disabled={running}
              data-testid="sweep-output"
              onChange={(e) => set({ output: Number(e.target.value) })}
            >
              {form.output < 0 && <option value={-1}>{t('None')}</option>}
              {outputs.map(({ e, i }) => (
                <option key={i} value={i}>
                  {names.get(e)}
                </option>
              ))}
            </select>
          </div>
          {form.analysis === 'transient' ? (
            <>
              <div className="field">
                <label className="field-label" htmlFor="sweep-quantity">
                  {t('Quantity')}
                </label>
                <select
                  id="sweep-quantity"
                  className="text-input scope-select"
                  value={canCurrent ? form.quantity : 'voltage'}
                  disabled={running || !canCurrent}
                  data-testid="sweep-quantity"
                  onChange={(e) => set({ quantity: e.target.value as 'voltage' | 'current' })}
                >
                  <option value="voltage">{t('Voltage')}</option>
                  <option value="current">{t('Current')}</option>
                </select>
              </div>
              <NumberField
                id="sweep-duration"
                label={t('Stop time')}
                value={form.durationText}
                onChange={(v) => set({ durationText: v })}
                invalid={duration === null}
                disabled={running}
              />
            </>
          ) : (
            <>
              <NumberField
                id="sweep-fstart"
                label={t('From (Hz)')}
                value={form.fStartText}
                onChange={(v) => set({ fStartText: v })}
                invalid={fStart === null}
                disabled={running}
              />
              <NumberField
                id="sweep-fstop"
                label={t('To (Hz)')}
                value={form.fStopText}
                onChange={(v) => set({ fStopText: v })}
                invalid={fStop === null}
                disabled={running}
              />
              <div className="field">
                <label className="field-label" htmlFor="sweep-ppd">
                  {t('Points/decade')}
                </label>
                <select
                  id="sweep-ppd"
                  className="text-input scope-select"
                  value={form.ppd}
                  disabled={running}
                  onChange={(e) => set({ ppd: Number(e.target.value) })}
                >
                  {PPD.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <NumberField
                id="sweep-amplitude"
                label={t('Amplitude (V)')}
                value={form.ampText}
                onChange={(v) => set({ ampText: v })}
                invalid={amp === null}
                disabled={running}
              />
            </>
          )}
        </div>

        <div
          className="bode-plot-card"
          style={{ background: theme.scope.card, color: theme.scope.text }}
        >
          {style === 'montecarlo' && results.length > 0 && (
            <div className="bode-legend" aria-hidden>
              <span className="bode-key" style={{ color: sc.nominal }}>
                {t('Nominal')}
              </span>
              <span className="bode-key" style={{ color: sc.spread }}>
                {`${t('Runs')} (${Math.max(0, results.length - 1)})`}
              </span>
            </div>
          )}
          <canvas
            ref={canvas}
            className="bode-canvas"
            data-testid="sweep-canvas"
            role="img"
            aria-label={t('Sweep results')}
            onPointerMove={(e) => onPointer(e.clientX)}
            onPointerDown={(e) => onPointer(e.clientX)}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse') setCursor(null);
            }}
          />
          <div className="sweep-readout" data-testid="sweep-readout">
            {sweep === null || results.length === 0 ? (
              <span className="bode-readout-label">
                {t('Pick what to vary and what to measure, then Run.')}
              </span>
            ) : (
              <>
                <div className="sweep-readout-head">
                  <span className="bode-readout-label">
                    {cursor === null ? t('Point at the plot to read values.') : t('Cursor')}
                  </span>{' '}
                  {cursor !== null &&
                    (isAc ? getFixedUnitText(cursor, 'Hz') : getFixedUnitText(cursor, 's'))}
                </div>
                {style === 'values' ? (
                  <div
                    className="sweep-runs-list"
                    style={columns(labelWidth + 3 + (isAc ? 21 : 11))}
                  >
                    {results.map((r, i) => {
                      const ac = isAc && cursor !== null ? acAt([r], cursor)[0] : null;
                      const v = !isAc && cursor !== null ? valueAt(sweep.times, r.y, cursor) : null;
                      return (
                        <span key={i} className="sweep-run" data-testid="sweep-run-row">
                          <span className="bode-key" style={{ color: runColor(theme, i) }}>
                            {r.spec.label.padEnd(labelWidth)}
                          </span>
                          {isAc
                            ? ac !== null && ac !== undefined
                              ? ` ${fmtDb(ac.gainDb)} ${fmtDeg(ac.phaseDeg)}`
                              : blank(21)
                            : ` ${fmtV(v)}`}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  cursor !== null && <SpreadReadout sweep={sweep} cursor={cursor} fmtV={fmtV} />
                )}
              </>
            )}
          </div>
        </div>

        {sweep !== null && (
          <div className="bode-status" data-testid="sweep-status">
            <progress className="bode-progress" max={1} value={sweep.progress} />
            <span className="bode-status-text">
              {`${String(done).padStart(String(total).length)}/${total} ${t('runs')}`}
            </span>
          </div>
        )}
        {error !== null && (
          <p className="dialog-problem" role="alert" data-testid="sweep-error">
            {error}
          </p>
        )}

        <div className="dialog-buttons">
          <button
            type="button"
            className="button"
            disabled={sweep === null || results.length === 0}
            data-testid="sweep-csv"
            onClick={() => sweep !== null && download('sweep.csv', sweepCsv(sweep), 'text/csv')}
          >
            <Icon name="download" size={18} /> {t('Export CSV')}
          </button>
          <button type="button" className="button" onClick={() => openDialog(null)}>
            {t('Close')}
          </button>
          {running ? (
            <button
              type="button"
              className="button button-primary"
              data-testid="sweep-stop"
              onClick={stop}
            >
              <Icon name="pause" size={18} /> {t('Stop')}
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary"
              disabled={!ok}
              data-testid="sweep-run"
              onClick={start}
            >
              <Icon name="play" size={18} /> {t('Run')}
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}

/** Readout columns as wide as their fixed-width text, as many as fit. */
const columns = (chars: number, most = 0): CSSProperties => ({
  gridTemplateColumns: `repeat(auto-fill, minmax(${chars}ch, 1fr))`,
  ...(most > 0 ? { maxWidth: `${most * (chars + 3)}ch` } : {}),
});

/** Monte Carlo at the cursor: the nominal value and the spread's min, mean and max. */
function SpreadReadout(props: {
  sweep: MultiRun;
  cursor: number;
  fmtV: (v: number | null) => string;
}) {
  const { sweep, cursor, fmtV } = props;
  const res = sweep.results.filter((r) => r.y.length > 0 || r.points.length > 0);
  const nominal = res.find((r) => r.spec.nominal);
  if (sweep.measure.kind === 'ac') {
    const at = acAt(res, cursor);
    const g = spread(at.map((v) => v?.gainDb ?? null));
    const p = spread(at.map((v) => v?.phaseDeg ?? null));
    const n = nominal !== undefined ? acAt([nominal], cursor)[0] : null;
    const row = (label: string, gain: number | undefined, phase: number | undefined) => (
      <span className="sweep-run">
        <span className="bode-readout-label">{label.padEnd(8)}</span>
        {gain === undefined || phase === undefined ? blank(21) : ` ${fmtDb(gain)} ${fmtDeg(phase)}`}
      </span>
    );
    return (
      <div className="sweep-runs-list" style={columns(31, 2)} data-testid="sweep-spread">
        {row(t('Nominal'), n?.gainDb, n?.phaseDeg)}
        {row(t('Mean'), g?.mean, p?.mean)}
        {row(t('Min'), g?.min, p?.min)}
        {row(t('Max'), g?.max, p?.max)}
      </div>
    );
  }
  const s = spread(res.map((r) => valueAt(sweep.times, r.y, cursor)));
  const n = nominal !== undefined ? valueAt(sweep.times, nominal.y, cursor) : null;
  const row = (label: string, v: number | null | undefined) => (
    <span className="sweep-run">
      <span className="bode-readout-label">{label.padEnd(8)}</span> {fmtV(v ?? null)}
    </span>
  );
  return (
    <div className="sweep-runs-list" style={columns(20, 2)} data-testid="sweep-spread">
      {row(t('Nominal'), n)}
      {row(t('Mean'), s?.mean)}
      {row(t('Min'), s?.min)}
      {row(t('Max'), s?.max)}
    </div>
  );
}

/** A Material segmented button: one choice of two or three. */
function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: [T, string][];
  disabled: boolean;
  testId: string;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={props.label}
      data-testid={props.testId}
    >
      {props.options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={props.value === v}
          className="segmented-button"
          data-selected={props.value === v || undefined}
          disabled={props.disabled}
          data-testid={`${props.testId}-${v}`}
          onClick={() => props.onChange(v)}
        >
          {props.value === v && <Icon name="check" size={16} />}
          {text}
        </button>
      ))}
    </div>
  );
}
