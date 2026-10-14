// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { readCircuit } from '@perun/format';
import { describe, expect, it } from 'vitest';
import { groupLoadIssues, issueWhere, loadIssuesText, unreadableReason } from './loadIssues.ts';

describe('skipped items', () => {
  const c = readCircuit(
    '9999 0 0 16 0 0\n' +
      'r 0 0 64 0 0 abc\n' +
      '9999 16 0 32 0 0\n' +
      '8888 0 0 16 0 0\n' +
      'r 0 0 64 0\n',
  );

  it('group by reason, and unknown parts by type', () => {
    const groups = groupLoadIssues(c.issues);
    expect(groups.map((g) => [g.kind, g.code, g.issues.map((i) => i.line)])).toEqual([
      ['unknown-part', '9999', [1, 3]],
      ['unreadable', '', [2, 5]],
      ['unknown-part', '8888', [4]],
    ]);
  });

  it('say in words why a record could not be read', () => {
    const [bad, short] = c.issues.filter((i) => i.kind === 'unreadable');
    expect(unreadableReason(bad?.detail ?? '')).toBe('Expected a number, found “abc”.');
    expect(unreadableReason(short?.detail ?? '')).toBe('The record ends before all of its values.');
    const [first] = c.issues;
    if (first) expect(issueWhere(first)).toBe('Line 1');
  });

  it('copy as plain text with the records', () => {
    expect(loadIssuesText(c.issues.slice(0, 1))).toBe(
      'line 1: unrecognized dump type: 9999\n  9999 0 0 16 0 0',
    );
  });
});
