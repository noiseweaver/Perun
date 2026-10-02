// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Colors from CircuitJS1 src/com/lushprojects/circuitjs1/client/Color.java and UIManager.java
// (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: the upstream look.

import type { Theme } from '../schema.ts';

export const classic: Theme = {
  schemaVersion: 1,
  meta: {
    name: 'Classic',
    author: 'circuitjs-next',
    description: 'The CircuitJS1 look: black background, green and red voltages, yellow current',
    base: 'classic',
  },
  canvas: { background: '#000000', grid: '#1a1a1a', gridMajor: '#262626' },
  circuit: {
    voltage: { negative: '#ff0000', zero: '#808080', positive: '#00ff00' },
    currentDot: '#ffff00',
    component: '#ffffff',
    componentMuted: '#808080',
    selection: '#00ffff',
    hover: '#00ffff',
    post: '#ffffff',
    text: '#ffffff',
    label: '#c0c0c0',
    badConnection: '#ff0000',
  },
  scope: {
    background: '#000000',
    grid: '#808080',
    traces: ['#00ff00', '#ffff00', '#ff0000', '#00ffff', '#ff00ff', '#ffffff'],
  },
  ui: {
    surface: '#1e1e1e',
    surfaceAlt: '#2b2b2b',
    border: '#4a4a4a',
    text: '#f0f0f0',
    textMuted: '#a8a8a8',
    accent: '#00b3b3',
    danger: '#ff5050',
  },
  style: {
    strokeWidth: 3,
    dotRadius: 2,
    grid: 'none',
    // upstream draws in the browser's SansSerif; both fonts are bundled with the app
    font: "'Roboto Variable', Roboto, Arial, Helvetica, sans-serif",
    monoFont:
      "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
  },
};

/** Classic colors on a dot grid. */
export const classicDots: Theme = {
  ...classic,
  meta: {
    ...classic.meta,
    name: 'Classic Dots',
    description: 'The CircuitJS1 colors with a dot grid behind the circuit',
  },
  canvas: { ...classic.canvas, grid: '#3a3a3a', gridMajor: '#5a5a5a' },
  style: { ...classic.style, grid: 'dots' },
};
