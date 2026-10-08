// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
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

/**
 * The --app-height for an installed iPhone app, or null for plain 100%. Installed on iPhone
 * (iOS 26), the page's 100% height comes out short by the status bar while the page still starts
 * at the top of the screen, which left an empty band under the app. An installed app always fills
 * the screen, so when the window is as wide as the screen the page is the screen's height. The
 * orientation comes from the window's own width rather than a media query, so the two can't
 * disagree halfway through a rotation. The window's height isn't used: iOS reports it short by
 * varying amounts (and stale after a rotation or a return from the background).
 */
export function iosAppHeight(screenW: number, screenH: number, innerW: number): number | null {
  // iOS reports the screen in portrait whatever the orientation; iPadOS may not
  const short = Math.min(screenW, screenH);
  const long = Math.max(screenW, screenH);
  if (Math.abs(innerW - short) <= 1) return long;
  if (Math.abs(innerW - long) <= 1) return short;
  return null; // split view, slide over or a resized window
}

/**
 * Keep --app-height in step with the window. iOS reports stale sizes during a rotation and when
 * the app comes back from the background, and sends no resize once the sizes settle, so a single
 * resize listener sometimes left the band under the app. Check again on every event that can
 * change the window and a few times after it, until the sizes have settled.
 */
function fitIosStandaloneHeight(): void {
  const fit = (): void => {
    const h = iosAppHeight(screen.width, screen.height, window.innerWidth);
    const root = document.documentElement.style;
    if (h === null) root.removeProperty('--app-height');
    else if (root.getPropertyValue('--app-height') !== `${h}px`)
      root.setProperty('--app-height', `${h}px`);
  };
  let timers: number[] = [];
  const refit = (): void => {
    fit();
    for (const t of timers) window.clearTimeout(t);
    timers = [50, 150, 300, 600, 1000].map((ms) => window.setTimeout(fit, ms));
  };
  fit();
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', refit);
  window.addEventListener('pageshow', refit);
  window.addEventListener('focus', refit);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refit();
  });
  screen.orientation?.addEventListener('change', refit);
}

export function setupPwa(): void {
  if (isStandalone() && isIos()) {
    document.documentElement.dataset['iosApp'] = '';
    fitIosStandaloneHeight();
  }
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
