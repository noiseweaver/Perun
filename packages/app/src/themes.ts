// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/*
 * The theme library and theme sharing (PLAN.md section 6): saved themes live in IndexedDB, theme
 * files are imported and exported as `*.theme.json`, and `theme=` links open as a preview that is
 * only kept when the user applies or saves it.
 */

import {
  DEFAULT_THEME_ID,
  THEME_PARAM,
  builtinTheme,
  decodeThemeParam,
  encodeThemeParam,
  parseTheme,
  parseThemeJson,
  themeFileName,
  themeToJson,
  type Theme,
} from '@perun/theme';
import { copyText, download, openDialog } from './commands.ts';
import { embedConfig } from './embedConfig.ts';
import {
  ACTIVE_THEME_KEY,
  USER_THEME_PREFIX,
  showToast,
  themeFor,
  updateSettings,
  useApp,
  type SavedTheme,
} from './store.ts';

// Named before the rename to Perun; kept so saved themes are still found.
const DB_NAME = 'circuitjs-next';
const DB_VERSION = 1;
const STORE = 'themes';

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** The database, or null where IndexedDB is unavailable (then the library lasts for the page). */
function db(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE))
          req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        // let another tab (or a test) upgrade or delete the database
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const d = await db();
  if (d === null) return null;
  try {
    return await request(fn(d.transaction(STORE, mode).objectStore(STORE)));
  } catch {
    return null;
  }
}

/**
 * Inside the Obsidian plugin the library is kept in local storage, which there is the plugin's
 * data in the vault: it syncs with the vault and circuits in notes can use it. The frame's
 * IndexedDB belongs to Obsidian itself, shared by every vault and kept on this device only.
 */
const EMBED_LIBRARY_KEY = 'circuitjs-next.themeLibrary';

function readEmbedLibrary(): unknown[] | null {
  try {
    const raw = localStorage.getItem(EMBED_LIBRARY_KEY);
    if (raw === null) return null;
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeEmbedLibrary(rows: unknown[]): void {
  try {
    localStorage.setItem(EMBED_LIBRARY_KEY, JSON.stringify(rows));
  } catch {
    // kept for this page only
  }
}

const rowId = (row: unknown): unknown => (row as { id?: unknown } | null)?.id;

/** Every saved theme, as stored (validated by the caller). */
async function allRows(): Promise<unknown[]> {
  if (embedConfig === null)
    return ((await withStore('readonly', (s) => s.getAll())) ?? []) as unknown[];
  let rows = readEmbedLibrary();
  if (rows === null) {
    // the first time: themes saved in an earlier version of the plugin come along
    rows = ((await withStore('readonly', (s) => s.getAll())) ?? []) as unknown[];
    writeEmbedLibrary(rows);
  }
  return rows;
}

async function putRow(entry: SavedTheme): Promise<void> {
  if (embedConfig === null) {
    await withStore('readwrite', (s) => s.put(entry));
    return;
  }
  const rows = (await allRows()).filter((r) => rowId(r) !== entry.id);
  writeEmbedLibrary([...rows, entry]);
}

async function deleteRow(id: string): Promise<void> {
  if (embedConfig === null) {
    await withStore('readwrite', (s) => s.delete(id));
    return;
  }
  writeEmbedLibrary((await allRows()).filter((r) => rowId(r) !== id));
}

/** Read the library. Entries are validated again: storage is not trusted any more than a file. */
export async function loadLibrary(): Promise<void> {
  const rows = await allRows();
  const library: SavedTheme[] = [];
  for (const row of rows) {
    const r = row as Partial<SavedTheme> | null;
    if (typeof r?.id !== 'string') continue;
    const parsed = parseTheme(r.theme);
    if (parsed.ok)
      library.push({
        id: r.id,
        theme: parsed.theme,
        saved: typeof r.saved === 'number' ? r.saved : 0,
      });
  }
  library.sort((a, b) => a.saved - b.saved);
  setLibrary(library);
}

function setLibrary(library: SavedTheme[]): void {
  const s = useApp.getState();
  useApp.setState({ library, theme: themeFor(s.settings.themeId, library) });
  cacheActive();
}

/** Keep the active library theme where the next page load finds it before IndexedDB answers. */
function cacheActive(): void {
  const s = useApp.getState();
  try {
    if (s.settings.themeId.startsWith(USER_THEME_PREFIX)) {
      const id = s.settings.themeId.slice(USER_THEME_PREFIX.length);
      localStorage.setItem(ACTIVE_THEME_KEY, JSON.stringify({ id, theme: s.theme }));
    } else localStorage.removeItem(ACTIVE_THEME_KEY);
  } catch {
    // storage disabled
  }
}

const sameTheme = (a: Theme, b: Theme): boolean => JSON.stringify(a) === JSON.stringify(b);

function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Add a theme to the library, or replace entry `id`. A theme already there unchanged is not added
 * twice. Returns its id.
 */
export async function saveTheme(theme: Theme, id: string | null = null): Promise<string> {
  const library = useApp.getState().library;
  const existing =
    id !== null ? library.find((t) => t.id === id) : library.find((t) => sameTheme(t.theme, theme));
  const entry: SavedTheme = {
    id: existing?.id ?? id ?? newId(),
    theme,
    saved: existing?.saved ?? Date.now(),
  };
  await putRow(entry);
  setLibrary(existing ? library.map((t) => (t.id === entry.id ? entry : t)) : [...library, entry]);
  return entry.id;
}

export async function deleteTheme(id: string): Promise<void> {
  await deleteRow(id);
  const s = useApp.getState();
  if (s.settings.themeId === USER_THEME_PREFIX + id) selectTheme(DEFAULT_THEME_ID);
  setLibrary(s.library.filter((t) => t.id !== id));
}

/** Use a built-in (by id) or a library theme (`user:` id). */
export function selectTheme(themeId: string): void {
  updateSettings({ themeId });
  cacheActive();
}

export const userThemeId = (id: string): string => USER_THEME_PREFIX + id;

export function isBuiltin(themeId: string): boolean {
  return builtinTheme(themeId) !== null;
}

// ---- files and links ---------------------------------------------------------------------------

export function exportThemeFile(theme: Theme): void {
  download(themeFileName(theme), themeToJson(theme), 'application/json');
}

/** Read a theme file, add it to the library and use it. */
export async function importThemeFile(file: File): Promise<void> {
  const r = parseThemeJson(await file.text());
  if (!r.ok) {
    useApp.setState({
      error: `${file.name} is not a theme file: ${r.errors.slice(0, 3).join('; ')}`,
    });
    return;
  }
  const id = await saveTheme(r.theme);
  selectTheme(userThemeId(id));
  showToast(`Theme “${r.theme.meta.name}” added`);
}

/** This page with `theme=`, and the circuit too when `circuitQuery` (like `ctz=...`) is given. */
export async function themeLink(theme: Theme, base: string, circuitQuery = ''): Promise<string> {
  const param = `${THEME_PARAM}=${await encodeThemeParam(theme)}`;
  return `${base}?${circuitQuery ? circuitQuery + '&' : ''}${param}`;
}

export async function copyThemeLink(theme: Theme, base: string): Promise<void> {
  await copyText(await themeLink(theme, base), 'Link');
}

/**
 * A `theme=` in a link: show that theme as a preview with Apply and Save (PLAN.md section 6).
 * Returns whether the link had one.
 */
export async function previewThemeFromQuery(q: ReadonlyMap<string, string>): Promise<boolean> {
  const param = q.get(THEME_PARAM);
  if (param === undefined) return false;
  const r = await decodeThemeParam(param);
  if (!r.ok) {
    useApp.setState({ error: `The theme in this link can't be used: ${r.errors[0] ?? ''}` });
    return true;
  }
  useApp.setState({ preview: { theme: r.theme, source: 'link' } });
  return true;
}

/** Keep the previewed theme: add it to the library and, with `use`, switch to it. */
export async function keepPreview(use: boolean): Promise<void> {
  const p = useApp.getState().preview;
  if (p === null) return;
  const id = await saveTheme(p.theme);
  useApp.setState({ preview: null });
  if (use) selectTheme(userThemeId(id));
  showToast(use ? `Using “${p.theme.meta.name}”` : `“${p.theme.meta.name}” saved to your themes`);
}

export function dismissPreview(): void {
  useApp.setState({ preview: null });
}

// ---- editor ------------------------------------------------------------------------------------

/** Open the theme editor on a theme; `id` is the library entry saving replaces, if any. */
export function editTheme(theme: Theme, id: string | null): void {
  useApp.setState({ editing: { theme, id }, preview: null });
  openDialog('themeEditor');
}

/** Library id of the active theme, or null for a built-in. */
export function activeLibraryId(): string | null {
  const t = useApp.getState().settings.themeId;
  return t.startsWith(USER_THEME_PREFIX) ? t.slice(USER_THEME_PREFIX.length) : null;
}
