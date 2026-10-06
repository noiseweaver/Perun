// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

/*
 * Theme UI (PLAN.md section 6): the library dialog, the editor with a live preview and contrast
 * warnings, and the banner a `theme=` link opens with.
 */

import {
  BUILTIN_THEMES,
  contrastWarnings,
  parseColor,
  toCss,
  type ContrastWarning,
  type Theme,
} from '@circuitjs-next/theme';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { openDialog, pageBase } from '../commands.ts';
import { SamplePreview } from '../samplePreview.ts';
import { useApp, type SavedTheme } from '../store.ts';
import {
  copyThemeLink,
  deleteTheme,
  dismissPreview,
  editTheme,
  exportThemeFile,
  keepPreview,
  saveTheme,
  selectTheme,
  userThemeId,
} from '../themes.ts';
import { Shell } from './DialogShell.tsx';
import { Icon } from './Icon.tsx';
import { t } from '../i18n.ts';

// ---- link preview ------------------------------------------------------------------------------

/** Shown while a theme from a link is previewed: keep it or go back. */
export function ThemeLinkBanner() {
  const preview = useApp((s) => s.preview);
  if (preview?.source !== 'link') return null;
  return (
    <div className="theme-banner" role="status" data-testid="theme-banner">
      <span className="theme-banner-text">
        Previewing the theme <strong>{preview.theme.meta.name}</strong> from this link
      </span>
      <div className="theme-banner-buttons">
        <button
          type="button"
          className="button"
          onClick={dismissPreview}
          data-testid="theme-banner-dismiss"
        >
          {t('Dismiss')}
        </button>
        <button
          type="button"
          className="button"
          title={t('Add it to your themes and keep your current one')}
          onClick={() => void keepPreview(false)}
          data-testid="theme-banner-save"
        >
          {t('Save')}
        </button>
        <button
          type="button"
          className="button button-primary"
          title={t('Add it to your themes and use it')}
          onClick={() => void keepPreview(true)}
          data-testid="theme-banner-apply"
        >
          {t('Apply')}
        </button>
      </div>
    </div>
  );
}

// ---- swatch ------------------------------------------------------------------------------------

/** A small picture of a theme: its canvas with the voltage colors, a dot and its accent. */
function Swatch({ theme }: { theme: Theme }) {
  const v = theme.circuit.voltage;
  return (
    <span className="theme-swatch" aria-hidden style={{ background: theme.canvas.background }}>
      <span
        className="theme-swatch-wire"
        style={{
          background: `linear-gradient(90deg, ${v.negative}, ${v.zero}, ${v.positive})`,
        }}
      />
      <span className="theme-swatch-dot" style={{ background: theme.circuit.currentDot }} />
      <span className="theme-swatch-bar" style={{ background: theme.ui.surface }}>
        <span style={{ background: theme.ui.accent }} />
      </span>
    </span>
  );
}

// ---- library -----------------------------------------------------------------------------------

function ThemeRow(props: { id: string; theme: Theme; saved: SavedTheme | null; active: boolean }) {
  const { theme, saved } = props;
  const [confirm, setConfirm] = useState(false);
  return (
    <li
      className={`theme-row${props.active ? ' theme-row-active' : ''}`}
      data-testid={`theme-row-${theme.meta.name}`}
    >
      <button
        type="button"
        className="theme-row-pick"
        aria-pressed={props.active}
        onClick={() => selectTheme(props.id)}
        title={props.active ? 'In use' : 'Use this theme'}
      >
        <Swatch theme={theme} />
        <span className="theme-row-text">
          <span className="theme-row-name">
            {theme.meta.name}
            {props.active && <Icon name="check" size={18} className="icon theme-row-check" />}
          </span>
          <span className="theme-row-desc">
            {saved ? (theme.meta.author ? `By ${theme.meta.author}` : 'Yours') : 'Built in'}
            {theme.meta.description ? ` · ${theme.meta.description}` : ''}
          </span>
        </span>
      </button>
      <div className="theme-row-actions">
        <button
          type="button"
          className="icon-button"
          aria-label={saved ? `Edit ${theme.meta.name}` : `Customize ${theme.meta.name}`}
          title={saved ? 'Edit' : 'Customize a copy'}
          onClick={() => editTheme(theme, saved?.id ?? null)}
          data-testid="theme-row-edit"
        >
          <Icon name="edit" size={20} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Copy a link to ${theme.meta.name}`}
          title={t('Copy link')}
          onClick={() => void copyThemeLink(theme, pageBase())}
          data-testid="theme-row-link"
        >
          <Icon name="link" size={20} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Export ${theme.meta.name} as a file`}
          title={t('Export file')}
          onClick={() => exportThemeFile(theme)}
          data-testid="theme-row-export"
        >
          <Icon name="download" size={20} />
        </button>
        {saved &&
          (confirm ? (
            <button
              type="button"
              className="button button-danger"
              onClick={() => void deleteTheme(saved.id)}
              onBlur={() => setConfirm(false)}
              autoFocus
              data-testid="theme-row-delete-confirm"
            >
              {t('Delete')}
            </button>
          ) : (
            <button
              type="button"
              className="icon-button"
              aria-label={`Delete ${theme.meta.name}`}
              title={t('Delete')}
              onClick={() => setConfirm(true)}
              data-testid="theme-row-delete"
            >
              <Icon name="delete" size={20} />
            </button>
          ))}
      </div>
    </li>
  );
}

export function ThemesDialog() {
  const themeId = useApp((s) => s.settings.themeId);
  const library = useApp((s) => s.library);
  return (
    <Shell
      title={t('Themes')}
      description={t('Pick a theme, customize one, or share it as a file or link.')}
      wide
    >
      <ul className="theme-list" data-testid="theme-list">
        {Object.entries(BUILTIN_THEMES).map(([id, t]) => (
          <ThemeRow key={id} id={id} theme={t} saved={null} active={themeId === id} />
        ))}
      </ul>
      <h3 className="theme-list-heading">{t('Your themes')}</h3>
      {library.length === 0 ? (
        <p className="theme-list-empty">
          {t('Themes you make, import or save from a link appear here. They stay in this browser.')}
        </p>
      ) : (
        <ul className="theme-list">
          {library.map((t) => (
            <ThemeRow
              key={t.id}
              id={userThemeId(t.id)}
              theme={t.theme}
              saved={t}
              active={themeId === userThemeId(t.id)}
            />
          ))}
        </ul>
      )}
      <div className="dialog-buttons">
        <button
          type="button"
          className="button"
          onClick={() =>
            document.querySelector<HTMLInputElement>('[data-testid="theme-file-input"]')?.click()
          }
          data-testid="themes-import"
        >
          <Icon name="upload" size={18} /> Import file
        </button>
        <button
          type="button"
          className="button"
          onClick={() => editTheme(useApp.getState().theme, null)}
          data-testid="themes-new"
        >
          <Icon name="add" size={18} /> New theme
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

// ---- editor ------------------------------------------------------------------------------------

type Path = string;

function getAt(theme: Theme, path: Path): unknown {
  let v: unknown = theme;
  for (const p of path.split('.')) v = (v as Record<string, unknown>)[p];
  return v;
}

/** A copy of `theme` with `path` set to `value`. */
function setAt(theme: Theme, path: Path, value: unknown): Theme {
  const parts = path.split('.');
  const copy = (o: unknown, i: number): unknown => {
    const key = parts[i] as string;
    const node = Array.isArray(o) ? [...(o as unknown[])] : { ...(o as Record<string, unknown>) };
    (node as Record<string, unknown>)[key] =
      i === parts.length - 1 ? value : copy((o as Record<string, unknown>)[key], i + 1);
    return node;
  };
  return copy(theme, 0) as Theme;
}

const COLOR_GROUPS: { title: string; fields: [Path, string][] }[] = [
  {
    title: 'Circuit area',
    fields: [
      ['canvas.background', 'Background'],
      ['canvas.grid', 'Grid'],
      ['canvas.gridMajor', 'Major grid'],
    ],
  },
  {
    title: 'Voltages',
    fields: [
      ['circuit.voltage.negative', 'Negative'],
      ['circuit.voltage.zero', 'Zero'],
      ['circuit.voltage.positive', 'Positive'],
    ],
  },
  {
    title: 'Elements',
    fields: [
      ['circuit.currentDot', 'Current dots'],
      ['circuit.component', 'Components'],
      ['circuit.componentMuted', 'Secondary parts'],
      ['circuit.post', 'Posts'],
      ['circuit.text', 'Values'],
      ['circuit.label', 'Labels'],
      ['circuit.selection', 'Selection'],
      ['circuit.hover', 'Hover'],
      ['circuit.badConnection', 'Bad connections'],
      ['circuit.electricField', 'Electric field'],
      ['circuit.magneticField', 'Magnetic field'],
      ['circuit.energy', 'Energy'],
    ],
  },
  {
    title: 'Scopes',
    fields: [
      ['scope.background', 'Plot'],
      ['scope.card', 'Card'],
      ['scope.grid', 'Grid'],
      ['scope.gridMajor', 'Major grid'],
      ['scope.text', 'Text'],
      ['scope.current', 'Current'],
      ['scope.trigger', 'Trigger'],
      ['scope.fft', 'Spectrum'],
      ['scope.fftGrid', 'Spectrum grid'],
    ],
  },
  {
    title: 'App',
    fields: [
      ['ui.surface', 'Surface'],
      ['ui.surfaceAlt', 'Containers'],
      ['ui.border', 'Outlines'],
      ['ui.text', 'Text'],
      ['ui.textMuted', 'Secondary text'],
      ['ui.accent', 'Accent'],
      ['ui.danger', 'Errors'],
    ],
  },
];

/** Labels for contrast warnings, by key: the field label with its group where it needs one. */
const GROUP_PREFIX: Record<string, string> = {
  'Circuit area': 'Circuit',
  Voltages: 'Voltage',
  Elements: '',
  Scopes: 'Scope',
  App: 'App',
};
const LABELS: Record<string, string> = Object.fromEntries([
  ...COLOR_GROUPS.flatMap((g) =>
    g.fields.map(([p, l]) => {
      const prefix = GROUP_PREFIX[g.title] ?? '';
      return [p, prefix ? `${prefix} ${l.toLowerCase()}` : l];
    }),
  ),
  ['scope.traces.0', 'Scope voltage trace'],
]);
const labelOf = (key: string): string => LABELS[key] ?? key;

const ratioText = (r: number): string => `${r.toFixed(1)}:1`;

function warningText(w: ContrastWarning): string {
  return `${ratioText(w.ratio)} on ${labelOf(w.against).toLowerCase()}, needs ${ratioText(w.min)}`;
}

/** `#rrggbb` for the browser's color picker, which has no alpha. */
function pickerValue(color: string): string {
  const c = parseColor(color);
  return toCss({ ...(c ?? { r: 0, g: 0, b: 0 }), a: 1 });
}

function sameColor(a: string, b: string): boolean {
  const ca = parseColor(a);
  const cb = parseColor(b);
  return ca !== null && cb !== null && toCss(ca) === toCss(cb);
}

function ColorField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  warnings: ContrastWarning[];
  testId: string;
}) {
  const [text, setText] = useState(props.value);
  // follow outside changes (picker, Start from) but not while the text being typed means the same
  useEffect(() => {
    setText((t) => (sameColor(t, props.value) ? t : props.value));
  }, [props.value]);
  const valid = parseColor(text) !== null;
  const id = `tf-${props.testId}`;
  return (
    <div className="theme-field" data-testid={`field-${props.testId}`}>
      <input
        type="color"
        className="theme-color"
        value={pickerValue(props.value)}
        aria-label={`${props.label} color picker`}
        onChange={(e) => {
          const picked = parseColor(e.target.value);
          const old = parseColor(props.value);
          if (picked) props.onChange(toCss({ ...picked, a: old?.a ?? 1 }));
        }}
      />
      <label className="theme-field-label" htmlFor={id}>
        {props.label}
      </label>
      <input
        id={id}
        className="text-input theme-field-input"
        value={text}
        spellCheck={false}
        aria-invalid={!valid}
        onChange={(e) => {
          setText(e.target.value);
          if (parseColor(e.target.value) !== null) props.onChange(e.target.value.trim());
        }}
        onBlur={() => {
          if (!valid) setText(props.value);
        }}
        data-testid={`color-${props.testId}`}
      />
      {!valid && (
        <span className="field-error theme-field-note">
          {/* eslint-disable-next-line local/no-color-literals -- a hint, not a color */}
          {t('Use hex, rgb() or hsl()')}
        </span>
      )}
      {props.warnings.map((w) => (
        <span
          key={w.against}
          className="theme-field-note theme-warning"
          data-testid={`warning-${props.testId}`}
        >
          <Icon name="warning" size={16} /> {warningText(w)}
        </span>
      ))}
    </div>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="theme-section">
      <h3 className="theme-section-title">{props.title}</h3>
      <div className="theme-section-body">{props.children}</div>
    </section>
  );
}

/** The live sample circuit, redrawn in the draft theme. */
function PreviewCanvas({ theme }: { theme: Theme }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<SamplePreview | null>(null);
  const first = useRef(theme);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const p = new SamplePreview(c, first.current);
    preview.current = p;
    const fit = (): void => {
      const r = c.getBoundingClientRect();
      p.resize(r.width, r.height, window.devicePixelRatio || 1);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    fit();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    p.start(!still);
    return () => {
      ro.disconnect();
      p.stop();
      preview.current = null;
    };
  }, []);
  useEffect(() => {
    preview.current?.setTheme(theme);
  }, [theme]);
  return (
    <canvas
      ref={canvas}
      className="theme-preview-canvas"
      aria-label={t('Sample circuit in this theme')}
      data-testid="theme-preview"
    />
  );
}

const FONT_RE = /^[\w\s,'"-]+$/;

function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
  pattern?: RegExp;
  list?: string;
  error?: string;
  mono?: boolean;
}) {
  const [text, setText] = useState(props.value);
  useEffect(() => setText(props.value), [props.value]);
  const valid = text.length <= 200 && (props.pattern ? props.pattern.test(text) : true);
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <input
        className={`text-input field-input${props.mono ? '' : ' theme-text-input'}`}
        value={text}
        list={props.list}
        spellCheck={false}
        aria-invalid={!valid}
        onChange={(e) => {
          setText(e.target.value);
          const ok =
            e.target.value.length <= 200 &&
            (props.pattern ? props.pattern.test(e.target.value) : true);
          if (ok) props.onChange(e.target.value);
        }}
        data-testid={`text-${props.testId}`}
      />
      {!valid && <span className="field-error">{props.error ?? 'Too long'}</span>}
    </label>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  testId: string;
}) {
  return (
    <label className="field theme-range">
      <span className="field-label">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        data-testid={`range-${props.testId}`}
      />
      <span className="theme-range-value">{props.value.toFixed(1).padStart(4, ' ')}</span>
    </label>
  );
}

function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  testId: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <select
        className="text-input field-input"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
        data-testid={`select-${props.testId}`}
      >
        {props.options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A built-in being customized gets a new name and no author; a saved theme keeps its own. */
function draftOf(theme: Theme, id: string | null): Theme {
  if (id !== null) return theme;
  const builtin = Object.values(BUILTIN_THEMES).includes(theme);
  return builtin
    ? { ...theme, meta: { ...theme.meta, name: `Custom ${theme.meta.name}`, author: '' } }
    : theme;
}

export function ThemeEditorDialog() {
  // read once: the store's copy is cleared when the editor closes
  const [editing] = useState(() => useApp.getState().editing);
  const [draft, setDraft] = useState<Theme>(() =>
    editing ? draftOf(editing.theme, editing.id) : useApp.getState().theme,
  );
  const id = editing?.id ?? null;
  const warnings = useMemo(() => contrastWarnings(draft), [draft]);
  const warningsFor = (key: string): ContrastWarning[] => warnings.filter((w) => w.key === key);

  // the whole app shows the draft while the editor is open
  useEffect(() => {
    useApp.setState({ preview: { theme: draft, source: 'editor' } });
  }, [draft]);
  useEffect(
    () => () => {
      if (useApp.getState().preview?.source === 'editor') useApp.setState({ preview: null });
      useApp.setState({ editing: null });
    },
    [],
  );

  const set = (path: Path, value: unknown): void => setDraft((d) => setAt(d, path, value));
  const traces = draft.scope.traces;
  const baseOptions = Object.entries(BUILTIN_THEMES).map(
    ([k, t]) => [k, t.meta.name] as [string, string],
  );

  const save = async (): Promise<void> => {
    const saved = await saveTheme(draft, id);
    selectTheme(userThemeId(saved));
    openDialog(null);
  };

  return (
    <Shell
      title={id ? `Edit ${editing?.theme.meta.name ?? 'theme'}` : 'New theme'}
      description={t('Changes show on the sample circuit and across the app as you make them.')}
      className="dialog-theme"
    >
      <div className="theme-editor">
        <div className="theme-editor-preview">
          <PreviewCanvas theme={draft} />
          {warnings.length === 0 ? (
            <p className="theme-contrast" data-testid="theme-contrast">
              <Icon name="check" size={18} /> Text and voltage colors have enough contrast
            </p>
          ) : (
            <ul className="theme-contrast theme-contrast-bad" data-testid="theme-contrast">
              {warnings.map((w) => (
                <li key={`${w.key} ${w.against}`}>
                  <button
                    type="button"
                    className="theme-contrast-item"
                    onClick={() => {
                      const f = document.getElementById(`tf-${w.key}`);
                      f?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                      f?.focus({ preventScroll: true });
                    }}
                  >
                    <Icon name="warning" size={16} />
                    <span>
                      {labelOf(w.key)}: {warningText(w)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="theme-editor-form" data-testid="theme-form">
          <Section title={t('About')}>
            <TextField
              label="Name"
              value={draft.meta.name}
              onChange={(v) => set('meta.name', v)}
              testId="name"
            />
            <TextField
              label="Author"
              value={draft.meta.author}
              onChange={(v) => set('meta.author', v)}
              testId="author"
            />
            <TextField
              label="Description"
              value={draft.meta.description}
              onChange={(v) => set('meta.description', v)}
              testId="description"
            />
            <SelectField
              label="Start from"
              value={draft.meta.base}
              options={baseOptions}
              onChange={(base) => {
                const b = BUILTIN_THEMES[base];
                if (b) setDraft((d) => ({ ...b, meta: { ...d.meta, base: b.meta.base } }));
              }}
              testId="base"
            />
          </Section>
          {COLOR_GROUPS.map((g) => (
            <Section key={g.title} title={g.title}>
              {g.title === 'Voltages' && (
                <div
                  className="theme-gradient"
                  aria-hidden
                  style={{
                    background: `linear-gradient(90deg, ${draft.circuit.voltage.negative}, ${draft.circuit.voltage.zero}, ${draft.circuit.voltage.positive})`,
                  }}
                />
              )}
              {g.fields.map(([path, label]) => (
                <ColorField
                  key={path}
                  label={label}
                  value={getAt(draft, path) as string}
                  onChange={(v) => set(path, v)}
                  warnings={warningsFor(path)}
                  testId={path}
                />
              ))}
              {g.title === 'Scopes' && (
                <div className="theme-traces">
                  <span className="field-label">{t('Traces (the first draws voltage)')}</span>
                  {traces.map((c, i) => (
                    <div className="theme-trace" key={i}>
                      <ColorField
                        label={`Trace ${i + 1}`}
                        value={c}
                        onChange={(v) => set(`scope.traces.${i}`, v)}
                        warnings={warningsFor(`scope.traces.${i}`)}
                        testId={`scope.traces.${i}`}
                      />
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove trace ${i + 1}`}
                        disabled={traces.length <= 1}
                        onClick={() =>
                          set(
                            'scope.traces',
                            traces.filter((_, k) => k !== i),
                          )
                        }
                      >
                        <Icon name="close" size={18} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="button"
                    disabled={traces.length >= 16}
                    onClick={() =>
                      set('scope.traces', [
                        ...traces,
                        traces[traces.length - 1] ?? draft.scope.text,
                      ])
                    }
                  >
                    <Icon name="add" size={18} /> Add trace
                  </button>
                </div>
              )}
            </Section>
          ))}
          <Section title={t('Style')}>
            <NumberField
              label="Line width"
              value={draft.style.strokeWidth}
              min={0.5}
              max={8}
              step={0.5}
              onChange={(v) => set('style.strokeWidth', v)}
              testId="strokeWidth"
            />
            <NumberField
              label="Current dot size"
              value={draft.style.dotRadius}
              min={0.5}
              max={6}
              step={0.5}
              onChange={(v) => set('style.dotRadius', v)}
              testId="dotRadius"
            />
            <NumberField
              label="Corner roundness"
              value={draft.style.roundness}
              min={0}
              max={2}
              step={0.1}
              onChange={(v) => set('style.roundness', v)}
              testId="roundness"
            />
            <SelectField
              label="Grid"
              value={draft.style.grid}
              options={[
                ['none', 'None'],
                ['dots', 'Dots'],
                ['lines', 'Lines'],
              ]}
              onChange={(v) => set('style.grid', v)}
              testId="grid"
            />
            <SelectField
              label="Scopes"
              value={draft.style.scopeLook}
              options={[
                ['cards', 'Cards'],
                ['classic', 'Classic'],
              ]}
              onChange={(v) => set('style.scopeLook', v)}
              testId="scopeLook"
            />
            <TextField
              label="Font"
              value={draft.style.font}
              onChange={(v) => set('style.font', v)}
              pattern={FONT_RE}
              list="theme-fonts"
              error="Font names only, separated by commas"
              mono
              testId="font"
            />
            <TextField
              label="Value font"
              value={draft.style.monoFont}
              onChange={(v) => set('style.monoFont', v)}
              pattern={FONT_RE}
              list="theme-mono-fonts"
              error="Font names only, separated by commas"
              mono
              testId="monoFont"
            />
            <datalist id="theme-fonts">
              <option value="'Roboto Variable', Roboto, system-ui, sans-serif" />
              <option value="system-ui, sans-serif" />
              <option value="Georgia, serif" />
            </datalist>
            <datalist id="theme-mono-fonts">
              <option value="'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace" />
              <option value="ui-monospace, Menlo, Consolas, monospace" />
            </datalist>
          </Section>
        </div>
      </div>
      <div className="dialog-buttons">
        <button
          type="button"
          className="button"
          onClick={() => exportThemeFile(draft)}
          data-testid="theme-editor-export"
        >
          <Icon name="download" size={18} /> Export
        </button>
        <button
          type="button"
          className="button"
          onClick={() => void copyThemeLink(draft, pageBase())}
          data-testid="theme-editor-link"
        >
          <Icon name="link" size={18} /> Copy link
        </button>
        <span className="dialog-buttons-gap" />
        <Dialog.Close asChild>
          <button type="button" className="button">
            {t('Cancel')}
          </button>
        </Dialog.Close>
        <button
          type="button"
          className="button button-primary"
          onClick={() => void save()}
          data-testid="theme-editor-save"
        >
          {t('Save')}
        </button>
      </div>
    </Shell>
  );
}
