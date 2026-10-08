// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { Simulation, constructElement } from '@perun/elements';
import { drawPreview } from '@perun/render';
import { useEffect, useRef, useState } from 'react';
import { searchPalette, type PaletteGroup, type PaletteItem } from '../editor/catalog.ts';
import { controller } from '../SimController.ts';
import { setPaletteOpen, shownTheme, useApp } from '../store.ts';
import { Icon } from './Icon.tsx';
import { t, tGroup, tItem } from '../i18n.ts';

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

function PaletteButton({ item, active }: { item: PaletteItem; active: boolean }) {
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

  return (
    <button
      type="button"
      className="palette-item"
      data-active={active || undefined}
      data-testid={`palette-${item.className}`}
      title={item.shortcut ? `${tItem(item.label)} (${item.shortcut})` : tItem(item.label)}
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
      <span className="palette-label">{tItem(item.label)}</span>
      {item.shortcut && <kbd className="palette-key">{item.shortcut}</kbd>}
    </button>
  );
}

const COLLAPSED_KEY = 'circuitjs-next.paletteCollapsed';

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveCollapsed(c: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...c]));
  } catch {
    // storage disabled: the groups stay as they are for this page
  }
}

/**
 * The circuit's and the session's subcircuit models as a last group, as upstream's Subcircuits
 * menu (UIManager's subcircuit menu update), matched by name when searching.
 */
function withSubcircuits(groups: PaletteGroup[], models: string[], query: string): PaletteGroup[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const items: PaletteItem[] = models
    .filter((name) => words.every((w) => `${name} subcircuit`.toLowerCase().includes(w)))
    .map((name) => ({
      className: `CustomCompositeElm:${name}`,
      label: name,
      keywords: 'subcircuit',
      shortcut: null,
    }));
  return items.length === 0 ? groups : [...groups, { title: 'Subcircuits', items }];
}

/** Searchable list of the elements that can be placed. */
export function Palette() {
  const [query, setQuery] = useState('');
  const addClass = useApp((s) => s.editor.addClass);
  const open = useApp((s) => s.paletteOpen);
  const models = useApp((s) => s.subcircuitModels);
  const groups = withSubcircuits(searchPalette(query), models, query);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const toggleGroup = (title: string): void => {
    const next = new Set(collapsed);
    if (next.has(title)) next.delete(title);
    else next.add(title);
    setCollapsed(next);
    saveCollapsed(next);
  };
  // a search shows every match, whatever is collapsed
  const searching = query.trim() !== '';
  return (
    <aside
      className="palette"
      aria-label={t('Components')}
      data-testid="palette"
      data-open={open}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="palette-inner">
        <div className="palette-top">
          <div className="palette-search">
            <Icon name="search" size={20} />
            <input
              className="palette-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Search components')}
              aria-label={t('Search components')}
              data-testid="palette-search"
            />
            {query && (
              <button
                type="button"
                className="icon-button icon-button-small"
                aria-label={t('Clear search')}
                onClick={() => setQuery('')}
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
          <button
            type="button"
            className="icon-button icon-button-small"
            aria-label={t('Hide components')}
            title={t('Hide components')}
            data-testid="palette-hide"
            onClick={() => setPaletteOpen(false)}
          >
            <Icon name="chevronLeft" size={20} />
          </button>
        </div>
        <div className="palette-hint">{t('Click, then drag on the canvas. Or drag onto it.')}</div>
        <div className="palette-list">
          {groups.map((g) => (
            <section key={g.title} className="palette-group">
              <h2 className="palette-group-title">
                <button
                  type="button"
                  className="palette-group-toggle"
                  aria-expanded={searching || !collapsed.has(g.title)}
                  data-testid={`palette-group-${g.title}`}
                  onClick={() => toggleGroup(g.title)}
                  disabled={searching}
                >
                  <Icon name="dropDown" size={18} className="palette-group-chevron" />
                  {tGroup(g.title)}
                </button>
              </h2>
              {(searching || !collapsed.has(g.title)) &&
                g.items.map((it) => (
                  <PaletteButton key={it.className} item={it} active={addClass === it.className} />
                ))}
            </section>
          ))}
          {groups.length === 0 && <p className="palette-empty">No component matches “{query}”.</p>}
        </div>
      </div>
    </aside>
  );
}
