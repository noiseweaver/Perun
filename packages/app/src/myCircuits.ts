// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Not in upstream: circuits saved by name in this browser (File > My circuits). Upstream keeps
// only one "Recover Auto-Save" slot in local storage.

/** A circuit saved in this browser. */
export interface SavedCircuit {
  id: string;
  name: string;
  /** The circuit as a file holds it (XML, as File > Save writes). */
  text: string;
  /** A small PNG picture of the schematic as a data URL, or null for an empty circuit. */
  thumb: string | null;
  /** Milliseconds since 1970. */
  created: number;
  modified: number;
}

const DB_NAME = 'circuitjs-next.circuits';
const STORE = 'circuits';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no storage for circuits'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open this browser's storage"));
    req.onblocked = () => reject(new Error("This browser's storage is busy in another tab"));
  });
  // a failure (private mode, storage off) is tried again next time
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function request<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        let result: T;
        req.onsuccess = () => {
          result = req.result;
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? req.error ?? new Error('Storage error'));
        tx.onabort = () => reject(tx.error ?? new Error('Storage full'));
      }),
  );
}

/** Every saved circuit, last changed first. */
export async function listCircuits(): Promise<SavedCircuit[]> {
  const all = await request<SavedCircuit[]>(
    'readonly',
    (s) => s.getAll() as IDBRequest<SavedCircuit[]>,
  );
  return sortNewestFirst(all);
}

export function getCircuit(id: string): Promise<SavedCircuit | undefined> {
  return request<SavedCircuit | undefined>(
    'readonly',
    (s) => s.get(id) as IDBRequest<SavedCircuit | undefined>,
  );
}

export async function putCircuit(c: SavedCircuit): Promise<void> {
  await request('readwrite', (s) => s.put(c));
  notify();
}

export async function deleteCircuit(id: string): Promise<void> {
  await request('readwrite', (s) => s.delete(id));
  notify();
}

/** Ask the browser not to clear the saves when it runs short of space (once per page). */
let persistAsked = false;
export function askPersistence(): void {
  if (persistAsked) return;
  persistAsked = true;
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    // not offered
  }
}

// ---- change listeners (an open My circuits dialog follows saves made elsewhere) -------------

const listeners = new Set<() => void>();

export function onCircuitsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}

// ---- plain helpers ---------------------------------------------------------------------------

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function sortNewestFirst<T extends Pick<SavedCircuit, 'modified' | 'name'>>(
  list: readonly T[],
): T[] {
  return [...list].sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name));
}

/** The circuits whose name has every word of the query, ignoring case and accents. */
export function filterByName<T extends Pick<SavedCircuit, 'name'>>(
  list: readonly T[],
  query: string,
): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...list];
  return list.filter((c) => {
    const n = fold(c.name);
    return words.every((w) => n.includes(w));
  });
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** A saved circuit with this name (ignoring case and surrounding spaces), other than `except`. */
export function findByName<T extends Pick<SavedCircuit, 'name' | 'id'>>(
  list: readonly T[],
  name: string,
  except?: string,
): T | undefined {
  const n = name.trim().toLowerCase();
  return list.find((c) => c.id !== except && c.name.trim().toLowerCase() === n);
}

/** A name for a copy that no saved circuit has yet: "Name (copy)", then "Name (copy 2)"... */
export function copyName(name: string, list: readonly Pick<SavedCircuit, 'name'>[]): string {
  const base = name.replace(/ \(copy(?: \d+)?\)$/, '');
  const taken = new Set(list.map((c) => c.name.trim().toLowerCase()));
  for (let i = 1; ; i++) {
    const n = i === 1 ? `${base} (copy)` : `${base} (copy ${i})`;
    if (!taken.has(n.toLowerCase())) return n;
  }
}

/** A circuit's name from a file name or title: no `.txt` / `.circuitjs` / `.xml` ending. */
export function nameFromTitle(title: string): string {
  return title.replace(/\.(txt|circuitjs|xml)$/i, '').trim();
}
