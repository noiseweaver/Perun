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

/** Read the library. Entries are validated again: storage is not trusted any more than a file. */
export async function loadLibrary(): Promise<void> {
  const rows = (await withStore('readonly', (s) => s.getAll())) ?? [];
  const library: SavedTheme[] = [];
  for (const row of rows as unknown[]) {
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
  await withStore('readwrite', (s) => s.put(entry));
  setLibrary(existing ? library.map((t) => (t.id === entry.id ? entry : t)) : [...library, entry]);
  return entry.id;
}

export async function deleteTheme(id: string): Promise<void> {
  await withStore('readwrite', (s) => s.delete(id));
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
