// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { openQuery } from '../startup.ts';
import { useApp } from '../store.ts';
import { t } from '../i18n.ts';

/** Paste an upstream CircuitJS link (`?cct=`, `?ctz=`, `?startCircuit=` ...) and open it. */
export function OpenLinkDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [link, setLink] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const i = link.indexOf('?');
    if (i < 0) {
      setProblem('That link has no circuit in it (no "?cct=", "?ctz=" or "?startCircuit=").');
      return;
    }
    const ok = await openQuery(link.substring(i), useApp.getState().examples, true);
    if (!ok) {
      setProblem('That link has no circuit in it (no "?cct=", "?ctz=" or "?startCircuit=").');
      return;
    }
    setProblem(null);
    setLink('');
    props.onOpenChange(false);
  };

  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title className="dialog-title">{t('Open link')}</Dialog.Title>
          <Dialog.Description className="dialog-description">
            {t('Paste a CircuitJS link. Links from falstad.com and other CircuitJS sites work.')}
          </Dialog.Description>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              className="text-input"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://www.falstad.com/circuit/circuitjs.html?ctz=…"
              autoFocus
              data-testid="link-input"
            />
            {problem !== null && <p className="dialog-problem">{problem}</p>}
            <div className="dialog-buttons">
              <Dialog.Close asChild>
                <button type="button" className="button">
                  {t('Cancel')}
                </button>
              </Dialog.Close>
              <button type="submit" className="button button-primary" data-testid="link-open">
                {t('Open')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
