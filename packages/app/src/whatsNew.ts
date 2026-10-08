// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { useApp } from './store.ts';

/** Release notes, newest first. The text is English and goes through `t` when shown. */
export const RELEASES: { version: string; notes: string[] }[] = [
  {
    version: '1.0.0',
    notes: [
      'Your circuit is kept: reopening the app brings back what you were working on.',
      'Send a suggestion from the File menu.',
      'AC analysis with Bode plots, parameter sweeps, Monte Carlo and a DC operating point table.',
      'Temperature, subcircuit parameters and a heat view.',
      'Formula cards that show the math behind a part with live values.',
      'Rewind and scrub through the last 10 seconds of the simulation.',
      'Field views for coils and capacitors.',
      'Teaching tools: pencil, laser pointer and eraser.',
      'Themes, a theme editor, and an installable app that works offline.',
    ],
  },
];

const SEEN_KEY = 'circuitjs-next.seenVersion';

/**
 * Remember the version now running and say whether it's newer than the one seen last time, so
 * an update can point at its notes once. A first install has nothing to compare and says no.
 */
export function checkUpdated(
  version: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): boolean {
  let seen: string | null;
  try {
    seen = storage.getItem(SEEN_KEY);
    storage.setItem(SEEN_KEY, version);
  } catch {
    return false;
  }
  return seen !== null && seen !== version;
}

/** Show the "updated" banner when this version is new to this device. */
export function announceUpdate(): void {
  const version = import.meta.env.APP_VERSION;
  let updated = false;
  try {
    updated = checkUpdated(version);
  } catch {
    // no local storage at all
  }
  if (updated) useApp.setState({ updatedTo: version });
}
