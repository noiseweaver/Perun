// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App.tsx';
import { CrashScreen } from './components/CrashScreen.tsx';
import { controller } from './SimController.ts';
import { setupPwa } from './pwa.ts';
import { lockPageZoom } from './pageZoom.ts';
import { resolveLanguage, setLanguage } from './i18n.ts';
import { useApp } from './store.ts';
// bundled fonts (theme fonts are family names only, PLAN.md section 6)
import '@fontsource-variable/roboto/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles.css';

const root = document.getElementById('root');
// like upstream, the interface starts once its language is loaded
void setLanguage(resolveLanguage(useApp.getState().settings.language)).then(() => {
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <CrashScreen>
          <App />
        </CrashScreen>
      </StrictMode>,
    );
  }
});

// for end-to-end tests and debugging from the console
declare global {
  interface Window {
    circuitjsNext?: { controller: typeof controller };
  }
}
window.circuitjsNext = { controller };

setupPwa();
lockPageZoom();
