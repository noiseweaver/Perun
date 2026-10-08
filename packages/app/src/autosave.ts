// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { controller } from './SimController.ts';
import { useApp } from './store.ts';

/**
 * The circuit on screen, kept in local storage so reopening the app (iOS may close an installed
 * app in the background at any time) brings it back instead of the default circuit.
 */
export const LAST_CIRCUIT_KEY = 'circuitjs-next.lastCircuit';
const SAVE_EVERY_MS = 3000;

export interface LastCircuit {
  text: string;
  title: string;
}

export function readLastCircuit(): LastCircuit | null {
  try {
    const raw = localStorage.getItem(LAST_CIRCUIT_KEY);
    if (raw === null) return null;
    const v = JSON.parse(raw) as Partial<LastCircuit>;
    return typeof v.text === 'string' && v.text !== '' && typeof v.title === 'string'
      ? { text: v.text, title: v.title }
      : null;
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
  const title = useApp.getState().title;
  const value = JSON.stringify({ text, title });
  if (value === lastSaved) return;
  try {
    localStorage.setItem(LAST_CIRCUIT_KEY, value);
    lastSaved = value;
  } catch {
    // storage full or disabled: the circuit lasts for this page
  }
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
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', saveLastCircuit);
  };
}
