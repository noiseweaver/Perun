// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Phase 14: wires that follow a dragged part, schematic image and parts list export.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@circuitjs-next/format';

const RC =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 96 320 96 96 0 1 1000 5 0 0 0.5\n' +
  'r 96 96 256 96 0 1000\n' +
  'w 256 96 352 96 0\n' +
  'c 352 96 352 320 0 1e-7 0\n' +
  'w 96 320 352 320 0\n';

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

const wires = (page: Page): Promise<number[][]> =>
  page.evaluate(
    () =>
      window.circuitjsNext?.controller.circuit.elements
        .filter((e) => e.getClassName() === 'WireElm')
        .map((e) => [e.x, e.y, e.x2, e.y2]) ?? [],
  );

test('dragging a capacitor takes its wires along, unless the option is off', async ({ page }) => {
  await page.goto(`/?ctz=${compressCircuit(RC)}`);
  await ready(page);
  const from = await at(page, 352, 208);
  const to = await at(page, 416, 208);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, from.y, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  const w = await wires(page);
  expect(w).toContainEqual([256, 96, 416, 96]);
  expect(w).toContainEqual([96, 320, 416, 320]);

  await page.getByTestId('options-menu').click();
  await page.getByTestId('menu-wires-follow').click();
  const back = await at(page, 416, 208);
  const left = await at(page, 384, 208);
  await page.mouse.move(back.x, back.y);
  await page.mouse.down();
  await page.mouse.move(left.x, left.y, { steps: 4 });
  await page.mouse.up();
  expect(await wires(page)).toContainEqual([256, 96, 416, 96]);
});

test('exports the schematic as SVG and PNG, and a parts list', async ({ page }) => {
  await page.goto(`/?ctz=${compressCircuit(RC)}`);
  await ready(page);
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-export-image').click();
  await expect(page.getByTestId('export-preview')).toBeVisible();
  const svg = page.waitForEvent('download');
  await page.getByTestId('export-download').click();
  const svgFile = await svg;
  expect(svgFile.suggestedFilename()).toMatch(/\.svg$/);

  await page.getByTestId('export-format').selectOption('png');
  await expect(page.getByTestId('export-preview')).toHaveAttribute('src', /^data:image\/png/);
  const png = page.waitForEvent('download');
  await page.getByTestId('export-download').click();
  expect((await png).suggestedFilename()).toMatch(/\.png$/);
  await page.keyboard.press('Escape');

  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-parts-list').click();
  const table = page.getByTestId('parts-table');
  await expect(table).toContainText('Resistor');
  await expect(table).toContainText('1 kΩ');
  await expect(table).toContainText('100 nF');
  await expect(table).not.toContainText('Wire');
});
