// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Phase 6: scopes restored from upstream files draw below the circuit, and the scope menus and
// properties dialog change them. tools/golden/src/scopes.test.ts checks the restored scopes
// against upstream's own save of every bundled example.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@circuitjs-next/format';

/** A 10 V source driving a resistor, drawn on a 16 px grid. */
const LOOP =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 96 224 96 96 0 0 40 10 0 0 0.5\n' +
  'r 96 96 256 96 0 1000\n' +
  'w 256 96 256 224 0\n' +
  'w 96 224 256 224 0\n';

const ready = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('circuit-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.circuitjsNext?.controller.frames ?? 0) > 2);
};

/** Page coordinates of a circuit point. */
const at = async (page: Page, x: number, y: number): Promise<{ x: number; y: number }> => {
  const box = await page.getByTestId('circuit-canvas').boundingBox();
  const p = await page.evaluate(
    ([x, y]) => window.circuitjsNext?.controller.toScreen(x, y) ?? null,
    [x, y] as const,
  );
  if (!box || !p) throw new Error('no canvas');
  return { x: box.x + p.x, y: box.y + p.y };
};

/** Page coordinates of a point in scope `i`'s rectangle, as a fraction of its size. */
const inScope = async (page: Page, i: number, fx = 0.5, fy = 0.5) => {
  const box = await page.getByTestId('circuit-canvas').boundingBox();
  const r = await page.evaluate(
    (i) => window.circuitjsNext?.controller.scopes.scopes[i]?.rect ?? null,
    i,
  );
  if (!box || !r) throw new Error('no scope');
  return { x: box.x + r.x + r.width * fx, y: box.y + r.y + r.height * fy };
};

const scopeCount = (page: Page): Promise<number> =>
  page.evaluate(() => window.circuitjsNext?.controller.scopes.scopeCount ?? -1);

const savedScopes = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (window.circuitjsNext?.controller.circuit.dumpXml() ?? '')
      .split('\n')
      .filter((l) => l.startsWith('  <o ')),
  );

/** Distinct colors in a canvas rectangle (CSS px), to tell an empty area from a drawn one. */
const colorsIn = (page: Page, r: { x: number; y: number; width: number; height: number }) =>
  page.getByTestId('circuit-canvas').evaluate((c: HTMLCanvasElement, r) => {
    const dpr = c.width / c.clientWidth;
    const d = c
      .getContext('2d')
      ?.getImageData(r.x * dpr, r.y * dpr, r.width * dpr, r.height * dpr).data;
    const seen = new Set<number>();
    if (d)
      for (let i = 0; i < d.length; i += 4) seen.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
    return seen.size;
  }, r);

test('scope lines of an upstream example restore its scopes and draw them', async ({ page }) => {
  await page.goto('/?startCircuit=lrc.txt');
  await ready(page);
  expect(await scopeCount(page)).toBe(3);
  // the circuit gives up the bottom of the canvas to the scopes
  const heights = await page.evaluate(() => {
    const c = window.circuitjsNext?.controller;
    return c ? [c.circuitHeight(), c.scopeArea().height] : [];
  });
  expect(heights[1]).toBeGreaterThan(50);
  // traces are drawn
  const r = await page.evaluate(() => window.circuitjsNext?.controller.scopes.scopes[0]?.rect);
  if (!r) throw new Error('no scope rect');
  await expect.poll(() => colorsIn(page, r)).toBeGreaterThan(4);
  // and saved back as upstream would
  const saved = await savedScopes(page);
  expect(saved).toHaveLength(3);
  expect(saved[0]).toContain('en="4"');
});

test('View in New Scope adds a scope, Remove Scope and undo take it away and back', async ({
  page,
}) => {
  await page.goto(`/?ctz=${compressCircuit(LOOP)}`);
  await ready(page);
  expect(await scopeCount(page)).toBe(0);
  const p = await at(page, 176, 96);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.getByTestId('ctx-view-in-scope').click();
  expect(await scopeCount(page)).toBe(1);
  expect(await savedScopes(page)).toHaveLength(1);

  // the scope's own menu
  const s = await inScope(page, 0);
  await page.mouse.click(s.x, s.y, { button: 'right' });
  await page.getByTestId('scope-remove').click();
  expect(await scopeCount(page)).toBe(0);
  await page.keyboard.press('Control+z');
  expect(await scopeCount(page)).toBe(1);
});

test('the properties dialog changes what a scope plots and is saved', async ({ page }) => {
  await page.goto(`/?ctz=${compressCircuit(LOOP)}`);
  await ready(page);
  const p = await at(page, 176, 96);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.getByTestId('ctx-view-in-scope').click();

  const s = await inScope(page, 0);
  await page.mouse.click(s.x, s.y, { button: 'right' });
  await page.getByTestId('scope-properties').click();
  const dialog = page.getByTestId('scope-dialog');
  await expect(dialog).toBeVisible();
  const dump = () => page.evaluate(() => window.circuitjsNext?.controller.circuit.dumpXml());
  const before = await dump();
  await page.getByTestId('scope-show-power').click();
  await expect(page.getByTestId('scope-show-power')).toBeChecked();
  await page.getByTestId('scope-dialog-ok').click();
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate(() =>
      window.circuitjsNext?.controller.scopes.scopes[0]?.plots.map((pl) => pl.value),
    ),
  ).toContain(7);
  expect(await dump()).not.toBe(before);

  // double-clicking the scope opens it again
  await page.mouse.dblclick(s.x, s.y);
  await expect(dialog).toBeVisible();
});

test('Scopes menu stacks and separates every scope', async ({ page }) => {
  await page.goto('/?startCircuit=lrc.txt');
  await ready(page);
  const positions = () =>
    page.evaluate(() => window.circuitjsNext?.controller.scopes.scopes.map((s) => s.position));
  expect(await positions()).toEqual([0, 1, 2]);
  await page.getByTestId('scopes-menu').click();
  await page.getByRole('menuitem', { name: 'Stack All', exact: true }).click();
  expect(await positions()).toEqual([0, 0, 0]);
  await page.getByTestId('scopes-menu').click();
  await page.getByRole('menuitem', { name: 'Combine All', exact: true }).click();
  expect(await scopeCount(page)).toBe(1);
  await page.getByTestId('scopes-menu').click();
  await page.getByTestId('scopes-separate-all').click();
  expect(await scopeCount(page)).toBe(3);
});

test('hovering an element shows its info', async ({ page }) => {
  await page.goto(`/?ctz=${compressCircuit(LOOP)}`);
  await ready(page);
  const p = await at(page, 176, 96);
  await page.mouse.move(p.x, p.y);
  await expect
    .poll(() => page.evaluate(() => window.circuitjsNext?.controller.infoLines() ?? []))
    .toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^resistor/),
        expect.stringMatching(/^I = 10 mA/),
      ]),
    );
});
