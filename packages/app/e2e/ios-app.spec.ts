// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// Installed on iPhone, iOS 26 reports the window a status bar short of the screen. The app must
// still fill the screen after every rotation, or an empty band shows under the bottom bar.

import { expect, test, type Page } from '@playwright/test';

// iPhone 17 Pro in points; iOS reports the screen in portrait whatever the orientation
const SCREEN = { width: 402, height: 874 };
const STATUS_BAR = 62;

test.use({
  viewport: { width: SCREEN.width, height: SCREEN.height - STATUS_BAR },
  hasTouch: true,
  isMobile: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript((s) => {
    Object.defineProperty(navigator, 'standalone', { get: () => true });
    Object.defineProperty(screen, 'width', { get: () => s.width });
    Object.defineProperty(screen, 'height', { get: () => s.height });
  }, SCREEN);
});

const pageHeight = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.getBoundingClientRect().height);

test('the installed iPhone app fills the screen after rotating back and forth', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('run-stop')).toBeVisible();
  await expect.poll(() => pageHeight(page)).toBe(SCREEN.height);

  for (let i = 0; i < 2; i++) {
    // on its side the status bar hides and the window is the whole screen
    await page.setViewportSize({ width: SCREEN.height, height: SCREEN.width });
    await expect.poll(() => pageHeight(page)).toBe(SCREEN.width);
    await page.setViewportSize({ width: SCREEN.width, height: SCREEN.height - STATUS_BAR });
    await expect.poll(() => pageHeight(page)).toBe(SCREEN.height);
  }

  // back from the background iOS can report the window at full height for a moment, then shrink
  // it again without a resize: the page must keep the screen's height
  await page.evaluate((h) => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => h });
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('resize'));
    delete (window as { innerHeight?: number }).innerHeight;
  }, SCREEN.height);
  await page.waitForTimeout(1200);
  expect(await pageHeight(page)).toBe(SCREEN.height);
});
