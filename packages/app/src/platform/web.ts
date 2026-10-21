// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { KeyValueStore, Platform, RecordStore } from './types.ts';

/** The app as its own web page. */
export const webPlatform: Platform = {
  name: 'web',
  get storage(): KeyValueStore {
    return window.localStorage;
  },
  get deviceStorage(): KeyValueStore {
    return window.localStorage;
  },
  records: indexedDbRecords,
  saveFile(name, data, type) {
    const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
  askBeforeLeaving(ask) {
    const onLeave = (e: BeforeUnloadEvent): void => {
      if (!ask()) return;
      e.preventDefault();
      // browsers from before preventDefault counted (Chrome before 119) ask when this is set
      e.returnValue = true;
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  },
  start() {},
};

const databases = new Map<string, Promise<IDBDatabase>>();

/** Database `name` (version 1) with one object store, `store`, keyed by `id`. */
function openDatabase(name: string, store: string): Promise<IDBDatabase> {
  const key = `${name}/${store}`;
  let p = databases.get(key);
  if (p !== undefined) return p;
  p = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no storage for this'));
      return;
    }
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(store))
        req.result.createObjectStore(store, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      // let another tab (or a test) upgrade or delete the database
      req.result.onversionchange = () => {
        req.result.close();
        databases.delete(key);
      };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error ?? new Error("Couldn't open this browser's storage"));
    req.onblocked = () => reject(new Error("This browser's storage is busy in another tab"));
  });
  // a failure (private mode, storage off) is tried again next time
  p.catch(() => databases.delete(key));
  databases.set(key, p);
  return p;
}

export function indexedDbRecords<T extends { id: string }>(
  database: string,
  store: string,
): RecordStore<T> {
  const run = <R>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<R> =>
    openDatabase(database, store).then(
      (db) =>
        new Promise<R>((resolve, reject) => {
          const tx = db.transaction(store, mode);
          const req = fn(tx.objectStore(store));
          let result: R;
          req.onsuccess = () => {
            result = req.result as R;
          };
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(tx.error ?? req.error ?? new Error('Storage error'));
          tx.onabort = () => reject(tx.error ?? new Error('Storage full'));
        }),
    );
  return {
    getAll: () => run<T[]>('readonly', (s) => s.getAll()),
    get: (id) => run<T | undefined>('readonly', (s) => s.get(id)),
    put: async (r) => {
      await run<unknown>('readwrite', (s) => s.put(r));
    },
    delete: async (id) => {
      await run<unknown>('readwrite', (s) => s.delete(id));
    },
  };
}
