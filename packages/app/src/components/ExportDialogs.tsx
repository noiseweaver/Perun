// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Not in upstream: a schematic image (SVG or PNG) and a parts list (CSV).

import { getFixedUnitText, getUnitText, parseUnits, type CircuitElm } from '@perun/elements';
import {
  DEFAULT_SCHEMATIC,
  schematicBounds,
  schematicCanvas,
  schematicSvg,
  type MeasureText,
  type SchematicOptions,
} from '@perun/render';
import { builtinTheme, type Theme } from '@perun/theme';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import { copyText, defaultFileName, showToast } from '../commands.ts';
import { download, downloadBlob } from '../download.ts';
import { MAX_ROWS, plotColumns } from '../analysis/scopeRecord.ts';
import { partsCsv, partsList } from '../export/partsList.ts';
import { t } from '../i18n.ts';
import { controller } from '../SimController.ts';
import { shownTheme, useApp } from '../store.ts';
import { Shell } from './DialogShell.tsx';
import { Icon } from './Icon.tsx';

/** The longest side of an exported PNG, in pixels (browsers refuse much larger canvases). */
const MAX_PNG_SIDE = 8192;
const PNG_SCALES = [1, 2, 4] as const;

type Format = 'svg' | 'png';
type ThemeChoice = 'current' | 'light' | 'classic';

/** The file name the circuit was opened or saved as, without its extension. */
function baseName(): string {
  return defaultFileName().replace(/\.[^.]*$/, '') || 'circuit';
}

let measureCtx: CanvasRenderingContext2D | null = null;
const measure: MeasureText = (s, font, size) => {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (measureCtx === null) return s.length * size * 0.6;
  measureCtx.font = font;
  return measureCtx.measureText(s).width;
};

/** The elements an export covers: the selection if asked and there is one, else all. */
function exportElements(selectionOnly: boolean): CircuitElm[] {
  const els = controller.circuit.elements;
  if (!selectionOnly) return els;
  const sel = els.filter((e) => e.selected);
  return sel.length > 0 ? sel : els;
}

export function ExportImageDialog() {
  const userTheme = useApp(shownTheme);
  const settings = useApp((s) => s.settings);
  const display = useApp((s) => s.display);
  const hasSelection = useMemo(() => controller.circuit.elements.some((e) => e.selected), []);
  const [format, setFormat] = useState<Format>('svg');
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>('light');
  const [voltageColors, setVoltageColors] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [scale, setScale] = useState<number>(2);

  const theme: Theme =
    themeChoice === 'current' ? userTheme : (builtinTheme(themeChoice) ?? userTheme);
  const opts: SchematicOptions = {
    ...DEFAULT_SCHEMATIC,
    voltageColors,
    voltageRange: controller.circuit.options.voltageRange,
    showValues: display.showValues,
    euroResistors: settings.euroResistors,
    euroGates: settings.euroGates,
    showOhm: settings.showOhm,
    textFont: settings.textFont,
    junctionDots: settings.junctionDots,
    valueScale: settings.valueSize,
    transparent,
  };
  const elements = exportElements(selectionOnly);
  const bounds = schematicBounds(elements);
  const w = bounds === null ? 0 : bounds.x2 - bounds.x1;
  const h = bounds === null ? 0 : bounds.y2 - bounds.y1;
  // a PNG too large for the browser is drawn at the largest scale that fits
  const pngScale = Math.min(scale, MAX_PNG_SIDE / Math.max(w, h, 1));
  const optsKey = JSON.stringify([opts, themeChoice, selectionOnly, format, pngScale]);

  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (bounds === null) {
      setPreview(null);
      return;
    }
    if (format === 'svg') {
      const svg = schematicSvg(elements, theme, opts, measure);
      setPreview(
        svg === null ? null : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      );
    } else {
      const c = document.createElement('canvas');
      setPreview(
        schematicCanvas(c, elements, theme, opts, pngScale) ? c.toDataURL('image/png') : null,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optsKey]);

  const save = (): void => {
    const name = baseName();
    if (format === 'svg') {
      const svg = schematicSvg(elements, theme, opts, measure);
      if (svg !== null) download(`${name}.svg`, svg, 'image/svg+xml');
      return;
    }
    const c = document.createElement('canvas');
    if (!schematicCanvas(c, elements, theme, opts, pngScale)) return;
    c.toBlob((b) => {
      if (b !== null) downloadBlob(`${name}.png`, b);
      else showToast(t("Couldn't make the image"));
    }, 'image/png');
  };

  const copy = (): void => {
    if (format === 'svg') {
      const svg = schematicSvg(elements, theme, opts, measure);
      if (svg !== null) void copyText(svg, 'SVG');
      return;
    }
    const c = document.createElement('canvas');
    if (!schematicCanvas(c, elements, theme, opts, pngScale)) return;
    c.toBlob((b) => {
      if (b === null || typeof ClipboardItem === 'undefined') {
        showToast(t("Couldn't copy the image; download it instead"));
        return;
      }
      navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(
        () => showToast(t('Image copied')),
        () => showToast(t("Couldn't copy the image; download it instead")),
      );
    }, 'image/png');
  };

  const px = (v: number): string => String(Math.round(v));
  return (
    <Shell
      title={t('Export image')}
      description={t('The schematic without the grid, current dots or highlights.')}
      wide
    >
      <div className="export-form">
        <div className="field">
          <label className="field-label" htmlFor="export-format">
            {t('Format')}
          </label>
          <select
            id="export-format"
            className="text-input scope-select"
            value={format}
            data-testid="export-format"
            onChange={(e) => setFormat(e.target.value === 'png' ? 'png' : 'svg')}
          >
            <option value="svg">{t('SVG (vector)')}</option>
            <option value="png">{t('PNG (picture)')}</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="export-theme">
            {t('Colors')}
          </label>
          <select
            id="export-theme"
            className="text-input scope-select"
            value={themeChoice}
            data-testid="export-theme"
            onChange={(e) => setThemeChoice(e.target.value as ThemeChoice)}
          >
            <option value="light">{t('Light, for print')}</option>
            <option value="current">
              {t('This theme')} ({userTheme.meta.name})
            </option>
            <option value="classic">{t('Classic')}</option>
          </select>
        </div>
        {format === 'png' && (
          <div className="field">
            <label className="field-label" htmlFor="export-scale">
              {t('Size')}
            </label>
            <select
              id="export-scale"
              className="text-input scope-select"
              value={scale}
              data-testid="export-scale"
              onChange={(e) => setScale(Number(e.target.value))}
            >
              {PNG_SCALES.map((s) => (
                <option key={s} value={s}>
                  {s}× ({px(w * Math.min(s, pngScale))} × {px(h * Math.min(s, pngScale))})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="export-checks">
        <label className="field field-check">
          <input
            type="checkbox"
            className="checkbox"
            checked={voltageColors}
            data-testid="export-voltage-colors"
            onChange={(e) => setVoltageColors(e.target.checked)}
          />
          <span>{t('Color by voltage')}</span>
        </label>
        <label className="field field-check">
          <input
            type="checkbox"
            className="checkbox"
            checked={transparent}
            data-testid="export-transparent"
            onChange={(e) => setTransparent(e.target.checked)}
          />
          <span>{t('Transparent background')}</span>
        </label>
        {hasSelection && (
          <label className="field field-check">
            <input
              type="checkbox"
              className="checkbox"
              checked={selectionOnly}
              data-testid="export-selection"
              onChange={(e) => setSelectionOnly(e.target.checked)}
            />
            <span>{t('Only the selected parts')}</span>
          </label>
        )}
      </div>
      <div className="export-preview" data-checkered={transparent || undefined}>
        {preview !== null ? (
          <img src={preview} alt={t('Schematic preview')} data-testid="export-preview" />
        ) : (
          <p className="inspector-empty">{t('The circuit is empty.')}</p>
        )}
      </div>
      <div className="dialog-buttons">
        <button type="button" className="button" disabled={bounds === null} onClick={copy}>
          {t('Copy')}
        </button>
        <Dialog.Close asChild>
          <button type="button" className="button">
            {t('Close')}
          </button>
        </Dialog.Close>
        <button
          type="button"
          className="button button-primary"
          disabled={bounds === null}
          data-testid="export-download"
          onClick={save}
        >
          <Icon name="download" size={18} /> {t('Download')}
        </button>
      </div>
    </Shell>
  );
}

export function PartsListDialog() {
  const rows = useMemo(() => partsList(controller.circuit.elements), []);
  const csv = partsCsv(rows);
  const total = rows.reduce((n, r) => n + r.count, 0);
  return (
    <Shell
      title={t('Parts list')}
      description={t('Each kind of part with its value and how many the circuit uses.')}
      wide
    >
      {rows.length === 0 ? (
        <p className="inspector-empty">{t('The circuit has no parts yet.')}</p>
      ) : (
        <div className="parts-table-wrap">
          <table className="parts-table" data-testid="parts-table">
            <thead>
              <tr>
                <th className="parts-count">{t('Qty')}</th>
                <th>{t('Part')}</th>
                <th>{t('Value')}</th>
                <th>{t('Details')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="parts-count">{r.count}</td>
                  <td>{r.part}</td>
                  <td className="parts-value">{r.value}</td>
                  <td className="parts-details">{r.details}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="parts-count">{total}</td>
                <td colSpan={3}>{t('in total')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="dialog-buttons">
        <button
          type="button"
          className="button"
          disabled={rows.length === 0}
          onClick={() => void copyText(csv, 'Parts list')}
        >
          {t('Copy')}
        </button>
        <Dialog.Close asChild>
          <button type="button" className="button">
            {t('Close')}
          </button>
        </Dialog.Close>
        <button
          type="button"
          className="button button-primary"
          disabled={rows.length === 0}
          data-testid="parts-download"
          onClick={() => download(`${baseName()}-parts.csv`, csv, 'text/csv')}
        >
          <Icon name="download" size={18} /> {t('Download CSV')}
        </button>
      </div>
    </Shell>
  );
}

/** Simulated time a scope shows across its width. */
function visibleSpan(): number {
  const s = controller.csvScope;
  if (s === null) return 0;
  return controller.circuit.sim.maxTimeStep * s.speed * s.rect.width;
}

/** A time typed with or without its unit ("20 ms", "20m", "0.02"); NaN when it isn't one. */
function parseTime(text: string): number {
  const s = text.replace(/\s+/g, '').replace(/(?<=\d|[pnuμµmkMG])s$/, '');
  try {
    return parseUnits(s);
  } catch {
    return Number.NaN;
  }
}

const END_TEXT = {
  done: 'Recorded.',
  stopped: 'Stopped.',
  full: `Stopped at ${MAX_ROWS.toLocaleString('en')} rows, the most one recording keeps.`,
  reset: 'Stopped: the simulation was reset.',
} as const;

/** A scope's CSV: what is on screen, or every timestep for a stretch of simulated time. */
export function ScopeCsvDialog() {
  const scope = controller.csvScope;
  const running = useApp((s) => s.running);
  const [spanText, setSpanText] = useState(() => getUnitText(visibleSpan(), 's'));
  const span = parseTime(spanText);
  const spanOk = Number.isFinite(span) && span > 0;
  // the recorder changes as the simulation runs: look again a few times a second
  const [, tick] = useState(0);
  const rec = controller.scopeRecorder?.scope === scope ? controller.scopeRecorder : null;
  const recording = rec !== null && !rec.done;
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => tick((n) => n + 1), 200);
    return () => window.clearInterval(id);
  }, [recording]);
  if (scope === null) return null;
  const columns = plotColumns(scope, scope.visiblePlots);
  const name = baseName();
  const screen = (): void => {
    const csv = scope.exportCSV();
    if (csv !== null) download(`${name}-scope-screen.csv`, csv, 'text/csv');
  };
  const progress = rec === null ? 0 : Math.min(1, rec.elapsed / rec.duration);
  return (
    <Shell
      title={t('Export scope data')}
      description={t('Columns: time, then each plot on this scope.')}
      wide
    >
      <ul className="csv-columns" data-testid="csv-columns">
        {columns.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
      <section className="csv-section">
        <h3 className="csv-heading">{t('Full resolution')}</h3>
        <p className="dialog-description">
          {t(
            'Records every timestep from now on, for as long as you choose. The simulation has to be running.',
          )}
        </p>
        <div className="csv-record">
          <div className="field">
            <label className="field-label" htmlFor="csv-span">
              {t('Simulated time')}
            </label>
            <input
              id="csv-span"
              className="text-input field-input"
              value={spanText}
              disabled={recording}
              data-invalid={spanOk ? undefined : ''}
              data-testid="csv-span"
              onChange={(e) => setSpanText(e.target.value)}
            />
          </div>
          {recording ? (
            <button
              type="button"
              className="button"
              data-testid="csv-stop"
              onClick={() => {
                controller.stopScopeRecording();
                tick((n) => n + 1);
              }}
            >
              <Icon name="pause" size={18} /> {t('Stop')}
            </button>
          ) : (
            <button
              type="button"
              className="button"
              disabled={!spanOk || columns.length === 0}
              data-testid="csv-record"
              onClick={() => {
                controller.startScopeRecording(scope, span);
                tick((n) => n + 1);
              }}
            >
              <Icon name="play" size={18} /> {t(rec === null ? 'Record' : 'Record again')}
            </button>
          )}
        </div>
        {rec !== null && (
          <div className="csv-status" data-testid="csv-status">
            <progress className="bode-progress" max={1} value={progress} />
            <span className="csv-status-text">
              {getFixedUnitText(rec.elapsed, 's')} / {getFixedUnitText(rec.duration, 's')}
              {'  '}
              {String(rec.rows).padStart(String(MAX_ROWS).length)} {t('rows')}
            </span>
            {rec.end !== null && <span className="csv-status-note">{t(END_TEXT[rec.end])}</span>}
            {recording && !running && (
              <span className="csv-status-note">{t('Paused: press Run to record.')}</span>
            )}
          </div>
        )}
      </section>
      <div className="dialog-buttons">
        <button type="button" className="button" disabled={columns.length === 0} onClick={screen}>
          {t('On screen only')}
        </button>
        <button
          type="button"
          className="button"
          disabled={rec === null || rec.rows === 0}
          onClick={() => rec !== null && void copyText(rec.csv(), 'Data')}
        >
          {t('Copy')}
        </button>
        <Dialog.Close asChild>
          <button type="button" className="button">
            {t('Close')}
          </button>
        </Dialog.Close>
        <button
          type="button"
          className="button button-primary"
          disabled={rec === null || rec.rows === 0}
          data-testid="csv-download"
          onClick={() => rec !== null && download(`${name}-scope.csv`, rec.csv(), 'text/csv')}
        >
          <Icon name="download" size={18} /> {t('Download CSV')}
        </button>
      </div>
    </Shell>
  );
}
