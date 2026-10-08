// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { luminance, rgba, themeCssVariables } from '@circuitjs-next/theme';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect } from 'react';
import { startup } from '../startup.ts';
import { applyUpdate } from '../pwa.ts';
import { setPaletteOpen, shownTheme, useApp } from '../store.ts';
import { installShortcuts, openDialog } from '../commands.ts';
import { paletteItem } from '../editor/catalog.ts';
import { controller } from '../SimController.ts';
import { AppBar } from './AppBar.tsx';
import { CircuitCanvas } from './CircuitCanvas.tsx';
import { ControlBar } from './ControlBar.tsx';
import { Timeline } from './Timeline.tsx';
import { DcPanel } from './DcPanel.tsx';
import { Dialogs } from './Dialogs.tsx';
import { Inspector } from './Inspector.tsx';
import { Icon } from './Icon.tsx';
import { Palette } from './Palette.tsx';
import { FieldLegend } from './FieldLegend.tsx';
import { SliderPanel } from './SliderPanel.tsx';
import { WheelValuePopup } from './WheelValuePopup.tsx';
import { SubcircuitBar } from './SubcircuitBar.tsx';
import { TeachBar } from './TeachBar.tsx';
import { ThemeLinkBanner } from './ThemeDialogs.tsx';
import { t, tf, tItem } from '../i18n.ts';

let started = false;

export function App() {
  const themeId = useApp((s) => s.settings.themeId);
  const theme = useApp(shownTheme);
  const previewing = useApp((s) => s.preview !== null);
  const paletteOpen = useApp((s) => s.paletteOpen);
  // a new language re-renders every label (none of the components below is memoized)
  useApp((s) => s.language);

  useEffect(() => {
    // theme tokens for the UI chrome; values are validated theme data
    const vars = themeCssVariables(theme);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.dataset['theme'] = previewing ? 'preview' : themeId;
    // the browser's own controls (scrollbars, pickers) follow the theme's lightness
    root.style.colorScheme = luminance(rgba(theme.ui.surface)) > 0.4 ? 'light' : 'dark';
    // the browser and installed app's title bar match the app bar
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme.ui.surface);
  }, [theme, themeId, previewing]);

  useEffect(() => installShortcuts(), []);

  useEffect(() => {
    if (started) return;
    started = true;
    void startup();
  }, []);

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="app">
        <AppBar />
        <div className="workspace">
          <Palette />
          <main className="canvas-area">
            {!paletteOpen && (
              <button
                type="button"
                className="palette-reveal"
                aria-label={t('Show components')}
                title={t('Show components')}
                data-testid="palette-reveal"
                onClick={() => setPaletteOpen(true)}
              >
                <Icon name="chevronRight" size={20} />
              </button>
            )}
            <CircuitCanvas />
            <div className="overlay-right">
              <SliderPanel />
              <DcPanel />
            </div>
            <FieldLegend />
            <WheelValuePopup />
            <ModeChip />
            <SubcircuitBar />
            <TeachBar />
            <ThemeLinkBanner />
            <Toast />
            <UpdateBanner />
            <UpdatedBanner />
          </main>
          <Inspector />
        </div>
        <Timeline />
        <ControlBar />
        <Dialogs />
        <Announcer />
      </div>
    </Tooltip.Provider>
  );
}

/** What a drag on the canvas will place, with a way out. */
function ModeChip() {
  const addClass = useApp((s) => s.editor.addClass);
  if (addClass === null) return null;
  const item = paletteItem(addClass);
  const label = item ? tItem(item.label) : addClass;
  return (
    <div className="mode-chip" data-testid="mode-chip">
      <span>
        {t('Drag to place:')} <strong>{label}</strong>
      </span>
      <button type="button" className="button" onClick={() => controller.editor.setSelectMode()}>
        {t('Done')}
      </button>
    </div>
  );
}

/** The first run after an update: point at what changed, once. */
function UpdatedBanner() {
  const version = useApp((s) => s.updatedTo);
  const waiting = useApp((s) => s.updateReady);
  if (version === null || waiting) return null;
  const dismiss = (): void => useApp.setState({ updatedTo: null });
  return (
    <div className="update-banner" role="status" data-testid="updated-banner">
      <span>{tf('Updated to version {version}.', { version })}</span>
      <button
        type="button"
        className="button button-primary"
        onClick={() => {
          dismiss();
          openDialog('whatsNew');
        }}
      >
        {t("What's new")}
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={t('Close')}
        title={t('Close')}
        onClick={dismiss}
      >
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}

/** A new version is ready (the service worker downloaded it): reload into it. */
function UpdateBanner() {
  const ready = useApp((s) => s.updateReady);
  if (!ready) return null;
  return (
    <div className="update-banner" role="status" data-testid="update-banner">
      <span>{t('A new version is ready.')}</span>
      <button type="button" className="button button-primary" onClick={applyUpdate}>
        {t('Reload')}
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={t('Later')}
        title={t('Later')}
        onClick={() => useApp.setState({ updateReady: false })}
      >
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}

/** Screen reader announcements (keyboard selection). */
function Announcer() {
  const text = useApp((s) => s.announcement);
  return (
    <div className="visually-hidden" aria-live="polite" data-testid="announcer">
      {text}
    </div>
  );
}

function Toast() {
  const toast = useApp((s) => s.toast);
  if (toast === null) return null;
  return (
    <div key={toast} className="toast" role="status" data-testid="toast">
      {toast}
    </div>
  );
}
