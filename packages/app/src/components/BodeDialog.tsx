// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import {
  VoltageElm,
  getFixedUnitText,
  parseUnits,
  type CircuitElm,
} from '@circuitjs-next/elements';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  BodeSweep,
  bodeCsv,
  cutoffFrequencies,
  defaultAmplitude,
  interpolate,
  isBodeOutput,
  isBodeSource,
  type BodeSettings,
} from '../analysis/bode.ts';
import { bodeLayout, drawBode, freqAtX } from '../analysis/bodePlot.ts';
import { elementNames, outputRank } from '../analysis/names.ts';
import { download, openDialog } from '../commands.ts';
import { t } from '../i18n.ts';
import { controller } from '../SimController.ts';
import { shownTheme, useApp } from '../store.ts';
import { Shell } from './DialogShell.tsx';
import { Icon } from './Icon.tsx';

/** The last sweep, kept while the dialog is closed so reopening shows it again. */
let last: { settings: BodeSettings; sweep: BodeSweep } | null = null;
/** Element the dialog should start from (context menu), or null. */
let request: CircuitElm | null = null;

/** Open the AC analysis dialog; `elm` becomes the input or output if it can be one. */
export function openBode(elm: CircuitElm | null = null): void {
  request = elm;
  openDialog('bode');
}

export function canBode(elm: CircuitElm): boolean {
  return isBodeSource(elm) || isBodeOutput(elm);
}

const PPD = [5, 10, 20, 50];
/** Simulation time per animation frame for the sweep, in ms. */
const SLICE_MS = 12;
/** Below this everywhere the output is numerical noise, not a response. */
const QUIET_DB = -100;

const fmtFreq = (f: number): string => getFixedUnitText(f, 'Hz');
const fmtDb = (v: number): string =>
  Number.isFinite(v) ? `${v.toFixed(2).padStart(8)} dB` : `${'-∞'.padStart(8)} dB`;
const fmtDeg = (v: number): string => `${v.toFixed(1).padStart(7)}°`;

export function readPositive(text: string): number | null {
  try {
    const v = parseUnits(text.trim().replace(/hz$/i, '').replace(/v$/i, '').replace(/[µμ]/, 'u'));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export const shortNum = (v: number): string =>
  getFixedUnitText(v, '')
    .trim()
    .replace(/\.?0+(?=\s|$)/, '')
    .replace(/\s+/g, '');

export function BodeDialog() {
  const els = controller.circuit.elements;
  const theme = useApp(shownTheme);
  const [, refresh] = useReducer((n: number) => n + 1, 0);

  const sources = els.filter(isBodeSource);
  const outputs = els
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => isBodeOutput(e))
    .sort((a, b) => outputRank(a.e) - outputRank(b.e) || a.i - b.i);
  const names = elementNames(els);

  const [settings, setSettings] = useState<BodeSettings>(() => initialSettings(els));
  const [fromText, setFromText] = useState(() => shortNum(settings.fStart));
  const [toText, setToText] = useState(() => shortNum(settings.fStop));
  const [ampText, setAmpText] = useState(() => shortNum(settings.amplitude));
  const [sweep, setSweep] = useState<BodeSweep | null>(() =>
    last !== null && sameElements(last.settings, settings) ? last.sweep : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const running = sweep !== null && sweep.state === 'running';

  const fStart = readPositive(fromText);
  const fStop = readPositive(toText);
  const amplitude = readPositive(ampText);
  const rangeOk = fStart !== null && fStop !== null && fStop > fStart * 1.01;
  const ok =
    rangeOk && amplitude !== null && settings.source >= 0 && settings.output >= 0 && !running;

  const plotStart = sweep !== null ? (sweep.freqs[0] ?? 1) : (fStart ?? 10);
  const plotStop = sweep !== null ? (sweep.freqs[sweep.freqs.length - 1] ?? 10) : (fStop ?? 1e5);
  const points = sweep?.points ?? [];
  const cutoffs =
    sweep !== null && sweep.state === 'done' && points.some((p) => p.gainDb > QUIET_DB)
      ? cutoffFrequencies(points)
      : [];

  // run the sweep a slice per frame while the dialog is open
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

  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0 });
  useEffect(() => {
    const c = canvas.current;
    if (c === null) return;
    // the card's content width (its padding is 8px a side)
    const w = Math.max(200, (c.parentElement?.clientWidth ?? 616) - 16);
    const h = w < 480 ? 300 : 360;
    const dpr = window.devicePixelRatio || 1;
    size.current = { w, h };
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
    if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
    const g = c.getContext('2d');
    if (g === null) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBode(g, w, h, { points, fStart: plotStart, fStop: plotStop, cutoffs, cursor, theme });
  });

  const start = (): void => {
    if (!ok || fStart === null || fStop === null || amplitude === null) return;
    const s: BodeSettings = { ...settings, fStart, fStop, amplitude };
    setError(null);
    setCursor(null);
    try {
      const sw = new BodeSweep(controller.saveText(), s);
      last = { settings: s, sweep: sw };
      setSettings(s);
      setSweep(sw);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const stop = (): void => {
    if (sweep !== null && sweep.state === 'running') sweep.state = 'done';
    refresh();
  };

  const pick = (key: 'source' | 'output', i: number): void => {
    const next = { ...settings, [key]: i };
    if (key === 'source') {
      const e = els[i];
      if (e !== undefined && isBodeSource(e)) setAmpText(shortNum(defaultAmplitude(e)));
    }
    setSettings(next);
  };

  const onPointer = (clientX: number): void => {
    const c = canvas.current;
    if (c === null || points.length === 0) return;
    const r = c.getBoundingClientRect();
    const l = bodeLayout(size.current.w, size.current.h, plotStart, plotStop);
    const x = clientX - r.left;
    setCursor(x < l.left || x > l.right ? null : freqAtX(l, x));
  };

  // the readout: under the pointer, else at the -3 dB point
  const readF = cursor ?? cutoffs[0] ?? null;
  const readV = readF !== null ? interpolate(points, readF) : null;
  const readLabel = cursor !== null ? t('Cursor') : t('−3 dB at');
  const done = points.length;
  const total = sweep?.freqs.length ?? 0;
  const unsettled = points.filter((p) => !p.settled).length;
  const quiet =
    sweep !== null &&
    sweep.state === 'done' &&
    points.length > 0 &&
    cutoffs.length === 0 &&
    points.every((p) => !(p.gainDb > QUIET_DB));

  return (
    <Shell
      title={t('AC analysis (Bode plot)')}
      description={t(
        'Plays a sine at each frequency on a copy of the circuit and measures the output. The running circuit is not touched.',
      )}
      wide
      className="bode-dialog-content"
    >
      <div className="bode-dialog" data-testid="bode-dialog">
        {sources.length === 0 ? (
          <p className="dialog-problem" data-testid="bode-no-source">
            {t('Add a voltage source to drive the circuit first.')}
          </p>
        ) : null}
        <div className="bode-form">
          <div className="field">
            <label className="field-label" htmlFor="bode-source">
              {t('Input source')}
            </label>
            <select
              id="bode-source"
              className="text-input scope-select"
              value={settings.source}
              disabled={running}
              data-testid="bode-source"
              onChange={(e) => pick('source', Number(e.target.value))}
            >
              {settings.source < 0 && <option value={-1}>{t('None')}</option>}
              {sources.map((e) => (
                <option key={els.indexOf(e)} value={els.indexOf(e)}>
                  {names.get(e)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="bode-output">
              {t('Output')}
            </label>
            <select
              id="bode-output"
              className="text-input scope-select"
              value={settings.output}
              disabled={running}
              data-testid="bode-output"
              onChange={(e) => pick('output', Number(e.target.value))}
            >
              {settings.output < 0 && <option value={-1}>{t('None')}</option>}
              {outputs
                .filter(({ i }) => i !== settings.source)
                .map(({ e, i }) => (
                  <option key={i} value={i}>
                    {names.get(e)}
                    {e.getPostCount() === 2 && outputRank(e) > 0 ? ` (${t('across')})` : ''}
                  </option>
                ))}
            </select>
          </div>
          <NumberField
            id="bode-from"
            label={t('From (Hz)')}
            value={fromText}
            onChange={setFromText}
            invalid={fStart === null || !rangeOk}
            disabled={running}
          />
          <NumberField
            id="bode-to"
            label={t('To (Hz)')}
            value={toText}
            onChange={setToText}
            invalid={fStop === null || !rangeOk}
            disabled={running}
          />
          <div className="field">
            <label className="field-label" htmlFor="bode-ppd">
              {t('Points/decade')}
            </label>
            <select
              id="bode-ppd"
              className="text-input scope-select"
              value={settings.pointsPerDecade}
              disabled={running}
              data-testid="bode-ppd"
              onChange={(e) =>
                setSettings({ ...settings, pointsPerDecade: Number(e.target.value) })
              }
            >
              {PPD.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <NumberField
            id="bode-amplitude"
            label={t('Amplitude (V)')}
            value={ampText}
            onChange={setAmpText}
            invalid={amplitude === null}
            disabled={running}
          />
        </div>

        <div
          className="bode-plot-card"
          style={{ background: theme.scope.card, color: theme.scope.text }}
        >
          <div className="bode-legend" aria-hidden>
            <span className="bode-key" style={{ color: theme.scope.traces[0] ?? theme.scope.text }}>
              {t('Gain')}
            </span>
            <span
              className="bode-key"
              style={{ color: theme.scope.traces[1] ?? theme.scope.current }}
            >
              {t('Phase')}
            </span>
            {cutoffs.length > 0 && (
              <span className="bode-key bode-key-dashed" style={{ color: theme.scope.trigger }}>
                −3 dB
              </span>
            )}
          </div>
          <canvas
            ref={canvas}
            className="bode-canvas"
            data-testid="bode-canvas"
            role="img"
            aria-label={t('Bode plot')}
            onPointerMove={(e) => onPointer(e.clientX)}
            onPointerDown={(e) => onPointer(e.clientX)}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse') setCursor(null);
            }}
          />
          <div className="bode-readout" data-testid="bode-readout">
            {readF !== null && readV !== null ? (
              <>
                <span className="bode-readout-pair">
                  <span className="bode-readout-label">{readLabel}</span> {fmtFreq(readF)}
                </span>
                <span className="bode-readout-pair">
                  <span className="bode-readout-label">{t('Gain')}</span> {fmtDb(readV.gainDb)}
                </span>
                <span className="bode-readout-pair">
                  <span className="bode-readout-label">{t('Phase')}</span> {fmtDeg(readV.phaseDeg)}
                </span>
              </>
            ) : (
              <span className="bode-readout-label">
                {sweep === null
                  ? t('Pick an input and an output, then Run.')
                  : t('Point at the plot to read gain and phase.')}
              </span>
            )}
          </div>
        </div>

        {sweep !== null && (
          <div className="bode-status" data-testid="bode-status">
            <progress className="bode-progress" max={total} value={done} />
            <span className="bode-status-text">
              {running
                ? `${String(done).padStart(String(total).length)}/${total}  ${fmtFreq(
                    sweep.freqs[Math.min(done, total - 1)] ?? 0,
                  )}`
                : `${done}/${total}`}
            </span>
            {quiet && (
              <span className="bode-status-note" data-testid="bode-quiet">
                {t('The output barely responds. Is it connected to the input?')}
              </span>
            )}
            {unsettled > 0 && (
              <span className="bode-status-note">
                {t('Hollow points did not settle.')} ({unsettled})
              </span>
            )}
          </div>
        )}
        {error !== null && (
          <p className="dialog-problem" role="alert" data-testid="bode-error">
            {error}
          </p>
        )}

        <div className="dialog-buttons">
          <button
            type="button"
            className="button"
            disabled={points.length === 0}
            data-testid="bode-csv"
            onClick={() => download('bode.csv', bodeCsv(points), 'text/csv')}
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
              data-testid="bode-stop"
              onClick={stop}
            >
              <Icon name="pause" size={18} /> {t('Stop')}
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary"
              disabled={!ok}
              data-testid="bode-run"
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

export function NumberField(props: {
  id: string;
  label: string;
  value: string;
  invalid: boolean;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        className="text-input field-input"
        value={props.value}
        spellCheck={false}
        disabled={props.disabled}
        data-invalid={props.invalid || undefined}
        data-testid={props.id}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

/** Start from the context menu's element, else the last run, else the first sensible pair. */
function initialSettings(els: readonly CircuitElm[]): BodeSettings {
  const base: BodeSettings = last?.settings ?? {
    source: -1,
    output: -1,
    fStart: 10,
    fStop: 100000,
    pointsPerDecade: 10,
    amplitude: 1,
  };
  const s = { ...base };
  const valid = (i: number, test: (e: CircuitElm) => boolean): boolean => {
    const e = els[i];
    return e !== undefined && test(e);
  };
  if (!valid(s.source, isBodeSource)) s.source = -1;
  if (!valid(s.output, isBodeOutput) || s.output === s.source) s.output = -1;
  const req = request;
  request = null;
  const selected = req ?? els.find((e) => e.selected) ?? null;
  if (selected !== null) {
    const i = els.indexOf(selected);
    if (isBodeSource(selected)) s.source = i;
    else if (isBodeOutput(selected)) s.output = i;
  }
  if (s.source < 0) {
    const ac = els.findIndex((e) => isBodeSource(e) && e.waveform === VoltageElm.WF_AC);
    s.source = ac >= 0 ? ac : els.findIndex(isBodeSource);
  }
  if (s.output < 0 || s.output === s.source) {
    const ranked = els
      .map((e, i) => ({ e, i }))
      .filter(({ e, i }) => isBodeOutput(e) && i !== s.source && !isBodeSource(e))
      .sort((a, b) => outputRank(a.e) - outputRank(b.e) || a.i - b.i);
    s.output = ranked[0]?.i ?? -1;
  }
  const src = els[s.source];
  if (
    src !== undefined &&
    isBodeSource(src) &&
    (last === null || s.source !== last.settings.source)
  )
    s.amplitude = defaultAmplitude(src);
  return s;
}

function sameElements(a: BodeSettings, b: BodeSettings): boolean {
  return a.source === b.source && a.output === b.output;
}
