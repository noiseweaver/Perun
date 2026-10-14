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
});
