// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import { freePath, safeFileName } from './files.ts';

describe('exported file names', () => {
  it('leaves out what a vault file name cannot hold', () => {
    expect(safeFileName('a/b: c?.png')).toBe('a-b- c-.png');
    expect(safeFileName('[x]#^.csv')).toBe('-x---.csv');
    expect(safeFileName('.svg')).toBe('Circuit.svg');
    expect(safeFileName('  ')).toBe('Circuit');
  });

  it('numbers a name that is taken, before its extension', () => {
    const taken = new Set(['Notes/x.png', 'Notes/x 1.png']);
    expect(freePath((p) => taken.has(p), 'Notes/', 'x.png')).toBe('Notes/x 2.png');
    expect(freePath((p) => taken.has(p), '', 'y.png')).toBe('y.png');
    expect(freePath(() => false, '/', 'z')).toBe('z');
  });
});
