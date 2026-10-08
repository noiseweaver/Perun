// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// The property panel's live header, mouse wheel value stepping, and the scope dialog's preview.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@perun/format';

/** A 10 V source driving a 1k resistor, drawn on a 16 px grid. */
const LOOP =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 96 224 96 96 0 0 40 10 0 0 0.5\n' +
  'r 96 96 256 96 0 1000\n' +
  'w 256 96 256 224 0\n' +
  'w 96 224 256 224 0\n';

const open = async (page: Page, text: string): Promise<void> => {
  await page.goto(`/?ctz=${compressCircuit(text)}`);
  await expect(page.getByTestId('circuit-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.perun?.controller.frames ?? 0) > 2);
};

/** Page coordinates of a circuit point. */
const at = async (page: Page, x: number, y: number): Promise<{ x: number; y: number }> => {
  const box = await page.getByTestId('circuit-canvas').boundingBox();
  const p = await page.evaluate(([x, y]) => window.perun?.controller.toScreen(x, y) ?? null, [
    x,
    y,
  ] as const);
  if (!box || !p) throw new Error('no canvas');
  return { x: box.x + p.x, y: box.y + p.y };
};

const resistance = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      window.perun?.controller.circuit.elements
        .find((e) => e.getClassName() === 'ResistorElm')
        ?.getEditInfo(0)?.value ?? NaN,
  );

test('the property panel shows the part live with its voltage, current and power', async ({
  page,
}) => {
  await open(page, LOOP);
  const p = await at(page, 176, 96);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('live-header')).toBeVisible();
  // 10 V across 1k: every value keeps one width, with room for a minus sign
  await expect(page.getByTestId('live-v')).toHaveText(/^\s*-?10\.000 +V$/);
  await expect(page.getByTestId('live-i')).toHaveText(/^\s*-?10\.000 +mA$/);
  await expect(page.getByTestId('live-p')).toHaveText(/^\s*-?100\.000 +mW$/);
  const widths = await page.evaluate(() =>
    ['live-v', 'live-i', 'live-p'].map(
      (id) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.length,
    ),
  );
  expect(new Set(widths).size).toBe(1);
});

test("the formula card shows the selected resistor's law with live numbers", async ({ page }) => {
  await open(page, LOOP);
  const p = await at(page, 176, 96);
  await page.mouse.click(p.x, p.y);
  const card = page.getByTestId('formula-card');
  await expect(card).toBeVisible();
  const law = card.getByTestId('formula-law').first();
  await expect(law).toContainText('I = V / R');
  // values keep a fixed width, so 10 V and 1 kΩ are padded to the full budget
  const lines = law.getByTestId('formula-line');
  await expect(lines.nth(0)).toHaveText(/=\s+-?10\.000 +V\s*\/\s+1\.000 kΩ/);
  await expect(lines.nth(1)).toHaveText(/=\s+-?10\.000 mA/);
  // collapsing it is remembered for the next part
  await card.getByRole('button').click();
  await expect(card.getByTestId('formula-law')).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => (window.perun?.controller.frames ?? 0) > 2);
  const q = await at(page, 176, 96);
  await page.mouse.click(q.x, q.y);
  await expect(page.getByTestId('formula-card')).toBeVisible();
  await expect(page.getByTestId('formula-law')).toHaveCount(0);
});

test('the mouse wheel over a resistor steps it through E12, one undo for the lot', async ({
  page,
}) => {
  await open(page, LOOP);
  // the view can still be settling (panels opening, a fit) on a slow runner: wait until the
  // resistor stays put on screen before pointing at it
  let p = await at(page, 176, 96);
  await expect
    .poll(async () => {
      const q = await at(page, 176, 96);
      const still = q.x === p.x && q.y === p.y;
      p = q;
      return still;
    })
    .toBe(true);
  // a wheel that lands before the canvas has the pointer over the part does nothing: point and
  // wheel again until the first step takes (only while the value is still 1k, so never twice)
  await expect(async () => {
    if ((await resistance(page)) === 1000) {
      p = await at(page, 176, 96);
      await page.mouse.move(p.x, p.y);
      await page.mouse.wheel(0, -100);
    }
    await expect.poll(() => resistance(page), { timeout: 1000 }).toBeCloseTo(1200);
  }).toPass({ timeout: 10000 });
  await expect(page.getByTestId('wheel-value-current')).toHaveText(/1\.2k/);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => resistance(page)).toBeCloseTo(1500);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => resistance(page)).toBeCloseTo(820);
  await expect(page.getByTestId('wheel-value')).toBeHidden();
  await page.keyboard.press('Control+z');
  expect(await resistance(page)).toBeCloseTo(1000);
});

test('the mouse wheel over a field in the panel steps it', async ({ page }) => {
  await open(page, LOOP);
  const p = await at(page, 176, 96);
  await page.mouse.click(p.x, p.y);
  const field = page.getByTestId('field-0');
  await field.hover();
  await page.mouse.wheel(0, -100);
  await expect.poll(() => resistance(page)).toBeCloseTo(1200);
});

test('Options > Edit Values With Mouse Wheel off: the wheel zooms instead', async ({ page }) => {
  await open(page, LOOP);
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByTestId('menu-wheel-edit').click();
  await page.keyboard.press('Escape');
  const p = await at(page, 176, 96);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(300);
  expect(await resistance(page)).toBe(1000);
});

test('the scope dialog shows the scope live, and its plot chips switch plots', async ({ page }) => {
  await page.goto('/?startCircuit=lrc.txt');
  await page.waitForFunction(() => (window.perun?.controller.scopes.scopeCount ?? 0) > 0);
  await page.evaluate(() => {
    const c = window.perun?.controller;
    const s = c?.scopes.scopes[0];
    if (c && s) c.openScopeProperties(s);
  });
  const preview = page.getByTestId('scope-preview');
  await expect(preview).toBeVisible();
  const box = await preview.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  // it changes as the simulation runs
  const shot = () => preview.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const a = await shot();
  await expect.poll(shot).not.toBe(a);
  await page.getByTestId('scope-show-current').click();
  await expect(page.getByTestId('scope-show-current')).not.toBeChecked();
  expect(await page.evaluate(() => window.perun?.controller.scopes.scopes[0]?.showI)).toBe(false);
});

test('Options > Value text size changes how big component values are drawn', async ({ page }) => {
  await open(page, LOOP);
  const size = () => page.evaluate(() => window.perun?.controller.lastFrameState?.valueScale);
  expect(await size()).toBe(0.875);
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByTestId('menu-value-size').click();
  // a click moves the mouse across the parent menu, which can close the submenu on a slow runner
  const item = page.getByTestId('value-size-1.25');
  await expect(item).toBeVisible();
  await item.dispatchEvent('click');
  await expect.poll(size).toBe(1.25);
});
