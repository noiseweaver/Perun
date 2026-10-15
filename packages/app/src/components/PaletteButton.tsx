// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { Simulation, constructElement } from '@perun/elements';
import { drawPreview } from '@perun/render';
import { useEffect, useRef } from 'react';
import type { PaletteItem } from '../editor/catalog.ts';
import { tItem } from '../i18n.ts';
import { controller } from '../SimController.ts';
import { setPaletteOpen, shownTheme, useApp } from '../store.ts';

const previewSim = new Simulation();
const ICON_W = 44;
const ICON_H = 32;

/** The element drawn small with the current theme. */
export function Preview({ className }: { className: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useApp(shownTheme);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    // a user's subcircuit is found through the circuit's own model list
    const sim = className.startsWith('CustomCompositeElm:') ? controller.circuit.sim : previewSim;
    const e = constructElement(className, 0, 0, sim);
    if (!e) return;
    e.dragPlace(0, 0, false);
    drawPreview(c, e, theme, ICON_W, ICON_H, window.devicePixelRatio || 1);
  }, [className, theme]);
  return (
    <canvas
      ref={ref}
      className="palette-icon"
      style={{ width: ICON_W, height: ICON_H }}
      aria-hidden
    />
  );
}

/** Pixels a press must travel before it becomes a drag onto the canvas. */
const DRAG_THRESHOLD = 6;

/**
 * A component to pick: a click arms it for placing by dragging on the canvas (again to stop), a
 * drag carries it onto the canvas. A slot shows only the drawing, its name as a tooltip.
 */
export function PaletteButton({
  item,
  active,
  testId,
  slot = false,
}: {
  item: PaletteItem;
  active: boolean;
  testId: string;
  slot?: boolean;
}) {
  const drag = useRef<{ x: number; y: number; id: number; active: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>): void => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD) return;
      d.active = true;
    }
    const pos = controller.clientToCircuit(e.clientX, e.clientY);
    controller.editor.paletteDragMove(item.className, pos, e.shiftKey);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.active) {
      controller.editor.paletteDragEnd();
      // the drag is not a click
      e.preventDefault();
      return;
    }
    // a click picks the element for placing by dragging on the canvas (again to stop)
    if (active) controller.editor.setSelectMode();
    else controller.editor.setAddMode(item.className);
    if (window.innerWidth < 720) setPaletteOpen(false);
  };
  const onPointerCancel = (): void => {
    drag.current = null;
    controller.editor.paletteDragMove(item.className, null, false);
  };

  const name = tItem(item.label);
  return (
    <button
      type="button"
      className={slot ? 'quick-slot' : 'palette-item'}
      data-active={active || undefined}
      data-testid={testId}
      title={item.shortcut ? `${name} (${item.shortcut})` : name}
      aria-label={slot ? name : undefined}
      aria-pressed={slot ? active : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (active) controller.editor.setSelectMode();
          else controller.editor.setAddMode(item.className);
        }
      }}
    >
      <Preview className={item.className} />
      {!slot && <span className="palette-label">{name}</span>}
      {!slot && item.shortcut && <kbd className="palette-key">{item.shortcut}</kbd>}
    </button>
  );
}
