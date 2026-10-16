// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// Smart editing (not in upstream): drop onto a wire, align and spread, Replace with… and the
// part search on Space and the radial wheel.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@perun/format';

const HEAD = '$ 1 5.0E-6 10 50 5.0\n';

const open = async (page: Page, body: string): Promise<void> => {
  await page.goto(`/?ctz=${compressCircuit(HEAD + body)}`);
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

type ElmInfo = { cls: string; pos: number[] };
const elements = (page: Page): Promise<ElmInfo[]> =>
  page.evaluate(() =>
    (window.perun?.controller.circuit.elements ?? []).map((e) => ({
      cls: e.getClassName(),
      pos: [e.x, e.y, e.x2, e.y2],
    })),
  );

test('a part dropped from the palette onto a wire splices in', async ({ page }) => {
  await open(page, 'w 0 96 320 96 0\n');
  const item = page.getByTestId('palette-ResistorElm');
  await item.scrollIntoViewIfNeeded();
  const ib = await item.boundingBox();
  if (!ib) throw new Error('no palette');
  const drop = await at(page, 128, 96);
  await page.mouse.move(ib.x + 20, ib.y + ib.height / 2);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 10 });
  await page.mouse.up();
  const els = await elements(page);
  expect(els.filter((e) => e.cls === 'WireElm')).toHaveLength(2);
  const r = els.find((e) => e.cls === 'ResistorElm');
  expect(r?.pos[1]).toBe(96);
  expect(r?.pos[3]).toBe(96);
});

test('Align middles from the Edit menu, undone in one step', async ({ page }) => {
  await open(page, 'r 0 0 64 0 0 1000\nr 128 32 192 32 0 1000\nr 256 -32 320 -32 0 1000\n');
  await page.getByTestId('circuit-canvas').focus();
  await page.keyboard.press('Control+a');
  await page.getByTestId('edit-menu').click();
  await page.getByTestId('menu-align').click();
  await page.getByTestId('menu-align-middle').click();
  expect((await elements(page)).map((e) => e.pos[1])).toEqual([0, 0, 0]);
  await page.keyboard.press('Control+z');
  expect((await elements(page)).map((e) => e.pos[1])).toEqual([0, 32, -32]);
});

test('the inspector lines up and spreads a selection', async ({ page }) => {
  await open(page, 'r 0 0 64 0 0 1000\nr 80 96 144 96 0 1000\nr 320 192 384 192 0 1000\n');
  await page.getByTestId('circuit-canvas').focus();
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('align-row')).toBeVisible();
  await page.getByTestId('spread-x').click();
  expect((await elements(page)).map((e) => e.pos[0])).toEqual([0, 160, 320]);
  await page.getByTestId('align-top').click();
  expect((await elements(page)).map((e) => e.pos[1])).toEqual([0, 0, 0]);
});

test('Replace with… swaps a resistor for a capacitor on the same posts', async ({ page }) => {
  await open(page, 'w 0 96 96 96 0\nr 96 96 160 96 0 1000\nw 160 96 224 96 0\n');
  const p = await at(page, 128, 96);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.getByTestId('ctx-replace').click();
  await expect(page.getByTestId('part-search')).toBeVisible();
  await page.getByTestId('part-search-input').fill('capacitor');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('part-search')).toHaveCount(0);
  const c = (await elements(page)).find((e) => e.cls === 'CapacitorElm');
  expect(c?.pos).toEqual([96, 96, 160, 96]);
  expect((await elements(page)).some((e) => e.cls === 'ResistorElm')).toBe(false);
});

test('Space opens a part search at the pointer; Enter places the part there', async ({ page }) => {
  await open(page, '');
  const p = await at(page, 160, 160);
  await page.mouse.move(p.x, p.y);
  await page.getByTestId('circuit-canvas').focus();
  await page.keyboard.press(' ');
  await expect(page.getByTestId('part-search-input')).toBeFocused();
  await page.keyboard.type('induc');
  await expect(page.getByTestId('part-search-InductorElm')).toBeVisible();
  await page.keyboard.press('Enter');
  const els = await elements(page);
  expect(els.map((e) => e.cls)).toEqual(['InductorElm']);
  const [x1, y1, x2] = els[0]?.pos ?? [];
  expect(Math.abs(((x1 ?? 0) + (x2 ?? 0)) / 2 - 160)).toBeLessThanOrEqual(32);
  expect(Math.abs((y1 ?? 0) - 160)).toBeLessThanOrEqual(16);
});

test('the radial wheel has a search button too; Escape closes the search', async ({ page }) => {
  await open(page, '');
  const p = await at(page, 160, 160);
  await page.mouse.move(p.x, p.y);
  await page.getByTestId('circuit-canvas').focus();
  await page.keyboard.press('q');
  await page.getByTestId('wheel-search').click();
  await expect(page.getByTestId('radial-wheel')).toHaveCount(0);
  await expect(page.getByTestId('part-search-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('part-search')).toHaveCount(0);
  expect(await elements(page)).toEqual([]);
});

test('a wire drawn from a long lead joins there instead of a bad connection', async ({ page }) => {
  await open(page, 'r 0 96 320 96 0 1000\n');
  await page.getByTestId('circuit-canvas').focus();
  await page.keyboard.press('w');
  const a = await at(page, 272, 96);
  const b = await at(page, 272, 192);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  const els = await elements(page);
  expect(els.find((e) => e.cls === 'ResistorElm')?.pos).toEqual([48, 96, 272, 96]);
  expect(els.filter((e) => e.cls === 'WireElm')).toHaveLength(3);
});

test('right-click on empty canvas offers the wheel favorites and a search', async ({ page }) => {
  await open(page, '');
  const p = await at(page, 160, 160);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.getByTestId('ctx-quick-CapacitorElm').click();
  const els = await elements(page);
  expect(els.map((e) => e.cls)).toEqual(['CapacitorElm']);
  const [x1, y1, x2] = els[0]?.pos ?? [];
  expect(Math.abs(((x1 ?? 0) + (x2 ?? 0)) / 2 - 160)).toBeLessThanOrEqual(32);
  expect(Math.abs((y1 ?? 0) - 160)).toBeLessThanOrEqual(16);

  const q = await at(page, 160, 320);
  await page.mouse.click(q.x, q.y, { button: 'right' });
  await page.getByTestId('ctx-quick-search').click();
  await expect(page.getByTestId('part-search-input')).toBeFocused();
});
