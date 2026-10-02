// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import type { Theme } from '../schema.ts';

/**
 * Low glare dark theme ("Night Bench" in PLAN.md section 6), the default. The UI colors are a
 * Material 3 dark scheme built from a blue seed: surface tone 6, containers tone 12, primary tone
 * 80, outline variant tone 30.
 */
export const dark: Theme = {
  schemaVersion: 1,
  meta: {
    name: 'Dark',
    author: 'circuitjs-next',
    description: 'Low glare dark theme with muted voltage colors',
    base: 'dark',
  },
  canvas: { background: '#191c22', grid: '#2b2f37', gridMajor: '#363b45' },
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
    surface: '#111318',
    surfaceAlt: '#1d2025',
    border: '#44474e',
    text: '#e2e2e9',
    textMuted: '#a9acb6',
    accent: '#a8c7fa',
    danger: '#ffb4ab',
  },
  style: {
    strokeWidth: 2.5,
    dotRadius: 2.5,
    grid: 'dots',
    font: "'Roboto Variable', Roboto, system-ui, sans-serif",
    monoFont: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
  },
};
