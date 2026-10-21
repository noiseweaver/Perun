// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/*
 * Everything the app needs from the page it runs in. The app runs as a web page and inside the
 * Obsidian plugin's frame (packages/obsidian), and the two keep files, data and keys differently;
 * code anywhere else in the app goes through `platform` (index.ts), never to the browser directly
 * (ESLint enforces it, see eslint.config.js), so a new feature works in both.
 */

/** Key-value text storage, the part of the web's Storage the app uses. */
export interface KeyValueStore {
  readonly length: number;
  key(i: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Records kept by their `id` (a library of themes, of circuits). */
export interface RecordStore<T extends { id: string }> {
  getAll(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(record: T): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface Platform {
  readonly name: 'web' | 'obsidian';
  /**
   * Small data kept between sessions: settings, favorites, saved models. On the web the
   * browser's local storage; in Obsidian the plugin's data in the vault, so it syncs. Reading it
   * can throw (storage turned off), as local storage does.
   */
  readonly storage: KeyValueStore;
  /** Data that stays on this device even in Obsidian (the clipboard shared by editor tabs). */
  readonly deviceStorage: KeyValueStore;
  /**
   * Records kept by id under a database and store name: IndexedDB on the web, the plugin's data
   * in Obsidian. Rejects when there is no storage.
   */
  records<T extends { id: string }>(database: string, store: string): RecordStore<T>;
  /** Labels for the buttons that call saveFile (English; the caller translates them). */
  readonly saveLabels: { readonly file: string; readonly csv: string };
  /** Give the user a file: a download on the web, a file next to the circuit in Obsidian. */
  saveFile(name: string, data: string | Blob, type: string): void;
  /**
   * Ask before the page closes (the browser's own question while `ask` returns true). Returns a
   * function that stops asking. In Obsidian every edit is already in the file: nothing to ask.
   */
  askBeforeLeaving(ask: () => boolean): () => void;
  /** Start what this platform does for the whole page (Obsidian: its hotkeys keep working). */
  start(): void;
}
