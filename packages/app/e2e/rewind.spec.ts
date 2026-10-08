// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Phase 20 rewind and scrub: drag back through the last seconds of the run, replay it, and carry
// on from the end or from an edit.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@circuitjs-next/format';

// a 5 V source charging 10 µF through 1 kΩ behind a switch, with a scope on the capacitor
const RC =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 112 368 112 48 0 0 40 5 0 0 0.5\n' +
  's 112 48 336 48 0 0 false\n' +
  'r 336 48 336 368 0 1000\n' +
  'c 336 368 112 368 0 0.00001 0 0.001\n' +
  'o 3 64 0 4099 5 0.05 0 2 3 3\n';

const open = async (page: Page): Promise<void> => {
  await page.goto(`/?ctz=${compressCircuit(RC)}`);
  await expect(page.getByTestId('circuit-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.circuitjsNext?.controller.history.length ?? 0) > 60);
};

const simTime = (page: Page): Promise<number> =>
  page.evaluate(() => window.circuitjsNext?.controller.circuit.sim.t ?? -1);
const capVolts = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const c = window.circuitjsNext?.controller.circuit;
    const cap = c?.elements.find((e) => e.getClassName() === 'CapacitorElm');
    return cap ? (cap.volts[0] ?? 0) - (cap.volts[1] ?? 0) : NaN;
  });
const running = async (page: Page): Promise<boolean> =>
  (await page.getByTestId('run-stop').getAttribute('aria-pressed')) === 'true';

test('dragging the timeline shows the past, Play replays it and the run carries on', async ({
  page,
}) => {
  await open(page);
  await page.getByTestId('rewind-toggle').click();
  const timeline = page.getByTestId('timeline');
  await expect(timeline).toBeVisible();
  await expect(timeline).toHaveAttribute('data-live', 'true');

  const liveT = await simTime(page);
  const liveV = await capVolts(page);
  // to the oldest frame kept: the run pauses there
  await page.getByRole('slider', { name: 'Time shown' }).focus();
  await page.keyboard.press('Home');
  await expect(timeline).toHaveAttribute('data-live', 'false');
  expect(await running(page)).toBe(false);
  const pastT = await simTime(page);
  expect(pastT).toBeLessThan(liveT);
  // the capacitor is charging, so it was lower then
  expect(await capVolts(page)).toBeLessThan(liveV);
  // the timeline and the bar show the same time, in the same fixed width
  const shown = await page.getByTestId('timeline-time').textContent();
  await expect(page.getByTestId('sim-time')).toHaveText(shown ?? '');
  await expect(page.getByTestId('run-stop')).toHaveAttribute('title', 'Replay');

  // a few steps forward with the keyboard, then replay to the end and on into the run
  const width = shown?.length;
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  expect((await page.getByTestId('timeline-time').textContent())?.length).toBe(width);
  expect(await simTime(page)).toBeGreaterThan(pastT);
  await page.getByTestId('timeline-play').click();
  expect(await running(page)).toBe(true);
  await expect(timeline).toHaveAttribute('data-live', 'true', { timeout: 15_000 });
  await expect.poll(() => simTime(page)).toBeGreaterThan(liveT);
});

test('Back to live returns to the run as it was; closing does too', async ({ page }) => {
  await open(page);
  await page.getByTestId('run-stop').click();
  await page.getByTestId('rewind-toggle').click();
  const liveT = await simTime(page);
  await page.getByRole('slider', { name: 'Time shown' }).focus();
  await page.keyboard.press('Home');
  expect(await simTime(page)).toBeLessThan(liveT);
  await page.getByTestId('timeline-live').click();
  await expect(page.getByTestId('timeline')).toHaveAttribute('data-live', 'true');
  expect(await simTime(page)).toBe(liveT);

  await page.getByRole('slider', { name: 'Time shown' }).focus();
  await page.keyboard.press('Home');
  expect(await simTime(page)).toBeLessThan(liveT);
  await page.getByTestId('timeline-close').click();
  await expect(page.getByTestId('timeline')).toHaveCount(0);
  expect(await simTime(page)).toBe(liveT);
});

test('an edit while rewound carries on from the frame shown', async ({ page }) => {
  await open(page);
  await page.getByTestId('rewind-toggle').click();
  await page.getByRole('slider', { name: 'Time shown' }).focus();
  await page.keyboard.press('Home');
  const pastT = await simTime(page);
  const pastV = await capVolts(page);
  // open the switch: the capacitor keeps the charge it had then
  await page.evaluate(() => {
    const ctl = window.circuitjsNext?.controller;
    const sw = ctl?.circuit.elements.find((e) => e.getClassName() === 'SwitchElm');
    if (ctl && sw) ctl.toggleSwitch(sw as never);
  });
  await expect(page.getByTestId('timeline')).toHaveAttribute('data-live', 'true');
  await page.getByTestId('run-stop').click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(pastT + 0.01);
  expect(await capVolts(page)).toBeCloseTo(pastV, 2);
});
