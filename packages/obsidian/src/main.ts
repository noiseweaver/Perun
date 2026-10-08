// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import {
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
  type App,
  type Debouncer,
  debounce,
} from 'obsidian';
import type { Theme } from '@perun/theme';
import { CircuitBlock } from './block.ts';
import { BLANK_CIRCUIT, CircuitEditorView, EXTENSION, VIEW_TYPE } from './editorView.ts';
import {
  DEFAULT_DATA,
  blockTheme,
  drawSettings,
  obsidianThemeId,
  readData,
  type DrawSettings,
  type PluginData,
} from './settings.ts';

/** The code block language that shows a circuit. */
const BLOCK_LANGUAGE = 'circuit';

/**
 * Perun in Obsidian: ```circuit code blocks run live in notes, and .circuit files open the full
 * editor in a tab.
 */
export default class PerunPlugin extends Plugin {
  data: PluginData = { ...DEFAULT_DATA, storage: {} };
  readonly blocks = new Set<CircuitBlock>();
  readonly editors = new Set<CircuitEditorView>();
  private saveSoon: Debouncer<[], Promise<void>> = debounce(() => this.saveData(this.data), 1000);

  override async onload(): Promise<void> {
    this.data = readData(await this.loadData());

    this.registerMarkdownCodeBlockProcessor(BLOCK_LANGUAGE, (source, el, ctx) => {
      ctx.addChild(new CircuitBlock(el, source, this));
    });

    this.registerView(VIEW_TYPE, (leaf) => new CircuitEditorView(leaf, this));
    this.registerExtensions([EXTENSION], VIEW_TYPE);

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

  async setFollowObsidian(on: boolean): Promise<void> {
    this.data.followObsidian = on;
    await this.saveData(this.data);
    this.restyle();
  }

  restyle(): void {
    for (const b of this.blocks) b.restyle();
    for (const e of this.editors) e.restyle();
  }

  /** Create an empty circuit file (in `folder`, else where new notes go) and open it. */
  async newCircuit(folder?: string): Promise<void> {
    const parent =
      folder ??
      this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path ?? '').path;
    const dir = parent === '/' ? '' : `${parent}/`;
    let path = normalizePath(`${dir}Circuit.${EXTENSION}`);
    for (let n = 1; this.app.vault.getAbstractFileByPath(path) !== null; n++)
      path = normalizePath(`${dir}Circuit ${n}.${EXTENSION}`);
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
