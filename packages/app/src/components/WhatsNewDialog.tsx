// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import * as Dialog from '@radix-ui/react-dialog';
import { t, tf } from '../i18n.ts';
import { RELEASES } from '../whatsNew.ts';
import { Shell } from './DialogShell.tsx';

/** The release notes, newest version first. */
export function WhatsNewDialog() {
  return (
    <Shell title={t("What's new")} className="about-dialog">
      <div className="about" data-testid="whats-new">
        {RELEASES.map((r) => (
          <section key={r.version}>
            <h3 className="whats-new-version">
              {tf("What's new in {version}", { version: r.version })}
            </h3>
            <ul className="whats-new-list">
              {r.notes.map((n) => (
                <li key={n}>{t(n)}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="dialog-buttons">
        <Dialog.Close asChild>
          <button type="button" className="button button-primary">
            {t('OK')}
          </button>
        </Dialog.Close>
      </div>
    </Shell>
  );
}
