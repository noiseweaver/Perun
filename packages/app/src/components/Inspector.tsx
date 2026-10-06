// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Fields follow CircuitJS1 EditDialog (src/com/lushprojects/circuitjs1/client/EditDialog.java,
// master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: the element lists its fields with
// getEditInfo and takes values back with setEditValue. Unlike upstream's dialog, each field
// applies on its own (Enter or leaving the field), so values can be tuned while the circuit runs.

import {
  CircuitElm,
  VoltageElm,
  hasTolerance,
  parseUnits,
  stepE12,
  toleranceEditInfo,
  toleranceFromEditInfo,
  unitString,
  type EditInfo,
} from '@circuitjs-next/elements';
import { useEffect, useMemo, useRef, useState } from 'react';
import { controller } from '../SimController.ts';
import { useApp } from '../store.ts';
import { useNarrow } from './useNarrow.ts';
import { Icon, type IconName } from './Icon.tsx';
import { LiveHeader } from './LiveHeader.tsx';
import { t } from '../i18n.ts';

/** Upstream unitString(ei), with voltage sources shown in rms when that is shorter. */
function displayValue(elm: CircuitElm, ei: EditInfo, v = ei.value): string {
  if (elm instanceof VoltageElm && !ei.dimensionless && elm.useRmsDisplay(v))
    return unitString(ei, v * elm.getRmsMultiplier()) + 'rms';
  return unitString(ei, v);
}

/** Upstream parseUnits(ei): voltage sources convert "rms" with their waveform's multiplier. */
function readValue(elm: CircuitElm, text: string): number {
  const s = text.trim();
  if (elm instanceof VoltageElm && s.endsWith('rms')) {
    const mult = elm.getRmsMultiplier();
    if (mult > 0) return parseUnits(s.substring(0, s.length - 3)) / mult;
  }
  return parseUnits(s);
}

function labelText(name: string): string {
  // upstream translates the name (EditDialog), and allows HTML in names starting with "<"
  // (links); show the text only
  const s = t(name);
  return s.startsWith('<') ? s.replace(/<[^>]*>/g, '') : s;
}

const fieldLabel = (ei: EditInfo): string => labelText(ei.name);

interface FieldProps {
  elm: CircuitElm;
  n: number;
  ei: EditInfo;
  autoFocus: boolean;
  onError: (msg: string | null) => void;
  /** Apply the value some other way than the element's setEditValue (fields not in upstream). */
  onApply?: (ei: EditInfo) => void;
}

function apply(props: FieldProps): void {
  const { elm, n, ei, onError } = props;
  ei.error = null;
  if (ei.positive && ei.value <= 0) ei.setError('must be > 0');
  if (ei.nonNegative && ei.value < 0) ei.setError('must be >= 0');
  if (ei.error === null) {
    if (props.onApply) props.onApply(ei);
    else controller.applyEdit(elm, n, ei);
  }
  if (ei.error !== null) {
    const field = ei.errorFieldName ?? ei.name;
    onError(field ? `${labelText(field)}: ${ei.error}` : ei.error);
  } else onError(null);
}

function NumberField(props: FieldProps) {
  const { elm, ei } = props;
  const [text, setText] = useState(() => displayValue(elm, ei));
  const [bad, setBad] = useState(false);
  useEffect(() => setText(displayValue(elm, ei)), [elm, ei]);
  const commit = (s: string): void => {
    let v: number;
    try {
      v = readValue(elm, s);
    } catch {
      setBad(true);
      return;
    }
    setBad(false);
    if (v === ei.value) return;
    ei.value = v;
    apply(props);
  };
  const step = (dir: number): void => {
    let cur: number;
    try {
      cur = readValue(elm, text);
    } catch {
      cur = ei.value;
    }
    const next = ei.dimensionless || ei.unitStep ? cur + dir : stepE12(cur, dir);
    setText(displayValue(elm, ei, next));
    ei.value = next;
    apply(props);
  };
  // the wheel over the field steps it like the buttons do (through E12 for part values)
  const stepRef = useRef(step);
  stepRef.current = step;
  const stepper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stepper.current;
    if (!el) return;
    let carry = 0;
    const wheel = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.deltaY === 0) return;
      e.preventDefault();
      carry -= e.deltaMode === 1 ? e.deltaY / 3 : e.deltaY / 100;
      const n = Math.trunc(carry);
      carry -= n;
      for (let k = 0; k !== Math.abs(n); k++) stepRef.current(Math.sign(n));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const id = `field-${props.n}`;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {fieldLabel(ei)}
      </label>
      <div className="stepper" ref={stepper}>
        <button
          type="button"
          className="icon-button icon-button-small"
          aria-label={`${t('Decrease')} ${fieldLabel(ei)}`}
          onClick={() => step(-1)}
        >
          <Icon name="minus" size={18} />
        </button>
        <input
          id={id}
          className="text-input field-input"
          data-invalid={bad || undefined}
          value={text}
          autoFocus={props.autoFocus}
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value);
            if (e.key === 'Escape') {
              setText(displayValue(elm, ei));
              setBad(false);
              e.currentTarget.blur();
            }
          }}
          data-testid={`field-${props.n}`}
        />
        <button
          type="button"
          className="icon-button icon-button-small"
          aria-label={`${t('Increase')} ${fieldLabel(ei)}`}
          onClick={() => step(1)}
        >
          <Icon name="add" size={18} />
        </button>
      </div>
      {bad && <span className="field-error">{t('Not a number. Try 4.7k, 100n or 2k2.')}</span>}
    </div>
  );
}

function TextField(props: FieldProps) {
  const { ei } = props;
  const [text, setText] = useState(ei.text ?? '');
  useEffect(() => setText(ei.text ?? ''), [ei]);
  const commit = (s: string): void => {
    if (s === ei.text) return;
    ei.text = s;
    apply(props);
  };
  const id = `field-${props.n}`;
  const common = {
    id,
    className: 'text-input field-input',
    value: text,
    autoFocus: props.autoFocus,
    spellCheck: false,
    'data-testid': `field-${props.n}`,
  };
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {fieldLabel(ei)}
      </label>
      {ei.multiline ? (
        <textarea
          {...common}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
        />
      ) : (
        <input
          {...common}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value);
          }}
        />
      )}
    </div>
  );
}

/** A button that acts at once (upstream EditInfo.button), undoable like any edit. */
function ButtonField(props: FieldProps & { onDone: () => void }) {
  const { ei } = props;
  const button = ei.button;
  if (!button) return null;
  return (
    <div className="field">
      {ei.name !== '' && <span className="field-label">{fieldLabel(ei)}</span>}
      <button
        type="button"
        className="button"
        autoFocus={props.autoFocus}
        onClick={() => {
          controller.runEditAction(() => button.onClick());
          props.onDone();
        }}
        data-testid={`field-${props.n}`}
      >
        {t(button.label)}
      </button>
    </div>
  );
}

/** Read a chosen file the way the field asks and hand it to the element. */
async function loadFile(file: File, ef: NonNullable<EditInfo['file']>): Promise<() => void> {
  if (ef.kind === 'text') {
    const text = await file.text();
    return () => ef.onLoad(file.name, text);
  }
  if (ef.kind === 'binary') {
    if (ef.maxSize !== undefined && file.size >= ef.maxSize)
      throw new Error('Cannot load: That file is too large!');
    const bytes = new Uint8Array(await file.arrayBuffer());
    return () => ef.onLoad(file.name, bytes);
  }
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    const samples = audio.getChannelData(0);
    return () => ef.onLoad(file.name, samples, audio.sampleRate);
  } finally {
    void ctx.close();
  }
}

/** A file picker (upstream's FileUpload widget or "Load ... From File" button). */
function FileField(props: FieldProps & { onDone: () => void }) {
  const { ei, onError } = props;
  const ef = ei.file;
  const input = useRef<HTMLInputElement>(null);
  if (!ef) return null;
  const id = `field-${props.n}`;
  return (
    <div className="field">
      {ei.name !== '' && <span className="field-label">{fieldLabel(ei)}</span>}
      <input
        ref={input}
        id={id}
        type="file"
        accept={ef.accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          loadFile(file, ef).then(
            (apply) => {
              controller.runEditAction(apply);
              onError(null);
              props.onDone();
            },
            (err: unknown) => onError(err instanceof Error ? err.message : String(err)),
          );
        }}
      />
      <button
        type="button"
        className="button"
        autoFocus={props.autoFocus}
        onClick={() => input.current?.click()}
        data-testid={`field-${props.n}`}
      >
        {t(ef.label ?? 'Choose File…')}
      </button>
    </div>
  );
}

function CheckboxField(props: FieldProps) {
  const cb = props.ei.checkbox;
  // EditInfo is mutable and does not re-render the panel; React state shows the tick at once
  const [on, setOn] = useState(cb?.state ?? false);
  if (!cb) return null;
  return (
    <label className="field field-check">
      <input
        type="checkbox"
        className="checkbox"
        checked={on}
        autoFocus={props.autoFocus}
        onChange={(e) => {
          setOn(e.target.checked);
          cb.state = e.target.checked;
          apply(props);
        }}
        data-testid={`field-${props.n}`}
      />
      <span>{t(cb.label)}</span>
    </label>
  );
}

function ChoiceField(props: FieldProps) {
  const ch = props.ei.choice;
  const [selected, setSelected] = useState(ch?.selected ?? 0);
  if (!ch) return null;
  const id = `field-${props.n}`;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {fieldLabel(props.ei)}
      </label>
      <select
        id={id}
        className="select"
        value={selected}
        autoFocus={props.autoFocus}
        onChange={(e) => {
          setSelected(Number(e.target.value));
          ch.selected = Number(e.target.value);
          props.ei.value = ch.selected;
          apply(props);
        }}
        data-testid={`field-${props.n}`}
      >
        {ch.items.map((it, i) => (
          <option key={i} value={i}>
            {t(it)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** An icon with a short caption under it (touch screens show no tooltips), the full label on hover. */
function ActionButton(props: {
  icon: IconName;
  label: string;
  caption: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="action-button"
      data-testid={props.testId}
      aria-label={t(props.label)}
      title={t(props.label)}
      onClick={props.onClick}
    >
      <span className="action-button-icon">
        <Icon name={props.icon} />
      </span>
      <span className="action-button-caption" aria-hidden="true">
        {t(props.caption)}
      </span>
    </button>
  );
}

/** Rotate, mirror and delete for the selection. */
function SelectionActions({ elm }: { elm: CircuitElm | null }) {
  const ed = controller.editor;
  return (
    <div className="inspector-actions">
      <ActionButton
        icon="rotateLeft"
        label="Rotate CCW"
        caption="Rotate left"
        onClick={() => ed.rotateCCW()}
      />
      <ActionButton
        icon="rotateRight"
        label="Rotate CW"
        caption="Rotate right"
        onClick={() => ed.rotateCW()}
      />
      <ActionButton icon="flip" label="Mirror X" caption="Mirror" onClick={() => ed.mirrorX()} />
      {elm !== null && elm.getPostCount() === 2 && (
        <ActionButton
          icon="swap"
          label="Swap terminals"
          caption="Swap"
          onClick={() => ed.swapTerminals(elm)}
        />
      )}
      {elm !== null && elm.canViewInScope() && (
        <>
          <ActionButton
            icon="scope"
            label="View in new scope"
            caption="Scope"
            testId="action-view-in-scope"
            onClick={() => controller.viewInScope(elm)}
          />
          <ActionButton
            icon="openInNew"
            label="View in new undocked scope"
            caption="Undocked scope"
            testId="action-view-in-undocked-scope"
            onClick={() => controller.viewInUndockedScope(elm)}
          />
        </>
      )}
      {elm !== null && controller.canAddSliders(elm) && (
        <ActionButton
          icon="tune"
          label="Sliders…"
          caption="Sliders"
          testId="action-sliders"
          onClick={() => controller.openSliderDialog(elm)}
        />
      )}
      <ActionButton
        icon="copy"
        label="Duplicate"
        caption="Duplicate"
        onClick={() => ed.duplicate(null)}
      />
      <ActionButton
        icon="delete"
        label="Delete"
        caption="Delete"
        onClick={() => ed.deleteSelected(null)}
      />
    </div>
  );
}

/** Properties of the selected element, or what to do with a multiple selection. */

type SheetSnap = 'peek' | 'half' | 'full';
/** The sheet keeps the height the user last chose while the app is open. */
let lastSnap: SheetSnap = 'half';

/** Sheet heights in px: just the title row, about half the screen, or up to the app bar. */
function sheetHeights(panel: HTMLElement): Record<SheetSnap, number> {
  const header = panel.querySelector<HTMLElement>('.inspector-header');
  const peek = header ? header.offsetTop + header.offsetHeight + 8 : 96;
  const full = Math.max(peek, window.innerHeight - 64 - 16);
  const half = Math.min(full, Math.max(peek, Math.round(window.innerHeight * 0.45)));
  return { peek, half, full };
}

/** Drag handle: drag to resize the sheet, release to snap; a tap toggles it open or shut. */
function SheetHandle(props: {
  panel: React.RefObject<HTMLElement | null>;
  snap: SheetSnap;
  setSnap: (s: SheetSnap) => void;
  setDragHeight: (h: number | null) => void;
}) {
  const drag = useRef<{ id: number; y: number; h: number; moved: boolean } | null>(null);
  const { panel, snap, setSnap, setDragHeight } = props;
  const heightAt = (y: number): number => {
    const d = drag.current;
    const el = panel.current;
    if (!d || !el) return 0;
    const hs = sheetHeights(el);
    return Math.min(hs.full, Math.max(hs.peek, d.h - (y - d.y)));
  };
  return (
    <button
      type="button"
      className="sheet-handle"
      aria-label={t(snap === 'peek' ? 'Show properties' : 'Hide properties')}
      aria-expanded={snap !== 'peek'}
      data-testid="sheet-handle"
      onPointerDown={(e) => {
        const el = panel.current;
        if (!el || e.button !== 0) return;
        drag.current = { id: e.pointerId, y: e.clientY, h: el.offsetHeight, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        if (!d.moved && Math.abs(e.clientY - d.y) < 4) return;
        d.moved = true;
        setDragHeight(heightAt(e.clientY));
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        const el = panel.current;
        if (!d || d.id !== e.pointerId || !el) return;
        let next: SheetSnap;
        if (!d.moved) next = snap === 'peek' ? 'half' : 'peek';
        else {
          const h = heightAt(e.clientY);
          const hs = sheetHeights(el);
          next = (['peek', 'half', 'full'] as const).reduce((a, b) =>
            Math.abs(hs[b] - h) < Math.abs(hs[a] - h) ? b : a,
          );
        }
        drag.current = null;
        setDragHeight(null);
        setSnap(next);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragHeight(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') setSnap(snap === 'peek' ? 'half' : 'full');
        else if (e.key === 'ArrowDown') setSnap(snap === 'full' ? 'half' : 'peek');
        else return;
        e.preventDefault();
      }}
    >
      <span className="sheet-handle-bar" />
    </button>
  );
}

export function Inspector() {
  const selected = useApp((s) => s.editor.panelElm);
  const count = useApp((s) => s.editor.panelCount);
  const revision = useApp((s) => s.editor.revision);
  const moving = useApp((s) => s.editor.moving);
  const focus = useApp((s) => s.inspectorFocus);
  const [error, setError] = useState<string | null>(null);
  const [rebuild, setRebuild] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const narrow = useNarrow();
  const [snap, setSnapState] = useState<SheetSnap>(lastSnap);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [heights, setHeights] = useState<Record<SheetSnap, number> | null>(null);
  const setSnap = (s: SheetSnap): void => {
    lastSnap = s;
    setSnapState(s);
  };

  const infos = useMemo(() => {
    const list: EditInfo[] = [];
    if (selected === null) return list;
    for (let i = 0; i < 40; i++) {
      const ei = selected.getEditInfo(i);
      if (ei === null) break;
      list.push(ei);
    }
    return list;
    // revision: values changed elsewhere (undo, drag); rebuild: a field asked for a new list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, revision, rebuild]);

  useEffect(() => setError(null), [selected]);

  // measure the sheet's snap heights once it is on screen, and again when the window resizes
  const shown = count > 0;
  useEffect(() => {
    if (!narrow || !shown) return;
    const measure = (): void => {
      if (panel.current) setHeights(sheetHeights(panel.current));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [narrow, shown, selected]);

  // double-click and Enter move the keyboard to the first field (opening a shut sheet)
  useEffect(() => {
    if (focus === 0) return;
    if (lastSnap === 'peek') setSnap('half');
    const first = panel.current?.querySelector<HTMLElement>('[data-testid="field-0"]');
    first?.focus();
  }, [focus]);

  if (count === 0) return null;

  const onError = (msg: string | null): void => {
    setError(msg);
    // upstream rebuilds the dialog when a field sets newDialog (a waveform change)
    if (infos.some((ei) => ei.newDialog)) setRebuild((r) => r + 1);
  };

  return (
    <aside
      className="inspector"
      aria-label={t('Properties')}
      data-testid="inspector"
      data-sheet={narrow ? snap : undefined}
      data-dragging={dragHeight !== null || undefined}
      data-canvas-drag={(narrow && moving) || undefined}
      style={narrow && heights !== null ? { height: dragHeight ?? heights[snap] } : undefined}
      ref={panel}
    >
      <SheetHandle panel={panel} snap={snap} setSnap={setSnap} setDragHeight={setDragHeight} />
      <header className="inspector-header">
        <h2 className="inspector-title" data-testid="inspector-title">
          {selected !== null
            ? selected.getDialogTitle().replace(/^Edit /, '')
            : `${count} selected`}
        </h2>
        <button
          type="button"
          className="icon-button icon-button-small"
          aria-label={t('Close')}
          onClick={() => controller.editor.clearSelection()}
        >
          <Icon name="close" size={18} />
        </button>
      </header>
      {selected !== null && <LiveHeader elm={selected} />}
      <SelectionActions elm={selected} />
      {selected !== null && (
        <form className="inspector-fields" onSubmit={(e) => e.preventDefault()}>
          {infos.length === 0 && <p className="inspector-empty">{t('No properties to edit.')}</p>}
          {infos.map((ei, n) => {
            const props: FieldProps = {
              elm: selected,
              n,
              ei,
              autoFocus: false,
              onError,
            };
            const key = `${n}:${revision}:${rebuild}`;
            const onDone = (): void => setRebuild((r) => r + 1);
            if (ei.button && !ei.file) return <ButtonField key={key} {...props} onDone={onDone} />;
            if (ei.file) return <FileField key={key} {...props} onDone={onDone} />;
            if (ei.choice) return <ChoiceField key={key} {...props} />;
            if (ei.checkbox) return <CheckboxField key={key} {...props} />;
            if (ei.text !== null) return <TextField key={key} {...props} />;
            return <NumberField key={key} {...props} />;
          })}
          {hasTolerance(selected) && (
            // not in upstream (DEVIATIONS.md): the part's tolerance for Monte Carlo runs
            <ChoiceField
              key={`tol:${revision}:${rebuild}`}
              elm={selected}
              n={infos.length}
              ei={toleranceEditInfo(selected)}
              autoFocus={false}
              onError={onError}
              onApply={(ei) => controller.applyTolerance(selected, toleranceFromEditInfo(ei))}
            />
          )}
          {error !== null && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </aside>
  );
}
