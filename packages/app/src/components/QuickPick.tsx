// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { Fragment } from 'react';
import { quickPickItems, useQuickPick } from '../quickPick.ts';
import { setPaletteOpen, useApp } from '../store.ts';
import { t } from '../i18n.ts';
import { Icon } from './Icon.tsx';
import { PaletteButton } from './PaletteButton.tsx';

/**
 * Favorite and recent components, one tap or click each.
 * - `rail`: down the canvas's left edge while the palette is slid away, under the tab that
 *   brings it back.
 * - `strip`: a row under the canvas on phones, ending in a button that opens the palette.
 * - `grid`: at the top of the open palette.
 */
export function QuickPick({ variant }: { variant: 'rail' | 'strip' | 'grid' }) {
  const favorites = useQuickPick((s) => s.favorites);
  const recents = useQuickPick((s) => s.recents);
  const models = useApp((s) => s.subcircuitModels);
  const addClass = useApp((s) => s.editor.addClass);
  const items = quickPickItems(favorites, recents, models);
  const testPrefix = variant === 'grid' ? 'palette-quick' : 'quick';
  const sections = [
    { id: 'favorites', label: t('Favorites'), items: items.favorites },
    { id: 'recent', label: t('Recent'), items: items.recents },
  ].filter((s) => s.items.length > 0);
  if (variant === 'grid' && sections.length === 0) return null;

  return (
    <div
      className={`quick-pick quick-pick-${variant}`}
      role="toolbar"
      aria-label={t('Quick pick')}
      aria-orientation={variant === 'rail' ? 'vertical' : 'horizontal'}
      data-testid={`quick-pick-${variant}`}
    >
      {variant === 'rail' && (
        <button
          type="button"
          className="quick-pick-reveal"
          aria-label={t('Show components')}
          title={t('Show components')}
          data-testid="palette-reveal"
          onClick={() => setPaletteOpen(true)}
        >
          <Icon name="chevronRight" size={20} />
        </button>
      )}
      {sections.map((s, i) => (
        <Fragment key={s.id}>
          {(i > 0 || variant === 'rail') && <span className="quick-pick-divider" aria-hidden />}
          {variant === 'grid' && (
            <div className="quick-pick-caption" aria-hidden>
              {s.label}
            </div>
          )}
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
