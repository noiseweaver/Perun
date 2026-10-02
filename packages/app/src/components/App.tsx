// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { themeCssVariables } from '@circuitjs-next/theme';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect } from 'react';
import { themeById } from '../SimController.ts';
import { startup } from '../startup.ts';
import { useApp } from '../store.ts';
import { AppBar } from './AppBar.tsx';
import { CircuitCanvas } from './CircuitCanvas.tsx';
import { ControlBar } from './ControlBar.tsx';

let started = false;

export function App() {
  const themeId = useApp((s) => s.settings.themeId);

  useEffect(() => {
    // theme tokens for the UI chrome; values are validated theme data
    const vars = themeCssVariables(themeById(themeId));
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.dataset['theme'] = themeId;
  }, [themeId]);

  useEffect(() => {
    if (started) return;
    started = true;
    void startup();
  }, []);

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="app">
        <AppBar />
        <main className="canvas-area">
          <CircuitCanvas />
        </main>
        <ControlBar />
      </div>
    </Tooltip.Provider>
  );
}
