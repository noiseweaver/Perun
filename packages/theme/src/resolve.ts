// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { BUILTIN_THEMES, DEFAULT_THEME_ID } from './builtins/index.ts';
import { MAX_THEME_BYTES, themeInputSchema, type Theme, type ThemeInput } from './schema.ts';

/** Fill the keys a theme leaves out from its base built-in (`meta.base`, default Dark). */
export function resolveTheme(input: ThemeInput): Theme {
  const baseId = input.meta?.base ?? DEFAULT_THEME_ID;
  const base = BUILTIN_THEMES[baseId] ?? (BUILTIN_THEMES[DEFAULT_THEME_ID] as Theme);
  return {
    schemaVersion: 1,
    meta: { ...base.meta, ...input.meta, base: base.meta.base },
    canvas: { ...base.canvas, ...input.canvas },
    circuit: {
      ...base.circuit,
      ...input.circuit,
      voltage: { ...base.circuit.voltage, ...input.circuit?.voltage },
    },
    scope: { ...base.scope, ...input.scope },
    ui: { ...base.ui, ...input.ui },
    style: { ...base.style, ...input.style },
  };
}

export type ThemeParseResult = { ok: true; theme: Theme } | { ok: false; errors: string[] };

/** Validate untrusted theme data and resolve it against its base. Never throws. */
export function parseTheme(data: unknown): ThemeParseResult {
  const r = themeInputSchema.safeParse(data);
  if (!r.success) {
    return {
      ok: false,
      errors: r.error.issues.map((i) => `${i.path.join('.') || '(theme)'}: ${i.message}`),
    };
  }
  return { ok: true, theme: resolveTheme(r.data as ThemeInput) };
}

/** Parse theme JSON text (size capped). Never throws. */
export function parseThemeJson(text: string): ThemeParseResult {
  if (text.length > MAX_THEME_BYTES)
    return { ok: false, errors: [`theme is larger than ${MAX_THEME_BYTES} bytes`] };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`not JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  return parseTheme(data);
}

/**
 * CSS custom properties for UI chrome (`--ui-surface`, `--canvas-background`, ...). Values are
 * validated colors and font names, so they are safe for `style.setProperty`.
 */
export function themeCssVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme.ui)) vars[`--ui-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(theme.canvas)) vars[`--canvas-${kebab(k)}`] = v;
  vars['--font'] = theme.style.font;
  vars['--mono-font'] = theme.style.monoFont;
  return vars;
}

const kebab = (s: string): string => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
