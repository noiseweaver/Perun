// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, test } from '@playwright/test';

test('app shell loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#root')).toContainText('@circuitjs-next/app');
});
