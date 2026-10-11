// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// Formula boxes (not in upstream, docs/deviations/formula-boxes.md): LaTeX on the canvas with
// live values of linked parts.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@perun/format';

/** 9 V across 1 kΩ, with a formula box showing the resistor's current. */
const CIRCUIT = `<cir f="1" ts="0.000005" ic="10" cb="50" pb="50" vr="5" mts="5e-11">
  <v x="160 352 160 160" f="0" wf="0" maxv="9"/>
  <r x="160 160 352 160" f="0" r="1000"/>
  <w x="352 160 352 352" f="0"/>
  <w x="160 352 352 352" f="0"/>
  <x x="480 150 480 150" f="0" si="20" te="I = \\\\frac{V}{R} = \\\\I" tex="1" tl="1"/>
</cir>`;

const open = async (page: Page, text: string): Promise<void> => {
  await page.goto(`/?ctz=${compressCircuit(text)}`);
  await expect(page.getByTestId('circuit-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.perun?.controller.frames ?? 0) > 2);
};

const at = async (page: Page, x: number, y: number): Promise<{ x: number; y: number }> => {
  const box = await page.getByTestId('circuit-canvas').boundingBox();
  const p = await page.evaluate(([x, y]) => window.perun?.controller.toScreen(x, y) ?? null, [
    x,
    y,
  ] as const);
  if (!box || !p) throw new Error('no canvas');
  return { x: box.x + p.x, y: box.y + p.y };
};

const formulaText = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const e = window.perun?.controller.circuit.elements.at(-1);
    return e !== undefined && 'formula' in e ? String(e.formula) : null;
  });

test('a formula box typesets, links a part and previews edits as they are typed', async ({
  page,
}) => {
  const mathjax = page.waitForRequest(/mathjax/);
  await open(page, CIRCUIT);
  await mathjax;

  const f = await at(page, 500, 145);
  await page.mouse.dblclick(f.x, f.y);
  await expect(page.getByTestId('inspector-title')).toHaveText('Formula');
  const field = page.getByTestId('field-0');
  await expect(field).toHaveValue('I = \\frac{V}{R} = \\I');
  await expect(page.getByTestId('formula-links')).toContainText('Resistor');

  // the canvas follows the typing; leaving the field makes it one undo step
  await field.fill('P = \\P');
  await expect.poll(() => formulaText(page)).toBe('P = \\P');
  await field.blur();
  await page.getByTestId('circuit-canvas').focus();
  await page.keyboard.press('Control+z');
  await expect.poll(() => formulaText(page)).toBe('I = \\frac{V}{R} = \\I');
});

test('the palette places a formula box that saves as a text box', async ({ page }) => {
  await open(page, '$ 1 5.0E-6 10 50 5.0\n');
  const item = page.getByTestId('palette-FormulaElm');
  await item.scrollIntoViewIfNeeded();
  await item.click();
  const a = await at(page, 200, 200);
  const b = await at(page, 240, 200);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => formulaText(page)).toBe('I = \\frac{V}{R}');
  const xml = await page.evaluate(() => window.perun?.controller.circuit.dumpXml() ?? '');
  expect(xml).toMatch(/<x [^>]*te="I = \\\\frac\{V\}\{R\}"[^>]*tex="1"/);
});
