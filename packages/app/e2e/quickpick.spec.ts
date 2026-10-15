// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// The quick pick: favorites pinned with a star and the components placed most recently, at the
// top of the palette, on a rail while the palette is away, and in a strip on phones.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@perun/format';

const BLANK = '$ 1 5.0E-6 10 50 5.0\n';

const open = async (page: Page): Promise<void> => {
  await page.goto(`/?ctz=${compressCircuit(BLANK)}`);
  await expect(page.getByTestId('circuit-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.perun?.controller.frames ?? 0) > 2);
};

const classes = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (window.perun?.controller.circuit.elements ?? []).map((e) => e.getClassName()),
  );

/** Drag on the canvas from its centre, as placing a component does. */
const dragOnCanvas = async (page: Page, dx: number, dy: number): Promise<void> => {
  const box = await page.getByTestId('circuit-canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
};

test('stars pin favorites to the top of the palette, and they stay pinned', async ({ page }) => {
  await open(page);
  const grid = page.getByTestId('quick-pick-grid');
  await expect(grid.getByTestId('palette-quick-ResistorElm')).toBeVisible();
  await expect(grid.getByTestId('palette-quick-PTransistorElm')).toHaveCount(0);

  await page.getByTestId('palette-search').fill('pnp');
  await page.getByTestId('palette-star-PTransistorElm').click();
  await expect(page.getByTestId('palette-star-PTransistorElm')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByTestId('palette-search').fill('');
  await expect(grid.getByTestId('palette-quick-PTransistorElm')).toBeVisible();

  await page.getByTestId('palette-star-WireElm').click();
  await expect(grid.getByTestId('palette-quick-WireElm')).toHaveCount(0);

  await page.reload();
  await expect(grid.getByTestId('palette-quick-PTransistorElm')).toBeVisible();
  await expect(grid.getByTestId('palette-quick-WireElm')).toHaveCount(0);
});

test('placed components show as recent', async ({ page }) => {
  await open(page);
  await page.getByTestId('palette-search').fill('zener');
  await page.getByTestId('palette-ZenerElm').click();
  await page.getByTestId('palette-search').fill('');
  await dragOnCanvas(page, 96, 0);
  expect(await classes(page)).toEqual(['ZenerElm']);
  await expect(
    page.getByTestId('quick-pick-grid').getByTestId('palette-quick-ZenerElm'),
  ).toBeVisible();
  // a favorite isn't repeated under Recent
  await page.getByTestId('palette-quick-ResistorElm').click();
  await dragOnCanvas(page, 0, 96);
  await expect(page.getByTestId('palette-quick-ResistorElm')).toHaveCount(1);
});

test('with the palette away, the rail picks components', async ({ page }) => {
  await open(page);
  await page.getByTestId('palette-hide').click();
  const rail = page.getByTestId('quick-pick-rail');
  await expect(rail).toBeVisible();
  await rail.getByTestId('quick-CapacitorElm').click();
  await expect(page.getByTestId('mode-chip')).toContainText('Capacitor');
  await expect(rail.getByTestId('quick-CapacitorElm')).toHaveAttribute('aria-pressed', 'true');
  await dragOnCanvas(page, 96, 0);
  expect(await classes(page)).toEqual(['CapacitorElm']);
  // the tab at its top brings the palette back
  await page.getByTestId('palette-reveal').click();
  await expect(page.getByTestId('palette')).toHaveAttribute('data-open', 'true');
  await expect(rail).toHaveCount(0);
});

test('the rail folds away to its handle, and stays folded', async ({ page }) => {
  await open(page);
  await page.getByTestId('palette-hide').click();
  const rail = page.getByTestId('quick-pick-rail');
  await expect(rail.getByTestId('quick-ResistorElm')).toBeVisible();
  await page.getByTestId('quick-rail-fold').click();
  await expect(rail).toHaveCount(0);
  await expect(page.getByTestId('palette-reveal')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('quick-rail-fold')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('quick-rail-fold').click();
  await expect(rail.getByTestId('quick-ResistorElm')).toBeVisible();
});

test('Options turns the quick pick bar off, leaving the tab that brings the palette back', async ({
  page,
}) => {
  await open(page);
  await page.getByTestId('palette-hide').click();
  await page.getByTestId('options-menu').click();
  await page.getByTestId('menu-quick-pick').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('quick-ResistorElm')).toHaveCount(0);
  await expect(page.getByTestId('quick-rail-fold')).toHaveCount(0);
  await page.getByTestId('palette-reveal').click();
  await expect(page.getByTestId('palette')).toHaveAttribute('data-open', 'true');
});

test('favorites are put in order by dragging or with the arrow keys', async ({ page }) => {
  await open(page);
  const order = (): Promise<string[]> =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem('circuitjs-next.paletteFavorites') ?? '[]'),
    );
  await page.getByTestId('quick-reorder').click();
  // Ground (second) one place to the right, from the keyboard
  await page.getByTestId('quick-order-GroundElm').focus();
  await page.keyboard.press('ArrowRight');
  expect((await order()).slice(0, 3)).toEqual(['WireElm', 'ResistorElm', 'GroundElm']);
  await expect(page.getByTestId('quick-order-GroundElm')).toBeFocused();
  // the op amp dragged onto the wire's place, first
  const from = await page.getByTestId('quick-order-OpAmpElm').boundingBox();
  const to = await page.getByTestId('quick-order-WireElm').boundingBox();
  if (!from || !to) throw new Error('no slots');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  expect((await order())[0]).toBe('OpAmpElm');
  // done: the buttons pick components again, in the new order
  await page.getByTestId('quick-reorder').click();
  const grid = page.getByTestId('quick-pick-grid');
  await expect(grid.locator('.quick-slot').first()).toHaveAttribute(
    'data-testid',
    'palette-quick-OpAmpElm',
  );
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the strip under the canvas picks components and opens the palette', async ({ page }) => {
    await open(page);
    const strip = page.getByTestId('quick-pick-strip');
    await expect(strip).toBeVisible();
    await expect(page.getByTestId('quick-pick-rail')).toHaveCount(0);
    // it sits between the canvas and the run controls
    const canvas = await page.getByTestId('circuit-canvas').boundingBox();
    const box = await strip.boundingBox();
    expect((box?.y ?? 0) + 1).toBeGreaterThan((canvas?.y ?? 0) + (canvas?.height ?? 0));

    await strip.getByTestId('quick-ResistorElm').tap();
    await expect(page.getByTestId('mode-chip')).toContainText('Resistor');
    await strip.getByTestId('quick-more').tap();
    await expect(page.getByTestId('palette')).toHaveAttribute('data-open', 'true');
  });

  test('the strip folds away to a small handle, and stays folded', async ({ page }) => {
    await open(page);
    const canvasHeight = async (): Promise<number> =>
      (await page.getByTestId('circuit-canvas').boundingBox())?.height ?? 0;
    const tall = await canvasHeight();
    await page.getByTestId('quick-strip-fold').tap();
    await expect(page.getByTestId('quick-pick-strip')).toHaveCount(0);
    // the canvas takes the room
    await expect.poll(canvasHeight).toBeGreaterThan(tall + 30);
    await page.reload();
    await expect(page.getByTestId('quick-strip-fold')).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('quick-strip-fold').tap();
    await expect(page.getByTestId('quick-pick-strip')).toBeVisible();
  });
});
