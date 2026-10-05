// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import type { Theme } from '../schema.ts';
import { dark } from './dark.ts';

/**
 * Light theme, the base for light themes that leave keys out. The UI colors are the Material 3
 * light scheme from the same blue seed as Dark: surface tone 98, containers tone 94, primary tone
 * 40, outline variant tone 80. Circuit colors are dark enough for 3:1 against the background.
 */
export const light: Theme = {
  schemaVersion: 1,
  meta: {
    name: 'Light',
    author: 'circuitjs-next',
    description: 'Paper white background with deep voltage colors',
    base: 'light',
  },
  canvas: { background: '#fbfbfe', grid: '#e4e6eb', gridMajor: '#d0d4db' },
  circuit: {
    voltage: { negative: '#c62828', zero: '#6b7280', positive: '#2e7d32' },
    currentDot: '#b25e00',
    component: '#2b2f36',
    componentMuted: '#6b7280',
    selection: '#1565c0',
    hover: '#00838f',
    post: '#2b2f36',
    text: '#2b2f36',
    label: '#44474e',
    badConnection: '#c62828',
  },
  scope: {
    background: '#ffffff',
    card: '#eef0f5',
    grid: '#e1e4ea',
    gridMajor: '#a9afba',
    text: '#191c20',
    current: '#b25e00',
    trigger: '#bf4a00',
    fft: '#c62828',
    fftGrid: '#f1c4c4',
    traces: ['#2e7d32', '#1565c0', '#8e24aa', '#00838f', '#c62828', '#b25e00'],
  },
  ui: {
    surface: '#f9f9ff',
    surfaceAlt: '#ededf4',
    border: '#c4c6d0',
    text: '#191c20',
    textMuted: '#44474e',
    accent: '#415f91',
    danger: '#ba1a1a',
  },
  style: { ...dark.style },
};
