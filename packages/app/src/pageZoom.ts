// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/**
 * Keep the page itself at its own scale on touch screens: pinching or double-tapping the
 * interface zoomed the whole app, leaving the bars off screen. The canvas keeps its own pinch
 * zoom, which runs on pointer events. A viewport meta with user-scalable=no would fail the axe
 * checks and iOS ignores it anyway, so Safari's gesture events are cancelled here instead;
 * styles.css turns off double-tap zoom (touch-action: manipulation) and keeps text fields at
 * 16px on touch screens so focusing one does not zoom in.
 */
export function lockPageZoom(): void {
  const cancel = (e: Event): void => e.preventDefault();
  // Safari's pinch events (non-standard); other browsers never send them
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
    document.addEventListener(type, cancel, { passive: false });
  // a two-finger pinch anywhere but the canvas (which handles its own) must not zoom the page
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1 && !(e.target instanceof HTMLCanvasElement)) e.preventDefault();
    },
    { passive: false },
  );
}
