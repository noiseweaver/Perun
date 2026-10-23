// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Not in upstream: saving, opening and renaming circuits kept in this browser (myCircuits.ts).

import { DEFAULT_SCHEMATIC, schematicCanvas } from '@perun/render';
import type { CircuitElm } from '@perun/elements';
import {
  askPersistence,
  deleteCircuit,
  getCircuit,
  listCircuits,
  nameFromTitle,
  newId,
  putCircuit,
  type SavedCircuit,
} from './myCircuits.ts';
import { controller } from './SimController.ts';
import { shownTheme, showToast, useApp } from './store.ts';
import { t } from './i18n.ts';

/** The thumbnail's largest size in pixels (cards show it at half this on a 2x screen). */
const THUMB_W = 480;
const THUMB_H = 300;

/** A small picture of the schematic in the theme on screen, or null for an empty circuit. */
export function thumbnail(elements: readonly CircuitElm[]): string | null {
  const s = useApp.getState();
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
    // draw at 1x first to learn the size, then at the scale that fits
    const opts = {
      ...DEFAULT_SCHEMATIC,
      showValues: false,
      euroResistors: s.settings.euroResistors,
      euroGates: s.settings.euroGates,
      tidyPots: s.settings.tidyPots,
      textFont: s.settings.textFont,
    };
    const theme = shownTheme(s);
    if (!schematicCanvas(canvas, elements, theme, opts, 1)) return null;
    const scale = Math.min(THUMB_W / canvas.width, THUMB_H / canvas.height, 1);
    if (scale < 1) schematicCanvas(canvas, elements, theme, opts, scale);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** The name a browser save of the circuit on screen starts with. */
export function suggestedName(): string {
  const s = useApp.getState();
  if (s.savedAs !== null) return s.savedAs.name;
  const name = nameFromTitle(t(s.title));
  return name === '' ? t('Untitled') : name;
}

function failed(e: unknown): void {
  const why = e instanceof Error ? e.message : String(e);
  showToast(`${t("Couldn't save in this browser")}: ${why}`);
}

/**
 * Save the circuit on screen in this browser as `name`. `replaceId` overwrites that save (the
 * one with the same name, or the one the circuit came from); otherwise a new one is made.
 */
export async function saveToBrowser(name: string, replaceId?: string): Promise<boolean> {
  const text = controller.saveText();
  const thumb = thumbnail(controller.circuit.elements);
  const now = Date.now();
  try {
    const old = replaceId === undefined ? undefined : await getCircuit(replaceId);
    const rec: SavedCircuit = {
      id: old?.id ?? replaceId ?? newId(),
      name,
      text,
      thumb,
      created: old?.created ?? now,
      modified: now,
    };
    await putCircuit(rec);
    askPersistence();
    controller.unsavedChanges = false;
    useApp.setState({ title: name, savedAs: { id: rec.id, name } });
    showToast(t('Saved in this browser'));
    return true;
  } catch (e) {
    failed(e);
    return false;
  }
}

/** Ctrl+S: save over the circuit's own browser save, else open the Save dialog. */
export function quickSave(): boolean {
  const saved = useApp.getState().savedAs;
  if (saved === null || controller.editingModel()) return false;
  void saveToBrowser(saved.name, saved.id);
  return true;
}

/** Open one of My circuits. */
export async function openSaved(id: string): Promise<void> {
  const c = await getCircuit(id);
  if (c === undefined) {
    showToast(t('That circuit is no longer saved'));
    return;
  }
  if (controller.load(c.text, c.name, true, true)) {
    controller.lastFileName = null;
    useApp.setState({ savedAs: { id: c.id, name: c.name } });
  }
}

/** Rename a saved circuit; the title follows when it is the one on screen. */
export async function renameSaved(id: string, name: string): Promise<void> {
  const c = await getCircuit(id);
  if (c === undefined) return;
  await putCircuit({ ...c, name });
  const s = useApp.getState();
  if (s.savedAs?.id === id) useApp.setState({ title: name, savedAs: { id, name } });
}

export async function removeSaved(id: string): Promise<void> {
  await deleteCircuit(id);
  // the circuit stays on screen, now not saved anywhere
  if (useApp.getState().savedAs?.id === id) {
    useApp.setState({ savedAs: null });
    controller.unsavedChanges = true;
  }
}

/** Rename the circuit on screen from its title in the app bar. */
export function renameCurrent(raw: string): void {
  const name = raw.trim();
  const s = useApp.getState();
  if (name === '' || name === t(s.title)) return;
  if (s.savedAs !== null) {
    void renameSaved(s.savedAs.id, name).catch(failed);
    return;
  }
  useApp.setState({ title: name });
  // a download offers the new name too
  controller.lastFileName = /\.[a-z]{2,9}$/i.test(name) ? name : `${name}.txt`;
}

/** After restoring the last circuit: forget its browser save if it was deleted meanwhile. */
export function checkSavedAs(): void {
  const saved = useApp.getState().savedAs;
  if (saved === null) return;
  getCircuit(saved.id).then(
    (c) => {
      if (useApp.getState().savedAs?.id !== saved.id) return;
      if (c === undefined) useApp.setState({ savedAs: null });
      else if (c.name !== saved.name) useApp.setState({ savedAs: { id: c.id, name: c.name } });
    },
    () => undefined,
  );
}

export { listCircuits };
