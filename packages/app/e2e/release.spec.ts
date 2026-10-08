// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Release polish: the circuit kept between visits, the notes after an update, the suggestion
// form, and the About box in another language.

import { expect, test } from '@playwright/test';

test('reopening the app brings back the last circuit', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('circuit-title')).toHaveText('LRC Circuit');
  await page.evaluate(() => window.circuitjsNext?.controller.newCircuit());
  await expect(page.getByTestId('circuit-title')).toHaveText('Untitled');
  // the app going to the background saves at once
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await expect(page.getByTestId('circuit-title')).toHaveText('Untitled');
});

test('the first run after an update offers its notes once', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded') === null) {
      localStorage.setItem('circuitjs-next.seenVersion', '0.9.0');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.goto('/');
  const banner = page.getByTestId('updated-banner');
  await expect(banner).toContainText('Updated to version');
  await banner.getByRole('button', { name: "What's new" }).click();
  await expect(page.getByTestId('whats-new')).toContainText("What's new in 1.0.0");
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('circuit-title')).not.toHaveText('');
  await expect(banner).toHaveCount(0);
});

test('a first install shows no update banner', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('circuit-title')).not.toHaveText('');
  await expect(page.getByTestId('updated-banner')).toHaveCount(0);
});

test('the suggestion form needs an email address and some text', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-feedback').click();
  const problem = page.getByTestId('feedback-problem');
  await page.getByTestId('feedback-message').fill('More themes, please');
  await page.getByTestId('feedback-send').click();
  await expect(problem).toHaveText('Enter a valid email address.');
  await page.getByTestId('feedback-email').fill('someone@example.com');
  await page.getByTestId('feedback-message').fill('');
  await page.getByTestId('feedback-send').click();
  await expect(problem).toHaveText('Write your suggestion first.');
});

test('a suggestion opens GitHub with the issue form filled in', async ({ page }) => {
  await page.addInitScript(() => {
    window.open = (url) => {
      (window as unknown as { opened: string }).opened = String(url);
      return null;
    };
  });
  await page.goto('/');
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-feedback').click();
  await page.getByTestId('feedback-email').fill('someone@example.com');
  await page.getByTestId('feedback-message').fill('More themes, please\nand a darker grid');
  await page.getByTestId('feedback-send').click();
  await expect(page.getByTestId('toast')).toHaveText('Finish on GitHub to send your suggestion.');
  const opened = new URL(
    await page.evaluate(() => (window as unknown as { opened: string }).opened),
  );
  expect(opened.origin + opened.pathname).toBe(
    'https://github.com/noiseweaver/circuitsjs-next/issues/new',
  );
  expect(opened.searchParams.get('template')).toBe('suggestion.yml');
  expect(opened.searchParams.get('title')).toBe('Suggestion: More themes, please');
  expect(opened.searchParams.get('email')).toBe('someone@example.com');
  expect(opened.searchParams.get('suggestion')).toBe('More themes, please\nand a darker grid');
});

test('About follows the interface language', async ({ page }) => {
  await page.goto('/?lang=de');
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-about').click();
  await expect(page.getByRole('dialog')).toContainText('Über circuitjs-next');
  await expect(page.getByTestId('about-author')).toHaveText(
    'circuitjs-next wird von Gadiel Zintu (github.com/noiseweaver) entwickelt und gepflegt.',
  );
});
