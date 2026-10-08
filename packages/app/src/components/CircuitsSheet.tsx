// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ExampleItem, ExampleMenu } from '../examples.ts';
import { openExample } from '../startup.ts';
import { CategoryIcon } from './CategoryIcon.tsx';
import { Icon } from './Icon.tsx';
import { t } from '../i18n.ts';

/** Every circuit under a menu, with the groups it sits in. */
function flatten(menu: ExampleMenu, path: string[] = []): { item: ExampleItem; path: string[] }[] {
  const out: { item: ExampleItem; path: string[] }[] = [];
  for (const it of menu.items) {
    if (it.kind === 'menu') out.push(...flatten(it, [...path, it.title]));
    else out.push({ item: it, path });
  }
  return out;
}

/** A group of circuits that opens in place (nested groups indent). */
function Group(props: { menu: ExampleMenu; depth: number; pick: (it: ExampleItem) => void }) {
  const [open, setOpen] = useState(false);
  const { menu, depth } = props;
  return (
    <li className="sheet-category">
      <button
        type="button"
        className="sheet-row sheet-group"
        style={{ paddingLeft: 16 + depth * 16 }}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <CategoryIcon title={menu.title} />
        <span className="sheet-row-title">{t(menu.title)}</span>
        <Icon name="chevronRight" className="icon sheet-chevron" />
      </button>
      {open && <Items menu={menu} depth={depth + 1} pick={props.pick} />}
    </li>
  );
}

function Items(props: { menu: ExampleMenu; depth: number; pick: (it: ExampleItem) => void }) {
  return (
    <ul className="sheet-list">
      {props.menu.items.map((it, i) =>
        it.kind === 'menu' ? (
          <Group key={`m${i}`} menu={it} depth={props.depth} pick={props.pick} />
        ) : (
          <li key={it.file}>
            <button
              type="button"
              className="sheet-row"
              style={{ paddingLeft: 16 + props.depth * 16 }}
              onClick={() => props.pick(it)}
            >
              <span className="sheet-row-title">{t(it.title)}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

/** How far (px) a sheet must be pulled down, or how fast (px/ms), to let it go. */
const DISMISS_DISTANCE = 96;
const DISMISS_SPEED = 0.6;

/**
 * Pull the sheet down to dismiss it: from its handle or header at any time, and from the list
 * once the list is scrolled to its top (further down the list a downward swipe scrolls it).
 */
function useSwipeToDismiss(
  // the element itself, not a ref: the dialog's portal mounts it after the first render
  el: HTMLElement | null,
  list: RefObject<HTMLElement | null>,
  dismiss: () => void,
): void {
  const onDismiss = useRef(dismiss);
  useEffect(() => {
    onDismiss.current = dismiss;
  });
  useEffect(() => {
    if (!el) return;
    let startY = 0;
    let startT = 0;
    let dy = 0;
    let state: 'idle' | 'pending' | 'drag' | 'scroll' = 'idle';
    const inList = (t: EventTarget | null): boolean =>
      t instanceof Node && (list.current?.contains(t) ?? false);
    const start = (e: TouchEvent): void => {
      const touch = e.touches[0];
      if (e.touches.length !== 1 || !touch) {
        state = 'idle';
        return;
      }
      startY = touch.clientY;
      startT = e.timeStamp;
      dy = 0;
      state = inList(e.target) && (list.current?.scrollTop ?? 0) > 0 ? 'scroll' : 'pending';
    };
    const move = (e: TouchEvent): void => {
      const touch = e.touches[0];
      if (!touch || state === 'idle' || state === 'scroll') return;
      dy = touch.clientY - startY;
      if (state === 'pending') {
        if (Math.abs(dy) < 6) return;
        // an upward swipe scrolls the list as usual
        if (dy < 0) {
          state = 'scroll';
          return;
        }
        state = 'drag';
        el.style.transition = 'none';
      }
      e.preventDefault();
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const end = (e: TouchEvent): void => {
      if (state === 'drag') {
        const speed = dy / Math.max(1, e.timeStamp - startT);
        el.style.transition = '';
        if (dy > DISMISS_DISTANCE || speed > DISMISS_SPEED) {
          el.style.transform = 'translateY(100%)';
          window.setTimeout(() => onDismiss.current(), 180);
        } else el.style.transform = '';
      }
      state = 'idle';
    };
    el.addEventListener('touchstart', start, { passive: true });
    // not passive: a pull that drags the sheet must not also scroll or bounce the page
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [el, list]);
}

/**
 * The Circuits menu on a phone: a sheet with a search box and groups that open in place, where
 * the desktop dropdown's side-opening submenus have no room. Tapping outside it, pulling it down,
 * the close button or Escape put it away.
 */
export function CircuitsSheet(props: { root: ExampleMenu; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const all = useMemo(() => flatten(props.root), [props.root]);
  const q = query.trim().toLowerCase();
  // titles match in the interface language and in English
  const found =
    q === ''
      ? []
      : all.filter(
          (e) =>
            t(e.item.title).toLowerCase().includes(q) || e.item.title.toLowerCase().includes(q),
        );
  const [sheet, setSheet] = useState<HTMLDivElement | null>(null);
  const body = useRef<HTMLDivElement>(null);
  useSwipeToDismiss(sheet, body, props.onClose);
  const pick = (it: ExampleItem): void => {
    props.onClose();
    void openExample(it.file, it.title, true, true);
  };
  return (
    <Dialog.Root open onOpenChange={(o) => !o && props.onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="circuits-sheet-scrim" data-testid="circuits-sheet-scrim" />
        <Dialog.Content ref={setSheet} className="circuits-sheet" data-testid="circuits-sheet">
          <div className="circuits-sheet-handle" aria-hidden>
            <span className="sheet-handle-bar" />
          </div>
          <header className="circuits-sheet-header">
            <Dialog.Title className="circuits-sheet-title">{t('Circuits')}</Dialog.Title>
            <Dialog.Description className="visually-hidden">
              {t('Open an example circuit')}
            </Dialog.Description>
            <Dialog.Close className="icon-button" aria-label={t('Close')}>
              <Icon name="close" />
            </Dialog.Close>
          </header>
          <label className="palette-search circuits-sheet-search">
            <Icon name="search" />
            <input
              className="palette-search-input"
              placeholder={t('Search circuits')}
              value={query}
              data-testid="circuits-search"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div ref={body} className="circuits-sheet-body" key={q === '' ? 'tree' : 'search'}>
            {q === '' ? (
              <Items menu={props.root} depth={0} pick={pick} />
            ) : found.length === 0 ? (
              <p className="inspector-empty circuits-sheet-empty">{t('No circuits match.')}</p>
            ) : (
              <ul className="sheet-list">
                {found.map(({ item, path }) => (
                  <li key={item.file}>
                    <button type="button" className="sheet-row" onClick={() => pick(item)}>
                      <span className="sheet-row-title">{t(item.title)}</span>
                      <span className="sheet-row-path">{path.map((p) => t(p)).join(' › ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
