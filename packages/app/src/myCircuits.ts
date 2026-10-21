// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Not in upstream: circuits saved by name in this browser (File > My circuits). Upstream keeps
// only one "Recover Auto-Save" slot in local storage.

import { platform } from './platform/index.ts';

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

/** Where the saves live: IndexedDB (the vault in Obsidian). */
const records = platform.records<SavedCircuit>(DB_NAME, STORE);

/** Every saved circuit, last changed first. */
export async function listCircuits(): Promise<SavedCircuit[]> {
  return sortNewestFirst(await records.getAll());
}

export function getCircuit(id: string): Promise<SavedCircuit | undefined> {
  return records.get(id);
}

export async function putCircuit(c: SavedCircuit): Promise<void> {
  await records.put(c);
  notify();
}

export async function deleteCircuit(id: string): Promise<void> {
  await records.delete(id);
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
