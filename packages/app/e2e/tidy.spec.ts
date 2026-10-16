// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// Edit > Tidy up (not in upstream): straightens wires and lines parts up, undoably.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@perun/format';

/** Three resistors in a row; the middle one sits a grid step low, so the wires jog. */
const JOGGED =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'r 0 0 64 0 0 1000\nw 64 0 96 0 0\nw 96 0 96 16 0\nw 96 16 128 16 0\n' +
  'r 128 16 192 16 0 1000\nw 192 16 224 16 0\nw 224 16 224 0 0\nw 224 0 256 0 0\n' +
  'r 256 0 320 0 0 1000\n';

const open = async (page: Page, text: string): Promise<void> => {
  await page.goto(`/?ctz=${compressCircuit(text)}`);
  await expect(page.getByTestId('circuit-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.perun?.controller.frames ?? 0) > 2);
};

const wireCount = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      window.perun?.controller.circuit.elements.filter((e) => e.getClassName() === 'WireElm')
        .length ?? -1,
  );

test('Edit > Tidy up straightens the wires and can be undone', async ({ page }) => {
  await open(page, JOGGED);
  expect(await wireCount(page)).toBe(6);
  await page.getByTestId('edit-menu').click();
  await page.getByTestId('menu-tidy-up').click();
  await expect(page.getByTestId('toast')).toHaveText('Tidied up. Wires: 6 → 2. Parts moved: 1.');
  expect(await wireCount(page)).toBe(2);

  await page.getByTestId('edit-menu').click();
  await page.getByTestId('menu-tidy-up').click();
  await expect(page.getByTestId('toast')).toHaveText('Already tidy.');

  await page.keyboard.press('Control+z');
  expect(await wireCount(page)).toBe(6);
});
