// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Installable app and offline use (PLAN.md Phase 9): registers the service worker the build writes
// (vite-plugin-sw.ts), offers a reload when a new version has been downloaded, keeps the browser's
// install prompt for the File menu, and opens files the installed app is asked to open.

import { BASE } from './startup.ts';
import { controller } from './SimController.ts';
import { useApp } from './store.ts';

/** Chrome's install prompt event (not in the DOM typings). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installPrompt: InstallPromptEvent | null = null;
let waiting: ServiceWorker | null = null;

/** Whether the app runs installed (from the home screen or as its own window). */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/** iPhone and iPad Safari, which install only through Share > Add to Home Screen. */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac with touch
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Show the browser's install prompt (File > Install app…). */
export async function promptInstall(): Promise<void> {
  const p = installPrompt;
  if (p === null) return;
  installPrompt = null;
  useApp.setState({ install: 'none' });
  await p.prompt();
}

/** Switch to the new version waiting in the background, then reload into it. */
export function applyUpdate(): void {
  if (waiting === null) {
    window.location.reload();
    return;
  }
  waiting.postMessage('skipWaiting');
}

export function setupPwa(): void {
  if (isStandalone()) useApp.setState({ install: 'none' });
  else if (isIos()) useApp.setState({ install: 'ios' });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e as InstallPromptEvent;
    useApp.setState({ install: 'prompt' });
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    useApp.setState({ install: 'none' });
  });

  // files opened with the installed app (manifest file_handlers, Chrome and Edge)
  const lq = (
    window as Window & {
      launchQueue?: {
        setConsumer(fn: (p: { files: readonly FileSystemFileHandle[] }) => void): void;
      };
    }
  ).launchQueue;
  lq?.setConsumer(async (params) => {
    const handle = params.files[0];
    if (!handle) return;
    const file = await handle.getFile();
    if (controller.load(await file.text(), file.name, true, true))
      controller.lastFileName = file.name;
  });

  // the dev server serves no worker; the build does
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(window.location.protocol)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // a worker that took over after the user asked for the update: show the new version
    if (reloading || waiting === null) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${BASE}sw.js`, { scope: BASE })
      .then((reg) => {
        const offer = (w: ServiceWorker | null): void => {
          // the first install has no old version to replace
          if (w === null || navigator.serviceWorker.controller === null) return;
          waiting = w;
          useApp.setState({ updateReady: true });
        };
        offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed') offer(w);
          });
        });
        void navigator.serviceWorker.ready.then(() => useApp.setState({ offlineReady: true }));
      })
      .catch(() => {
        // not allowed here (a sandboxed frame, private mode): the app works online as before
      });
  });
}
