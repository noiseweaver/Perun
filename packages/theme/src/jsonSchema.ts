// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { z } from 'zod';
import { themeInputSchema } from './schema.ts';

/** Where the published JSON Schema lives (docs/theme.schema.json in the repository). */
export const THEME_SCHEMA_ID =
  'https://github.com/noiseweaver/perun/blob/main/docs/theme.schema.json';

/** JSON Schema for theme files, generated from the zod schema (PLAN.md section 6). */
export function themeJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(themeInputSchema, { io: 'input' }) as Record<string, unknown>;
  return { ...schema, $id: THEME_SCHEMA_ID, title: 'Perun theme' };
}
