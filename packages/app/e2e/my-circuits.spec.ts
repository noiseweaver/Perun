// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { expect, test } from '@playwright/test';

test('saves circuits in the browser, reopens, renames and deletes them', async ({ page }) => {
  await page.goto('/');
  const title = page.getByTestId('circuit-title');
  await expect(title).toHaveText('LRC Circuit');
  await expect(page.getByTestId('unsaved-dot')).toHaveCount(0);

  // the first save asks for a name, in the browser by default
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-target-browser')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('save-name')).toHaveValue('LRC Circuit');
  await page.getByTestId('save-name').fill('Tank');
  await page.getByTestId('save-ok').click();
  await expect(title).toHaveText('Tank');

  // an edit shows the dot; Ctrl+S saves over the same circuit without asking
  await page
    .locator('canvas')
    .first()
    .click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('unsaved-dot')).toHaveCount(1);
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('unsaved-dot')).toHaveCount(0);
  await expect(page.getByTestId('save-name')).toHaveCount(0);

  // a second circuit; the same name asks to replace
  await page.getByTestId('file-menu').click();
  await page.getByText('New blank circuit').click();
  await page.keyboard.press('Control+s');
  await page.getByTestId('save-name').fill('tank');
  await expect(page.getByTestId('save-replaces')).toBeVisible();
  await page.getByTestId('save-name').fill('Blank');
  await page.getByTestId('save-ok').click();
  await expect(title).toHaveText('Blank');

  // renaming from the title renames the save
  await title.click();
  await page.getByTestId('circuit-title-input').fill('Empty board');
  await page.keyboard.press('Enter');
  await expect(title).toHaveText('Empty board');

  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-my-circuits').click();
  const names = page.getByTestId('my-circuit-name');
  await expect(names).toHaveText(['Empty board', 'Tank']);
  // the circuit on screen has a picture; the empty one doesn't
  await expect(page.locator('img.my-circuit-thumb')).toHaveCount(1);

  await page.getByRole('button', { name: 'Open Tank', exact: true }).click();
  await expect(title).toHaveText('Tank');

  // after a reload the circuit is still the saved one
  await page.waitForTimeout(3500);
  await page.reload();
  await expect(title).toHaveText('Tank');
  await page.getByTestId('circuits-menu').click();
  await page.getByTestId('circuits-my-circuits').click();
  const board = page
    .getByTestId('my-circuit')
    .filter({ has: page.getByText('Empty board', { exact: true }) });
  await board.getByTestId('my-circuit-more').click();
  await page.getByTestId('my-circuit-duplicate').click();
  await expect(names).toHaveText(['Empty board (copy)', 'Empty board', 'Tank']);
  await board.getByTestId('my-circuit-more').click();
  await page.getByTestId('my-circuit-delete').click();
  await page.getByTestId('my-circuit-delete-ok').click();
  await expect(names).toHaveText(['Empty board (copy)', 'Tank']);
});

test('the Save dialog still downloads a file', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('circuit-title')).toHaveText('LRC Circuit');
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-save').click();
  await page.getByTestId('save-target-file').click();
  await page.getByTestId('save-name').fill('lrc.txt');
  const download = page.waitForEvent('download');
  await page.getByTestId('save-ok').click();
  expect((await download).suggestedFilename()).toBe('lrc.txt');
  // the choice is remembered
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-save').click();
  await expect(page.getByTestId('save-target-file')).toHaveAttribute('aria-checked', 'true');
});

test('closing with unsaved changes asks first, unless turned off in Options', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('circuit-title')).toHaveText('LRC Circuit');
  const asked: string[] = [];
  page.on('dialog', (d) => {
    asked.push(d.type());
    void d.dismiss();
  });
  const reload = async (): Promise<void> => {
    // a dismissed question leaves the page where it was, so don't wait for a load
    await page.evaluate(() => window.location.reload()).catch(() => undefined);
    await page.waitForTimeout(300);
  };

  // nothing changed yet: no question (the canvas click gives the page the user gesture browsers need)
  const canvas = page.locator('canvas').first();
  await canvas.click({ position: { x: 5, y: 5 } });
  await reload();
  expect(asked).toEqual([]);
  await expect(page.getByTestId('circuit-title')).toHaveText('LRC Circuit');

  // an edit: closing asks, and staying keeps the circuit
  await canvas.click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('unsaved-dot')).toHaveCount(1);
  await reload();
  expect(asked).toEqual(['beforeunload']);
  await expect(page.getByTestId('unsaved-dot')).toHaveCount(1);

  // switched off: no question
  await page.getByTestId('options-menu').click();
  const item = page.getByTestId('menu-warn-unsaved');
  await expect(item).toHaveAttribute('aria-checked', 'true');
  await item.click();
  await page.keyboard.press('Escape');
  await reload();
  await page.waitForLoadState('load');
  expect(asked).toEqual(['beforeunload']);
});
