// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { useEffect, useMemo, useRef, useState } from 'react';
import { searchPalette, type PaletteItem } from '../editor/catalog.ts';
import { t, tItem } from '../i18n.ts';
import { closePartSearch, usePartSearch, type PartSearchState } from '../partSearch.ts';
import { controller } from '../SimController.ts';
import { useApp } from '../store.ts';
import { Icon } from './Icon.tsx';
import { Preview } from './PaletteButton.tsx';

/** Width of the box and the room kept from the window's edges, in CSS pixels. */
const WIDTH = 300;
const EDGE = 8;
/** Results shown before the list scrolls. */
const SHOWN = 8;

/** The part search box at the pointer; see partSearch.ts. */
export function PartSearch() {
  const search = usePartSearch((s) => s.search);
  return search === null ? null : <SearchBox search={search} />;
}

function SearchBox({ search }: { search: PartSearchState }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const models = useApp((s) => s.subcircuitModels);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const replacing = search.replace;
  // what fits in place of the part being replaced: the same posts in the same places
  const fits = useMemo(
    () => (replacing === null ? null : new Set(controller.replacements(replacing))),
    [replacing],
  );
  const items = useMemo(() => {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const out: PaletteItem[] = searchPalette(query).flatMap((g) => g.items);
    for (const name of models)
      if (words.every((w) => `${name} subcircuit`.toLowerCase().includes(w)))
        out.push({
          className: `CustomCompositeElm:${name}`,
          label: name,
          keywords: 'subcircuit',
          shortcut: null,
        });
    return out.filter(
      (it) =>
        (fits === null || fits.has(it.className)) &&
        (replacing === null || it.className !== replacing.getClassName()),
    );
  }, [query, models, fits, replacing]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  useEffect(() => {
    const down = (e: PointerEvent): void => {
      if (root.current?.contains(e.target as Node)) return;
      closePartSearch();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('resize', closePartSearch);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('resize', closePartSearch);
    };
  }, []);

  const pick = (it: PaletteItem | undefined): void => {
    if (it === undefined) return;
    closePartSearch();
    if (replacing !== null) controller.replaceWith(replacing, it.className);
    else controller.placeFromSearch(it.className, search.gx, search.gy);
  };

  const left = Math.min(Math.max(EDGE, search.x - WIDTH / 2), window.innerWidth - WIDTH - EDGE);
  // the whole list fits on screen: near the bottom it opens upwards
  const tall = 72 + SHOWN * 44;
  const top = Math.max(EDGE, Math.min(search.y - 24, window.innerHeight - tall - EDGE));
  return (
    <div
      ref={root}
      className="part-search"
      style={{ left, top, width: WIDTH }}
      role="dialog"
      aria-label={replacing !== null ? t('Replace with…') : t('Search components')}
      data-testid="part-search"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="palette-search part-search-field">
        <Icon name={replacing !== null ? 'replace' : 'search'} size={20} />
        <input
          className="palette-search-input"
          autoFocus
          value={query}
          placeholder={replacing !== null ? t('Replace with…') : t('Search components')}
          aria-label={replacing !== null ? t('Replace with…') : t('Search components')}
          role="combobox"
          aria-expanded
          aria-controls="part-search-list"
          aria-activedescendant={items.length > 0 ? `part-search-${active}` : undefined}
          data-testid="part-search-input"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(items.length - 1, a + 1));
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
            else if (e.key === 'Enter') pick(items[active]);
            else if (e.key === 'Escape') closePartSearch();
            else {
              e.stopPropagation();
              return;
            }
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      </div>
      <ul
        ref={list}
        id="part-search-list"
        className="part-search-list"
        role="listbox"
        style={{ maxHeight: SHOWN * 44 }}
      >
        {items.length === 0 && (
          <li className="part-search-empty">
            {replacing !== null ? t('Nothing else fits here.') : t('No parts match.')}
          </li>
        )}
        {items.map((it, i) => (
          <li
            key={it.className}
            id={`part-search-${i}`}
            data-index={i}
            role="option"
            aria-selected={i === active}
            className="part-search-item"
            data-testid={`part-search-${it.className}`}
            onPointerEnter={() => setActive(i)}
            onClick={() => pick(it)}
          >
            <Preview className={it.className} />
            <span className="part-search-name">{tItem(it.label)}</span>
            {it.shortcut !== null && <kbd className="part-search-key">{it.shortcut}</kbd>}
          </li>
        ))}
      </ul>
    </div>
  );
}
