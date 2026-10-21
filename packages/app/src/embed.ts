// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/*
 * The app inside a host page's frame (the Obsidian plugin's circuit editor). The host owns the
 * file: the app opens the circuit the host gives it and sends the circuit back after each edit,
 * instead of keeping its own last circuit.
 */

import { controller } from './SimController.ts';
import { embedConfig, isEmbedMessage, type EmbedConfig, type EmbedMessage } from './embedConfig.ts';
import { selectTheme } from './themes.ts';

/** How often to look for edits to send to the host. */
const WATCH_MS = 300;

function post(msg: EmbedMessage): void {
  window.parent.postMessage(msg, '*');
}

/** Open the host's circuit, then send edits back and follow the host's messages. */
export function startEmbedded(config: EmbedConfig): void {
  let version = -1;
  const open = (text: string, title: string): void => {
    controller.load(text, title, true);
    version = controller.circuitVersion;
    controller.unsavedChanges = false;
  };
  open(config.text, config.title);

  window.addEventListener('message', (e: MessageEvent<unknown>) => {
    if (e.source !== window.parent || !isEmbedMessage(e.data)) return;
    const m = e.data;
    if (m.perun === 'load') open(m.text, m.title);
    else if (m.perun === 'theme') selectTheme(m.themeId);
  });

  // An edit (or a circuit opened from the menus) bumps the version; running the simulation
  // doesn't, so the file is written when the user changes something, not as values move.
  const flush = (): void => {
    if (version === controller.circuitVersion && !controller.unsavedChanges) return;
    // mid-drag, or inside a subcircuit's own circuit: wait until the main circuit is whole again
    if (controller.editor.history.inEdit || controller.editingModel()) return;
    let text: string;
    try {
      text = controller.saveText();
    } catch {
      return;
    }
    version = controller.circuitVersion;
    controller.unsavedChanges = false;
    post({ perun: 'changed', text });
  };
  window.setInterval(flush, WATCH_MS);
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('pagehide', flush);
}

/** Whether the app runs inside a host page's frame. */
export const embedded = embedConfig !== null;
