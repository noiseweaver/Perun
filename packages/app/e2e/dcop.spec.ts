// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Phase 13: the DC operating point table. The solve is checked against hand calculations in
// packages/app/src/analysis/dcop.test.ts; this covers opening the panel, reading and pointing.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@circuitjs-next/format';

/** Voltage-divider bias of an NPN stage, with a capacitor that must carry no DC current. */
const NPN_BIAS =
  '$ 1 0.000005 10 50 5 50\n' +
  'R 352 64 352 32 0 0 40 12 0 0 0.5\n' +
  'w 352 64 208 64 0\n' +
  'r 352 64 352 224 0 2200\n' +
  'r 208 64 208 240 0 47000\n' +
  'r 208 240 208 400 0 10000\n' +
  'w 208 240 304 240 0\n' +
  't 304 240 352 240 0 1 0 0 100 default\n' +
  'r 352 256 352 400 0 1000\n' +
  'w 208 400 352 400 0\n' +
  'g 352 400 352 432 0\n' +
  'c 208 240 128 240 0 0.000001 0\n' +
  'r 128 240 128 400 0 1000\n' +
  'w 128 400 208 400 0\n' +
  '207 352 224 416 224 0 out\n';

const ready = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('circuit-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.circuitjsNext?.controller.frames ?? 0) > 2);
};

test('the DC operating point of a transistor stage', async ({ page }) => {
  await page.goto(`/?ctz=${compressCircuit(NPN_BIAS)}`);
  await ready(page);
  await page.getByTestId('scopes-menu').click();
  await page.getByTestId('scopes-dc').click();

  const panel = page.getByTestId('dc-panel');
  await expect(panel).toBeVisible();
  const nodes = page.getByTestId('dc-node-row');
  await expect(nodes.first()).toContainText('GND');
  // the labeled collector node is listed by name, right after ground
  await expect(nodes.nth(1)).toContainText('out');
  const out = (await nodes.nth(1).textContent()) ?? '';
  const vc = Number(/(-?[\d.]+)\s+V/.exec(out)?.[1]);
  expect(vc).toBeGreaterThan(8.5);
  expect(vc).toBeLessThan(9.5);

  // pointing at a node lights its wires on the canvas
  await nodes.nth(1).hover();
  await expect
    .poll(() => page.evaluate(() => window.circuitjsNext?.controller.analysisHighlights().length))
    .toBeGreaterThan(0);

  await page.getByTestId('dc-tab-parts').click();
  const table = page.getByTestId('dc-parts');
  await expect(table).toContainText('Transistor');
  for (const pin of ['B', 'C', 'E'])
    await expect(table.getByRole('cell', { name: pin, exact: true })).toBeVisible();

  // sorting by current puts the largest current first
  await page.getByTestId('dc-sort-i').click();
  await expect(page.getByTestId('dc-part-row').first()).not.toContainText('Capacitor');

  // the CSV holds both tables
  const download = page.waitForEvent('download');
  await page.getByTestId('dc-csv').click();
  expect((await download).suggestedFilename()).toBe('dc-operating-point.csv');

  // Live mode reads the running circuit
  await page.getByTestId('dc-mode-live').click();
  await expect(page.getByTestId('dc-note')).toContainText('running simulation');

  await page.getByTestId('dc-panel-close').click();
  await expect(panel).toHaveCount(0);
  expect(
    await page.evaluate(() => window.circuitjsNext?.controller.analysisHighlights().length),
  ).toBe(0);
});
