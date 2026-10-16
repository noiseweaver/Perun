// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Not in upstream: File > My circuits, the circuits saved in this browser.

import * as Menu from '@radix-ui/react-dropdown-menu';
import { useEffect, useRef, useState } from 'react';
import { openDialog } from '../commands.ts';
import { download } from '../download.ts';
import { openSaved, removeSaved, renameSaved } from '../browserSaves.ts';
import {
  copyName,
  filterByName,
  listCircuits,
  newId,
  onCircuitsChanged,
  putCircuit,
  type SavedCircuit,
} from '../myCircuits.ts';
import { showToast, useApp } from '../store.ts';
import { t } from '../i18n.ts';
import { Shell } from './DialogShell.tsx';
import { Icon, MenuIcon } from './Icon.tsx';

/** A search box shows once there are more circuits than fit at a glance. */
const SEARCH_FROM = 7;

/** When a circuit was saved: the time today, the day this year, else the date. */
function when(ms: number, now = new Date()): string {
  const d = new Date(ms);
  try {
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (d.getFullYear() === now.getFullYear())
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function fileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'circuit';
  return /\.(txt|circuitjs|xml)$/i.test(safe) ? safe : `${safe}.txt`;
}

export function MyCircuitsDialog() {
  const [list, setList] = useState<SavedCircuit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const current = useApp((s) => s.savedAs?.id ?? null);

  useEffect(() => {
    let live = true;
    const load = (): void => {
      listCircuits().then(
        (l) => {
          if (live) setList(l);
        },
        (e: unknown) => {
          if (live) setError(e instanceof Error ? e.message : String(e));
        },
      );
    };
    load();
    const off = onCircuitsChanged(load);
    return () => {
      live = false;
      off();
    };
  }, []);

  const shown = list === null ? [] : filterByName(list, query);

  const act = (p: Promise<unknown>): void => {
    p.catch((e: unknown) => showToast(e instanceof Error ? e.message : String(e)));
  };

  return (
    <Shell
      title={t('My circuits')}
      description={t('Circuits saved in this browser on this device.')}
      wide
      className="my-circuits-dialog"
    >
      {list !== null && list.length >= SEARCH_FROM && (
        <label className="palette-search my-circuits-search">
          <Icon name="search" className="icon" />
          <input
            className="palette-search-input"
            placeholder={t('Search my circuits')}
            value={query}
            data-testid="my-circuits-search"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      <div className="my-circuits-body" data-testid="my-circuits">
        {error !== null && <p className="my-circuits-empty">{error}</p>}
        {error === null && list !== null && list.length === 0 && (
          <p className="my-circuits-empty" data-testid="my-circuits-empty">
            {t('Nothing saved yet. Use File > Save… and choose In this browser.')}
          </p>
        )}
        {list !== null && list.length > 0 && shown.length === 0 && (
          <p className="my-circuits-empty">{t('No circuits match.')}</p>
        )}
        <ul className="my-circuits-grid">
          {shown.map((c) => (
            <li
              key={c.id}
              className={`my-circuit${c.id === current ? ' my-circuit-current' : ''}`}
              data-testid="my-circuit"
            >
              <button
                type="button"
                className="my-circuit-open"
                aria-label={`${t('Open')} ${c.name}`}
                onClick={() => {
                  openDialog(null);
                  act(openSaved(c.id));
                }}
              >
                {c.thumb !== null ? (
                  <img className="my-circuit-thumb" src={c.thumb} alt="" draggable={false} />
                ) : (
                  <span className="my-circuit-thumb my-circuit-thumb-empty">
                    <Icon name="noteAdd" className="icon" />
                  </span>
                )}
              </button>
              {confirming === c.id ? (
                <div className="my-circuit-confirm">
                  <span className="my-circuit-confirm-text">
                    {t('Delete “{name}”?').replace('{name}', c.name)}
                  </span>
                  <div className="my-circuit-confirm-buttons">
                    <button type="button" className="button" onClick={() => setConfirming(null)}>
                      {t('Cancel')}
                    </button>
                    <button
                      type="button"
                      className="button button-danger"
                      data-testid="my-circuit-delete-ok"
                      onClick={() => {
                        setConfirming(null);
                        act(removeSaved(c.id));
                      }}
                    >
                      {t('Delete')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="my-circuit-info">
                  {renaming === c.id ? (
                    <RenameField
                      name={c.name}
                      onDone={(name) => {
                        setRenaming(null);
                        if (name !== null && name !== c.name) act(renameSaved(c.id, name));
                      }}
                    />
                  ) : (
                    <div className="my-circuit-text">
                      <span
                        className="my-circuit-name"
                        title={c.name}
                        data-testid="my-circuit-name"
                      >
                        {c.name}
                      </span>
                      <span className="my-circuit-date">
                        {c.id === current ? `${t('On screen')} · ` : ''}
                        {when(c.modified)}
                      </span>
                    </div>
                  )}
                  <Menu.Root>
                    <Menu.Trigger
                      className="icon-button my-circuit-more"
                      aria-label={t('More')}
                      title={t('More')}
                      data-testid="my-circuit-more"
                    >
                      <Icon name="moreVert" className="icon" />
                    </Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Content className="menu-content" sideOffset={4} align="end">
                        <Menu.Item
                          className="menu-item"
                          data-testid="my-circuit-rename"
                          onSelect={() => setRenaming(c.id)}
                        >
                          <MenuIcon name="edit" />
                          {t('Rename')}
                        </Menu.Item>
                        <Menu.Item
                          className="menu-item"
                          data-testid="my-circuit-duplicate"
                          onSelect={() =>
                            act(
                              putCircuit({
                                ...c,
                                id: newId(),
                                name: copyName(c.name, list ?? []),
                                created: Date.now(),
                                modified: Date.now(),
                              }),
                            )
                          }
                        >
                          <MenuIcon name="duplicate" />
                          {t('Duplicate')}
                        </Menu.Item>
                        <Menu.Item
                          className="menu-item"
                          data-testid="my-circuit-download"
                          onSelect={() => download(fileName(c.name), c.text, 'text/plain')}
                        >
                          <MenuIcon name="download" />
                          {t('Download file')}
                        </Menu.Item>
                        <Menu.Separator className="menu-separator" />
                        <Menu.Item
                          className="menu-item"
                          data-testid="my-circuit-delete"
                          onSelect={() => setConfirming(c.id)}
                        >
                          <MenuIcon name="delete" />
                          {t('Delete…')}
                        </Menu.Item>
                      </Menu.Content>
                    </Menu.Portal>
                  </Menu.Root>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="dialog-buttons">
        <button type="button" className="button" onClick={() => openDialog(null)}>
          {t('Close')}
        </button>
        <button
          type="button"
          className="button button-primary"
          data-testid="my-circuits-save"
          onClick={() => openDialog('save')}
        >
          {t('Save this circuit…')}
        </button>
      </div>
    </Shell>
  );
}

/** The name as a text field: Enter or leaving it keeps the new name. */
function RenameField(props: { name: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(props.name);
  const done = useRef(false);
  const finish = (name: string | null): void => {
    if (done.current) return;
    done.current = true;
    props.onDone(name === null || name.trim() === '' ? null : name.trim());
  };
  return (
    <input
      className="text-input my-circuit-rename"
      value={value}
      aria-label={t('Name')}
      data-testid="my-circuit-rename-input"
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(value);
        else if (e.key === 'Escape') finish(null);
      }}
    />
  );
}
