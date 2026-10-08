// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { compressCircuit } from '@perun/format';
import { MarkdownRenderChild, setIcon, setTooltip } from 'obsidian';
import { CircuitPlayer } from './player.ts';
import { SITE_URL } from './settings.ts';
import type { Theme } from '@perun/theme';
import type { DrawSettings } from './settings.ts';

/** What a block needs from the plugin. */
export interface BlockHost {
  theme(): Theme;
  draw(): DrawSettings;
  blocks: Set<CircuitBlock>;
}

/**
 * A ```circuit code block in reading view and live preview: the circuit running on a canvas, with
 * play/pause, reset and a link that opens it in the web app. Printing and PDF export show a still
 * picture instead, since a canvas prints as a blurry bitmap.
 */
export class CircuitBlock extends MarkdownRenderChild {
  private player: CircuitPlayer | null = null;
  private picture: HTMLImageElement | null = null;
  private playButton: HTMLButtonElement | null = null;
  private visible = false;
  private readonly source: string;
  private readonly host: BlockHost;

  constructor(containerEl: HTMLElement, source: string, host: BlockHost) {
    super(containerEl);
    this.source = source;
    this.host = host;
  }

  override onload(): void {
    const root = this.containerEl.createDiv({ cls: 'perun-block' });
    const canvas = root.createEl('canvas', { cls: 'perun-canvas' });
    try {
      this.player = new CircuitPlayer(canvas, this.source, this.host.theme(), this.host.draw());
    } catch (e) {
      root.empty();
      root.addClass('perun-error');
      root.setText(`Perun can't read this circuit: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const player = this.player;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Circuit simulation');
    this.picture = root.createEl('img', { cls: 'perun-picture', attr: { alt: 'Circuit' } });

    const bar = root.createDiv({ cls: 'perun-bar' });
    this.playButton = bar.createEl('button', { cls: 'clickable-icon perun-play' });
    this.playButton.addEventListener('click', () => {
      player.running = !player.running;
      this.showPlaying();
    });
    const reset = bar.createEl('button', { cls: 'clickable-icon' });
    setIcon(reset, 'rotate-ccw');
    setTooltip(reset, 'Reset');
    reset.setAttribute('aria-label', 'Reset');
    reset.addEventListener('click', () => {
      player.reset();
      player.running = true;
      this.showPlaying();
    });
    const open = bar.createEl('a', {
      cls: 'perun-open',
      text: 'Open in Perun',
      href: `${SITE_URL}?ctz=${compressCircuit(this.source)}`,
    });
    open.setAttribute('target', '_blank');
    open.setAttribute('rel', 'noopener');
    this.showPlaying();

    const fit = (): void => {
      const width = canvas.parentElement?.clientWidth ?? 0;
      if (width === 0) return;
      const height = player.heightFor(width);
      canvas.style.height = `${height}px`;
      player.resize(width, height, window.devicePixelRatio || 1);
    };
    const resizer = new ResizeObserver(fit);
    resizer.observe(root);
    this.register(() => resizer.disconnect());

    // run only while on screen: a long note can hold many circuits
    const seen = new IntersectionObserver((entries) => {
      this.visible = entries.some((e) => e.isIntersecting);
      if (this.visible) this.startPlayer();
      else player.stop();
    });
    seen.observe(root);
    this.register(() => seen.disconnect());

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = (): void => {
      if (this.visible) this.startPlayer();
    };
    motion.addEventListener('change', onMotion);
    this.register(() => motion.removeEventListener('change', onMotion));

    this.host.blocks.add(this);
    this.register(() => {
      this.host.blocks.delete(this);
      player.stop();
    });
    this.updatePicture();
  }

  private startPlayer(): void {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.player?.start(!still);
  }

  private showPlaying(): void {
    const b = this.playButton;
    if (!b || !this.player) return;
    const label = this.player.running ? 'Pause' : 'Run';
    setIcon(b, this.player.running ? 'pause' : 'play');
    setTooltip(b, label);
    b.setAttribute('aria-label', label);
  }

  private updatePicture(): void {
    const svg = this.player?.svg() ?? null;
    if (this.picture && svg !== null)
      this.picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  /** Obsidian's mode or the plugin's settings changed. */
  restyle(): void {
    this.player?.setTheme(this.host.theme(), this.host.draw());
    this.updatePicture();
  }
}
