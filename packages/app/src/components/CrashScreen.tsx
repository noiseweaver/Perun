// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { themeCssVariables } from '@perun/theme';
import { Component, type CSSProperties, type ReactNode } from 'react';
import { LAST_CIRCUIT_KEY } from '../autosave.ts';
import { t } from '../i18n.ts';
import { shownTheme, useApp } from '../store.ts';

/** Theme tokens for the crash screen, which can't count on App having set them. */
function themeStyle(): CSSProperties {
  try {
    return themeCssVariables(shownTheme(useApp.getState())) as CSSProperties;
  } catch {
    return {};
  }
}

function reload(): void {
  window.location.reload();
}

/** Forget the circuit autosave would reopen, in case that circuit is what broke the app. */
function reloadBlank(): void {
  try {
    localStorage.removeItem(LAST_CIRCUIT_KEY);
  } catch {
    // storage disabled: nothing was kept
  }
  // drop any circuit named in the address too
  window.location.replace(window.location.pathname);
}

/** Catches an error that would otherwise leave a blank page, and offers a way back. */
export class CrashScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown): void {
    console.error(error);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <div className="crash-screen" role="alert" style={themeStyle()} data-testid="crash-screen">
        <div className="crash-card">
          <h1>{t('Something went wrong')}</h1>
          <p>{t('The app ran into an error. Reloading usually fixes it.')}</p>
          <pre className="crash-detail">{error.message}</pre>
          <div className="dialog-buttons">
            <button type="button" className="button" onClick={reloadBlank}>
              {t('Reload with a blank circuit')}
            </button>
            <button type="button" className="button button-primary" onClick={reload}>
              {t('Reload')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
