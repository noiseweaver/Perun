// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import {
  ItemView,
  Notice,
  TFile,
  TextFileView,
  debounce,
  type ViewStateResult,
  type WorkspaceLeaf,
} from 'obsidian';
import type { EmbedConfig, EmbedMessage } from '@perun/app/embedConfig';
import { editorSrcdoc } from './frame.ts';
import { replaceBlock } from './blockText.ts';
import { SITE_URL } from './settings.ts';

export const VIEW_TYPE = 'perun-circuit';
export const BLOCK_VIEW_TYPE = 'perun-block';
export const EXTENSION = 'circuit';

/** A new, empty circuit (the editor's File > New). */
export const BLANK_CIRCUIT = '$ 1 5.0E-6 10 50 5.0\n';

/** What an editor tab needs from the plugin. */
export interface EditorHost {
  /** The built-in theme to use, or null for the theme chosen in the editor. */
  themeId(): string | null;
  storage(): Record<string, string>;
  setStorage(key: string, value: string | null): void;
  editors: Set<{ restyle(): void }>;
}

/**
 * The whole Perun app in a frame inside a tab. It opens the text it is given and hands each edit
 * to `onChanged`.
 */
class EditorFrame {
  private frame: HTMLIFrameElement | null = null;
  /** The text the app has on screen: last opened, or last sent back after an edit. */
  shown: string | null = null;
  private readonly parent: HTMLElement;
  private readonly host: EditorHost;
  private readonly onChanged: (text: string) => void;

  constructor(parent: HTMLElement, host: EditorHost, onChanged: (text: string) => void) {
    this.parent = parent;
    this.host = host;
    this.onChanged = onChanged;
  }

  /** The window's message handler (registered by the view, so it goes when the view does). */
  readonly onMessage = (e: MessageEvent<unknown>): void => {
    if (this.frame === null || e.source !== this.frame.contentWindow) return;
    const m = e.data as EmbedMessage | null;
    if (m?.perun === 'changed') {
      this.shown = m.text;
      this.onChanged(m.text);
    } else if (m?.perun === 'storage') this.host.setStorage(m.key, m.value);
  };

  /** Show `data` unless the app already has it on screen. */
  show(data: string, title: string, force = false): void {
    if (!force && data === this.shown) return;
    this.shown = data;
    const text = data.trim() === '' ? BLANK_CIRCUIT : data;
    if (this.frame === null) this.open(text, title);
    else this.post({ perun: 'load', text, title });
  }

  private open(text: string, title: string): void {
    const config: EmbedConfig = {
      text,
      title,
      themeId: this.host.themeId(),
      siteUrl: SITE_URL,
      storage: this.host.storage(),
    };
    const frame = this.parent.createEl('iframe', { cls: 'perun-frame' });
    frame.setAttribute('title', 'Perun circuit editor');
    frame.srcdoc = editorSrcdoc(config);
    this.frame = frame;
  }

  private post(m: EmbedMessage): void {
    this.frame?.contentWindow?.postMessage(m, '*');
  }

  restyle(): void {
    const id = this.host.themeId();
    if (id !== null) this.post({ perun: 'theme', themeId: id });
  }

  destroy(): void {
    this.frame?.remove();
    this.frame = null;
    this.shown = null;
  }
}

/**
 * A .circuit file in a tab: the whole Perun app in a frame. The file holds the circuit as the app
 * saves it (XML); each edit in the app comes back here and Obsidian writes it to the file.
 */
export class CircuitEditorView extends TextFileView {
  private readonly host: EditorHost;
  private readonly editor: EditorFrame;

  constructor(leaf: WorkspaceLeaf, host: EditorHost) {
    super(leaf);
    this.host = host;
    this.editor = new EditorFrame(this.contentEl, host, (text) => {
      this.data = text;
      this.requestSave();
    });
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
    this.registerDomEvent(window, 'message', this.editor.onMessage);
  }

  override async onClose(): Promise<void> {
    this.host.editors.delete(this);
    this.editor.destroy();
  }

  override getViewData(): string {
    return this.data;
  }

  /** The file was opened, or changed outside this tab (another device, another editor). */
  override setViewData(data: string, clear: boolean): void {
    // Obsidian sets this.data before calling; what the app shows tells whether this is news
    this.data = data;
    this.editor.show(data, this.file?.basename ?? 'Circuit', clear);
  }

  override clear(): void {
    this.data = '';
  }

  restyle(): void {
    this.editor.restyle();
  }
}

/** Which ```circuit block a block tab edits: its note, and its text as last written. */
interface BlockState {
  path: string;
  text: string;
}

/**
 * A ```circuit code block of a note in the editor, in a tab. Each edit is written back into the
 * block (found by its text, so lines added above it meanwhile don't matter).
 */
export class BlockEditorView extends ItemView {
  private state: BlockState | null = null;
  private readonly host: EditorHost;
  private readonly editor: EditorFrame;
  /** Text waiting to be written into the note. */
  private pending: string | null = null;
  private readonly writeSoon = debounce(() => void this.write(), 800, true);

  constructor(leaf: WorkspaceLeaf, host: EditorHost) {
    super(leaf);
    this.host = host;
    this.editor = new EditorFrame(this.contentEl, host, (text) => {
      this.pending = text;
      this.writeSoon();
    });
  }

  override getViewType(): string {
    return BLOCK_VIEW_TYPE;
  }

  override getDisplayText(): string {
    const name = this.state?.path.split('/').pop()?.replace(/\.md$/, '');
    return name !== undefined ? `Circuit in ${name}` : 'Circuit';
  }

  override getIcon(): string {
    return 'circuit-board';
  }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass('perun-editor');
    this.host.editors.add(this);
    this.registerDomEvent(window, 'message', this.editor.onMessage);
  }

  override async onClose(): Promise<void> {
    await this.write();
    this.host.editors.delete(this);
    this.editor.destroy();
  }

  override getState(): Record<string, unknown> {
    return { ...(this.state ?? {}) };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const s = state as Partial<BlockState> | null;
    if (typeof s?.path === 'string' && typeof s.text === 'string') {
      this.state = { path: s.path, text: s.text };
      this.editor.show(s.text, this.getDisplayText());
    }
    await super.setState(state, result);
  }

  private async write(): Promise<void> {
    const text = this.pending;
    const state = this.state;
    this.pending = null;
    if (text === null || state === null) return;
    const file = this.app.vault.getAbstractFileByPath(state.path);
    if (!(file instanceof TFile)) return;
    let found = false;
    await this.app.vault.process(file, (data) => {
      const next = replaceBlock(data, state.text, text);
      found = next !== null;
      return next ?? data;
    });
    if (found) state.text = text;
    else
      new Notice(
        `Perun couldn't find this circuit in ${file.basename} any more, so the change wasn't saved there.`,
      );
  }

  restyle(): void {
    this.editor.restyle();
  }
}
