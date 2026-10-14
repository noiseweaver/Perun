// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// What a load left out, as the "items skipped" notice explains it: one group per reason (and per
// unknown part type), each with a title, why it happened and the records themselves.

import type { LoadIssue, LoadIssueKind } from '@perun/format';
import { t, tf } from './i18n.ts';

export interface LoadIssueGroup {
  kind: LoadIssueKind;
  /** The unknown part's type code or tag; empty for the other kinds. */
  code: string;
  issues: LoadIssue[];
}

/** The issues grouped by reason, unknown parts by type, in order of first appearance. */
export function groupLoadIssues(issues: readonly LoadIssue[]): LoadIssueGroup[] {
  const groups = new Map<string, LoadIssueGroup>();
  for (const i of issues) {
    const code = i.kind === 'unknown-part' ? i.detail : '';
    const key = `${i.kind}\u0000${code}`;
    let g = groups.get(key);
    if (g === undefined) {
      g = { kind: i.kind, code, issues: [] };
      groups.set(key, g);
    }
    g.issues.push(i);
  }
  return [...groups.values()];
}

export function groupTitle(g: LoadIssueGroup): string {
  switch (g.kind) {
    case 'unknown-part':
      return tf('Unknown part type “{code}”', { code: g.code });
    case 'unreadable':
      return t('Records that could not be read');
    case 'scope-part-missing':
      return t('Scopes of a skipped part');
    case 'slider-part-missing':
      return t('Sliders for a skipped part');
  }
}

export function groupExplanation(g: LoadIssueGroup): string {
  switch (g.kind) {
    case 'unknown-part':
      return t(
        "Perun doesn't know this part. The file may come from a newer version of CircuitJS1 or from another program, or it may be damaged. The part was left out, so anything it connected is open at that spot.",
      );
    case 'unreadable':
      return t(
        'These records have a value missing or in the wrong form, so they were left out. The file may be damaged or edited by hand.',
      );
    case 'scope-part-missing':
      return t('These scopes watch a part that was left out, so they were left out too.');
    case 'slider-part-missing':
      return t('These sliders adjust a part that was left out, so they were left out too.');
  }
}

/** Why one record couldn't be read, in words (the reader's exceptions are Java's). */
export function unreadableReason(detail: string): string {
  const m = /^For input string: "(.*)"$/s.exec(detail);
  if (m) return tf('Expected a number, found “{text}”.', { text: m[1] ?? '' });
  if (detail === 'NoSuchElementException') return t('The record ends before all of its values.');
  return detail;
}

/** Where a record was in the file: its line in the text format; XML records have none. */
export function issueWhere(i: LoadIssue): string {
  return i.line > 0 ? tf('Line {n}', { n: i.line }) : '';
}

/** Everything as plain text, to paste into a bug report or suggestion. */
export function loadIssuesText(issues: readonly LoadIssue[]): string {
  return issues
    .map((i) => {
      const where = i.line > 0 ? `line ${i.line}: ` : '';
      return `${where}${i.message}\n  ${i.record}`;
    })
    .join('\n');
}
