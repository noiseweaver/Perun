// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

export { BUILTIN_THEMES, DEFAULT_THEME_ID, builtinTheme } from './builtins/index.ts';
export {
  contrastRatio,
  luminance,
  mixColor,
  parseColor,
  rgba,
  scaleColor,
  toCss,
  type Rgba,
} from './color.ts';
export {
  GRAPHIC_CONTRAST,
  TEXT_CONTRAST,
  contrastWarnings,
  type ContrastWarning,
} from './contrast.ts';
export { THEME_SCHEMA_ID, themeJsonSchema } from './jsonSchema.ts';
export {
  parseTheme,
  parseThemeJson,
  resolveTheme,
  themeCssVariables,
  type ThemeParseResult,
} from './resolve.ts';
export { MAX_THEME_BYTES, themeInputSchema, type Theme, type ThemeInput } from './schema.ts';
export {
  MAX_THEME_PARAM,
  THEME_PARAM,
  decodeThemeParam,
  encodeThemeParam,
  minimizeTheme,
  themeFileName,
  themeToJson,
} from './share.ts';
