// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { TextFileView, type WorkspaceLeaf } from 'obsidian';
import type { EmbedConfig, EmbedMessage } from '@perun/app/embedConfig';
import { editorSrcdoc } from './frame.ts';
import { SITE_URL } from './settings.ts';

export const VIEW_TYPE = 'perun-circuit';
export const EXTENSION = 'circuit';

/** A new, empty circuit (the editor's File > New). */
export const BLANK_CIRCUIT = '$ 1 5.0E-6 10 50 5.0\n';

/** What an editor tab needs from the plugin. */
export interface EditorHost {
  /** The built-in theme to use, or null for the theme chosen in the editor. */
  themeId(): string | null;
  storage(): Record<string, string>;
  setStorage(key: string, value: string | null): void;
  editors: Set<CircuitEditorView>;
}

/**
 * A .circuit file in a tab: the whole Perun app in a frame. The file holds the circuit as the app
 * saves it (XML); each edit in the app comes back here and Obsidian writes it to the file.
 */
export class CircuitEditorView extends TextFileView {
  private frame: HTMLIFrameElement | null = null;
  /** The text the app has on screen: last opened, or last sent back after an edit. */
  private shown: string | null = null;
  private readonly host: EditorHost;

  constructor(leaf: WorkspaceLeaf, host: EditorHost) {
    super(leaf);
    this.host = host;
  }

  override getViewType(): string {
    return VIEW_TYPE;
  }

  override getDisplayText(): string {
    return this.file?.basename ?? 'Circuit';
  }

  override getIcon(): string {
    return 'circuit-board';
  }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass('perun-editor');
    this.host.editors.add(this);
    this.registerDomEvent(window, 'message', (e: MessageEvent<unknown>) => {
      if (this.frame === null || e.source !== this.frame.contentWindow) return;
      const m = e.data as EmbedMessage | null;
      if (m?.perun === 'changed') {
        this.data = this.shown = m.text;
        this.requestSave();
      } else if (m?.perun === 'storage') this.host.setStorage(m.key, m.value);
    });
  }

  override async onClose(): Promise<void> {
    this.host.editors.delete(this);
    this.frame?.remove();
    this.frame = null;
  }

  override getViewData(): string {
    return this.data;
  }

  /** The file was opened, or changed outside this tab (another device, another editor). */
  override setViewData(data: string, clear: boolean): void {
    // Obsidian sets this.data before calling; what the app shows tells whether this is news
    this.data = data;
    if (!clear && data === this.shown) return;
    this.shown = data;
    const text = data.trim() === '' ? BLANK_CIRCUIT : data;
    const title = this.file?.basename ?? 'Circuit';
    if (this.frame === null) this.openFrame(text, title);
    else this.post({ perun: 'load', text, title });
  }

  override clear(): void {
    this.data = '';
    this.shown = null;
  }

  private openFrame(text: string, title: string): void {
    const config: EmbedConfig = {
      text,
      title,
      themeId: this.host.themeId(),
      siteUrl: SITE_URL,
      storage: this.host.storage(),
    };
    const frame = this.contentEl.createEl('iframe', { cls: 'perun-frame' });
    frame.setAttribute('title', 'Perun circuit editor');
    frame.srcdoc = editorSrcdoc(config);
    this.frame = frame;
  }

  private post(m: EmbedMessage): void {
    this.frame?.contentWindow?.postMessage(m, '*');
  }

  /** Obsidian's mode or the plugin's theme setting changed. */
  restyle(): void {
    const id = this.host.themeId();
    if (id !== null) this.post({ perun: 'theme', themeId: id });
  }
}
