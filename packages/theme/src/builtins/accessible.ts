// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import type { Theme } from '../schema.ts';
import { dark } from './dark.ts';

/** Pure black and white with saturated voltages, thicker lines and larger dots. */
export const highContrast: Theme = {
  schemaVersion: 1,
  meta: {
    name: 'High Contrast',
    author: 'circuitjs-next',
    description: 'Black and white with bright voltage colors, thick lines and large current dots',
    base: 'dark',
  },
  canvas: { background: '#000000', grid: '#383838', gridMajor: '#575757' },
  circuit: {
    voltage: { negative: '#ff6b6b', zero: '#c4c4c4', positive: '#3dff6e' },
    currentDot: '#ffff00',
    component: '#ffffff',
    componentMuted: '#d6d6d6',
    selection: '#00e5ff',
    hover: '#ff9cff',
    post: '#ffffff',
    text: '#ffffff',
    label: '#ffffff',
    badConnection: '#ff6b6b',
    electricField: '#00e5ff',
    magneticField: '#ff9cff',
    energy: '#ffd000',
    heat: '#ff5c39',
  },
  scope: {
    background: '#000000',
    card: '#141414',
    undockedCard: '#1f1f1f',
    grid: '#4d4d4d',
    gridMajor: '#9e9e9e',
    text: '#ffffff',
    current: '#ffff00',
    trigger: '#ffa94d',
    fft: '#ff6b6b',
    fftGrid: '#7a2a2a',
    traces: ['#3dff6e', '#00e5ff', '#ff9cff', '#ffa94d', '#ff6b6b'],
  },
  teaching: { pens: ['#ffff00', '#00ffff', '#ff00ff', '#ffffff'], laser: '#ff3030' },
  ui: {
    surface: '#000000',
    surfaceAlt: '#141414',
    border: '#ffffff',
    text: '#ffffff',
    textMuted: '#e0e0e0',
    accent: '#ffd400',
    danger: '#ff6b6b',
  },
  style: { ...dark.style, strokeWidth: 3, dotRadius: 3, grid: 'lines' },
};

/**
 * Voltages run blue to orange instead of red to green, so they read with the common kinds of
 * color blindness. Accents and scope traces come from the Okabe and Ito palette.
 */
export const colorblindSafe: Theme = {
  ...dark,
  meta: {
    name: 'Colorblind Safe',
    author: 'circuitjs-next',
    description: 'Blue to orange voltages and Okabe-Ito accents on the Dark background',
    base: 'dark',
  },
  circuit: {
    ...dark.circuit,
    voltage: { negative: '#56b4e9', zero: '#8b919c', positive: '#e69f00' },
    currentDot: '#f4f4f4',
    selection: '#cc79a7',
    hover: '#009e73',
    badConnection: '#d55e00',
    electricField: '#56b4e9',
    magneticField: '#cc79a7',
    energy: '#e69f00',
    heat: '#d55e00',
  },
  scope: {
    ...dark.scope,
    current: '#e69f00',
    trigger: '#d55e00',
    fft: '#cc79a7',
    fftGrid: '#4d2f40',
    traces: ['#56b4e9', '#e69f00', '#009e73', '#f0e442', '#cc79a7', '#d55e00'],
  },
  teaching: { pens: ['#f0e442', '#e69f00', '#56b4e9', '#009e73', '#cc79a7'], laser: '#d55e00' },
  ui: { ...dark.ui, accent: '#56b4e9', danger: '#f0a35e' },
};
