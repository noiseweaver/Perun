// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { useState } from 'react';
import { searchPalette, type PaletteGroup, type PaletteItem } from '../editor/catalog.ts';
import { setPaletteOpen, useApp } from '../store.ts';
import { Icon } from './Icon.tsx';
import { PaletteButton } from './PaletteButton.tsx';
import { QuickPick } from './QuickPick.tsx';
import { toggleFavorite, useQuickPick } from '../quickPick.ts';
import { t, tGroup, tItem } from '../i18n.ts';
import { platform } from '../platform/index.ts';

/** The star after a palette row: pins the component to the quick pick, or unpins it. */
function FavoriteStar({ item, testId }: { item: PaletteItem; testId: string }) {
  const on = useQuickPick((s) => s.favorites.includes(item.className));
  const label = `${t(on ? 'Remove from favorites' : 'Add to favorites')}: ${tItem(item.label)}`;
  return (
    <button
      type="button"
      className="icon-button icon-button-small palette-star"
      data-on={on || undefined}
      aria-pressed={on}
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={() => toggleFavorite(item.className)}
    >
      <Icon name={on ? 'star' : 'starBorder'} size={18} />
    </button>
  );
}

const COLLAPSED_KEY = 'circuitjs-next.paletteCollapsed';

function loadCollapsed(): Set<string> {
  try {
    const raw = platform.storage.getItem(COLLAPSED_KEY);
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveCollapsed(c: Set<string>): void {
  try {
    platform.storage.setItem(COLLAPSED_KEY, JSON.stringify([...c]));
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
          {!searching && <QuickPick variant="grid" collapsed={collapsed} onToggle={toggleGroup} />}
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
                  <div key={it.className} className="palette-row">
                    <PaletteButton
                      item={it}
                      active={addClass === it.className}
                      testId={`palette-${it.className}`}
                    />
                    <FavoriteStar item={it} testId={`palette-star-${it.className}`} />
                  </div>
                ))}
            </section>
          ))}
          {groups.length === 0 && <p className="palette-empty">No component matches “{query}”.</p>}
        </div>
      </div>
    </aside>
  );
}
