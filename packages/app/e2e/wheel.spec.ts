// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// The radial wheel: the favorite components in a ring around the pointer, opened with q, a
// right-button flick on empty canvas, or a long press on a touch screen.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@perun/format';

const BLANK = '$ 1 5.0E-6 10 50 5.0\n';

const open = async (page: Page): Promise<{ x: number; y: number }> => {
  await page.goto(`/?ctz=${compressCircuit(BLANK)}`);
  await expect(page.getByTestId('circuit-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.perun?.controller.frames ?? 0) > 2);
  const box = await page.getByTestId('circuit-canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Each element's class and whether it stands upright. */
const placed = (page: Page): Promise<{ cls: string; upright: boolean }[]> =>
  page.evaluate(() =>
    (window.perun?.controller.circuit.elements ?? []).map((e) => ({
      cls: e.getClassName(),
      upright: e.x === e.x2,
    })),
  );

test('hold q, point at a part and let go: it is placed where the wheel opened', async ({
  page,
}) => {
  const c = await open(page);
  await page.mouse.move(c.x, c.y);
  await page.keyboard.down('q');
  const wheel = page.getByTestId('radial-wheel');
  await expect(wheel).toBeVisible();
  // the resistor is third, to the right of the top
  await page.mouse.move(c.x + 70, c.y, { steps: 4 });
  await expect(page.getByTestId('wheel-ResistorElm')).toHaveAttribute('data-lit', 'true');
  await expect(wheel).toContainText('Resistor');
  await page.keyboard.up('q');
  await expect(wheel).toHaveCount(0);
  expect(await placed(page)).toEqual([{ cls: 'ResistorElm', upright: false }]);
  // centred on the spot under the mouse
  const mid = await page.evaluate(() => {
    const e = window.perun?.controller.circuit.elements[0];
    return e ? window.perun?.controller.toScreen((e.x + e.x2) / 2, e.y) : null;
  });
  const box = await page.getByTestId('circuit-canvas').boundingBox();
  expect(Math.abs((mid?.x ?? 0) + (box?.x ?? 0) - c.x)).toBeLessThan(20);
});

test('a quick tap of q leaves the wheel open to click; Esc closes it', async ({ page }) => {
  const c = await open(page);
  await page.mouse.move(c.x, c.y);
  await page.keyboard.press('q');
  await expect(page.getByTestId('radial-wheel')).toBeVisible();
  await page.getByTestId('wheel-CapacitorElm').click();
  expect(await placed(page)).toEqual([{ cls: 'CapacitorElm', upright: false }]);
  await page.keyboard.press('q');
  await expect(page.getByTestId('radial-wheel')).toBeVisible();
  // the number keys pick too: 1 is the wire at the top, placed upright
  await page.keyboard.press('1');
  expect((await placed(page)).at(-1)).toEqual({ cls: 'WireElm', upright: true });
  await page.keyboard.press('q');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('radial-wheel')).toHaveCount(0);
  expect(await placed(page)).toHaveLength(2);
});

test('undo and redo under the wheel step back and forward and leave it open', async ({ page }) => {
  const c = await open(page);
  await page.mouse.move(c.x, c.y);
  await page.keyboard.press('q');
  await expect(page.getByTestId('wheel-undo')).toBeDisabled();
  await page.getByTestId('wheel-ResistorElm').click();
  await page.keyboard.press('q');
  await page.getByTestId('wheel-CapacitorElm').click();
  await page.keyboard.press('q');
  await page.getByTestId('wheel-undo').click();
  await page.getByTestId('wheel-undo').click();
  expect(await placed(page)).toEqual([]);
  await expect(page.getByTestId('radial-wheel')).toBeVisible();
  await page.getByTestId('wheel-redo').click();
  expect(await placed(page)).toEqual([{ cls: 'ResistorElm', upright: false }]);
  // a right flick let go on Undo undoes, rather than placing the part below
  await page.keyboard.press('Escape');
  await page.mouse.move(c.x - 160, c.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(c.x - 160, c.y + 30, { steps: 2 });
  const undo = await page.getByTestId('wheel-undo').boundingBox();
  if (!undo) throw new Error('no undo button');
  await page.mouse.move(undo.x + undo.width / 2, undo.y + undo.height / 2, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  expect(await placed(page)).toEqual([]);
});

test('a right-button flick on empty canvas picks; a right click still opens the menu', async ({
  page,
}) => {
  const c = await open(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(c.x, c.y - 30, { steps: 3 });
  await expect(page.getByTestId('radial-wheel')).toBeVisible();
  await page.mouse.move(c.x, c.y - 70, { steps: 3 });
  await page.mouse.up({ button: 'right' });
  await expect(page.getByTestId('radial-wheel')).toHaveCount(0);
  expect(await placed(page)).toEqual([{ cls: 'WireElm', upright: true }]);
  await expect(page.getByRole('menu')).toHaveCount(0);

  // a flick let go in the middle places nothing (left of the wire: the property panel is open)
  await page.mouse.move(c.x - 160, c.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(c.x - 145, c.y, { steps: 2 });
  await expect(page.getByTestId('radial-wheel')).toBeVisible();
  await page.mouse.move(c.x - 160, c.y, { steps: 2 });
  await page.mouse.up({ button: 'right' });
  await expect(page.getByTestId('radial-wheel')).toHaveCount(0);
  expect(await placed(page)).toHaveLength(1);

  await page.mouse.click(c.x - 160, c.y + 100, { button: 'right' });
  await expect(page.getByRole('menuitem', { name: /Centre Circuit/ })).toBeVisible();
});

test('Options turns the wheel off: q does nothing and a right drag is a plain right click', async ({
  page,
}) => {
  const c = await open(page);
  await page.getByTestId('options-menu').click();
  await page.getByTestId('menu-quick-wheel').click();
  await page.keyboard.press('Escape');
  await page.mouse.move(c.x, c.y);
  await page.keyboard.press('q');
  await expect(page.getByTestId('radial-wheel')).toHaveCount(0);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(c.x, c.y - 70, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  await expect(page.getByTestId('radial-wheel')).toHaveCount(0);
  expect(await placed(page)).toEqual([]);
  // the bar stays on: it has its own switch
  await expect(page.getByTestId('quick-pick-grid')).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a long press on empty canvas opens the wheel; a tap picks', async ({ page }) => {
    const c = await open(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: c.x, y: c.y }],
    });
    await expect(page.getByTestId('radial-wheel')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // lifted in the middle: it stays open, with what the empty-canvas menu had
    await expect(page.getByTestId('radial-wheel')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Centre Circuit' })).toBeVisible();
    await page.getByTestId('wheel-DiodeElm').tap();
    await expect(page.getByTestId('radial-wheel')).toHaveCount(0);
    expect(await placed(page)).toEqual([{ cls: 'DiodeElm', upright: false }]);
  });

  test('press, slide to a part and lift places it', async ({ page }) => {
    const c = await open(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: c.x, y: c.y }],
    });
    await expect(page.getByTestId('radial-wheel')).toBeVisible();
    for (let i = 1; i <= 5; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: c.x, y: c.y + 18 * i }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByTestId('radial-wheel')).toHaveCount(0);
    // straight down is the fifth favorite, the inductor, upright
    expect(await placed(page)).toEqual([{ cls: 'InductorElm', upright: true }]);
  });
});
