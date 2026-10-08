// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// Phase 9: the production build installs as an app and works offline. Runs against `vite preview`
// of the build (playwright.config.ts, project "build").

import { expect, test } from '@playwright/test';

test('the build is installable and works offline once loaded', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('circuit-title')).toHaveText('LRC Circuit');

  // installable: a manifest with icons, and a service worker that caches every file
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel=manifest]');
    return link ? ((await (await fetch(link.href)).json()) as { icons: unknown[] }) : null;
  });
  expect(manifest?.icons.length).toBeGreaterThan(2);
  await page.waitForFunction(() => window.perun !== undefined);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 30_000,
    })
    .toBe(true);

  await context.setOffline(true);
  // the app, another example and a shared link all open without a network
  await page.goto('/?startCircuit=pot.txt');
  await expect(page.getByTestId('circuit-title')).toHaveText('Potentiometer');
  await expect(page.getByTestId('load-error')).toHaveCount(0);
  await page.getByTestId('circuits-menu').click();
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  await page.keyboard.press('Escape');
  const licenses = await page.evaluate(async () => (await fetch('third-party-licenses.txt')).ok);
  expect(licenses).toBe(true);
  await context.setOffline(false);
});

test('About shows the version and links the licenses', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-about').click();
  await expect(page.getByTestId('about-version')).toContainText(/Version \d+\.\d+\.\d+/);
  await expect(page.getByTestId('about-author')).toContainText(
    'Gadiel Zintu (github.com/noiseweaver)',
  );
  const href = await page.getByTestId('about-third-party').getAttribute('href');
  const text = await page.evaluate(async (h) => (await fetch(h ?? '')).text(), href);
  expect(text).toContain('react-dom');
  expect(text).toContain('OFL');
});
