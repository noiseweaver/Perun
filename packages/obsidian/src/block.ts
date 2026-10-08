// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { Component, MarkdownRenderChild, type App, type TFile } from 'obsidian';
import { CircuitWidget, type WidgetHost } from './widget.ts';

/** A ```circuit code block in reading view and live preview: the circuit text, running. */
export class CircuitBlock extends MarkdownRenderChild {
  private readonly source: string;
  private readonly host: WidgetHost;
  private readonly edit: () => void;

  /** `edit` opens the block in the editor. */
  constructor(containerEl: HTMLElement, source: string, host: WidgetHost, edit: () => void) {
    super(containerEl);
    this.source = source;
    this.host = host;
    this.edit = edit;
  }

  override onload(): void {
    this.addChild(new CircuitWidget(this.containerEl, this.source, this.host, this.edit));
  }
}

/**
 * `![[name.circuit]]` in a note: the file, running, and running again from the new text whenever
 * the file changes (an edit in its tab, sync from another device).
 */
export class CircuitEmbed extends Component {
  private widget: CircuitWidget | null = null;
  private text: string | null = null;
  private readonly app: App;
  private readonly containerEl: HTMLElement;
  private readonly file: TFile;
  private readonly host: WidgetHost;

  constructor(app: App, containerEl: HTMLElement, file: TFile, host: WidgetHost) {
    super();
    this.app = app;
    this.containerEl = containerEl;
    this.file = file;
    this.host = host;
  }

  /** Called by Obsidian once the embed is set up. */
  async loadFile(): Promise<void> {
    await this.show();
    this.registerEvent(
      this.app.vault.on('modify', (f) => {
        if (f === this.file) void this.show();
      }),
    );
  }

  private async show(): Promise<void> {
    const text = await this.app.vault.cachedRead(this.file);
    if (text === this.text) return;
    this.text = text;
    if (this.widget !== null) this.removeChild(this.widget);
    this.containerEl.addClass('perun-embed');
    this.widget = this.addChild(
      new CircuitWidget(
        this.containerEl,
        text,
        this.host,
        () => void this.app.workspace.getLeaf('tab').openFile(this.file),
      ),
    );
  }
}
