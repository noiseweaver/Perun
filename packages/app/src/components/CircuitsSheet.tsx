// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import * as Dialog from '@radix-ui/react-dialog';
import { useMemo, useState } from 'react';
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
        <span className="sheet-row-title">{menu.title}</span>
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
              <span className="sheet-row-title">{it.title}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * The Circuits menu on a phone: a full-screen sheet with a search box and groups that open in
 * place, where the desktop dropdown's side-opening submenus have no room.
 */
export function CircuitsSheet(props: { root: ExampleMenu; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const all = useMemo(() => flatten(props.root), [props.root]);
  const q = query.trim().toLowerCase();
  const found = q === '' ? [] : all.filter((e) => e.item.title.toLowerCase().includes(q));
  const pick = (it: ExampleItem): void => {
    props.onClose();
    void openExample(it.file, it.title, true, true);
  };
  return (
    <Dialog.Root open onOpenChange={(o) => !o && props.onClose()}>
      <Dialog.Portal>
        <Dialog.Content className="circuits-sheet" data-testid="circuits-sheet">
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
          <div className="circuits-sheet-body" key={q === '' ? 'tree' : 'search'}>
            {q === '' ? (
              <Items menu={props.root} depth={0} pick={pick} />
            ) : found.length === 0 ? (
              <p className="inspector-empty circuits-sheet-empty">{t('No circuits match.')}</p>
            ) : (
              <ul className="sheet-list">
                {found.map(({ item, path }) => (
                  <li key={item.file}>
                    <button type="button" className="sheet-row" onClick={() => pick(item)}>
                      <span className="sheet-row-title">{item.title}</span>
                      <span className="sheet-row-path">{path.join(' › ')}</span>
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
