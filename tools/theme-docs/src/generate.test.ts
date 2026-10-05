// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMA_PATH, THEMES_MD, schemaText, themesMdText } from './generate.ts';

describe('theme docs', () => {
  it('docs/theme.schema.json is up to date (pnpm theme:docs)', async () => {
    expect(readFileSync(SCHEMA_PATH, 'utf8')).toBe(await schemaText());
  });

  it('the key table in docs/THEMES.md is up to date (pnpm theme:docs)', async () => {
    const md = readFileSync(THEMES_MD, 'utf8');
    expect(md).toBe(await themesMdText(md));
  });
});
