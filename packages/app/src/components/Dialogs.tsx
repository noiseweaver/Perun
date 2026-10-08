// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Save and export dialogs after CircuitJS1 ExportAsLocalFileDialog, ExportAsUrlDialog,
// ExportAsTextDialog, ImportFromTextDialog, ShortcutsDialog and the time step fields of EditOptions
// (src/com/lushprojects/circuitjs1/client/, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.

import { getUnitText, parseUnits } from '@circuitjs-next/elements';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import {
  UPSTREAM_PAGE,
  circuitLink,
  copyText,
  defaultFileName,
  openDialog,
  pageBase,
  saveToFile,
} from '../commands.ts';
import { paletteGroups } from '../editor/catalog.ts';
import { controller } from '../SimController.ts';
import { useApp } from '../store.ts';
import { themeLink } from '../themes.ts';
import { AboutDialog } from './AboutDialog.tsx';
import { FeedbackDialog } from './FeedbackDialog.tsx';
import { WhatsNewDialog } from './WhatsNewDialog.tsx';
import { BodeDialog } from './BodeDialog.tsx';
import { SweepDialog } from './SweepDialog.tsx';
import { ExportImageDialog, PartsListDialog, ScopeCsvDialog } from './ExportDialogs.tsx';
import { Shell } from './DialogShell.tsx';
import { ScopePropertiesDialog } from './ScopeDialog.tsx';
import { SliderDialog } from './SliderDialog.tsx';
import { ModelDialog } from './ModelDialog.tsx';
import { ParamsDialog } from './ParamsDialog.tsx';
import { SubcircuitDialog, SubcircuitManagerDialog } from './SubcircuitDialog.tsx';
import { ThemeEditorDialog, ThemesDialog } from './ThemeDialogs.tsx';
import { t } from '../i18n.ts';

function SaveDialog() {
  const [name, setName] = useState(defaultFileName);
  return (
    <Shell
      title={t('Save circuit')}
      description={t("Downloads the circuit in CircuitJS's file format.")}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveToFile(name);
          openDialog(null);
        }}
      >
        <input
          className="text-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
          aria-label={t('File name')}
          data-testid="save-name"
        />
        <div className="dialog-buttons">
          <Dialog.Close asChild>
            <button type="button" className="button">
              {t('Cancel')}
            </button>
          </Dialog.Close>
          <button type="submit" className="button button-primary" data-testid="save-ok">
            {t('Save')}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function LinkRow(props: { label: string; url: string; testId: string }) {
  return (
    <div className="link-row">
      <span className="field-label">{props.label}</span>
      <div className="link-row-line">
        <input
          className="text-input"
          readOnly
          value={props.url}
          aria-label={`${props.label} link`}
          onFocus={(e) => e.currentTarget.select()}
          data-testid={props.testId}
        />
        <button type="button" className="button" onClick={() => void copyText(props.url, 'Link')}>
          {t('Copy')}
        </button>
      </div>
    </div>
  );
}

function ExportLinkDialog() {
  const [withTheme, setWithTheme] = useState(false);
  const [themed, setThemed] = useState<string | null>(null);
  const plain = circuitLink(pageBase());
  const upstream = circuitLink(UPSTREAM_PAGE);
  useEffect(() => {
    if (!withTheme) return;
    let live = true;
    const base = pageBase();
    void themeLink(useApp.getState().theme, base, plain.slice(base.length + 1)).then((l) => {
      if (live) setThemed(l);
    });
    return () => {
      live = false;
    };
  }, [withTheme, plain]);
  const here = withTheme ? (themed ?? plain) : plain;
  return (
    <Shell
      title={t('Export link')}
      description={t('Anyone with the link sees this circuit. Both links carry the whole circuit.')}
      wide
    >
      <LinkRow label="This app" url={here} testId="link-here" />
      <label className="field field-check link-theme-check">
        <input
          type="checkbox"
          className="checkbox"
          checked={withTheme}
          onChange={(e) => setWithTheme(e.target.checked)}
          data-testid="link-with-theme"
        />
        <span>
          Include my theme ({useApp.getState().theme.meta.name}). It opens as a preview the other
          person can apply or dismiss.
        </span>
      </label>
      <LinkRow label="Falstad CircuitJS" url={upstream} testId="link-upstream" />
      {here.length > 2000 && (
        <p className="dialog-problem">
          {t('These links are longer than 2000 characters and may not work in some browsers.')}
        </p>
      )}
      <div className="dialog-buttons">
        <Dialog.Close asChild>
          <button type="button" className="button button-primary">
            {t('Done')}
          </button>
        </Dialog.Close>
      </div>
    </Shell>
  );
}

function ExportTextDialog() {
  const text = controller.saveText();
  return (
    <Shell title={t('Export as text')} description={t('The circuit as CircuitJS saves it.')} wide>
      <textarea
        className="text-input text-area"
        readOnly
        value={text}
        rows={14}
        onFocus={(e) => e.currentTarget.select()}
        data-testid="export-text"
      />
      <div className="dialog-buttons">
        <button type="button" className="button" onClick={() => void copyText(text, 'Text')}>
          {t('Copy')}
        </button>
        <Dialog.Close asChild>
          <button type="button" className="button button-primary">
            {t('Done')}
          </button>
        </Dialog.Close>
      </div>
    </Shell>
  );
}

function ImportTextDialog() {
  const [text, setText] = useState('');
  return (
    <Shell
      title={t('Import from text')}
      description={t('Paste a circuit in either CircuitJS format (XML or the older text lines).')}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (controller.load(text, 'Imported circuit', true, true)) openDialog(null);
        }}
      >
        <textarea
          className="text-input text-area"
          value={text}
          rows={14}
          autoFocus
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          aria-label={t('Circuit text')}
          data-testid="import-text"
        />
        <div className="dialog-buttons">
          <Dialog.Close asChild>
            <button type="button" className="button">
              {t('Cancel')}
            </button>
          </Dialog.Close>
          <button type="submit" className="button button-primary" data-testid="import-ok">
            {t('Import')}
          </button>
        </div>
      </form>
    </Shell>
  );
}

/** Reads "5u", "10µ", "1e-6"; null for anything else or a value that is not positive. */
function readTime(text: string): number | null {
  const s = text.trim().replace(/s$/, '').replace(/[µμ]/, 'u');
  try {
    const v = parseUnits(s);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** A temperature in °C, above absolute zero and below 1000; null for anything else. */
function readTemperature(text: string): number | null {
  const s = text.trim().replace(/\s*°?\s*C$/i, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const v = Number(s);
  return v > -273.15 && v <= 1000 ? v : null;
}

const shortTime = (v: number): string => getUnitText(v, 's').replace(/ ?s$/, '').replace(' ', '');

function SimSettingsDialog() {
  const sim = controller.circuit.sim;
  const [step, setStep] = useState(() => shortTime(sim.maxTimeStep));
  const [adjust, setAdjust] = useState(sim.adjustTimeStep);
  const [min, setMin] = useState(() => shortTime(sim.minTimeStep));
  const [temp, setTemp] = useState(() => String(sim.temperature));
  const [ramp, setRamp] = useState(sim.temperatureRamp !== null);
  const [rampTo, setRampTo] = useState(() => String(sim.temperatureRamp?.to ?? 85));
  const [rampOver, setRampOver] = useState(() => shortTime(sim.temperatureRamp?.duration ?? 0.1));
  const [heating, setHeating] = useState(sim.selfHeating);
  const stepValue = readTime(step);
  const minValue = adjust ? readTime(min) : sim.minTimeStep;
  const tempValue = readTemperature(temp);
  const rampToValue = ramp ? readTemperature(rampTo) : 0;
  const rampOverValue = ramp ? readTime(rampOver) : 0;
  const ok =
    stepValue !== null &&
    minValue !== null &&
    tempValue !== null &&
    rampToValue !== null &&
    rampOverValue !== null;
  return (
    <Shell
      title={t('Simulation settings')}
      description={t('A smaller time step is more accurate but makes the simulation run slower.')}
    >
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          controller.setTimeStep(stepValue, adjust, minValue, {
            temperature: tempValue,
            ramp: ramp ? { to: rampToValue, duration: rampOverValue } : null,
            selfHeating: heating,
          });
          openDialog(null);
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="sim-time-step">
            {t('Time step size (s)')}
          </label>
          <input
            id="sim-time-step"
            className="text-input field-input"
            value={step}
            autoFocus
            spellCheck={false}
            onChange={(e) => setStep(e.target.value)}
            data-testid="sim-time-step"
          />
          {stepValue === null && (
            <span className="field-error">{t('Enter a positive time, like 5u or 1e-6.')}</span>
          )}
        </div>
        <label className="field field-check">
          <input
            type="checkbox"
            className="checkbox"
            checked={adjust}
            onChange={(e) => setAdjust(e.target.checked)}
          />
          <span>{t('Auto-adjust time step')}</span>
        </label>
        {adjust && (
          <div className="field">
            <label className="field-label" htmlFor="sim-min-step">
              {t('Minimum time step size (s)')}
            </label>
            <input
              id="sim-min-step"
              className="text-input field-input"
              value={min}
              spellCheck={false}
              onChange={(e) => setMin(e.target.value)}
            />
            {minValue === null && (
              <span className="field-error">{t('Enter a positive time, like 50p.')}</span>
            )}
          </div>
        )}
        <div className="field">
          <label className="field-label" htmlFor="sim-temperature">
            {t('Temperature (°C)')}
          </label>
          <input
            id="sim-temperature"
            className="text-input field-input"
            value={temp}
            // not "decimal": the iPhone number pad has no minus key, and temperatures go below 0
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setTemp(e.target.value)}
            data-testid="sim-temperature"
          />
          {tempValue === null ? (
            <span className="field-error">
              {t('Enter a temperature from -273 to 1000 °C, like 27 or -20.')}
            </span>
          ) : (
            <span className="field-hint">
              {t(
                'Diodes, transistors and resistors with a temperature coefficient follow it. Parts are specified at 27 °C, the SPICE default.',
              )}
            </span>
          )}
        </div>
        <label className="field field-check">
          <input
            type="checkbox"
            className="checkbox"
            checked={ramp}
            onChange={(e) => setRamp(e.target.checked)}
            data-testid="sim-ramp"
          />
          <span>{t('Ramp the temperature while it runs')}</span>
        </label>
        {ramp && (
          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="sim-ramp-to">
                {t('Ramp to (°C)')}
              </label>
              <input
                id="sim-ramp-to"
                className="text-input field-input"
                value={rampTo}
                inputMode="text"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setRampTo(e.target.value)}
                data-testid="sim-ramp-to"
              />
              {rampToValue === null && (
                <span className="field-error">{t('Enter a temperature, like 85.')}</span>
              )}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="sim-ramp-over">
                {t('Over (s)')}
              </label>
              <input
                id="sim-ramp-over"
                className="text-input field-input"
                value={rampOver}
                spellCheck={false}
                onChange={(e) => setRampOver(e.target.value)}
                data-testid="sim-ramp-over"
              />
              {rampOverValue === null && (
                <span className="field-error">{t('Enter a time, like 100m.')}</span>
              )}
            </div>
          </div>
        )}
        <label className="field field-check">
          <input
            type="checkbox"
            className="checkbox"
            checked={heating}
            onChange={(e) => setHeating(e.target.checked)}
            data-testid="sim-self-heating"
          />
          <span>{t('Self-heating')}</span>
        </label>
        {heating && (
          <span className="field-hint">
            {t(
              'Diodes, transistors, MOSFETs and resistors heat from their own power and cool to the ambient temperature. Set how fast in each part’s properties.',
            )}
          </span>
        )}
        <div className="dialog-buttons">
          <Dialog.Close asChild>
            <button type="button" className="button">
              {t('Cancel')}
            </button>
          </Dialog.Close>
          <button
            type="submit"
            className="button button-primary"
            disabled={!ok}
            data-testid="sim-settings-ok"
          >
            {t('Apply')}
          </button>
        </div>
      </form>
    </Shell>
  );
}

const MOD = typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl+';

const EDIT_KEYS: [string, string][] = [
  ['Click', 'Select; shift-click adds or removes'],
  ['Drag on empty space', 'Select an area'],
  ['Drag an element', 'Move the selection'],
  ['Drag an end post', 'Stretch the element'],
  [`${MOD}drag`, 'Move one end; on a wire, click to split it'],
  ['Alt+drag, middle drag', 'Pan the view'],
  ['Wheel', 'Zoom'],
  ['Double-click, Enter', 'Edit properties'],
  ['] / [', 'Select the next / previous element'],
  ['Shift+F10, Menu key', 'Menu for the selection'],
  ['Arrow keys', 'Move the selection'],
  ['Delete, Backspace', 'Delete'],
  ['Esc', 'Stop placing, clear selection'],
  ['Space', 'Select mode'],
  [`${MOD}Z / ${MOD}Y`, 'Undo / redo'],
  [`${MOD}X / ${MOD}C / ${MOD}V`, 'Cut / copy / paste'],
  [`${MOD}D`, 'Duplicate'],
  [`${MOD}A`, 'Select all'],
  [`${MOD}S`, 'Save'],
  [`${MOD}O`, 'Open file'],
];

function ShortcutsDialog() {
  const elementKeys = paletteGroups()
    .flatMap((g) => g.items)
    .filter((it) => it.shortcut !== null);
  return (
    <Shell title={t('Keyboard shortcuts')} wide>
      <div className="shortcut-columns">
        <table className="shortcut-table">
          <tbody>
            {EDIT_KEYS.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="shortcut-table">
          <tbody>
            {elementKeys.map((it) => (
              <tr key={it.className}>
                <td>
                  <kbd>{it.shortcut}</kbd>
                </td>
                <td>{it.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dialog-buttons">
        <Dialog.Close asChild>
          <button type="button" className="button button-primary">
            {t('Done')}
          </button>
        </Dialog.Close>
      </div>
    </Shell>
  );
}

/** Installing on iPhone and iPad, where Safari has no install prompt. */
function InstallDialog() {
  return (
    <Shell
      title={t('Install app')}
      description={t(
        'Add the simulator to your home screen. It then opens full screen and works offline.',
      )}
    >
      <ol className="install-steps">
        <li>
          Tap the <strong>{t('Share')}</strong> button in Safari&apos;s toolbar.
        </li>
        <li>
          Choose <strong>{t('Add to Home Screen')}</strong>, then <strong>{t('Add')}</strong>.
        </li>
      </ol>
      <div className="dialog-buttons">
        <Dialog.Close asChild>
          <button type="button" className="button button-primary">
            {t('OK')}
          </button>
        </Dialog.Close>
      </div>
    </Shell>
  );
}

/** Whichever dialog the store names. */
export function Dialogs() {
  const dialog = useApp((s) => s.dialog);
  switch (dialog) {
    case 'save':
      return <SaveDialog />;
    case 'exportLink':
      return <ExportLinkDialog />;
    case 'exportText':
      return <ExportTextDialog />;
    case 'importText':
      return <ImportTextDialog />;
    case 'shortcuts':
      return <ShortcutsDialog />;
    case 'simSettings':
      return <SimSettingsDialog />;
    case 'params':
      return <ParamsDialog />;
    case 'scopeProperties':
      return <ScopePropertiesDialog />;
    case 'sliders':
      return <SliderDialog />;
    case 'model':
      return <ModelDialog />;
    case 'subcircuit':
      return <SubcircuitDialog />;
    case 'subcircuitManager':
      return <SubcircuitManagerDialog />;
    case 'about':
      return <AboutDialog />;
    case 'install':
      return <InstallDialog />;
    case 'themes':
      return <ThemesDialog />;
    case 'themeEditor':
      return <ThemeEditorDialog />;
    case 'bode':
      return <BodeDialog />;
    case 'sweep':
      return <SweepDialog />;
    case 'exportImage':
      return <ExportImageDialog />;
    case 'partsList':
      return <PartsListDialog />;
    case 'scopeCsv':
      return <ScopeCsvDialog />;
    case 'whatsNew':
      return <WhatsNewDialog />;
    case 'feedback':
      return <FeedbackDialog />;
    default:
      return null;
  }
}
