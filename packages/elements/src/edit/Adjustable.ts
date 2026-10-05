// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/Adjustable.java, Scrollbar.java
// (value range and stepping) and CirSim.java (findAdjustable, deleteSliders) (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { CircuitElm } from '../CircuitElm.ts';

/** Upstream `Adjustable.FLAG_SHARED` and `FLAG_LOG` (text format flags). */
export const ADJ_FLAG_SHARED = 1;
export const ADJ_FLAG_LOG = 2;

/** The slider's integer range (upstream `new Scrollbar(..., 0, 101)`: 0 to 100). */
export const SLIDER_MAX = 100;

/**
 * A slider that sets one numeric edit field of an element (upstream "Sliders…"). Upstream keeps
 * the slider widget inside the Adjustable; here `position` is the widget's integer value
 * (0..100) and the UI draws it. A slider can share another's widget (`sharedSlider`): moving
 * that one sets both values.
 */
export class Adjustable {
  elm: CircuitElm;
  minValue = 1;
  maxValue = 1000;
  /** Step increment; 0 = continuous. */
  sliderStep = 0;
  sliderText = '';
  logarithmic = false;
  /** Null if this one has its own slider, else the one it shares. */
  sharedSlider: Adjustable | null = null;
  /** Index of the value in the element's getEditInfo list that this slider controls. */
  editItem: number;
  /**
   * The slider's position (upstream `Scrollbar.val`). A new slider takes the value's position
   * unclamped, as upstream's Scrollbar constructor does; moving it clamps to 0..100.
   */
  position = 0;

  constructor(ce: CircuitElm, item: number) {
    this.elm = ce;
    this.editItem = item;
    const ei = ce.getEditInfo(item);
    if (ei !== null && ei.maxVal > 0) {
      this.minValue = ei.minVal;
      this.maxValue = ei.maxVal;
    }
  }

  /**
   * Upstream `createSlider(sim)`: whether this adjustable gets (or shares) a slider. Those that
   * don't are dropped after loading.
   */
  createSlider(): boolean {
    const ei = this.elm.getEditInfo(this.editItem);
    if (ei === null) return false;
    if (this.sharedSlider !== null) return true;
    if (this.sliderText.length === 0) return false;
    this.createSliderAt(ei.value);
    return true;
  }

  /** Upstream `createSlider(sim, value)`. */
  createSliderAt(value: number): void {
    this.position = this.valueToSliderPosition(value);
  }

  /** The step in slider units (upstream `slider.setStepSize`). */
  get stepSize(): number {
    return (this.sliderStep * 100) / (this.maxValue - this.minValue);
  }

  /** The adjustable whose slider this one shows: itself, or the one it shares. */
  get owner(): Adjustable {
    return this.sharedSlider ?? this;
  }

  /** Upstream `setSliderValue`: move the slider to show a value, without applying it. */
  setSliderValue(value: number): void {
    if (this.sharedSlider !== null) {
      this.sharedSlider.setSliderValue(value);
      return;
    }
    this.position = clampPosition(this.valueToSliderPosition(value));
  }

  /**
   * Snap a slider position to the step, as upstream's Scrollbar does when it is dragged
   * (`snapToStep`).
   */
  snapToStep(v: number): number {
    const step = this.stepSize;
    if (step > 0) {
      v = Math.trunc(Math.round(v / step) * step);
      v = clampPosition(v);
    }
    return v;
  }

  /** Upstream `getSliderValue`: the value the slider stands for. */
  getSliderValue(): number {
    const pos = this.owner.position;
    let result = this.sliderPositionToValue(pos);
    const step = this.owner.sliderStep;
    if (step > 0) result = this.minValue + Math.round((result - this.minValue) / step) * step;
    return result;
  }

  /** Upstream `executeSlider`: set the element's value from the slider. */
  executeSlider(): void {
    const ei = this.elm.getEditInfo(this.editItem);
    if (ei === null) return;
    ei.value = this.getSliderValue();
    this.elm.setEditValue(this.editItem, ei);
  }

  /** Upstream `valueToSliderPosition` (Java int cast). */
  valueToSliderPosition(value: number): number {
    if (this.logarithmic && this.minValue > 0) {
      const logMin = Math.log(this.minValue);
      const logMax = Math.log(this.maxValue);
      return javaInt(((Math.log(value) - logMin) / (logMax - logMin)) * 100);
    }
    return javaInt(((value - this.minValue) * 100) / (this.maxValue - this.minValue));
  }

  /** Upstream `sliderPositionToValue`. */
  sliderPositionToValue(pos: number): number {
    if (this.logarithmic && this.minValue > 0) {
      const logMin = Math.log(this.minValue);
      const logMax = Math.log(this.maxValue);
      return Math.exp(logMin + ((logMax - logMin) * pos) / 100);
    }
    return this.minValue + ((this.maxValue - this.minValue) * pos) / 100;
  }

  /** Upstream `getEditItemName`: the unlocalized name of the value this slider controls. */
  getEditItemName(): string {
    return this.elm.getEditInfo(this.editItem)?.name ?? '';
  }
}

/** Java `(int)` of a double: truncate, NaN to 0, saturate at the int range. */
function javaInt(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v >= 2147483647) return 2147483647;
  if (v <= -2147483648) return -2147483648;
  return Math.trunc(v);
}

/** Upstream `Scrollbar.setValue` clamps to its range. */
export function clampPosition(v: number): number {
  return Math.min(Math.max(v, 0), SLIDER_MAX);
}

/** Upstream `findEditItemByName`: the edit item index by name, else the fallback index. */
export function findEditItemByName(
  elm: CircuitElm,
  name: string | null,
  fallbackIndex: number,
): number {
  if (name !== null && name.length > 0) {
    for (let i = 0; ; i++) {
      const ei = elm.getEditInfo(i);
      if (ei === null) break;
      if (ei.name === name) return i;
    }
  }
  return fallbackIndex;
}

/** Upstream `CirSim.findAdjustable`. */
export function findAdjustable(
  list: readonly Adjustable[],
  elm: CircuitElm,
  item: number,
): Adjustable | null {
  for (const a of list) if (a.elm === elm && a.editItem === item) return a;
  return null;
}

/**
 * Upstream `reorderAdjustables`: sliders first, then the adjustables that share them, so a list
 * saves and loads with every shared slider before its users.
 */
export function reorderAdjustables(list: readonly Adjustable[]): Adjustable[] {
  return [...list.filter((a) => a.sharedSlider === null), ...list.filter((a) => a.sharedSlider)];
}

/** Whether another adjustable shares this one's slider (upstream `sliderBeingShared`). */
export function sliderBeingShared(list: readonly Adjustable[], adj: Adjustable): boolean {
  return list.some((a) => a.sharedSlider === adj);
}
