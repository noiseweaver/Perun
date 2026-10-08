// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { openDialog, showToast } from '../commands.ts';
import { t } from '../i18n.ts';
import { SOURCE_URL } from './AboutDialog.tsx';
import { Shell } from './DialogShell.tsx';

/** Loose on purpose: something@something.something; a typo is the sender's to fix. */
export function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** Long enough for a suggestion, short enough that the GitHub link stays under URL limits. */
export const MAX_SUGGESTION = 2000;

/**
 * GitHub's new issue page with the suggestion form (.github/ISSUE_TEMPLATE/suggestion.yml) filled
 * in: issue forms take each field's value from the query parameter named by its id.
 */
export function suggestionUrl(email: string, message: string, version: string): string {
  const firstLine = message.trim().split('\n')[0] ?? '';
  const title = firstLine.length > 60 ? `${firstLine.slice(0, 59)}…` : firstLine;
  const q = new URLSearchParams({
    template: 'suggestion.yml',
    title: `Suggestion: ${title}`,
    email: email.trim(),
    suggestion: message.trim(),
    version,
  });
  return `${SOURCE_URL}/issues/new?${q.toString()}`;
}

/**
 * File > Send a suggestion: an email address and the text, handed to GitHub's issue form in a new
 * tab, where the sender posts it with their GitHub account.
 */
export function FeedbackDialog() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const send = (): void => {
    if (!validEmail(email)) {
      setProblem(t('Enter a valid email address.'));
      return;
    }
    if (message.trim() === '') {
      setProblem(t('Write your suggestion first.'));
      return;
    }
    window.open(
      suggestionUrl(email, message, import.meta.env.APP_VERSION),
      '_blank',
      'noopener,noreferrer',
    );
    openDialog(null);
    showToast(t('Finish on GitHub to send your suggestion.'));
  };

  return (
    <Shell
      title={t('Send a suggestion')}
      description={t(
        "Ideas, problems, or anything you'd like changed. This opens GitHub with your suggestion filled in; you need a GitHub account, and the issue, including your email, is public.",
      )}
    >
      <form
        className="feedback-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="feedback-email">
            {t('Email')}
          </label>
          <input
            id="feedback-email"
            className="text-input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="feedback-email"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="feedback-message">
            {t('Suggestion')}
          </label>
          <textarea
            id="feedback-message"
            className="text-input text-area"
            rows={6}
            required
            maxLength={MAX_SUGGESTION}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            data-testid="feedback-message"
          />
        </div>
        {problem !== null && (
          <p className="dialog-problem" role="alert" data-testid="feedback-problem">
            {problem}
          </p>
        )}
        <div className="dialog-buttons">
          <Dialog.Close asChild>
            <button type="button" className="button">
              {t('Cancel')}
            </button>
          </Dialog.Close>
          <button type="submit" className="button button-primary" data-testid="feedback-send">
            {t('Continue on GitHub')}
          </button>
        </div>
      </form>
    </Shell>
  );
}
