// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import type { Theme } from '../schema.ts';
import { colorblindSafe, highContrast } from './accessible.ts';
import { classic, classicDots } from './classic.ts';
import { adwaitaDark, gruvboxDark, nord, solarizedDark } from './community.ts';
import { dark } from './dark.ts';
import { light } from './light.ts';

/** Built-in themes by id, in menu order. */
export const BUILTIN_THEMES: Readonly<Record<string, Theme>> = {
  dark,
  light,
  classic,
  'classic-dots': classicDots,
  'high-contrast': highContrast,
  'colorblind-safe': colorblindSafe,
  nord,
  'solarized-dark': solarizedDark,
  'gruvbox-dark': gruvboxDark,
  'adwaita-dark': adwaitaDark,
};

/** The theme a new user sees, and the base for themes that name none. */
export const DEFAULT_THEME_ID = 'dark';

/** The built-in with this id, or null (safe for any string, `__proto__` included). */
export function builtinTheme(id: string): Theme | null {
  return Object.hasOwn(BUILTIN_THEMES, id) ? (BUILTIN_THEMES[id] ?? null) : null;
}
