// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App.tsx';
import { controller } from './SimController.ts';
import { setupPwa } from './pwa.ts';
// bundled fonts (theme fonts are family names only, PLAN.md section 6)
import '@fontsource-variable/roboto/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// for end-to-end tests and debugging from the console
declare global {
  interface Window {
    circuitjsNext?: { controller: typeof controller };
  }
}
window.circuitjsNext = { controller };

setupPwa();
