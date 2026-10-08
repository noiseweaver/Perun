// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { Component, SliderComponent, setIcon, setTooltip } from 'obsidian';
import type { Theme } from '@perun/theme';
import { CircuitPlayer } from './player.ts';
import type { DrawSettings } from './settings.ts';

/** What a circuit in a note needs from the plugin. */
export interface WidgetHost {
  theme(): Theme;
  draw(): DrawSettings;
  widgets: Set<CircuitWidget>;
}

/**
 * A circuit running in a note (a ```circuit block or an embedded .circuit file): the canvas, a
 * bar with Pause/Run, Reset, Controls and Open in Perun (the editor, in a tab), and the controls panel with the circuit's
 * sliders and its simulation and current speed. Printing and PDF export show a still picture
 * instead, since a canvas prints as a blurry bitmap.
 */
export class CircuitWidget extends Component {
  private player: CircuitPlayer | null = null;
  private picture: HTMLImageElement | null = null;
  private playButton: HTMLButtonElement | null = null;
  private controls: HTMLElement | null = null;
  private visible = false;
  private readonly parentEl: HTMLElement;
  private readonly source: string;
  private readonly host: WidgetHost;
  private readonly edit: () => void;

  constructor(parentEl: HTMLElement, source: string, host: WidgetHost, edit: () => void) {
    super();
    this.parentEl = parentEl;
    this.source = source;
    this.host = host;
    this.edit = edit;
  }

  override onload(): void {
    const root = this.parentEl.createDiv({ cls: 'perun-block' });
    this.register(() => root.remove());
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
    this.playButton = button(bar, 'pause', 'Pause', () => {
      player.running = !player.running;
      this.showPlaying();
    });
    button(bar, 'rotate-ccw', 'Reset', () => {
      player.reset();
      player.running = true;
      this.showPlaying();
      this.buildControls();
    });
    const controls = root.createDiv({ cls: 'perun-controls' });
    this.controls = controls;
    const toggle = button(bar, 'sliders-horizontal', 'Controls', () => {
      controls.toggleClass('is-open', !controls.hasClass('is-open'));
      toggle.toggleClass('is-active', controls.hasClass('is-open'));
      toggle.setAttribute('aria-expanded', String(controls.hasClass('is-open')));
    });
    // open at first when the circuit has sliders of its own
    const open = player.sliders().length > 0;
    controls.toggleClass('is-open', open);
    toggle.toggleClass('is-active', open);
    toggle.setAttribute('aria-expanded', String(open));
    this.buildControls();
    // the circuit in Perun's editor, in an Obsidian tab
    const edit = bar.createEl('button', { cls: 'perun-open', text: 'Open in Perun' });
    edit.addEventListener('click', this.edit);
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

    this.host.widgets.add(this);
    this.register(() => {
      this.host.widgets.delete(this);
      player.stop();
    });
    this.updatePicture();
  }

  /** The sliders the circuit defines (as the editor's slider panel), then the two speeds. */
  private buildControls(): void {
    const panel = this.controls;
    const player = this.player;
    if (!panel || !player) return;
    panel.empty();
    player.sliders().forEach((entry, i) => {
      const value = slider(panel, entry.label, 0, 100, entry.position, (v) => {
        // the entry sets the value; a fresh list reads it back for the readout
        entry.set(v);
        value.setText(player.sliders()[i]?.valueText ?? '');
      });
      value.setText(entry.valueText);
    });
    slider(panel, 'Simulation speed', 0, 259, player.speed, (v) => (player.speed = v));
    slider(panel, 'Current speed', 1, 99, player.currentSpeed, (v) => (player.currentSpeed = v));
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

function button(
  parent: HTMLElement,
  icon: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = parent.createEl('button', { cls: 'clickable-icon' });
  setIcon(b, icon);
  setTooltip(b, label);
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

/** A labeled slider; returns the readout beside it (fixed width, monospace). */
function slider(
  parent: HTMLElement,
  label: string,
  min: number,
  max: number,
  value: number,
  onInput: (v: number) => void,
): HTMLElement {
  const row = parent.createDiv({ cls: 'perun-control' });
  row.createSpan({ cls: 'perun-control-label', text: label });
  new SliderComponent(row)
    .setLimits(min, max, 1)
    .setInstant(true)
    .setValue(value)
    .onChange(onInput)
    .sliderEl.setAttribute('aria-label', label);
  return row.createSpan({ cls: 'perun-control-value' });
}
