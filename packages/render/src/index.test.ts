// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('render', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@circuitjs-next/render');
  });
});
