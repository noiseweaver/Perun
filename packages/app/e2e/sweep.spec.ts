// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Phases 11 and 12: parameter sweeps and Monte Carlo. The runs are checked against analytic
// answers in packages/app/src/analysis/sweep.test.ts; this covers the dialog and the tolerance
// field.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@circuitjs-next/format';

/** A 5 V step into 1k and 1u (tau = 1 ms). */
const RC_STEP =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 96 320 96 96 0 0 40 5 0 0 0.5\n' +
  'r 96 96 256 96 0 1000\n' +
  'c 256 96 256 320 0 0.000001 0\n' +
  'w 96 320 256 320 0\n';

const ready = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('circuit-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.circuitjsNext?.controller.frames ?? 0) > 2);
};

const at = async (page: Page, x: number, y: number): Promise<{ x: number; y: number }> => {
  const box = await page.getByTestId('circuit-canvas').boundingBox();
  const p = await page.evaluate(
    ([x, y]) => window.circuitjsNext?.controller.toScreen(x, y) ?? null,
    [x, y] as const,
  );
  if (!box || !p) throw new Error('no canvas');
  return { x: box.x + p.x, y: box.y + p.y };
};

test('sweeping a resistor from its context menu overlays one run per value', async ({ page }) => {
  await page.goto(`/?ctz=${compressCircuit(RC_STEP)}`);
  await ready(page);
  const r = await at(page, 176, 96);
  await page.mouse.click(r.x, r.y, { button: 'right' });
  await page.getByTestId('ctx-sweep').click();

  await expect(page.getByTestId('sweep-dialog')).toBeVisible();
  await expect(page.getByTestId('sweep-part')).toHaveValue('1');
  // the values start around the part's own: half, itself and double
  await expect(page.getByTestId('sweep-values')).toHaveValue('500, 1k, 2k');
  await page.getByTestId('sweep-output').selectOption('2');
  await page.getByTestId('sweep-duration').fill('8ms');
  await page.getByTestId('sweep-run').click();
  await expect(page.getByTestId('sweep-run')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('sweep-status')).toContainText('3/3');

  const runs = page.getByTestId('sweep-run-row');
  await expect(runs).toHaveCount(3);
  await expect(runs.nth(1)).toContainText('1k');

  // at t = tau of the 1k run its capacitor is at 63% of 5 V
  const box = await page.getByTestId('sweep-canvas').boundingBox();
  if (!box) throw new Error('no plot');
  const left = 64;
  const right = box.width - 18;
  await page.mouse.move(box.x + left + (right - left) * (1 / 8), box.y + box.height / 2);
  await expect(page.getByTestId('sweep-readout')).toContainText('Cursor');
  await expect
    .poll(async () => {
      const text = (await runs.nth(1).textContent()) ?? '';
      return Number(/([\d.]+)\s*V/.exec(text)?.[1]);
    })
    .toBeCloseTo(5 * (1 - Math.exp(-1)), 1);

  // the running circuit was not touched
  const saved = await page.evaluate(() => window.circuitjsNext?.controller.saveText() ?? '');
  expect(saved).toContain('r="1000"');
});

test('Monte Carlo needs a tolerance, and spreads the runs once a part has one', async ({
  page,
}) => {
  await page.goto(`/?ctz=${compressCircuit(RC_STEP)}`);
  await ready(page);
  await page.getByTestId('scopes-menu').click();
  await page.getByTestId('scopes-montecarlo').click();
  await expect(page.getByTestId('sweep-problem')).toContainText('No part has a tolerance');
  await expect(page.getByTestId('sweep-run')).toBeDisabled();
  await page.keyboard.press('Escape');

  // give the resistor 10% in its properties
  const r = await at(page, 176, 96);
  await page.mouse.click(r.x, r.y);
  await expect(page.getByTestId('inspector-title')).toHaveText('Resistor');
  await page.getByLabel('Tolerance').selectOption({ label: '±10%' });
  const saved = await page.evaluate(() => window.circuitjsNext?.controller.saveText() ?? '');
  expect(saved).toContain('tol="10"');

  await page.getByTestId('scopes-menu').click();
  await page.getByTestId('scopes-montecarlo').click();
  await expect(page.getByTestId('sweep-tolerant')).toContainText('±10%');
  await page.getByTestId('sweep-output').selectOption('2');
  await page.getByTestId('sweep-duration').fill('5ms');
  await page.getByTestId('sweep-runs').selectOption('10');
  await page.getByTestId('sweep-run').click();
  await expect(page.getByTestId('sweep-run')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('sweep-status')).toContainText('11/11');

  const box = await page.getByTestId('sweep-canvas').boundingBox();
  if (!box) throw new Error('no plot');
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
  const spread = page.getByTestId('sweep-spread');
  await expect(spread).toContainText('Min');
  await expect(spread).toContainText('Max');

  // undo takes the tolerance back off
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  const after = await page.evaluate(() => window.circuitjsNext?.controller.saveText() ?? '');
  expect(after).not.toContain('tol=');
});
