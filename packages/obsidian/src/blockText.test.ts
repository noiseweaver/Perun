// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import { replaceBlock } from './blockText.ts';

describe('writing an edit back into a circuit block', () => {
  const note = [
    '# Note',
    '```js',
    'r 1',
    '```',
    '```circuit',
    '$ 1 a',
    'r 1',
    '```',
    'between',
    '~~~~ circuit',
    '$ 1 b',
    '~~~~',
    '',
  ].join('\n');

  it('replaces the block with that text, and only it', () => {
    expect(replaceBlock(note, '$ 1 b\n', '<cir/>\n')).toBe(note.replace('$ 1 b', '<cir/>'));
    expect(replaceBlock(note, '$ 1 a\nr 1', 'x')).toBe(note.replace('$ 1 a\nr 1', 'x'));
  });

  it("returns null when the block isn't there any more", () => {
    expect(replaceBlock(note, 'r 1', 'x')).toBeNull();
  });

  it('fills an empty block', () => {
    expect(replaceBlock('```circuit\n```\n', '', 'x')).toBe('```circuit\nx\n```\n');
  });
});
