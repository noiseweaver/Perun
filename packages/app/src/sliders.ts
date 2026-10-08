// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// What upstream's side panel shows under the buttons (CircuitJS1 Adjustable.java, PotElm.java,
// LDRElm.java, ThermistorNTCElm.java and VarRailElm.java createSlider/execute, master at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032): one slider per adjustable that owns one, and one
// for each pot (per linked group), LDR, thermistor and variable rail, in the order upstream adds
// them (elements as they load, then the adjustables).

import {
  Adjustable,
  CircuitElm,
  LDRElm,
  PotElm,
  SLIDER_MAX,
  ThermistorNTCElm,
  VarRailElm,
  clampPosition,
  getUnitText,
  unitString,
} from '@perun/elements';

/** One slider in the panel. Positions are upstream's Scrollbar values, 0 to 100. */
export interface SliderEntry {
  /** Stable while the circuit is unchanged (for React keys). */
  key: string;
  label: string;
  /** The element the slider belongs to (hovering the slider highlights it). */
  elm: CircuitElm;
  position: number;
  /** The value it sets, for the readout. */
  valueText: string;
  /** Move the slider and apply it, as upstream's Scrollbar command does. */
  set(position: number): void;
}

/** Room for the readout, so it keeps its width while dragging (owner's rule, CLAUDE.md). */
const VALUE_WIDTH = 11;
const pad = (s: string): string => s.padStart(VALUE_WIDTH);

export function sliderEntries(
  elements: readonly CircuitElm[],
  adjustables: readonly Adjustable[],
  analyze: () => void,
): SliderEntry[] {
  const out: SliderEntry[] = [];
  const pots = new Set<number>();
  elements.forEach((e, i) => {
    if (e instanceof PotElm) {
      // linked pots share the first one's slider
      if (e.link !== 0) {
        if (pots.has(e.link)) return;
        pots.add(e.link);
      }
      const group =
        e.link === 0
          ? [e]
          : elements.filter((p): p is PotElm => p instanceof PotElm && p.link === e.link);
      out.push({
        key: `e${i}`,
        label: e.sliderText,
        elm: e,
        position: e.sliderValue,
        valueText: pad(`${Math.round((e.sliderValue * 0.0099 + 0.005) * 100)}%`),
        set(v) {
          for (const p of group) {
            p.sliderValue = clampPosition(Math.round(v));
            p.setPoints();
          }
          analyze();
        },
      });
    } else if (e instanceof LDRElm || e instanceof ThermistorNTCElm) {
      const value =
        e instanceof LDRElm ? getUnitText(e.lux, 'lx') : `${e.temperature.toFixed(1)} °C`;
      out.push({
        key: `e${i}`,
        label: e.sliderText,
        elm: e,
        position: e.sliderValue,
        valueText: pad(value),
        set(v) {
          e.sliderValue = clampPosition(Math.round(v));
          e.setPoints();
          analyze();
        },
      });
    } else if (e instanceof VarRailElm) {
      out.push({
        key: `e${i}`,
        label: e.sliderText,
        elm: e,
        position: e.sliderValue,
        valueText: pad(getUnitText(e.getVoltage(), 'V')),
        set(v) {
          // upstream's rail reads its slider every step; nothing to analyze
          e.setSliderValue(v);
        },
      });
    }
  });
  adjustables.forEach((a, i) => {
    if (a.sharedSlider !== null) return;
    const users = adjustables.filter((u) => u === a || u.sharedSlider === a);
    const ei = a.elm.getEditInfo(a.editItem);
    const value = a.getSliderValue();
    out.push({
      key: `a${i}`,
      label: a.sliderText,
      elm: a.elm,
      position: a.position,
      valueText: pad(ei !== null ? unitString(ei, value) : String(value)),
      set(v) {
        a.position = a.snapToStep(clampPosition(Math.round(v)));
        // upstream Adjustable.execute: every adjustable on this slider takes its value
        for (const u of users) u.executeSlider();
        analyze();
      },
    });
  });
  return out;
}

export { SLIDER_MAX };
