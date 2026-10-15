// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { useEffect, useRef } from 'react';
import { controller } from '../SimController.ts';
import { t, tItem } from '../i18n.ts';
import { useQuickPick } from '../quickPick.ts';
import {
  closeWheel,
  setLit,
  useWheel,
  wedgeAngle,
  wedgeAt,
  wedgeVertical,
  wheelItems,
  type WheelState,
} from '../radialWheel.ts';
import { useApp } from '../store.ts';
import { Icon } from './Icon.tsx';
import { Preview } from './PaletteButton.tsx';

/** Ring radius (slot centres), outer radius and hub radius, in CSS pixels; bigger for fingers. */
const SIZES = {
  mouse: { ring: 72, outer: 104, hub: 26 },
  touch: { ring: 86, outer: 122, hub: 30 },
};
/** Room kept between the wheel and the window's edges. */
const EDGE = 8;
/** Holding q this long without picking and letting go closes the wheel; a shorter tap leaves it open. */
const KEY_TAP_MS = 300;

/** The ring of favorites around the pointer; see radialWheel.ts for how it opens. */
export function RadialWheel() {
  const wheel = useWheel((s) => s.wheel);
  return wheel === null ? null : <Wheel wheel={wheel} />;
}

function Wheel({ wheel }: { wheel: WheelState }) {
  const lit = useWheel((s) => s.lit);
  const favorites = useQuickPick((s) => s.favorites);
  const models = useApp((s) => s.subcircuitModels);
  const canPaste = useApp((s) => s.editor.canPaste);
  const canUndo = useApp((s) => s.editor.canUndo);
  const canRedo = useApp((s) => s.editor.canRedo);
  const items = wheelItems(favorites, models);
  const n = items.length;
  const touch = wheel.via === 'touch';
  const size = touch ? SIZES.touch : SIZES.mouse;
  // nudged inward near the window's edges; the part still goes where the wheel opened
  const below = 56;
  const cx = clamp(wheel.x, size.outer + EDGE, window.innerWidth - size.outer - EDGE);
  const cy = clamp(wheel.y, size.outer + EDGE, window.innerHeight - size.outer - below - EDGE);
  const root = useRef<HTMLDivElement>(null);
  // lifting the finger that opened the wheel can send a click to whatever is under it: only a
  // click whose press started on the wheel counts
  const pressedOnWheel = useRef(false);
  const clickable = (): boolean => pressedOnWheel.current;
  // a button under the wheel pressed by letting go over it (see up below)
  const releasedOnAction = useRef(false);
  const act = (fn: () => void) => (): void => {
    if (!clickable() && !releasedOnAction.current) return;
    releasedOnAction.current = false;
    fn();
  };
  // the latest values for the window listeners below
  const live = useRef({ cx, cy, n, items, wheel });
  live.current = { cx, cy, n, items, wheel };

  useEffect(() => {
    const pick = (i: number): void => {
      const { items, n } = live.current;
      const it = items[i];
      if (it === undefined) return;
      controller.placeFromWheel(it.className, wedgeVertical(i, n));
    };
    /**
     * The button in the row under the wheel at the pointer, if any: by its box, not by what is
     * topmost there, so a chip or panel drawn over its edge doesn't turn a press into a pick.
     */
    const actionAt = (e: PointerEvent): HTMLButtonElement | null => {
      for (const b of root.current?.querySelectorAll<HTMLButtonElement>('.radial-wheel-action') ??
        []) {
        const r = b.getBoundingClientRect();
        if (
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
        )
          return b;
      }
      return null;
    };
    // over the row under the wheel no wedge lights up: it picks by direction everywhere else
    const at = (e: PointerEvent): number =>
      actionAt(e) !== null
        ? -1
        : wedgeAt(e.clientX - live.current.cx, e.clientY - live.current.cy, live.current.n);
    const move = (e: PointerEvent): void => {
      const w = live.current.wheel;
      // a finger only steers the wheel while it is the one that opened it
      if (e.pointerType === 'touch' && w.pointerId !== e.pointerId) return;
      setLit(at(e));
    };
    const up = (e: PointerEvent): void => {
      const w = live.current.wheel;
      if (w.pointerId !== e.pointerId) return;
      const action = e.type === 'pointerup' ? actionAt(e) : null;
      const i = e.type === 'pointerup' ? at(e) : -1;
      if (i >= 0) pick(i);
      // a flick let go in the middle changes nothing; a finger lifted there leaves it open to tap
      else if (w.via === 'flick' && action === null) closeWheel();
      else {
        useWheel.setState({ wheel: { ...w, pointerId: null }, lit: -1 });
        // let go on a button under the wheel: that button, with the wheel left open
        if (action !== null && !action.disabled) {
          releasedOnAction.current = true;
          action.click();
        }
      }
    };
    const downOutside = (e: PointerEvent): void => {
      if (root.current?.contains(e.target as Node)) {
        pressedOnWheel.current = true;
        return;
      }
      // the press only closes the wheel; it doesn't start anything on the canvas
      e.preventDefault();
      e.stopPropagation();
      closeWheel();
    };
    const keyDown = (e: KeyboardEvent): void => {
      const stop = (): void => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (e.key === 'Escape' || (e.key.toLowerCase() === 'q' && !e.repeat)) {
        stop();
        closeWheel();
        return;
      }
      if (e.key.toLowerCase() === 'q') return stop();
      const digit = Number(e.key);
      if (e.key.length === 1 && digit >= 1 && digit <= live.current.n) {
        stop();
        pick(digit - 1);
      }
    };
    const keyUp = (e: KeyboardEvent): void => {
      const w = live.current.wheel;
      if (w.via !== 'key' || e.key.toLowerCase() !== 'q') return;
      const i = useWheel.getState().lit;
      if (i >= 0) pick(i);
      else if (performance.now() - w.openedAt > KEY_TAP_MS) closeWheel();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('pointerdown', downOutside, true);
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('keyup', keyUp, true);
    window.addEventListener('resize', closeWheel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('pointerdown', downOutside, true);
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('keyup', keyUp, true);
      window.removeEventListener('resize', closeWheel);
    };
  }, []);

  const litItem = items[lit];
  const d = size.outer;
  return (
    <div
      ref={root}
      className="radial-wheel"
      data-via={wheel.via}
      style={{ left: cx, top: cy }}
      role="menu"
      aria-label={t('Quick pick wheel')}
      data-testid="radial-wheel"
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        className="radial-wheel-disc"
        width={2 * d}
        height={2 * d}
        viewBox={`${-d} ${-d} ${2 * d} ${2 * d}`}
        aria-hidden
        onClick={(e) => {
          if (!clickable()) return;
          const i = wedgeAt(e.clientX - cx, e.clientY - cy, n);
          const it = items[i];
          if (it !== undefined) controller.placeFromWheel(it.className, wedgeVertical(i, n));
        }}
      >
        <circle className="radial-wheel-base" r={d} />
        {lit >= 0 && n > 0 && <path className="radial-wheel-lit" d={sector(lit, n, size.hub, d)} />}
      </svg>
      {items.map((it, i) => {
        const a = wedgeAngle(i, n);
        const name = tItem(it.label);
        return (
          <button
            key={it.className}
            type="button"
            role="menuitem"
            className="quick-slot radial-wheel-slot"
            data-lit={lit === i || undefined}
            style={{
              left: Math.round(size.ring * Math.cos(a)),
              top: Math.round(size.ring * Math.sin(a)),
            }}
            aria-label={`${name} (${i + 1})`}
            title={name}
            data-testid={`wheel-${it.className}`}
            onClick={() => {
              if (clickable()) controller.placeFromWheel(it.className, wedgeVertical(i, n));
            }}
          >
            <Preview className={it.className} />
          </button>
        );
      })}
      <button
        type="button"
        className="radial-wheel-hub"
        style={{ width: 2 * size.hub, height: 2 * size.hub }}
        aria-label={t('Close')}
        title={t('Close')}
        data-testid="radial-wheel-close"
        onClick={() => {
          if (clickable()) closeWheel();
        }}
      >
        <Icon name="close" size={18} />
      </button>
      <div className="radial-wheel-name" style={{ top: d + 6 }} aria-live="polite">
        {litItem !== undefined ? tItem(litItem.label) : ''}
      </div>
      <div className="radial-wheel-actions" style={{ top: d + 32 }}>
        {/* undo and redo leave the wheel open, to step back or forward more than once */}
        <button
          type="button"
          className="radial-wheel-action"
          disabled={!canUndo}
          aria-label={t('Undo')}
          title={t('Undo')}
          data-testid="wheel-undo"
          onClick={act(() => controller.undo())}
        >
          <Icon name="undo" size={20} />
        </button>
        <button
          type="button"
          className="radial-wheel-action"
          disabled={!canRedo}
          aria-label={t('Redo')}
          title={t('Redo')}
          data-testid="wheel-redo"
          onClick={act(() => controller.redo())}
        >
          <Icon name="redo" size={20} />
        </button>
        {touch && (
          // a long press on empty canvas used to open a menu with these
          <>
            <span className="radial-wheel-actions-divider" aria-hidden />
            <button
              type="button"
              className="radial-wheel-action"
              disabled={!canPaste}
              aria-label={t('Paste')}
              title={t('Paste')}
              onClick={act(() => {
                closeWheel();
                controller.paste();
              })}
            >
              <Icon name="paste" size={20} />
            </button>
            <button
              type="button"
              className="radial-wheel-action"
              aria-label={t('Select All')}
              title={t('Select All')}
              onClick={act(() => {
                closeWheel();
                controller.editor.selectAll();
                controller.publishEditor();
              })}
            >
              <Icon name="selectAll" size={20} />
            </button>
            <button
              type="button"
              className="radial-wheel-action"
              aria-label={t('Centre Circuit')}
              title={t('Centre Circuit')}
              onClick={act(() => {
                closeWheel();
                controller.fit();
              })}
            >
              <Icon name="fit" size={20} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
}

/** The ring segment of wedge `i` of `n` between radii r0 and r1, as an SVG path. */
function sector(i: number, n: number, r0: number, r1: number): string {
  const a = wedgeAngle(i, n);
  const h = Math.PI / n;
  const p = (r: number, t: number): string =>
    `${(r * Math.cos(t)).toFixed(2)} ${(r * Math.sin(t)).toFixed(2)}`;
  if (n === 1) return `M ${-r1} 0 A ${r1} ${r1} 0 1 1 ${r1} 0 A ${r1} ${r1} 0 1 1 ${-r1} 0 Z`;
  const large = 2 * h > Math.PI ? 1 : 0;
  return [
    `M ${p(r0, a - h)}`,
    `L ${p(r1, a - h)}`,
    `A ${r1} ${r1} 0 ${large} 1 ${p(r1, a + h)}`,
    `L ${p(r0, a + h)}`,
    `A ${r0} ${r0} 0 ${large} 0 ${p(r0, a - h)}`,
    'Z',
  ].join(' ');
}
