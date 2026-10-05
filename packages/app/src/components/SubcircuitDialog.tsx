// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Follows CircuitJS1 EditCompositeModelDialog (src/com/lushprojects/circuitjs1/client/
// EditCompositeModelDialog.java, master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: the chip
// drawn with its pins, which drag along the outline (several at once after a shift-click or a
// rubber band on one side), Width and Height buttons, Show Label, the model's name when it has
// none, and where the model is kept. The pin logic is in elements' compositeLayout.
// SubcircuitManagerDialog follows upstream SubcircuitDialog.java (Tools > Subcircuit Manager): the
// models that aren't built in, with Delete.

import {
  CustomCompositeChipElm,
  PinDrag,
  adjustChipSize,
  createPinsFromModel,
  findNearestPin,
  viewFor,
  type CustomCompositeModel,
  type DrawContext,
} from '@circuitjs-next/elements';
import { CanvasPainter, Palette } from '@circuitjs-next/render';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { openDialog } from '../commands.ts';
import { controller } from '../SimController.ts';
import { shownTheme, useApp } from '../store.ts';
import { Shell } from './DialogShell.tsx';
import { t } from '../i18n.ts';

const SIZE = 400;

interface Snapshot {
  pins: { pos: number; side: number }[];
  sizeX: number;
  sizeY: number;
  flags: number;
}

const snapshot = (m: CustomCompositeModel): Snapshot => ({
  pins: m.extList.map((p) => ({ pos: p.pos, side: p.side })),
  sizeX: m.sizeX,
  sizeY: m.sizeY,
  flags: m.flags,
});

function restore(m: CustomCompositeModel, s: Snapshot): void {
  m.extList.forEach((p, i) => {
    p.pos = s.pins[i].pos;
    p.side = s.pins[i].side;
  });
  m.sizeX = s.sizeX;
  m.sizeY = s.sizeY;
  m.flags = s.flags;
}

/** Circuit point to canvas pixel: x * scale + ox. */
interface Fit {
  scale: number;
  ox: number;
  oy: number;
}

export function SubcircuitDialog() {
  const req = controller.subcircuitDialog;
  const theme = useApp(shownTheme);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [name, setName] = useState('');
  const [showLabel, setShowLabel] = useState(req?.model.showLabel() ?? false);
  const [scope, setScope] = useState(req ? controller.subcircuitScope(req.model) : 0);
  const [error, setError] = useState<string | null>(null);
  // bumped to redraw after the model or the selection changes
  const [, setTick] = useState(0);
  const redraw = (): void => setTick((n) => n + 1);

  const state = useRef<{
    chip: CustomCompositeChipElm;
    saved: Snapshot | null;
    selected: Set<number>;
    hovered: number;
    drag: PinDrag | null;
    band: { x1: number; y1: number; x2: number; y2: number } | null;
    fit: Fit;
    done: boolean;
  } | null>(null);
  if (state.current === null && req !== null) {
    const chip = new CustomCompositeChipElm(50, 50, 200, 50, 0);
    chip.sim = controller.circuit.sim;
    state.current = {
      chip,
      // an existing model is edited in place: Cancel puts it back
      saved: req.askName ? null : snapshot(req.model),
      selected: new Set(),
      hovered: -1,
      drag: null,
      band: null,
      fit: { scale: 1, ox: 0, oy: 0 },
      done: false,
    };
  }

  const model = req?.model ?? null;
  const st = state.current;

  useEffect(() => {
    const c = canvasRef.current;
    if (c === null || st === null || model === null) return;
    const ctx = c.getContext('2d');
    if (ctx === null) return;
    const { chip } = st;
    const shown = new Set(st.selected);
    if (st.hovered >= 0) shown.add(st.hovered);
    if (st.band !== null) for (const i of pinsInBand(st, model)) shown.add(i);
    createPinsFromModel(chip, model, shown);
    chip.setLabel(showLabel ? (req?.askName ? name : model.name) : null);
    const view = viewFor(chip);
    if (view === null) return;
    // fit the chip, its pins and their names with a margin (upstream: the bounding box's offset)
    let x1 = Number.MAX_VALUE;
    let y1 = Number.MAX_VALUE;
    let x2 = -Number.MAX_VALUE;
    let y2 = -Number.MAX_VALUE;
    const add = (x: number, y: number): void => {
      x1 = Math.min(x1, x);
      y1 = Math.min(y1, y);
      x2 = Math.max(x2, x);
      y2 = Math.max(y2, y);
    };
    for (const p of chip.rectPoints) add(p.x, p.y);
    for (let i = 0; i !== chip.getPostCount(); i++) add(chip.getPost(i).x, chip.getPost(i).y);
    const pad = 32;
    const scale = Math.min(SIZE / (x2 - x1 + 2 * pad), SIZE / (y2 - y1 + 2 * pad), 3);
    const fit = {
      scale,
      ox: SIZE / 2 - ((x1 + x2) / 2) * scale,
      oy: SIZE / 2 - ((y1 + y2) / 2) * scale,
    };
    st.fit = fit;
    const dpr = window.devicePixelRatio || 1;
    c.width = SIZE * dpr;
    c.height = SIZE * dpr;
    const palette = new Palette(theme);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.canvas.background;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(fit.scale * dpr, 0, 0, fit.scale * dpr, fit.ox * dpr, fit.oy * dpr);
    ctx.lineCap = 'round';
    const painter = new CanvasPainter(ctx, palette);
    painter.settings = { voltageColors: false, voltageRange: 5, dots: false };
    const dc: DrawContext = {
      painter,
      highlighted: false,
      showValues: false,
      euroResistors: false,
      showOhm: false,
      dotCount: () => 0,
    };
    view.draw(chip, dc);
    if (chip.label !== null)
      painter.text(
        chip.label,
        { x: chip.labelX, y: chip.labelY },
        { role: 'label' },
        {
          font: 'units',
          align: 'center',
          baseline: 'middle',
        },
      );
    const b = st.band;
    if (b !== null) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const x = Math.min(b.x1, b.x2);
      const y = Math.min(b.y1, b.y2);
      const w = Math.abs(b.x2 - b.x1);
      const h = Math.abs(b.y2 - b.y1);
      ctx.fillStyle = palette.selection;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = palette.selection;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    }
  });

  if (req === null || st === null || model === null) return null;

  /** Canvas pixel (CSS) of the event, and the circuit point under it. */
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) * SIZE) / r.width;
    const py = ((e.clientY - r.top) * SIZE) / r.height;
    return { px, py, x: (px - st.fit.ox) / st.fit.scale, y: (py - st.fit.oy) / st.fit.scale };
  };
  const nearest = (x: number, y: number): number => findNearestPin(st.chip, x, y);

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    const hit = nearest(p.x, p.y);
    if (hit < 0) {
      // empty space: a rubber band
      if (!e.shiftKey) st.selected.clear();
      st.band = { x1: p.px, y1: p.py, x2: p.px, y2: p.py };
      redraw();
      return;
    }
    st.band = null;
    if (e.shiftKey) {
      if (st.selected.has(hit)) st.selected.delete(hit);
      else {
        const first = st.selected.values().next();
        // only pins on one side are moved together
        if (first.done || model.extList[first.value].side === model.extList[hit].side)
          st.selected.add(hit);
      }
    } else if (!st.selected.has(hit)) {
      st.selected.clear();
      st.selected.add(hit);
    }
    st.drag = new PinDrag(model, st.selected, hit);
    redraw();
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const p = at(e);
    if (st.band !== null) {
      st.band.x2 = p.px;
      st.band.y2 = p.py;
      redraw();
      return;
    }
    if (st.drag !== null) {
      const [pos, side] = st.chip.getPinPos(p.x, p.y, st.drag.currentSide);
      if (pos < 0) return;
      st.drag.move(pos, side);
      redraw();
      return;
    }
    const h = nearest(p.x, p.y);
    if (h !== st.hovered) {
      st.hovered = h;
      redraw();
    }
  };

  const onUp = (): void => {
    if (st.band !== null) {
      for (const i of pinsInBand(st, model)) st.selected.add(i);
      st.band = null;
    }
    st.drag = null;
    redraw();
  };

  const resize = (dx: number, dy: number): void => {
    if (adjustChipSize(model, dx, dy)) redraw();
  };

  const cancel = (): void => {
    if (st.saved !== null && !st.done) restore(model, st.saved);
    controller.subcircuitDialog = null;
  };

  const ok = (): void => {
    model.setShowLabel(showLabel);
    const err = controller.commitSubcircuit(model, req.askName ? name.trim() : null, scope);
    if (err !== null) {
      setError(t(err));
      return;
    }
    st.done = true;
    openDialog(null);
  };

  return (
    <Shell title={t('Edit Subcircuit Pin Layout')} onClose={cancel} className="subcircuit-dialog">
      <form
        data-testid="subcircuit-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          ok();
        }}
      >
        <p className="field-label">{t('Drag the pins to the desired position')}</p>
        <canvas
          ref={canvasRef}
          className="subcircuit-canvas"
          data-testid="subcircuit-canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => {
            if (st.hovered >= 0 && st.drag === null) {
              st.hovered = -1;
              redraw();
            }
          }}
        />
        {req.askName && (
          <div className="field">
            <label className="field-label" htmlFor="subcircuit-name">
              {t('Model Name')}
            </label>
            <input
              id="subcircuit-name"
              className="text-input"
              value={name}
              autoFocus
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
              data-testid="subcircuit-name"
            />
          </div>
        )}
        <div className="subcircuit-size">
          <span className="field-label">{t('Width')}</span>
          <button
            type="button"
            className="button"
            onClick={() => resize(1, 0)}
            aria-label={t('Wider')}
            data-testid="subcircuit-wider"
          >
            +
          </button>
          <button
            type="button"
            className="button"
            onClick={() => resize(-1, 0)}
            aria-label={t('Narrower')}
            data-testid="subcircuit-narrower"
          >
            −
          </button>
          <span className="field-label">{t('Height')}</span>
          <button
            type="button"
            className="button"
            onClick={() => resize(0, 1)}
            aria-label={t('Taller')}
            data-testid="subcircuit-taller"
          >
            +
          </button>
          <button
            type="button"
            className="button"
            onClick={() => resize(0, -1)}
            aria-label={t('Shorter')}
            data-testid="subcircuit-shorter"
          >
            −
          </button>
        </div>
        <label className="field field-check">
          <input
            type="checkbox"
            className="checkbox"
            checked={showLabel}
            onChange={(e) => setShowLabel(e.target.checked)}
            data-testid="subcircuit-show-label"
          />
          <span>{t('Show Label')}</span>
        </label>
        <div className="field">
          <label className="field-label" htmlFor="subcircuit-scope">
            {t('Scope:')}
          </label>
          <select
            id="subcircuit-scope"
            className="select"
            value={scope}
            onChange={(e) => setScope(Number(e.target.value))}
            data-testid="subcircuit-scope"
          >
            <option value={0}>{t('This Circuit')}</option>
            <option value={1}>{t('This Session')}</option>
            <option value={2}>{t('Save Across Sessions')}</option>
          </select>
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
          <button type="submit" className="button button-primary" data-testid="subcircuit-ok">
            {t('OK')}
          </button>
        </div>
      </form>
    </Shell>
  );
}

/**
 * Pins (not bus bits) whose names fall in the rubber band, all on one side: the side of the pins
 * already selected, or else of the first pin the band takes in (upstream's mouse handlers).
 */
function pinsInBand(
  st: {
    chip: CustomCompositeChipElm;
    selected: Set<number>;
    band: { x1: number; y1: number; x2: number; y2: number } | null;
    fit: Fit;
  },
  model: CustomCompositeModel,
): number[] {
  const b = st.band;
  if (b === null) return [];
  const x1 = Math.min(b.x1, b.x2);
  const x2 = Math.max(b.x1, b.x2);
  const y1 = Math.min(b.y1, b.y2);
  const y2 = Math.max(b.y1, b.y2);
  const first = st.selected.values().next();
  let side = first.done ? -1 : model.extList[first.value].side;
  const out: number[] = [];
  const pins = st.chip.pins;
  for (let i = 0; i !== pins.length; i++) {
    if (pins[i].busZ > 0) continue;
    const px = pins[i].textloc.x * st.fit.scale + st.fit.ox;
    const py = pins[i].textloc.y * st.fit.scale + st.fit.oy;
    if (px < x1 || px > x2 || py < y1 || py > y2) continue;
    if (side === -1) side = model.extList[i].side;
    if (model.extList[i].side === side) out.push(i);
  }
  return out;
}

/** Upstream's Subcircuit Manager: pick a model and delete it (after asking). */
export function SubcircuitManagerDialog() {
  const [models, setModels] = useState(() => controller.userSubcircuitModels());
  const [picked, setPicked] = useState(-1);
  const del = (): void => {
    const m = models[picked];
    if (m === undefined) {
      window.alert(t('Please select a subcircuit to delete.'));
      return;
    }
    if (!window.confirm(`${t('Are you sure you want to delete')} ${m.name}?`)) return;
    controller.deleteSubcircuitModel(m);
    setModels(models.filter((x) => x !== m));
    setPicked(-1);
  };
  return (
    <Shell title={t('Subcircuit Manager')}>
      <div className="subcircuit-manager">
        {models.length === 0 ? (
          <p className="field-label">
            {t('No subcircuits yet. File > Create Subcircuit makes one.')}
          </p>
        ) : (
          <select
            className="select subcircuit-manager-list"
            size={Math.min(8, Math.max(5, models.length))}
            aria-label={t('Subcircuits')}
            value={picked < 0 ? '' : String(picked)}
            onChange={(e) => setPicked(Number(e.target.value))}
            data-testid="subcircuit-manager-list"
          >
            {models.map((m, i) => (
              <option key={m.name} value={i}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <div className="dialog-buttons">
          <button
            type="button"
            className="button"
            onClick={del}
            disabled={models.length === 0}
            data-testid="subcircuit-manager-delete"
          >
            {t('Delete')}
          </button>
          <Dialog.Close asChild>
            <button type="button" className="button button-primary">
              {t('Done')}
            </button>
          </Dialog.Close>
        </div>
      </div>
    </Shell>
  );
}
