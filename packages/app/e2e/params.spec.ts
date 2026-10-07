// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Phase 15 (circuit temperature) and Phase 16 (parameters, and subcircuit copies with their own
// values).

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

/** 1 mA into a diode. */
const DIODE =
  '$ 1 0.000005 10.2 50 5 50 5e-11\n' +
  'i 96 96 96 192 0 0.001\n' +
  'd 96 192 96 288 2 spice-default\n' +
  'w 96 96 96 64 0\nw 96 64 96 288 0\n' +
  'g 96 288 96 320 0\n';

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

const diodeDrop = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const d = window.circuitjsNext?.controller.circuit.elements.find(
      (e) => e.getClassName() === 'DiodeElm',
    );
    return d ? Math.abs(d.volts[0] - d.volts[1]) : NaN;
  });

test('the circuit temperature moves a diode drop, shows in the bottom bar, and undoes', async ({
  page,
}) => {
  await open(page, DIODE);
  await expect(page.getByTestId('sim-temperature-readout')).toHaveCount(0);
  await expect.poll(() => diodeDrop(page)).toBeGreaterThan(0.6);
  const cold = await diodeDrop(page);

  await page.getByTestId('time-step').click();
  const field = page.getByTestId('sim-temperature');
  await expect(field).toHaveValue('27');
  await field.fill('hot');
  await expect(page.getByTestId('sim-settings-ok')).toBeDisabled();
  await field.fill('127');
  await page.getByTestId('sim-settings-ok').click();

  // fixed width: sign, three digits and a decimal
  await expect(page.getByTestId('sim-temperature-readout')).toHaveText('T =  127.0 °C');
  // about 2 mV less per degree
  await expect.poll(() => diodeDrop(page)).toBeLessThan(cold - 0.15);
  expect(await page.evaluate(() => window.circuitjsNext?.controller.saveText())).toContain(
    'temp="127"',
  );

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('sim-temperature-readout')).toHaveCount(0);
  await expect.poll(() => diodeDrop(page)).toBeCloseTo(cold, 3);
});

test('a parameter binds a part value, and each subcircuit copy sets its own', async ({ page }) => {
  await open(page, DIVIDER);

  // File > Parameters: RB = 2k
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-params').click();
  await page.getByTestId('param-add').click();
  await page.getByTestId('param-name-0').fill('RB');
  await page.getByTestId('param-value-0').fill('2k');
  await page.getByTestId('params-ok').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // the lower resistor follows {RB}
  const r = await at(page, 96, 256);
  await page.mouse.click(r.x, r.y);
  const value = page.getByTestId('field-0');
  await value.fill('{RB*}');
  await value.press('Enter');
  await expect(page.getByTestId('field-0-bind-error')).toHaveText('expression ends early');
  await value.fill('{RB}');
  await value.press('Enter');
  await expect(page.getByTestId('field-0-bound')).toContainText('2');
  const lower = () =>
    page.evaluate(() => {
      const rs = window.circuitjsNext?.controller.circuit.elements.filter(
        (e) => e.getClassName() === 'ResistorElm',
      );
      return (rs?.[1] as unknown as { resistance: number } | undefined)?.resistance ?? NaN;
    });
  expect(await lower()).toBe(2000);
  await page.keyboard.press('Escape');

  // changing the parameter changes the part
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-params').click();
  await page.getByTestId('param-value-0').fill('1k');
  await page.getByTestId('params-ok').click();
  await expect.poll(lower).toBe(1000);

  // a subcircuit made from it has RB, and a placed copy sets it
  // (with nothing selected, so the whole circuit)
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inspector-title')).toHaveCount(0);
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-create-subcircuit').click();
  await page.getByTestId('subcircuit-name').fill('pdiv');
  await page.getByTestId('subcircuit-ok').click();
  await page.getByTestId('palette-CustomCompositeElm:pdiv').click();
  const a = await at(page, -128, 160);
  const b = await at(page, -64, 160);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('Escape');

  const inner = () =>
    page.evaluate(() => {
      const cc = window.circuitjsNext?.controller.circuit.elements.find(
        (e) => e.getClassName() === 'CustomCompositeElm',
      ) as unknown as { compElmList: { resistance?: number }[] } | undefined;
      return cc?.compElmList.map((e) => e.resistance ?? null).filter((v) => v !== null) ?? [];
    });
  await expect.poll(inner).toEqual([1000, 1000]);
  const mid = await page.evaluate(() => {
    const e = window.circuitjsNext?.controller.circuit.elements.find(
      (x) => x.getClassName() === 'CustomCompositeElm',
    );
    if (!e) return null;
    const p = (e as unknown as { chip: { rectPoints: { x: number; y: number }[] } }).chip
      .rectPoints;
    return [(p[0].x + p[2].x) / 2, (p[0].y + p[2].y) / 2] as const;
  });
  if (mid === null) throw new Error('not placed');
  const m = await at(page, mid[0], mid[1]);
  await page.mouse.click(m.x, m.y);
  const rb = page.getByLabel('RB', { exact: true });
  await rb.fill('4.7k');
  await rb.press('Enter');
  await expect.poll(inner).toEqual([1000, 4700]);
  const saved = await page.evaluate(() => window.circuitjsNext?.controller.saveText() ?? '');
  expect(saved).toContain('pv="RB=4700"');
  expect(saved).toContain('prm="RB=1000"');

  // editing the model shows its parameters at their defaults
  await page.getByRole('button', { name: 'Edit Model' }).click();
  await expect(page.getByTestId('subcircuit-editing')).toHaveText('Editing: pdiv');
  await page.getByTestId('subcircuit-params').click();
  await expect(page.getByRole('dialog')).toContainText('Parameters of pdiv');
  await expect(page.getByTestId('param-name-0')).toHaveValue('RB');
  await expect(page.getByTestId('param-value-0')).toHaveValue('1k');
});

test('the sweep dialog steps the circuit temperature', async ({ page }) => {
  await open(page, DIODE);
  await page.getByTestId('scopes-menu').click();
  await page.getByTestId('scopes-sweep').click();
  await expect(page.getByTestId('sweep-dialog')).toBeVisible();
  await page.getByTestId('sweep-part').selectOption('-2');
  await expect(page.getByTestId('sweep-values')).toHaveValue('-20, 27, 85');
  const diode = await page.evaluate(
    () =>
      window.circuitjsNext?.controller.circuit.elements.findIndex(
        (e) => e.getClassName() === 'DiodeElm',
      ) ?? -1,
  );
  await page.getByTestId('sweep-output').selectOption(String(diode));
  await page.getByTestId('sweep-duration').fill('1ms');
  await page.getByTestId('sweep-run').click();
  await expect(page.getByTestId('sweep-status')).toContainText('3/3', { timeout: 30000 });
  const runs = page.getByTestId('sweep-run-row');
  await expect(runs).toHaveCount(3);
  await expect(runs.nth(0)).toContainText('-20 °C');
  await expect(runs.nth(2)).toContainText('85 °C');
  // the circuit itself stays at 27 °C
  expect(await page.evaluate(() => window.circuitjsNext?.controller.circuit.sim.temperature)).toBe(
    27,
  );
});

/** 10 V across 100 Ω: 1 W. */
const HEATER =
  '$ 1 0.000005 10.2 50 5 50 5e-11\n' +
  'v 96 320 96 96 0 0 40.0 10.0 0.0 0.0 0.5\n' +
  'r 96 96 256 96 0 100\n' +
  'w 256 96 256 320 0\n' +
  'w 256 320 96 320 0\n' +
  'g 96 320 96 352 0\n';

test('self-heating warms a resistor live, with its heat path in its properties', async ({
  page,
}) => {
  await open(page, HEATER);
  await page.getByTestId('time-step').click();
  await page.getByTestId('sim-ramp').check();
  await page.getByTestId('sim-ramp-to').fill('40');
  await page.getByTestId('sim-ramp-over').fill('1');
  await page.getByTestId('sim-self-heating').check();
  await page.getByTestId('sim-settings-ok').click();
  // the ambient readout shows even while it is still near 27 °C
  await expect(page.getByTestId('sim-temperature-readout')).toHaveText(/^T = {2}\s?\d\d\.\d °C$/);
  const saved = await page.evaluate(() => window.circuitjsNext?.controller.saveText() ?? '');
  expect(saved).toContain('heat="1"');
  expect(saved).toContain('tramp="40 1"');

  const r = await at(page, 176, 96);
  await page.mouse.click(r.x, r.y);
  await expect(page.getByTestId('inspector-title')).toHaveText('Resistor');
  // a fixed-width readout: sign, four digits and a decimal
  const temp = page.getByTestId('live-t');
  await expect(temp).toHaveText(/^ {0,3}-?\d+\.\d °C$/);
  expect(((await temp.textContent()) ?? '').length).toBe(9);
  await expect.poll(async () => parseFloat((await temp.textContent()) ?? '0')).toBeGreaterThan(30);

  // a big heatsink: the resistor cools back to near ambient
  const rth = page.getByTestId('field-100');
  await expect(rth).toHaveValue('250');
  await rth.fill('1');
  await rth.press('Enter');
  await expect.poll(async () => parseFloat((await temp.textContent()) ?? '99')).toBeLessThan(30);
  expect(await page.evaluate(() => window.circuitjsNext?.controller.saveText())).toContain(
    'rth="1"',
  );
  // a parameter can't drive it
  await rth.fill('{R}');
  await rth.press('Enter');
  await expect(page.getByText('Not a number. Try 4.7k, 100n or 2k2.')).toBeVisible();
});

test('Options > Visualizations > Heat shows a legend entry and saves nothing', async ({ page }) => {
  await open(page, HEATER);
  const before = await page.evaluate(() => window.circuitjsNext?.controller.saveText() ?? '');
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByTestId('menu-visualizations').click();
  // a click moves the mouse across the parent menu, which can close the submenu on a slow runner
  const item = page.getByTestId('menu-vis-heat');
  await expect(item).toBeVisible();
  await item.dispatchEvent('click');
  await expect
    .poll(() => page.evaluate(() => window.circuitjsNext?.controller.lastFrameState?.fields.heat))
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('field-legend')).toContainText('Warmer than ambient');
  // display only: the circuit is unchanged
  expect(await page.evaluate(() => window.circuitjsNext?.controller.saveText())).toBe(before);
});

test('a temperature sweep of the matched-pair VCO reads its frequency and pitch', async ({
  page,
}) => {
  // Phase 18: one of this port's own examples, swept over temperature
  await page.goto('/?startCircuit=vco-expo-pair.txt');
  await expect(page.getByTestId('circuit-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.circuitjsNext?.controller.frames ?? 0) > 2);
  await page.getByTestId('scopes-menu').click();
  await page.getByTestId('scopes-sweep').click();
  await page.getByTestId('sweep-part').selectOption('-2');
  await page.getByTestId('sweep-values').fill('27, 60');
  const cap = await page.evaluate(
    () =>
      window.circuitjsNext?.controller.circuit.elements.findIndex(
        (e) => e.getClassName() === 'CapacitorElm',
      ) ?? -1,
  );
  await page.getByTestId('sweep-output').selectOption(String(cap));
  await page.getByTestId('sweep-duration').fill('30ms');
  await page.getByTestId('sweep-run').click();
  await expect(page.getByTestId('sweep-status')).toContainText('2/2', { timeout: 120000 });

  const rows = page.getByTestId('sweep-frequency-row');
  await expect(rows).toHaveCount(2);
  // about 960 Hz at 27 °C, and the run at 60 °C is the reference's frequency plus a third
  await expect(rows.nth(0)).toContainText('Hz');
  await expect(rows.nth(0)).toContainText('ref');
  await expect(rows.nth(1)).toContainText('+4');
  await expect(page.getByTestId('sweep-drift')).toContainText('ppm/°C');

  await page.getByTestId('sweep-frequency-view-pitch').click();
  // 959 Hz is just under halfway from A#5 (932.33 Hz) to B5
  await expect(rows.nth(0)).toContainText('A#5');
  await expect(page.getByTestId('sweep-drift')).toContainText('¢/°C');
});
