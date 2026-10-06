// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { DEFAULT_THEME_ID, builtinTheme } from './builtins/index.ts';
import { parseThemeJson, type ThemeParseResult } from './resolve.ts';
import { MAX_THEME_BYTES, type Theme, type ThemeInput } from './schema.ts';
import {
  base64UrlDecode,
  base64UrlEncode,
  deflateRaw,
  inflateRaw,
  utf8Decode,
  utf8Encode,
} from './streams.ts';

/** Query parameter of a theme link (PLAN.md section 6). */
export const THEME_PARAM = 'theme';
/** Longest `theme=` value read: a full 16 KB theme compresses to well under this. */
export const MAX_THEME_PARAM = 24 * 1024;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The theme as its base plus what differs from it, the smallest form that resolves to the same
 * theme. Links carry this.
 */
export function minimizeTheme(theme: Theme): ThemeInput {
  const base = builtinTheme(theme.meta.base) ?? (builtinTheme(DEFAULT_THEME_ID) as Theme);
  const out: Record<string, unknown> = { schemaVersion: 1 };
  for (const group of ['meta', 'canvas', 'circuit', 'scope', 'teaching', 'ui', 'style'] as const) {
    const t = theme[group] as unknown as Record<string, unknown>;
    const b = base[group] as unknown as Record<string, unknown>;
    const diff: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(t)) {
      if (group === 'circuit' && k === 'voltage') {
        const vb = b[k] as Record<string, unknown>;
        const vd = Object.fromEntries(
          Object.entries(v as Record<string, unknown>).filter(([kk, vv]) => !same(vv, vb[kk])),
        );
        if (Object.keys(vd).length > 0) diff[k] = vd;
      } else if (group === 'meta' && k === 'base') {
        diff[k] = base.meta.base;
      } else if (!same(v, b[k])) diff[k] = v;
    }
    if (Object.keys(diff).length > 0) out[group] = diff;
  }
  return out as ThemeInput;
}

/** A theme file (`*.theme.json`): the full theme, readable and complete. */
export function themeToJson(theme: Theme): string {
  return JSON.stringify(theme, null, 2) + '\n';
}

/** File name for a theme: its name in lower case with dashes, then `.theme.json`. */
export function themeFileName(theme: Theme): string {
  const stem = theme.meta.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${stem || 'theme'}.theme.json`;
}

/** `base64url(deflate(json))` of the minimized theme, for `?theme=`. */
export async function encodeThemeParam(theme: Theme): Promise<string> {
  const json = JSON.stringify(minimizeTheme(theme));
  return base64UrlEncode(await deflateRaw(utf8Encode(json)));
}

/**
 * Read a `theme=` value. Untrusted input: it is length capped, inflated with an output cap, decoded
 * as strict UTF-8 and validated like any theme file. Never throws or rejects.
 */
export async function decodeThemeParam(param: string): Promise<ThemeParseResult> {
  if (param.length > MAX_THEME_PARAM) return { ok: false, errors: ['theme link is too long'] };
  const bytes = base64UrlDecode(param);
  if (bytes === null) return { ok: false, errors: ['theme link is not base64url'] };
  let json: string;
  try {
    json = utf8Decode(await inflateRaw(bytes, MAX_THEME_BYTES));
  } catch (e) {
    return {
      ok: false,
      errors: [`theme link is damaged (${e instanceof Error ? e.message : 'bad data'})`],
    };
  }
  return parseThemeJson(json);
}
