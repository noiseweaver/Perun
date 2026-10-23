// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { Typeset } from '@perun/render';

/**
 * What a host page that runs the app in a frame (the Obsidian plugin, packages/obsidian) tells it
 * before it starts, as `window.perunEmbed`. Null when the app is its own page.
 */
export interface EmbedConfig {
  /** The circuit to open, as saved (XML or upstream text). */
  text: string;
  /** Its name, shown in the app bar. */
  title: string;
  /** A built-in theme to use instead of the saved choice (the host's light or dark mode). */
  themeId: string | null;
  /** The public web app, the base of exported links and of the license files. */
  siteUrl: string;
  /**
   * The app's stored data (settings, palette state, saved models and themes), kept by the host so
   * it travels with the vault. The app reads and writes it through `platform.storage`
   * (platform/obsidian.ts), which sends each change back.
   */
  storage: Record<string, string>;
}

export const embedConfig: EmbedConfig | null =
  typeof window === 'undefined'
    ? null
    : ((window as Window & { perunEmbed?: EmbedConfig }).perunEmbed ?? null);

/** Messages between the app and its host page (window.postMessage), tagged so others pass by. */
export type EmbedMessage =
  /** host to app: open this circuit (the file changed outside the editor) */
  | { perun: 'load'; text: string; title: string }
  /** host to app: switch to this built-in theme (the theme follows the host's light and dark) */
  | { perun: 'theme'; themeId: string }
  /**
   * both ways: the theme follows the host's light and dark mode, or not (the user picked a theme,
   * or turned following on or off in the editor or the plugin's settings)
   */
  | { perun: 'follow'; on: boolean }
  /** app to host: the circuit was edited; store this text */
  | { perun: 'changed'; text: string }
  /**
   * app to host: a value the app stores changed (null: removed); host to app: another editor tab
   * changed it
   */
  | { perun: 'storage'; key: string; value: string | null }
  /** app to host: keep this file (an export, a copy of the circuit) in the vault */
  | { perun: 'file'; name: string; data: string | ArrayBuffer }
  /** app to host: a key with Ctrl, Cmd or Alt that the app doesn't use, for the host's hotkeys */
  | {
      perun: 'key';
      key: string;
      code: string;
      ctrlKey: boolean;
      metaKey: boolean;
      altKey: boolean;
      shiftKey: boolean;
    };

export function isEmbedMessage(data: unknown): data is EmbedMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { perun?: unknown }).perun === 'string'
  );
}

/**
 * What the Obsidian plugin hangs on the editor's frame element as `perunHost` (the frame is
 * same-origin, so the app reaches it through `window.frameElement`).
 */
export interface FrameHost {
  /** The plugin's MathJax, lent to the frame so main.js carries one copy (embedMathjax.ts). */
  loadTypeset(): Promise<Typeset>;
  /** One of the app's files left out of the page (an example circuit, a translation), or null. */
  file(name: string): Promise<string | null>;
}
