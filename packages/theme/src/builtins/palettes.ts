// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { Theme } from '../schema.ts';
import { dark } from './dark.ts';

/*
 * Themes after popular editor and Obsidian palettes, built from each palette's published values:
 * Dracula (draculatheme.com), Monokai (Wimer Hazenberg), Tokyo Night (enkia), Catppuccin
 * (catppuccin.com), Rosé Pine (rosepinetheme.com), Everforest (sainnhe), GitHub's Primer colors,
 * Solarized (Ethan Schoonover) and Obsidian's default theme. Every theme maps its palette the same
 * way: voltages run from the palette's red to its green, current dots are its yellow, selection
 * and hover its blue and cyan. Where a palette color is too faint for the contrast checks
 * (contrast.ts), it is nudged and the comment says so.
 */

interface Palette {
  name: string;
  description: string;
  base: 'dark' | 'light';
  /** Canvas, the scope plot and the app chrome. */
  bg: string;
  scopeBg: string;
  surface: string;
  /** Cards, menus and raised panels. */
  raised: string;
  grid: string;
  gridMajor: string;
  border: string;
  fg: string;
  muted: string;
  /** Wires at 0 V and unpowered parts. */
  zero: string;
  red: string;
  orange: string;
  yellow: string;
  green: string;
  cyan: string;
  blue: string;
  purple: string;
  accent: string;
  danger?: string;
  /** Energy overlay color when orange is too light on the canvas. */
  energy?: string;
}

function hex(n: number): string {
  return Math.round(n).toString(16).padStart(2, '0');
}

/** `a` blended over `b` with weight `w`. */
function mix(a: string, b: string, w: number): string {
  const ch = (s: string, i: number): number => parseInt(s.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => hex(ch(a, i) * w + ch(b, i) * (1 - w))).join('')}`;
}

function paletteTheme(p: Palette): Theme {
  return {
    schemaVersion: 1,
    meta: { name: p.name, author: 'Perun', description: p.description, base: p.base },
    canvas: { background: p.bg, grid: p.grid, gridMajor: p.gridMajor },
    circuit: {
      voltage: { negative: p.red, zero: p.zero, positive: p.green },
      currentDot: p.yellow,
      component: p.fg,
      componentMuted: p.zero,
      selection: p.blue,
      hover: p.cyan,
      post: p.fg,
      text: p.fg,
      label: p.muted,
      badConnection: p.red,
      electricField: p.blue,
      magneticField: p.purple,
      energy: p.energy ?? p.orange,
      heat: mix(p.red, p.orange, 0.6),
    },
    scope: {
      background: p.scopeBg,
      card: p.raised,
      undockedCard: mix(p.raised, p.fg, 0.92),
      grid: p.grid,
      gridMajor: p.border,
      text: p.fg,
      current: p.yellow,
      trigger: p.orange,
      fft: p.red,
      fftGrid: mix(p.red, p.scopeBg, 0.3),
      traces: [p.green, p.blue, p.purple, p.cyan, p.red, p.orange],
    },
    teaching: { pens: [p.yellow, p.red, p.blue, p.green, p.fg], laser: p.red },
    ui: {
      surface: p.surface,
      surfaceAlt: p.raised,
      border: p.border,
      text: p.fg,
      textMuted: p.muted,
      accent: p.accent,
      danger: p.danger ?? p.red,
    },
    style: { ...dark.style },
  };
}

export const dracula = paletteTheme({
  name: 'Dracula',
  description: 'Purple-grey with neon accents, after Dracula',
  base: 'dark',
  bg: '#282a36',
  scopeBg: '#21222c',
  surface: '#21222c',
  raised: '#343746',
  grid: '#343746',
  gridMajor: '#44475a',
  border: '#44475a',
  fg: '#f8f8f2',
  muted: '#bfbfbf',
  // Dracula's comment color, lightened a step for 3:1
  zero: '#7984b8',
  red: '#ff5555',
  orange: '#ffb86c',
  yellow: '#f1fa8c',
  green: '#50fa7b',
  cyan: '#8be9fd',
  blue: '#bd93f9',
  purple: '#ff79c6',
  accent: '#bd93f9',
  danger: '#ff6e6e',
});

export const monokai = paletteTheme({
  name: 'Monokai',
  description: 'Olive-black with vivid pinks and greens, after Monokai',
  base: 'dark',
  bg: '#272822',
  scopeBg: '#1e1f1c',
  surface: '#1e1f1c',
  raised: '#34352f',
  grid: '#34352f',
  gridMajor: '#414339',
  border: '#49483e',
  fg: '#f8f8f2',
  muted: '#c2c2b0',
  // Monokai's comment color, lightened for 3:1
  zero: '#8f8a72',
  red: '#f92672',
  orange: '#fd971f',
  yellow: '#e6db74',
  green: '#a6e22e',
  cyan: '#66d9ef',
  blue: '#66d9ef',
  purple: '#ae81ff',
  accent: '#a6e22e',
  danger: '#ff6188',
});

export const tokyoNight = paletteTheme({
  name: 'Tokyo Night',
  description: 'Deep indigo with soft neon, after Tokyo Night',
  base: 'dark',
  bg: '#1a1b26',
  scopeBg: '#16161e',
  surface: '#16161e',
  raised: '#24283b',
  grid: '#24283b',
  gridMajor: '#292e42',
  border: '#3b4261',
  fg: '#c0caf5',
  muted: '#a9b1d6',
  // Tokyo Night's comment color, lightened for 3:1
  zero: '#6b74a3',
  red: '#f7768e',
  orange: '#ff9e64',
  yellow: '#e0af68',
  green: '#9ece6a',
  cyan: '#7dcfff',
  blue: '#7aa2f7',
  purple: '#bb9af7',
  accent: '#7aa2f7',
});

export const catppuccinMocha = paletteTheme({
  name: 'Catppuccin Mocha',
  description: 'Soothing pastels on dark blue-grey, after Catppuccin Mocha',
  base: 'dark',
  bg: '#1e1e2e',
  scopeBg: '#181825',
  surface: '#181825',
  raised: '#313244',
  grid: '#313244',
  gridMajor: '#45475a',
  border: '#45475a',
  fg: '#cdd6f4',
  muted: '#a6adc8',
  zero: '#7f849c',
  red: '#f38ba8',
  orange: '#fab387',
  yellow: '#f9e2af',
  green: '#a6e3a1',
  cyan: '#94e2d5',
  blue: '#89b4fa',
  purple: '#cba6f7',
  accent: '#cba6f7',
});

export const catppuccinLatte = paletteTheme({
  name: 'Catppuccin Latte',
  description: 'Soft pastels on warm white, after Catppuccin Latte',
  base: 'light',
  bg: '#eff1f5',
  scopeBg: '#ffffff',
  surface: '#eff1f5',
  raised: '#e6e9ef',
  grid: '#dce0e8',
  gridMajor: '#ccd0da',
  border: '#bcc0cc',
  fg: '#4c4f69',
  muted: '#5c5f77',
  zero: '#7c7f93',
  red: '#d20f39',
  orange: '#fe640b',
  energy: '#c84f00',
  // Latte's yellow and green, darkened for 3:1 on the light canvas
  yellow: '#b86e00',
  green: '#2f8a1e',
  cyan: '#137d83',
  blue: '#1e66f5',
  purple: '#8839ef',
  accent: '#8839ef',
});

export const rosePine = paletteTheme({
  name: 'Rosé Pine',
  description: 'Muted plum with rose and gold, after Rosé Pine',
  base: 'dark',
  bg: '#191724',
  scopeBg: '#16141f',
  surface: '#16141f',
  raised: '#26233a',
  grid: '#26233a',
  gridMajor: '#403d52',
  border: '#403d52',
  fg: '#e0def4',
  muted: '#908caa',
  // Rosé Pine's muted color, lightened for 3:1
  zero: '#78748f',
  red: '#eb6f92',
  orange: '#ebbcba',
  yellow: '#f6c177',
  green: '#9ccfd8',
  cyan: '#9ccfd8',
  blue: '#c4a7e7',
  purple: '#c4a7e7',
  accent: '#ebbcba',
});

export const everforestDark = paletteTheme({
  name: 'Everforest Dark',
  description: 'Calm forest greens and warm beige, after Everforest',
  base: 'dark',
  bg: '#2d353b',
  scopeBg: '#232a2e',
  surface: '#232a2e',
  raised: '#343f44',
  grid: '#343f44',
  gridMajor: '#3d484d',
  border: '#475258',
  // Everforest's fg, a shade lighter so it reads on selected chips
  fg: '#ddd0b4',
  muted: '#9da9a0',
  zero: '#859289',
  red: '#e67e80',
  orange: '#e69875',
  yellow: '#dbbc7f',
  green: '#a7c080',
  cyan: '#83c092',
  blue: '#7fbbb3',
  purple: '#d699b6',
  accent: '#a7c080',
});

export const githubDark = paletteTheme({
  name: 'GitHub Dark',
  description: "Near-black with bright blue, after GitHub's dark mode",
  base: 'dark',
  bg: '#0d1117',
  scopeBg: '#010409',
  surface: '#010409',
  raised: '#161b22',
  grid: '#161b22',
  gridMajor: '#21262d',
  border: '#30363d',
  fg: '#e6edf3',
  muted: '#8b949e',
  zero: '#6e7681',
  red: '#f85149',
  orange: '#db6d28',
  yellow: '#d29922',
  green: '#3fb950',
  cyan: '#39c5cf',
  blue: '#58a6ff',
  purple: '#a371f7',
  accent: '#58a6ff',
});

export const githubLight = paletteTheme({
  name: 'GitHub Light',
  description: "Clean white with GitHub's blue, after its light mode",
  base: 'light',
  bg: '#ffffff',
  scopeBg: '#ffffff',
  surface: '#ffffff',
  raised: '#f6f8fa',
  grid: '#eaeef2',
  gridMajor: '#d0d7de',
  border: '#d0d7de',
  fg: '#1f2328',
  muted: '#59636e',
  zero: '#818b98',
  red: '#d1242f',
  orange: '#bc4c00',
  yellow: '#9a6700',
  green: '#1a7f37',
  cyan: '#1b7c83',
  blue: '#0969da',
  purple: '#8250df',
  accent: '#0969da',
});

export const solarizedLight = paletteTheme({
  name: 'Solarized Light',
  description: 'Warm cream with Solarized accents',
  base: 'light',
  bg: '#fdf6e3',
  scopeBg: '#fdf6e3',
  surface: '#fdf6e3',
  raised: '#eee8d5',
  grid: '#eee8d5',
  gridMajor: '#e0d9c3',
  border: '#d3cbb7',
  // base01 and base02: base00, Solarized's body text, is below 4.5:1 on base3
  fg: '#073642',
  muted: '#586e75',
  // base0, darkened a little for 3:1
  zero: '#76888a',
  red: '#dc322f',
  orange: '#cb4b16',
  // yellow and green darkened for 3:1 on the cream canvas
  yellow: '#9c7600',
  green: '#6c7c00',
  cyan: '#1f8a83',
  blue: '#268bd2',
  purple: '#6c71c4',
  // Solarized blue, deepened so cream text on it reaches 4.5:1
  accent: '#1a6496',
  danger: '#b8291f',
});

export const obsidianDark = paletteTheme({
  name: 'Obsidian Dark',
  description: "Charcoal with violet accent, after Obsidian's default dark theme",
  base: 'dark',
  bg: '#1e1e1e',
  scopeBg: '#161616',
  surface: '#161616',
  raised: '#262626',
  grid: '#2a2a2a',
  gridMajor: '#363636',
  border: '#363636',
  fg: '#dadada',
  muted: '#b3b3b3',
  zero: '#808080',
  red: '#fb464c',
  orange: '#e9973f',
  yellow: '#e0de71',
  green: '#44cf6e',
  cyan: '#53dfdd',
  blue: '#5d9cff',
  purple: '#a882ff',
  accent: '#a882ff',
});

export const obsidianLight = paletteTheme({
  name: 'Obsidian Light',
  description: "White with violet accent, after Obsidian's default light theme",
  base: 'light',
  bg: '#ffffff',
  scopeBg: '#ffffff',
  surface: '#ffffff',
  raised: '#f6f6f6',
  grid: '#ececec',
  gridMajor: '#e0e0e0',
  border: '#e0e0e0',
  fg: '#222222',
  muted: '#5c5c5c',
  zero: '#8a8a8a',
  red: '#e93147',
  orange: '#c45f00',
  // Obsidian's yellow, green and cyan, darkened for 3:1 on white
  yellow: '#a87f00',
  green: '#078a3a',
  cyan: '#008684',
  blue: '#086ddd',
  purple: '#7852ee',
  accent: '#7852ee',
  danger: '#c8243a',
});
