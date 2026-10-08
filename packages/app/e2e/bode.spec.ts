// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// Phase 10: AC analysis. The sweep itself is checked against analytic answers in
// packages/app/src/analysis/bode.test.ts; this covers opening, running and reading the dialog.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@perun/format';

/** 1k into 100n, a low-pass with its -3 dB point at 1.59 kHz. */
const RC =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 96 320 96 96 0 1 1000 5 0 0 0.5\n' +
  'r 96 96 256 96 0 1000\n' +
  'c 256 96 256 320 0 1e-7 0\n' +
  'w 96 320 256 320 0\n';

const ready = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('circuit-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.perun?.controller.frames ?? 0) > 2);
};

const at = async (page: Page, x: number, y: number): Promise<{ x: number; y: number }> => {
  const box = await page.getByTestId('circuit-canvas').boundingBox();
  const p = await page.evaluate(([x, y]) => window.perun?.controller.toScreen(x, y) ?? null, [
    x,
    y,
  ] as const);
  if (!box || !p) throw new Error('no canvas');
  return { x: box.x + p.x, y: box.y + p.y };
};

test('a Bode plot of an RC filter from the capacitor context menu', async ({ page }) => {
  await page.goto(`/?ctz=${compressCircuit(RC)}`);
  await ready(page);
  const cap = await at(page, 256, 208);
  await page.mouse.click(cap.x, cap.y, { button: 'right' });
  await page.getByTestId('ctx-bode').click();

  const dialog = page.getByTestId('bode-dialog');
  await expect(dialog).toBeVisible();
  // the capacitor is the output, the only source the input
  await expect(page.getByTestId('bode-output')).toHaveValue('2');
  await expect(page.getByTestId('bode-source')).toHaveValue('0');
  // an AC source keeps its own amplitude
  await expect(page.getByTestId('bode-amplitude')).toHaveValue('5');

  await page.getByTestId('bode-from').fill('100');
  await page.getByTestId('bode-to').fill('100k');
  await page.getByTestId('bode-ppd').selectOption('5');
  await page.getByTestId('bode-run').click();
  await expect(page.getByTestId('bode-run')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('bode-status')).toContainText('16/16');

  // with no pointer on the plot the readout shows the -3 dB point
  const readout = page.getByTestId('bode-readout');
  await expect(readout).toContainText('kHz');
  const text = (await readout.textContent()) ?? '';
  const khz = Number(/([\d.]+) kHz/.exec(text)?.[1]);
  expect(Math.abs(khz / 1.5915 - 1)).toBeLessThan(0.02);
  expect(text).toMatch(/-3\.0\d dB/);
  expect(text).toMatch(/-4[45]\.\d°/);

  // pointing at the plot reads it there
  const box = await page.getByTestId('bode-canvas').boundingBox();
  if (!box) throw new Error('no plot');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await expect(readout).toContainText('Cursor');

  // the running circuit was not touched
  const saved = await page.evaluate(() => window.perun?.controller.saveText() ?? '');
  expect(saved).toContain('fr="1000"');
});

test('the Scopes menu opens the dialog and says when there is no source', async ({ page }) => {
  await page.goto(`/?ctz=${compressCircuit('$ 1 0.000005 10 50 5 50\nr 96 96 256 96 0 1000\n')}`);
  await ready(page);
  await page.getByTestId('scopes-menu').click();
  await page.getByTestId('scopes-bode').click();
  await expect(page.getByTestId('bode-no-source')).toBeVisible();
  await expect(page.getByTestId('bode-run')).toBeDisabled();
});
