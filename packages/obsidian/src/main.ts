// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import {
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  type App,
  type Debouncer,
  debounce,
} from 'obsidian';
import type { Theme } from '@perun/theme';
import { CircuitBlock, CircuitEmbed } from './block.ts';
import type { CircuitWidget } from './widget.ts';
import {
  BLANK_CIRCUIT,
  BLOCK_VIEW_TYPE,
  BlockEditorView,
  CircuitEditorView,
  EXTENSION,
  VIEW_TYPE,
} from './editorView.ts';
import { freePath, safeFileName } from './files.ts';
import {
  DEFAULT_DATA,
  blockTheme,
  drawSettings,
  obsidianThemeId,
  readData,
  type DrawSettings,
  type PluginData,
} from './settings.ts';

/** Obsidian's internal embed registry (not in its published API). */
interface EmbedRegistry {
  registerExtension(
    extension: string,
    create: (ctx: { containerEl: HTMLElement }, file: TFile, subpath: string) => CircuitEmbed,
  ): void;
  unregisterExtension(extension: string): void;
}

/** The code block language that shows a circuit. */
const BLOCK_LANGUAGE = 'circuit';

/**
 * Perun in Obsidian: ```circuit code blocks run live in notes, and .circuit files open the full
 * editor in a tab.
 */
export default class PerunPlugin extends Plugin {
  data: PluginData = { ...DEFAULT_DATA, storage: {} };
  readonly widgets = new Set<CircuitWidget>();
  readonly editors = new Set<{ restyle(): void }>();
  private saveSoon: Debouncer<[], Promise<void>> = debounce(() => this.saveData(this.data), 1000);

  override async onload(): Promise<void> {
    this.data = readData(await this.loadData());

    this.registerMarkdownCodeBlockProcessor(BLOCK_LANGUAGE, (source, el, ctx) => {
      ctx.addChild(
        new CircuitBlock(el, source, this, () => void this.editBlock(ctx.sourcePath, source)),
      );
    });

    this.registerView(VIEW_TYPE, (leaf) => new CircuitEditorView(leaf, this));
    this.registerExtensions([EXTENSION], VIEW_TYPE);
    this.registerView(BLOCK_VIEW_TYPE, (leaf) => new BlockEditorView(leaf, this));
    this.registerEmbeds();

    this.addCommand({
      id: 'new-circuit',
      name: 'New circuit',
      callback: () => void this.newCircuit(),
    });
    this.addRibbonIcon('circuit-board', 'New circuit', () => void this.newCircuit());
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile) return;
        menu.addItem((item) =>
          item
            .setTitle('New circuit')
            .setIcon('circuit-board')
            .onClick(() => void this.newCircuit(file.path)),
        );
      }),
    );

    // Obsidian switched between light and dark
    this.registerEvent(this.app.workspace.on('css-change', () => this.restyle()));
    this.addSettingTab(new PerunSettingTab(this.app, this));
  }

  /**
   * `![[name.circuit]]` shows the file running. Obsidian has no public API for embedding a file
   * type yet; its embed registry is what plugins such as Excalidraw use. Without it, embeds show
   * Obsidian's plain file link.
   */
  private registerEmbeds(): void {
    const registry = (this.app as unknown as { embedRegistry?: EmbedRegistry }).embedRegistry;
    if (registry === undefined) return;
    registry.registerExtension(
      EXTENSION,
      (ctx, file) => new CircuitEmbed(this.app, ctx.containerEl, file, this),
    );
    this.register(() => registry.unregisterExtension(EXTENSION));
  }

  override onunload(): void {
    void this.saveSoon.run();
  }

  private get dark(): boolean {
    return document.body.classList.contains('theme-dark');
  }

  theme(): Theme {
    return blockTheme(this.data, this.dark);
  }

  draw(): DrawSettings {
    return drawSettings(this.data);
  }

  themeId(): string | null {
    return obsidianThemeId(this.data, this.dark);
  }

  storage(): Record<string, string> {
    return { ...this.data.storage };
  }

  setStorage(key: string, value: string | null): void {
    const { [key]: _old, ...rest } = this.data.storage;
    this.data.storage = value === null ? rest : { ...rest, [key]: value };
    this.saveSoon();
  }

  /** Write a file the editor exported into `folder`, under a name no other file has yet. */
  async saveFile(folder: string, name: string, data: string | ArrayBuffer): Promise<void> {
    const dir = folder === '/' || folder === '' ? '' : `${folder}/`;
    const path = freePath(
      (p) => this.app.vault.getAbstractFileByPath(p) !== null,
      dir,
      safeFileName(name),
    );
    try {
      if (typeof data === 'string') await this.app.vault.create(path, data);
      else await this.app.vault.createBinary(path, data);
      new Notice(`Saved ${path}`);
    } catch (e) {
      new Notice(`Couldn't save ${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async setFollowObsidian(on: boolean): Promise<void> {
    this.data.followObsidian = on;
    await this.saveData(this.data);
    this.restyle();
  }

  restyle(): void {
    for (const w of this.widgets) w.restyle();
    for (const e of this.editors) e.restyle();
  }

  /** Open a note's ```circuit block in the editor, in a new tab; edits go back into the note. */
  async editBlock(path: string, text: string): Promise<void> {
    await this.app.workspace.getLeaf('tab').setViewState({
      type: BLOCK_VIEW_TYPE,
      active: true,
      state: { path, text },
    });
  }

  /** Create an empty circuit file (in `folder`, else where new notes go) and open it. */
  async newCircuit(folder?: string): Promise<void> {
    const parent =
      folder ??
      this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path ?? '').path;
    const dir = parent === '/' ? '' : `${parent}/`;
    const path = freePath(
      (p) => this.app.vault.getAbstractFileByPath(p) !== null,
      dir,
      `Circuit.${EXTENSION}`,
    );
    try {
      const file = await this.app.vault.create(path, BLANK_CIRCUIT);
      await this.app.workspace.getLeaf(true).openFile(file);
    } catch (e) {
      new Notice(`Couldn't create ${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

class PerunSettingTab extends PluginSettingTab {
  private readonly plugin: PerunPlugin;

  constructor(app: App, plugin: PerunPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override display(): void {
    const el = this.containerEl;
    el.empty();
    new Setting(el)
      .setName("Match Obsidian's light and dark mode")
      .setDesc(
        "Circuits use Perun's Obsidian Dark or Obsidian Light theme. Turn off to use the theme you pick in the circuit editor.",
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.data.followObsidian)
          .onChange((on) => void this.plugin.setFollowObsidian(on)),
      );
  }
}
