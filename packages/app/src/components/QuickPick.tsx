// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { Fragment, useEffect, useRef, useState } from 'react';
import type { PaletteItem } from '../editor/catalog.ts';
import {
  moveFavorite,
  quickPickItems,
  setBarFolded,
  useQuickPick,
  type QuickPickBar,
} from '../quickPick.ts';
import { setPaletteOpen, useApp } from '../store.ts';
import { t, tItem } from '../i18n.ts';
import { Icon } from './Icon.tsx';
import { PaletteButton, Preview } from './PaletteButton.tsx';

/**
 * Favorite and recent components, one tap or click each.
 * - `strip`: a row under the canvas on phones, ending in a button that opens the palette. It
 *   folds away completely, leaving only a small handle.
 * - `grid`: at the top of the open palette, where the favorites can be put in order.
 */
export function QuickPick({
  variant,
  collapsed,
  onToggle,
}: {
  variant: 'strip' | 'grid';
  /** grid: the palette's folded categories; Favorites and Recent fold like the others. */
  collapsed?: ReadonlySet<string> | undefined;
  onToggle?: ((key: string) => void) | undefined;
}) {
  const barOn = useApp((s) => s.settings.quickPickBar);
  const folded = useQuickPick((s) => s.folded.strip);
  if (variant === 'grid')
    return <QuickPickBody variant="grid" collapsed={collapsed} onToggle={onToggle} />;
  if (!barOn) return null;
  return (
    <div className="quick-pick-dock quick-pick-dock-strip" data-folded={folded || undefined}>
      <FoldHandle bar="strip" folded={folded} />
      {!folded && <QuickPickBody variant="strip" />}
    </div>
  );
}

/** The key of Favorites or Recent among the palette's folded categories. */
function quickGroupKey(id: string): string {
  return `quick:${id}`;
}

/**
 * The tab at the canvas's left edge that brings the palette back while it is slid away (on a
 * phone, only while the strip, which has its own button for that, is folded or turned off).
 */
export function PaletteTab() {
  return (
    <button
      type="button"
      className="palette-tab"
      aria-label={t('Show components')}
      title={t('Show components')}
      data-testid="palette-reveal"
      onClick={() => setPaletteOpen(true)}
    >
      <Icon name="chevronRight" size={20} />
    </button>
  );
}

/** A small grip at the edge of a bar that folds it away and brings it back. */
function FoldHandle({ bar, folded }: { bar: QuickPickBar; folded: boolean }) {
  const label = t(folded ? 'Show quick pick' : 'Hide quick pick');
  return (
    <button
      type="button"
      className={`quick-pick-handle quick-pick-handle-${bar}`}
      aria-label={label}
      title={label}
      aria-expanded={!folded}
      data-testid={`quick-${bar}-fold`}
      onClick={() => setBarFolded(bar, !folded)}
    >
      <span className="quick-pick-grip" aria-hidden />
    </button>
  );
}

function QuickPickBody({
  variant,
  collapsed,
  onToggle,
}: {
  variant: 'strip' | 'grid';
  collapsed?: ReadonlySet<string> | undefined;
  onToggle?: ((key: string) => void) | undefined;
}) {
  const favorites = useQuickPick((s) => s.favorites);
  const recents = useQuickPick((s) => s.recents);
  const models = useApp((s) => s.subcircuitModels);
  const addClass = useApp((s) => s.editor.addClass);
  const [reordering, setReordering] = useState(false);
  const items = quickPickItems(favorites, recents, models);
  const testPrefix = variant === 'grid' ? 'palette-quick' : 'quick';
  const sections = [
    { id: 'favorites', label: t('Favorites'), items: items.favorites },
    { id: 'recent', label: t('Recent'), items: items.recents },
  ].filter((s) => s.items.length > 0);
  if (variant === 'grid' && sections.length === 0) return null;
  const shut = (id: string): boolean =>
    variant === 'grid' && (collapsed?.has(quickGroupKey(id)) ?? false);

  return (
    <div
      className={`quick-pick quick-pick-${variant}`}
      role="toolbar"
      aria-label={t('Quick pick')}
      aria-orientation="horizontal"
      data-testid={`quick-pick-${variant}`}
    >
      {sections.map((s, i) => (
        <Fragment key={s.id}>
          {i > 0 && <span className="quick-pick-divider" aria-hidden />}
          {variant === 'grid' && (
            <div className="quick-pick-caption">
              <button
                type="button"
                className="palette-group-toggle quick-pick-caption-toggle"
                aria-expanded={!shut(s.id)}
                data-testid={`palette-group-quick-${s.id}`}
                onClick={() => onToggle?.(quickGroupKey(s.id))}
              >
                <Icon name="dropDown" size={18} className="palette-group-chevron" />
                {s.label}
              </button>
              {s.id === 'favorites' && s.items.length > 1 && !shut(s.id) && (
                <button
                  type="button"
                  className="quick-pick-caption-button"
                  aria-pressed={reordering}
                  data-testid="quick-reorder"
                  onClick={() => setReordering(!reordering)}
                >
                  {t(reordering ? 'Done' : 'Reorder')}
                </button>
              )}
            </div>
          )}
          {shut(s.id) ? null : s.id === 'favorites' && reordering && variant === 'grid' ? (
            <FavoriteOrder items={s.items} label={s.label} />
          ) : (
            <div className="quick-pick-group" role="group" aria-label={s.label}>
              {s.items.map((it) => (
                <PaletteButton
                  key={it.className}
                  item={it}
                  active={addClass === it.className}
                  testId={`${testPrefix}-${it.className}`}
                  slot
                />
              ))}
            </div>
          )}
        </Fragment>
      ))}
      {variant === 'strip' && (
        <>
          <span className="quick-pick-divider" aria-hidden />
          <button
            type="button"
            className="quick-slot quick-pick-more"
            aria-label={t('Show components')}
            title={t('Show components')}
            data-testid="quick-more"
            onClick={() => setPaletteOpen(true)}
          >
            <Icon name="apps" size={24} />
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The favorites while they are being put in order: drag one onto another's place (mouse, pen or
 * finger), or move the focused one with the arrow keys.
 */
function FavoriteOrder({ items, label }: { items: PaletteItem[]; label: string }) {
  const favorites = useQuickPick((s) => s.favorites);
  const dragging = useRef<{ cls: string; id: number } | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const focusAfterMove = useRef<string | null>(null);
  const group = useRef<HTMLDivElement>(null);

  // moving a button in the page can drop its focus: give it back
  useEffect(() => {
    const cls = focusAfterMove.current;
    if (cls === null) return;
    focusAfterMove.current = null;
    group.current?.querySelector<HTMLButtonElement>(`[data-class="${cls}"]`)?.focus();
  }, [favorites]);

  const moveOnto = (cls: string, target: string): void => {
    if (target !== cls) moveFavorite(cls, favorites.indexOf(target));
  };

  return (
    <div
      ref={group}
      className="quick-pick-group quick-pick-order"
      role="group"
      aria-label={label}
      aria-describedby="quick-order-hint"
      data-testid="quick-order"
    >
      {items.map((it) => (
        <button
          key={it.className}
          type="button"
          className="quick-slot quick-order-slot"
          data-class={it.className}
          data-held={held === it.className || undefined}
          data-testid={`quick-order-${it.className}`}
          aria-label={tItem(it.label)}
          title={tItem(it.label)}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            dragging.current = { cls: it.className, id: e.pointerId };
            setHeld(it.className);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = dragging.current;
            if (!d || d.id !== e.pointerId) return;
            const over = document
              .elementFromPoint(e.clientX, e.clientY)
              ?.closest<HTMLElement>('.quick-order-slot');
            const target = over?.dataset['class'];
            if (target !== undefined) moveOnto(d.cls, target);
          }}
          onPointerUp={() => {
            dragging.current = null;
            setHeld(null);
          }}
          onPointerCancel={() => {
            dragging.current = null;
            setHeld(null);
          }}
          onKeyDown={(e) => {
            const step =
              e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                ? -1
                : e.key === 'ArrowRight' || e.key === 'ArrowDown'
                  ? 1
                  : 0;
            if (step === 0) return;
            e.preventDefault();
            const at = items.findIndex((x) => x.className === it.className) + step;
            const target = items[at];
            if (target === undefined) return;
            focusAfterMove.current = it.className;
            moveOnto(it.className, target.className);
          }}
        >
          <Preview className={it.className} />
        </button>
      ))}
      <p id="quick-order-hint" className="quick-order-hint">
        {t('Drag to reorder, or use the arrow keys.')}
      </p>
    </div>
  );
}
