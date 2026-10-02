// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import type { Theme } from '../schema.ts';

/** Low glare dark theme ("Night Bench" in PLAN.md section 6). */
export const dark: Theme = {
  schemaVersion: 1,
  meta: {
    name: 'Dark',
    author: 'circuitjs-next',
    description: 'Low glare dark theme with muted voltage colors',
    base: 'dark',
  },
  canvas: { background: '#1e222a', grid: '#2a2f3a', gridMajor: '#343a47' },
  circuit: {
    voltage: { negative: '#e06c75', zero: '#7f848e', positive: '#98c379' },
    currentDot: '#e5c07b',
    component: '#c8ccd4',
    componentMuted: '#7f848e',
    selection: '#61afef',
    hover: '#56b6c2',
    post: '#c8ccd4',
    text: '#c8ccd4',
    label: '#abb2bf',
    badConnection: '#e06c75',
  },
  scope: {
    background: '#16191f',
    grid: '#2a2f3a',
    traces: ['#98c379', '#61afef', '#e5c07b', '#c678dd', '#e06c75'],
  },
  ui: {
    surface: '#21252b',
    surfaceAlt: '#282c34',
    border: '#3b4048',
    text: '#d7dae0',
    textMuted: '#8b919c',
    accent: '#61afef',
    danger: '#e06c75',
  },
  style: {
    strokeWidth: 2.5,
    dotRadius: 2.5,
    grid: 'dots',
    font: 'Inter, system-ui, sans-serif',
    monoFont: 'JetBrains Mono, ui-monospace, monospace',
  },
};
