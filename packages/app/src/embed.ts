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
  passKeysToHost();
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('pagehide', flush);
}

/** Keys a text field keeps for itself even with Ctrl or Cmd. */
const TEXT_KEYS = new Set([
  'a',
  'c',
  'v',
  'x',
  'y',
  'z',
  'arrowleft',
  'arrowright',
  'arrowup',
  'arrowdown',
  'home',
  'end',
  'backspace',
  'delete',
]);

/**
 * A focused frame keeps every key from the host page, so the host's own hotkeys (Obsidian's
 * command palette, quick switcher, tab keys) would stop working while the editor has focus.
 * A key with Ctrl, Cmd or Alt that the app didn't use goes to the host.
 */
function passKeysToHost(): void {
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
    if (e.key === 'Control' || e.key === 'Meta' || e.key === 'Alt' || e.key === 'Shift') return;
    if (TEXT_KEYS.has(e.key.toLowerCase())) return;
    // after every handler has seen it: a key the app used is marked
    window.setTimeout(() => {
      if (e.defaultPrevented) return;
      post({
        perun: 'key',
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
      });
    }, 0);
  });
}

/** Whether the app runs inside a host page's frame. */
export const embedded = embedConfig !== null;
