// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

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
   * The app's local storage (settings, palette state), kept by the host so it travels with the
   * vault. The host page swaps it in for window.localStorage before the app starts.
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
  /** host to app: switch to this built-in theme */
  | { perun: 'theme'; themeId: string }
  /** app to host: the circuit was edited; store this text */
  | { perun: 'changed'; text: string }
  /** app to host: a setting the app keeps in local storage changed (null: removed) */
  | { perun: 'storage'; key: string; value: string | null };

export function isEmbedMessage(data: unknown): data is EmbedMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { perun?: unknown }).perun === 'string'
  );
}
