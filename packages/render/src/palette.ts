// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// The voltage color scale follows CircuitJS1 CircuitElm.setColorScale/getVoltageColor
// (src/com/lushprojects/circuitjs1/client/CircuitElm.java, master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: 201 steps, linear in RGB from zero to each end.

import type { ColorRole } from '@circuitjs-next/elements';
import { mixColor, rgba, toCss, type Theme } from '@circuitjs-next/theme';

/** Odd, so 0 V lands exactly on the zero color. */
export const COLOR_SCALE_COUNT = 201;

/** A theme resolved into CSS colors the canvas can use directly. */
export class Palette {
  readonly theme: Theme;
  readonly scale: string[] = [];
  readonly roles: Record<ColorRole, string>;
  readonly selection: string;
  readonly hover: string;

  constructor(theme: Theme) {
    this.theme = theme;
    const c = theme.circuit;
    const neutral = rgba(c.voltage.zero);
    const neg = rgba(c.voltage.negative);
    const pos = rgba(c.voltage.positive);
    for (let i = 0; i !== COLOR_SCALE_COUNT; i++) {
      const v = (i * 2) / COLOR_SCALE_COUNT - 1;
      this.scale.push(toCss(v < 0 ? mixColor(neutral, neg, -v) : mixColor(neutral, pos, v)));
    }
    this.roles = {
      component: c.component,
      componentMuted: c.componentMuted,
      label: c.label,
      text: c.text,
      post: c.post,
      currentDot: c.currentDot,
      badConnection: c.badConnection,
    };
    this.selection = c.selection;
    this.hover = c.hover;
  }

  /** Color for a voltage, `range` volts being full scale (upstream `getVoltageColor`). */
  voltage(volts: number, range: number): string {
    if (Number.isNaN(volts)) volts = 0;
    let i = Math.trunc(((volts + range) * (COLOR_SCALE_COUNT - 1)) / (range * 2));
    if (Number.isNaN(i) || i < 0) i = 0;
    if (i >= COLOR_SCALE_COUNT) i = COLOR_SCALE_COUNT - 1;
    return this.scale[i];
  }
}
