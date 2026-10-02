// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import type { Theme } from '../schema.ts';
import { classic } from './classic.ts';
import { dark } from './dark.ts';

/** Built-in themes by id. Light, High Contrast and Colorblind Safe arrive in Phase 7. */
export const BUILTIN_THEMES: Readonly<Record<string, Theme>> = { classic, dark };

/** The theme a new user sees, and the base for themes that name none. */
export const DEFAULT_THEME_ID = 'dark';
