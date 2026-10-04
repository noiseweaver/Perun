// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import type { Theme } from '../schema.ts';
import { dark } from './dark.ts';

/*
 * Dark themes after well-known editor palettes. The colors are taken from each palette's
 * published values: Nord (nordtheme.com), Solarized (Ethan Schoonover), Gruvbox (morhetz) and
 * libadwaita's dark style (GNOME). Voltages run red to green, current dots are the palette's
 * yellow, and selection and hover use its blues.
 */

export const nord: Theme = {
  schemaVersion: 1,
  meta: {
    name: 'Nord',
    author: 'circuitjs-next',
    description: 'Arctic blue-grey, after the Nord palette',
    base: 'dark',
  },
  canvas: { background: '#2e3440', grid: '#3b4252', gridMajor: '#434c5e' },
  circuit: {
    voltage: { negative: '#bf616a', zero: '#7b88a1', positive: '#a3be8c' },
    currentDot: '#ebcb8b',
    component: '#d8dee9',
    componentMuted: '#7b88a1',
    selection: '#88c0d0',
    hover: '#8fbcbb',
    post: '#d8dee9',
    text: '#e5e9f0',
    label: '#d8dee9',
    badConnection: '#bf616a',
  },
  scope: {
    background: '#292e39',
    grid: '#3b4252',
    traces: ['#a3be8c', '#88c0d0', '#ebcb8b', '#b48ead', '#d08770'],
  },
  ui: {
    surface: '#242933',
    surfaceAlt: '#2e3440',
    border: '#4c566a',
    text: '#eceff4',
    textMuted: '#a5adbd',
    accent: '#88c0d0',
    danger: '#bf616a',
  },
  style: { ...dark.style },
};

export const solarizedDark: Theme = {
  schemaVersion: 1,
  meta: {
    name: 'Solarized Dark',
    author: 'circuitjs-next',
    description: 'Deep teal with warm accents, after Solarized',
    base: 'dark',
  },
  canvas: { background: '#002b36', grid: '#073642', gridMajor: '#0b4352' },
  circuit: {
    voltage: { negative: '#dc322f', zero: '#657b83', positive: '#859900' },
    currentDot: '#b58900',
    component: '#93a1a1',
    componentMuted: '#586e75',
    selection: '#268bd2',
    hover: '#2aa198',
    post: '#93a1a1',
    text: '#93a1a1',
    label: '#839496',
    badConnection: '#dc322f',
  },
  scope: {
    background: '#00252e',
    grid: '#073642',
    traces: ['#859900', '#268bd2', '#b58900', '#d33682', '#2aa198'],
  },
  ui: {
    surface: '#00212b',
    surfaceAlt: '#073642',
    border: '#2f5560',
    text: '#eee8d5',
    textMuted: '#93a1a1',
    accent: '#268bd2',
    danger: '#dc322f',
  },
  style: { ...dark.style },
};

export const gruvboxDark: Theme = {
  schemaVersion: 1,
  meta: {
    name: 'Gruvbox Dark',
    author: 'circuitjs-next',
    description: 'Warm retro browns and pastels, after Gruvbox',
    base: 'dark',
  },
  canvas: { background: '#282828', grid: '#3c3836', gridMajor: '#504945' },
  circuit: {
    voltage: { negative: '#fb4934', zero: '#928374', positive: '#b8bb26' },
    currentDot: '#fabd2f',
    component: '#ebdbb2',
    componentMuted: '#928374',
    selection: '#83a598',
    hover: '#8ec07c',
    post: '#ebdbb2',
    text: '#ebdbb2',
    label: '#d5c4a1',
    badConnection: '#fb4934',
  },
  scope: {
    background: '#1d2021',
    grid: '#3c3836',
    traces: ['#b8bb26', '#83a598', '#fabd2f', '#d3869b', '#fe8019'],
  },
  ui: {
    surface: '#1d2021',
    surfaceAlt: '#282828',
    border: '#504945',
    text: '#ebdbb2',
    textMuted: '#a89984',
    accent: '#fabd2f',
    danger: '#fb4934',
  },
  style: { ...dark.style },
};

export const adwaitaDark: Theme = {
  schemaVersion: 1,
  meta: {
    name: 'Adwaita Dark',
    author: 'circuitjs-next',
    description: 'Neutral greys with GNOME blue, after libadwaita',
    base: 'dark',
  },
  canvas: { background: '#1e1e1e', grid: '#2c2c2c', gridMajor: '#383838' },
  circuit: {
    voltage: { negative: '#ff7b63', zero: '#9a9996', positive: '#8ff0a4' },
    currentDot: '#f6d32d',
    component: '#deddda',
    componentMuted: '#9a9996',
    selection: '#78aeed',
    hover: '#99c1f1',
    post: '#deddda',
    text: '#deddda',
    label: '#c0bfbc',
    badConnection: '#ff7b63',
  },
  scope: {
    background: '#1a1a1a',
    grid: '#2c2c2c',
    traces: ['#8ff0a4', '#78aeed', '#f6d32d', '#dc8add', '#ffa348'],
  },
  ui: {
    surface: '#242424',
    surfaceAlt: '#303030',
    border: '#484848',
    text: '#ffffff',
    textMuted: '#c0bfbc',
    accent: '#78aeed',
    danger: '#ff7b63',
  },
  style: { ...dark.style },
};
