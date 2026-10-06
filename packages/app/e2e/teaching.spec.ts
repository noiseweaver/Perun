// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Phase 9 teaching tools: pencil, laser pointer and eraser over the circuit, never saved.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@circuitjs-next/format';

const LOOP =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 96 224 96 96 0 0 40 10 0 0 0.5\n' +
  'r 96 96 256 96 0 1000\n' +
  'w 256 96 256 224 0\n' +
  'w 96 224 256 224 0\n';

const open = async (page: Page): Promise<void> => {
  await page.goto(`/?ctz=${compressCircuit(LOOP)}`);
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

/** Drag through circuit points with the mouse. */
const drag = async (page: Page, pts: [number, number][]): Promise<void> => {
  const first = await at(page, ...pts[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of pts.slice(1)) {
    const s = await at(page, ...p);
    await page.mouse.move(s.x, s.y, { steps: 6 });
  }
  await page.mouse.up();
};

const strokes = (page: Page): Promise<number> =>
  page.evaluate(() => window.circuitjsNext?.controller.annotations.strokes.length ?? -1);
const dump = (page: Page): Promise<string> =>
  page.evaluate(() => window.circuitjsNext?.controller.circuit.dumpXml() ?? '');

test('the pencil draws over the circuit without editing it, and is never saved', async ({
  page,
}) => {
  await open(page);
  const before = await dump(page);
  await page.getByTestId('draw-toggle').click();
  await expect(page.getByTestId('teach-bar')).toBeVisible();
  await expect(page.getByTestId('teach-pencil')).toHaveAttribute('aria-pressed', 'true');

  // a stroke across the resistor: drawn, but nothing selected or moved
  await drag(page, [
    [120, 64],
    [176, 120],
    [232, 64],
  ]);
  await expect.poll(() => strokes(page)).toBe(1);
  expect(await dump(page)).toBe(before);
  await expect(page.getByTestId('inspector-title')).toHaveCount(0);

  // a second pen color, then undo (also with the keyboard) and clear
  await page.getByTestId('teach-pen-1').click();
  await drag(page, [
    [120, 160],
    [232, 160],
  ]);
  await expect.poll(() => strokes(page)).toBe(2);
  expect(
    await page.evaluate(() => window.circuitjsNext?.controller.annotations.strokes[1]?.pen),
  ).toBe(1);
  await page.getByTestId('teach-undo').click();
  await expect.poll(() => strokes(page)).toBe(1);
  await page.keyboard.press('Control+z');
  await expect.poll(() => strokes(page)).toBe(0);
  // the circuit's own undo is untouched
  await expect(page.getByTestId('undo')).toBeDisabled();

  await drag(page, [
    [120, 160],
    [232, 160],
  ]);
  await page.getByTestId('teach-clear').click();
  await expect.poll(() => strokes(page)).toBe(0);

  // the eraser removes the strokes it passes over
  await page.getByTestId('teach-pencil').click();
  await drag(page, [
    [120, 160],
    [232, 160],
  ]);
  await drag(page, [
    [120, 192],
    [232, 192],
  ]);
  await expect.poll(() => strokes(page)).toBe(2);
  await page.getByTestId('teach-eraser').click();
  await drag(page, [
    [176, 140],
    [176, 176],
  ]);
  await expect.poll(() => strokes(page)).toBe(1);

  // Escape puts the tools away; the drawing stays until cleared, and is not in the file
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('teach-bar')).toHaveCount(0);
  expect(await strokes(page)).toBe(1);
  expect(await dump(page)).toBe(before);
});

test('the laser pointer leaves a trail that fades', async ({ page }) => {
  await open(page);
  await page.getByTestId('draw-toggle').click();
  await page.getByTestId('teach-laser').click();
  const a = await at(page, 120, 160);
  const b = await at(page, 232, 160);
  await page.mouse.move(a.x, a.y);
  await page.mouse.move(b.x, b.y, { steps: 10 });
  const active = (): Promise<boolean> =>
    page.evaluate(() => window.circuitjsNext?.controller.annotations.active ?? false);
  expect(await active()).toBe(true);
  // off the canvas, the head goes and the trail fades out
  await page.mouse.move(2, 2);
  await expect.poll(active, { timeout: 3000 }).toBe(false);
  // pointing never draws a stroke
  expect(
    await page.evaluate(() => window.circuitjsNext?.controller.annotations.strokes.length),
  ).toBe(0);
});
