// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import * as Dialog from '@radix-ui/react-dialog';
import { copyText, openDialog } from '../commands.ts';
import { t, tf } from '../i18n.ts';
import {
  groupExplanation,
  groupLoadIssues,
  groupTitle,
  issueWhere,
  loadIssuesText,
  unreadableReason,
} from '../loadIssues.ts';
import { useApp } from '../store.ts';
import { Icon } from './Icon.tsx';
import { Shell } from './DialogShell.tsx';

/** Records shown per group; the rest are counted (Copy has them all). */
const SHOWN = 5;

/** Hide the "items skipped" notice until the next circuit is opened. */
export function dismissLoadIssues(): void {
  useApp.setState({ loadIssues: [] });
}

/** The "items skipped" notice opened: what the last load left out, and why. */
export function LoadIssuesDialog() {
  const issues = useApp((s) => s.loadIssues);
  const groups = groupLoadIssues(issues);
  return (
    <Shell
      title={t('Skipped while opening')}
      description={t('These were left out of the circuit. Everything else was opened and runs.')}
      className="load-issues-dialog"
    >
      <div className="load-issues" data-testid="load-issues">
        {groups.map((g) => (
          <section key={`${g.kind}:${g.code}`} className="load-issue-group">
            <h3 className="load-issue-title">
              <Icon name="warning" size={18} />
              <span>{groupTitle(g)}</span>
              {g.issues.length > 1 && <span className="load-issue-count">×{g.issues.length}</span>}
            </h3>
            <p>{groupExplanation(g)}</p>
            <ul className="load-issue-records">
              {g.issues.slice(0, SHOWN).map((i, n) => (
                <li key={n}>
                  {(i.line > 0 || g.kind === 'unreadable') && (
                    <div className="load-issue-where">
                      {[issueWhere(i), g.kind === 'unreadable' ? unreadableReason(i.detail) : '']
                        .filter((s) => s.length > 0)
                        .join(' · ')}
                    </div>
                  )}
                  <code className="load-issue-record">{i.record}</code>
                </li>
              ))}
            </ul>
            {g.issues.length > SHOWN && (
              <p className="load-issue-more">
                {tf('and {n} more', { n: g.issues.length - SHOWN })}
              </p>
            )}
          </section>
        ))}
      </div>
      <div className="dialog-buttons">
        <button
          type="button"
          className="button"
          onClick={() => void copyText(loadIssuesText(issues), 'Details')}
        >
          {t('Copy')}
        </button>
        <button
          type="button"
          className="button"
          data-testid="load-issues-dismiss"
          onClick={() => {
            dismissLoadIssues();
            openDialog(null);
          }}
        >
          {t('Hide notice')}
        </button>
        <Dialog.Close asChild>
          <button type="button" className="button button-primary">
            {t('OK')}
          </button>
        </Dialog.Close>
      </div>
    </Shell>
  );
}
