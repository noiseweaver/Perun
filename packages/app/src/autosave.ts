// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { controller } from './SimController.ts';
import { useApp } from './store.ts';
import { platform } from './platform/index.ts';

/**
 * The circuit on screen, kept in local storage so reopening the app (iOS may close an installed
 * app in the background at any time) brings it back instead of the default circuit.
 */
export const LAST_CIRCUIT_KEY = 'circuitjs-next.lastCircuit';
const SAVE_EVERY_MS = 3000;

export interface LastCircuit {
  text: string;
  title: string;
  /** The circuit's save in My circuits, if it has one. */
  savedAs?: { id: string; name: string } | null;
  /** It had changes not saved anywhere. */
  unsaved?: boolean;
}

export function readLastCircuit(): LastCircuit | null {
  try {
    const raw = platform.storage.getItem(LAST_CIRCUIT_KEY);
    if (raw === null) return null;
    const v = JSON.parse(raw) as Partial<LastCircuit>;
    if (typeof v.text !== 'string' || v.text === '' || typeof v.title !== 'string') return null;
    const sa = v.savedAs;
    return {
      text: v.text,
      title: v.title,
      savedAs:
        typeof sa === 'object' &&
        sa !== null &&
        typeof sa.id === 'string' &&
        typeof sa.name === 'string'
          ? { id: sa.id, name: sa.name }
          : null,
      unsaved: v.unsaved === true,
    };
  } catch {
    return null;
  }
}

let lastSaved: string | null = null;

/** Store the circuit now if it changed since the last save. */
export function saveLastCircuit(): void {
  // a subcircuit's own circuit is not the user's circuit; the main one is saved once it's back
  if (controller.editingModel()) return;
  let text: string;
  try {
    text = controller.saveText();
  } catch {
    return;
  }
  const { title, savedAs } = useApp.getState();
  const value = JSON.stringify({ text, title, savedAs, unsaved: controller.unsavedChanges });
  if (value === lastSaved) return;
  try {
    platform.storage.setItem(LAST_CIRCUIT_KEY, value);
    lastSaved = value;
  } catch {
    // storage full or disabled: the circuit lasts for this page
  }
}

let leaving = false;

/** The app reloads itself (an update, the crash screen): no question first. */
export function allowLeave(): void {
  leaving = true;
}

/**
 * Closing or reloading the page while the circuit has changes not saved anywhere asks first
 * (Options > Warn before closing with unsaved changes). Browsers show their own wording, and only
 * once the page has been clicked or typed in; iPhone and iPad Safari never ask.
 */
function shouldAsk(): boolean {
  return !leaving && controller.unsavedChanges && useApp.getState().settings.warnUnsaved;
}

/** Save while the app runs and whenever it goes to the background. Returns a stop function. */
export function installAutosave(): () => void {
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') saveLastCircuit();
  }, SAVE_EVERY_MS);
  const onHide = (): void => {
    if (document.visibilityState === 'hidden') saveLastCircuit();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', saveLastCircuit);
  const stopAsking = platform.askBeforeLeaving(shouldAsk);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', saveLastCircuit);
    stopAsking();
  };
}
