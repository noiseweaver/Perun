// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { EmbedConfig, EmbedMessage } from '../embedConfig.ts';
import type { KeyValueStore, Platform, RecordStore } from './types.ts';
import { indexedDbRecords } from './web.ts';

function post(m: EmbedMessage): void {
  window.parent.postMessage(m, '*');
}

/**
 * The app inside the Obsidian plugin's frame (packages/obsidian). The plugin owns the vault:
 * files the app gives the user are written there, and the app's stored data is a copy of the
 * plugin's data (sent back on every change), so it travels with the vault.
 */
export function obsidianPlatform(config: EmbedConfig): Platform {
  const storage = vaultStorage(config.storage);
  return {
    name: 'obsidian',
    apple: config.apple,
    storage,
    // the clipboard stays on this device, so copying between editor tabs doesn't rewrite the vault
    get deviceStorage(): KeyValueStore {
      return window.localStorage;
    },
    records: (database, store) => vaultRecords(storage, database, store),
    saveLabels: { file: 'Save to vault', csv: 'Save CSV to vault' },
    saveFile(name, data) {
      if (typeof data === 'string') post({ perun: 'file', name, data });
      else
        data.arrayBuffer().then(
          (buffer) => post({ perun: 'file', name, data: buffer }),
          () => undefined,
        );
    },
    askBeforeLeaving: () => () => undefined,
    start: passKeysToHost,
    takeStored: storage.take,
    followsHost: (on) => post({ perun: 'follow', on }),
  };
}

/** Where `records(database, store)` keeps its list in the plugin's data. */
export const recordsKey = (database: string, store: string): string => `${database}/${store}`;

/** Storage over the plugin's copy, telling the plugin about each change. */
function vaultStorage(
  initial: Record<string, string>,
): KeyValueStore & { take(key: string, value: string | null): boolean } {
  const data = new Map<string, string>(Object.entries(initial).map(([k, v]) => [k, String(v)]));
  return {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(String(k)) ?? null,
    setItem(k, v) {
      k = String(k);
      v = String(v);
      if (data.get(k) === v) return;
      data.set(k, v);
      post({ perun: 'storage', key: k, value: v });
    },
    removeItem(k) {
      k = String(k);
      if (!data.delete(k)) return;
      post({ perun: 'storage', key: k, value: null });
    },
    take(k, v) {
      if (v === null) return data.delete(k);
      if (data.get(k) === v) return false;
      data.set(k, v);
      return true;
    },
  };
}

/**
 * Records as one JSON list in the vault storage. The frame's IndexedDB belongs to Obsidian, shared
 * by every vault and kept on this device only; what an earlier version of the plugin kept there
 * comes along the first time.
 */
function vaultRecords<T extends { id: string }>(
  storage: KeyValueStore,
  database: string,
  store: string,
): RecordStore<T> {
  const key = recordsKey(database, store);
  const read = (): T[] | null => {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    try {
      const v = JSON.parse(raw) as unknown;
      return Array.isArray(v) ? (v as T[]) : [];
    } catch {
      return [];
    }
  };
  const write = (rows: T[]): void => storage.setItem(key, JSON.stringify(rows));
  const all = async (): Promise<T[]> => {
    const rows = read();
    if (rows !== null) return rows;
    const old = await indexedDbRecords<T>(database, store)
      .getAll()
      .catch(() => [] as T[]);
    write(old);
    return old;
  };
  return {
    getAll: all,
    get: async (id) => (await all()).find((r) => r.id === id),
    async put(r) {
      write([...(await all()).filter((o) => o.id !== r.id), r]);
    },
    async delete(id) {
      write((await all()).filter((o) => o.id !== id));
    },
  };
}

/** Keys a text field keeps for itself even with Ctrl or Cmd. */
const TEXT_KEYS = new Set([
  'a',
  'c',
  'v',
  'x',
  'y',
  'z',
  'arrowleft',
  'arrowright',
  'arrowup',
  'arrowdown',
  'home',
  'end',
  'backspace',
  'delete',
]);

/**
 * A focused frame keeps every key from the host page, so Obsidian's own hotkeys (command palette,
 * quick switcher, tabs) would stop working while the editor has focus. A key with Ctrl, Cmd or Alt
 * that the app didn't use goes to the host.
 */
function passKeysToHost(): void {
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
    if (e.key === 'Control' || e.key === 'Meta' || e.key === 'Alt' || e.key === 'Shift') return;
    if (TEXT_KEYS.has(e.key.toLowerCase())) return;
    // after every handler has seen it: a key the app used is marked
    window.setTimeout(() => {
      if (e.defaultPrevented) return;
      post({
        perun: 'key',
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
      });
    }, 0);
  });
}
