// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Translations: the interface follows ?lang=, Options > Language and the browser, using upstream's
// string catalogs, and the choice is remembered.

import { expect, test } from '@playwright/test';

test('?lang= shows the interface in that language', async ({ page }) => {
  await page.goto('/?lang=de');
  await expect(page.getByTestId('file-menu')).toHaveText('Datei');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.getByTestId('edit-menu').click();
  await expect(page.getByRole('menuitem', { name: /Rückgängig/ })).toBeVisible();
});

test('Options > Language switches without a reload and is remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('file-menu')).toHaveText('File');
  await page.getByTestId('options-menu').click();
  await page.getByTestId('menu-language').click();
  await page.getByTestId('language-fr').click();
  await expect(page.getByTestId('file-menu')).toHaveText('Fichier');
  // the palette's element names come from the catalog too
  await expect(page.locator('.palette-label').filter({ hasText: /^Résistance$/ })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('file-menu')).toHaveText('Fichier');
  await page.getByTestId('options-menu').click();
  await page.getByTestId('menu-language').click();
  await page.getByTestId('language-en').click();
  await expect(page.getByTestId('file-menu')).toHaveText('File');
});

test.describe('browser language', () => {
  test.use({ locale: 'ja-JP' });
  test('is the default', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('file-menu')).toHaveText('ファイル');
  });
});

test('Catalan comes from the app’s own catalog', async ({ page }) => {
  await page.goto('/?lang=ca');
  await expect(page.getByTestId('file-menu')).toHaveText('Fitxer');
  await expect(page.locator('.palette-label').filter({ hasText: /^Resistència$/ })).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('Language unfolds inside the Options menu and stays on screen', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('options-menu').click();
    await page.getByTestId('menu-language').click();
    const last = page.getByTestId('language-kr');
    await last.scrollIntoViewIfNeeded();
    const box = await last.boundingBox();
    // within the screen (give or take subpixel rounding)
    expect(box && box.x >= 0 && box.x + box.width <= 391).toBe(true);
    await page.getByTestId('language-ca').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ca');
  });
});
