// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { Component, setIcon, setTooltip } from 'obsidian';
import type { SwitchElm } from '@perun/elements';
import type { Theme } from '@perun/theme';
import { CircuitPlayer } from './player.ts';
import type { DrawingSettings } from '@perun/app/drawing';

/** What a circuit in a note needs from the plugin. */
export interface WidgetHost {
  theme(): Theme;
  draw(): DrawingSettings;
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
    this.clickSwitches(canvas, player);
    this.picture = root.createEl('img', { cls: 'perun-picture', attr: { alt: 'Circuit' } });

    if (player.skipped > 0) {
      // as the editor's notice: the rest of the circuit runs
      const n = player.skipped;
      root.createDiv({
        cls: 'perun-skipped',
        text: `${n} ${n === 1 ? 'item' : 'items'} in this circuit couldn't be read and ${n === 1 ? 'was' : 'were'} left out. Open in Perun lists ${n === 1 ? 'it' : 'them'}.`,
      });
    }

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

  /**
   * Switches, push buttons and logic inputs work in a note as in the editor: a click flips one,
   * a push button is held while the pointer is down. Anywhere else the canvas scrolls the note.
   */
  private clickSwitches(canvas: HTMLCanvasElement, player: CircuitPlayer): void {
    let held: SwitchElm | null = null;
    const at = (e: PointerEvent): SwitchElm | null => {
      const r = canvas.getBoundingClientRect();
      return player.switchAt(e.clientX - r.left, e.clientY - r.top);
    };
    const letGo = (): void => {
      if (held !== null) player.toggle(held);
      held = null;
    };
    this.registerDomEvent(canvas, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      const s = at(e);
      if (s === null) return;
      e.preventDefault();
      player.toggle(s);
      if (s.momentary) {
        held = s;
        canvas.setPointerCapture(e.pointerId);
      }
    });
    this.registerDomEvent(canvas, 'pointerup', letGo);
    this.registerDomEvent(canvas, 'pointercancel', letGo);
    this.registerDomEvent(canvas, 'pointermove', (e) => {
      canvas.toggleClass('is-over-switch', held !== null || at(e) !== null);
    });
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
  row.createSpan({ cls: 'perun-control-label', text: label, attr: { title: label } });
  // a plain range input in Obsidian's slider style: Obsidian's SliderComponent (since 1.13 or so)
  // adds its own value readout next to the slider, which broke the row's layout
  const input = row.createEl('input', {
    cls: 'slider perun-control-slider',
    type: 'range',
    attr: { min, max, step: 1, 'aria-label': label },
  });
  // Obsidian's slider style fills the track up to the thumb by this ratio
  const fill = (): void =>
    input.style.setProperty(
      '--slider-fill-ratio',
      String((Number(input.value) - min) / (max - min)),
    );
  input.value = String(value);
  fill();
  input.addEventListener('input', () => {
    fill();
    onInput(Number(input.value));
  });
  return row.createSpan({ cls: 'perun-control-value' });
}
