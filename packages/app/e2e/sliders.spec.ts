// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// Live sliders: a pot's slider and an added ("Sliders…") slider move their values, undo puts them
// back, and the Sliders dialog adds a slider that is saved with the circuit.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@perun/format';

/** A pot between two 5 V sources (upstream pot.txt). */
const POT =
  '$ 1 5.0E-6 10.20027730826997 50 5.0 50\n' +
  'v 208 320 208 160 0 0 40.0 5.0 0.0 0.0 0.5\n' +
  'v 432 320 432 160 0 0 40.0 5.0 0.0 0.0 0.5\n' +
  'w 320 224 320 160 0\n' +
  'w 320 160 208 160 0\n' +
  'w 320 160 432 160 0\n' +
  '174 208 320 432 224 1 1000.0 0.5 Resistance\n';

/** A 10 V source and a resistor with a slider on the resistance (a `38` record). */
const ADJ =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 96 224 96 96 0 0 40 10 0 0 0.5\n' +
  'r 96 96 256 96 0 1000\n' +
  'w 256 96 256 224 0\n' +
  'w 96 224 256 224 0\n' +
  '38 1 F0 0 100 2000 Load 0\n';

const open = async (page: Page, text: string): Promise<void> => {
  await page.goto(`/?ctz=${compressCircuit(text)}`);
  await expect(page.getByTestId('circuit-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.perun?.controller.frames ?? 0) > 2);
};

const save = (page: Page): Promise<string> =>
  page.evaluate(() => window.perun?.controller.saveText() ?? '');

test('a pot slider moves the wiper, and undo puts it back', async ({ page }) => {
  await open(page, POT);
  const panel = page.getByTestId('slider-panel');
  await expect(panel).toContainText('Resistance');
  const position = () =>
    page.evaluate(() => {
      const e = window.perun?.controller.circuit.elements[5] as unknown as {
        position: number;
      };
      return e.position;
    });
  const before = await position();
  const thumb = panel.getByRole('slider', { name: 'Resistance' });
  await thumb.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(position).toBeCloseTo(before + 10 * 0.0099, 6);
  await expect(panel.getByTestId('slider-value')).toHaveText(/^ +60%$/);
  expect(await save(page)).toMatch(/po="0\.59\d*"/);
  await page.getByTestId('undo').click();
  await expect.poll(position).toBeCloseTo(before + 9 * 0.0099, 6);
});

test('an added slider sets its value and keeps a fixed-width readout', async ({ page }) => {
  await open(page, ADJ);
  const panel = page.getByTestId('slider-panel');
  await expect(panel).toContainText('Load');
  const resistance = () =>
    page.evaluate(() => window.perun?.controller.circuit.elements[1]?.getEditInfo(0)?.value ?? 0);
  const value = panel.getByTestId('slider-value');
  const width = (await value.textContent())?.length;
  await panel.getByRole('slider', { name: 'Load' }).focus();
  await page.keyboard.press('End');
  await expect.poll(resistance).toBe(2000);
  await expect(value).toHaveText(/2k/);
  expect((await value.textContent())?.length).toBe(width);
  await page.keyboard.press('Home');
  await expect.poll(resistance).toBe(100);
  expect(await save(page)).toContain('<adj e="1" ei="0" en="Resistance (ohms)" mn="100" mx="2000"');
});

test('the Sliders dialog adds a slider to a value', async ({ page }) => {
  await open(page, ADJ);
  // the resistor already has one; add one to the source's DC offset (or any other value)
  await page.evaluate(() => {
    const c = window.perun?.controller;
    const v = c?.circuit.elements[0];
    if (c && v) c.openSliderDialog(v);
  });
  const rows = page.getByTestId('slider-dialog-row');
  await expect(rows.first()).toBeVisible();
  await page.getByTestId('slider-on-0').check();
  await page.getByTestId('slider-min-0').fill('1');
  await page.getByTestId('slider-max-0').fill('20');
  await page.getByTestId('slider-label-0').fill('Supply');
  await page.getByTestId('slider-dialog-ok').click();
  const panel = page.getByTestId('slider-panel');
  await expect(panel.getByTestId('slider-row')).toHaveCount(2);
  await expect(panel).toContainText('Supply');
  expect(await save(page)).toMatch(/<adj e="0" ei="0" en="[^"]+" mn="1" mx="20" st="Supply"/);
  await page.getByTestId('undo').click();
  await expect(panel.getByTestId('slider-row')).toHaveCount(1);
});

test('deleting an element removes its slider', async ({ page }) => {
  await open(page, ADJ);
  await expect(page.getByTestId('slider-panel')).toBeVisible();
  await page.evaluate(() => {
    const c = window.perun?.controller;
    const r = c?.circuit.elements[1];
    if (c && r) c.editor.deleteSelected(r);
  });
  await expect(page.getByTestId('slider-panel')).toHaveCount(0);
  expect(await save(page)).not.toContain('<adj');
});
