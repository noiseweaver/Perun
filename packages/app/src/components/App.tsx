// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { luminance, rgba, themeCssVariables } from '@circuitjs-next/theme';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect } from 'react';
import { startup } from '../startup.ts';
import { applyUpdate } from '../pwa.ts';
import { setPaletteOpen, shownTheme, useApp } from '../store.ts';
import { installShortcuts } from '../commands.ts';
import { paletteItem } from '../editor/catalog.ts';
import { controller } from '../SimController.ts';
import { AppBar } from './AppBar.tsx';
import { CircuitCanvas } from './CircuitCanvas.tsx';
import { ControlBar } from './ControlBar.tsx';
import { Dialogs } from './Dialogs.tsx';
import { Inspector } from './Inspector.tsx';
import { Icon } from './Icon.tsx';
import { Palette } from './Palette.tsx';
import { SliderPanel } from './SliderPanel.tsx';
import { ThemeLinkBanner } from './ThemeDialogs.tsx';

let started = false;

export function App() {
  const themeId = useApp((s) => s.settings.themeId);
  const theme = useApp(shownTheme);
  const previewing = useApp((s) => s.preview !== null);
  const paletteOpen = useApp((s) => s.paletteOpen);

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
                aria-label="Show components"
                title="Show components"
                data-testid="palette-reveal"
                onClick={() => setPaletteOpen(true)}
              >
                <Icon name="chevronRight" size={20} />
              </button>
            )}
            <CircuitCanvas />
            <SliderPanel />
            <ModeChip />
            <ThemeLinkBanner />
            <Toast />
            <UpdateBanner />
          </main>
          <Inspector />
        </div>
        <ControlBar />
        <Dialogs />
      </div>
    </Tooltip.Provider>
  );
}

/** What a drag on the canvas will place, with a way out. */
function ModeChip() {
  const addClass = useApp((s) => s.editor.addClass);
  if (addClass === null) return null;
  const label = paletteItem(addClass)?.label ?? addClass;
  return (
    <div className="mode-chip" data-testid="mode-chip">
      <span>
        Drag to place: <strong>{label}</strong>
      </span>
      <button type="button" className="button" onClick={() => controller.editor.setSelectMode()}>
        Done
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
      <span>A new version is ready.</span>
      <button type="button" className="button" onClick={applyUpdate}>
        Reload
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Later"
        title="Later"
        onClick={() => useApp.setState({ updateReady: false })}
      >
        <Icon name="close" size={20} />
      </button>
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
