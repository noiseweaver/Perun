// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Phase 9: making a subcircuit from the circuit, placing it, and editing its model's circuit.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@circuitjs-next/format';

/** A divider between labels "top" and "bot", tapped by "mid". */
const DIVIDER =
  '$ 1 0.000005 10.2 50 5 50 5e-11\n' +
  '207 96 96 48 96 4 top\n' +
  'r 96 96 96 192 0 1000\n' +
  'r 96 192 96 320 0 1000\n' +
  '207 96 320 48 320 4 bot\n' +
  'w 96 192 192 192 0\n' +
  '207 192 192 240 192 4 mid\n';

const open = async (page: Page, text: string): Promise<void> => {
  await page.goto(`/?ctz=${compressCircuit(text)}`);
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

const classes = (page: Page): Promise<string[]> =>
  page.evaluate(
    () => window.circuitjsNext?.controller.circuit.elements.map((e) => e.getClassName()) ?? [],
  );

test('File > Create Subcircuit makes a model that can be placed and edited', async ({ page }) => {
  await open(page, DIVIDER);
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-create-subcircuit').click();
  const dialog = page.getByTestId('subcircuit-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Edit Subcircuit Pin Layout');
  // a model needs a name
  await page.getByTestId('subcircuit-ok').click();
  await expect(page.getByRole('alert')).toContainText('Please enter a model name.');
  await page.getByTestId('subcircuit-name').fill('div');
  await page.getByTestId('subcircuit-wider').click();
  await page.getByTestId('subcircuit-show-label').check();
  await page.getByTestId('subcircuit-ok').click();
  await expect(dialog).toHaveCount(0);

  // the palette offers it; place one
  const item = page.getByTestId('palette-CustomCompositeElm:div');
  await expect(item).toBeVisible();
  await item.click();
  const a = await at(page, -128, 160);
  const b = await at(page, -64, 160);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => classes(page)).toContain('CustomCompositeElm');
  const size = await page.evaluate(() => {
    const e = window.circuitjsNext?.controller.circuit.elements.find(
      (x) => x.getClassName() === 'CustomCompositeElm',
    ) as unknown as { model: { sizeX: number; sizeY: number; showLabel(): boolean } } | undefined;
    return e ? [e.model.sizeX, e.model.sizeY, e.model.showLabel()] : null;
  });
  expect(size).toEqual([3, 2, true]);

  // its model's circuit opens for editing, and Back returns to this one
  await page.keyboard.press('Escape');
  const middle = () =>
    page.evaluate(() => {
      const e = window.circuitjsNext?.controller.circuit.elements.find(
        (x) => x.getClassName() === 'CustomCompositeElm',
      );
      if (!e) return null;
      const r = (e as unknown as { chip: { rectPoints: { x: number; y: number }[] } }).chip
        .rectPoints;
      return [(r[0].x + r[2].x) / 2, (r[0].y + r[2].y) / 2] as const;
    });
  const mid = await middle();
  if (mid === null) throw new Error('not placed');
  const m = await at(page, mid[0], mid[1]);
  await page.mouse.click(m.x, m.y);
  await page.getByRole('button', { name: 'Edit Model' }).click();
  await expect(page.getByTestId('subcircuit-editing')).toHaveText('Editing: div');
  await expect.poll(() => classes(page)).not.toContain('CustomCompositeElm');
  await page.getByTestId('subcircuit-back').click();
  await expect(page.getByTestId('subcircuit-bar')).toHaveCount(0);
  await expect.poll(() => classes(page)).toContain('CustomCompositeElm');

  // a double click shows its parts, running, until Back (with the property panel out of the way)
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inspector-title')).toHaveCount(0);
  const mid2 = await middle();
  if (mid2 === null) throw new Error('lost');
  const m2 = await at(page, mid2[0], mid2[1]);
  await page.mouse.dblclick(m2.x, m2.y);
  await expect(page.getByTestId('subcircuit-viewing')).toHaveText('Viewing: div');
  await expect(page.getByTestId('subcircuit-save')).toHaveCount(0);
  await page.getByTestId('subcircuit-back').click();
  await expect(page.getByTestId('subcircuit-bar')).toHaveCount(0);
});
