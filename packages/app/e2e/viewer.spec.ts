// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Phase 4 acceptance: upstream links using tier-1 elements load and animate, and switching Classic
// and Dark at runtime restyles everything without a reload.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@circuitjs-next/format';

const RC =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 96 224 96 96 0 1 40 5 0 0 0.5\n' +
  'r 96 96 256 96 0 1000\n' +
  'c 256 96 256 224 0 0.000001 0\n' +
  'w 96 224 256 224 0\n';

const SWITCHED =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 96 224 96 96 0 0 40 5 0 0 0.5\n' +
  's 96 96 256 96 0 1 false\n' +
  'r 256 96 256 224 0 1000\n' +
  'w 96 224 256 224 0\n';

/** tools/golden/circuits/convergence-fail.txt: stops with "Convergence failed!" at 5 ms. */
const FAILS =
  '$ 1 5.0E-6 10 50 5.0 50 5.0E-11\n' +
  'R 400 96 400 64 0 2 50.0 50000.0 50000.0 4.71238898038469 0.5\n' +
  'r 400 96 400 288 0 1000.0\n' +
  'f 288 304 400 304 0 1.5 2.0\n' +
  'g 400 320 400 352 0\n' +
  'g 288 304 288 352 0\n';

/** `cct=` the way upstream's export link writes it. */
const cct = (text: string): string => encodeURIComponent(text).replaceAll('%24', '$');

const simTime = async (page: Page): Promise<string> =>
  (await page.getByTestId('sim-time').textContent()) ?? '';

/** RGBA of one canvas pixel (CSS px). */
const pixel = (page: Page, x: number, y: number) =>
  page.getByTestId('circuit-canvas').evaluate(
    (c: HTMLCanvasElement, [x, y]) => {
      const dpr = c.width / c.clientWidth;
      const d = c.getContext('2d')?.getImageData(x * dpr, y * dpr, 1, 1).data;
      return d ? [d[0], d[1], d[2]] : null;
    },
    [x, y] as const,
  );

/** A digest of the whole canvas, to tell frames apart. */
const canvasHash = (page: Page) =>
  page.getByTestId('circuit-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data ?? [];
    let h = 0;
    for (let i = 0; i < d.length; i += 7) h = (h * 31 + (d[i] ?? 0)) | 0;
    return h;
  });

test('the default example loads and animates', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('circuit-title')).toHaveText('LRC Circuit');
  await expect(page.getByTestId('circuits-menu')).toBeEnabled();
  const t0 = await simTime(page);
  const h0 = await canvasHash(page);
  await expect.poll(() => simTime(page)).not.toBe(t0);
  await expect.poll(() => canvasHash(page)).not.toBe(h0);
});

test('cct and ctz links load', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}`);
  await expect(page.getByTestId('load-error')).toHaveCount(0);
  const kinds = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          circuitjsNext: { controller: { circuit: { elements: object[] } } };
        }
      ).circuitjsNext.controller.circuit.elements.map((e) => e.constructor.name),
    );
  await expect.poll(kinds).toEqual(['VoltageElm', 'ResistorElm', 'CapacitorElm', 'WireElm']);
  await expect.poll(() => simTime(page)).not.toBe('t = 0 s');

  await page.goto(`/?ctz=${compressCircuit(SWITCHED)}&running=false`);
  await expect.poll(kinds).toEqual(['VoltageElm', 'SwitchElm', 'ResistorElm', 'WireElm']);
  await expect(page.getByTestId('run-stop')).toHaveText(/Run/);
});

test('startCircuit opens an example', async ({ page }) => {
  await page.goto('/?startCircuit=ohms.txt');
  await expect(page.getByTestId('circuit-title')).toHaveText(/Ohm/);
});

test('Classic and Dark restyle the canvas and UI without a reload', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}`);
  await expect(page.getByTestId('circuit-title')).toBeVisible();
  const marker = await page.evaluate(() => {
    (window as unknown as { marker: number }).marker = 42;
    return 42;
  });
  const surface = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ui-surface'),
    );
  const pick = async (id: string) => {
    await page.getByTestId('options-menu').click();
    await page.getByTestId(`theme-${id}`).click();
  };

  await pick('classic');
  await expect.poll(() => pixel(page, 2, 2)).toEqual([0, 0, 0]);
  const classicSurface = await surface();

  await pick('dark');
  await expect.poll(() => pixel(page, 2, 2)).not.toEqual([0, 0, 0]);
  expect(await surface()).not.toBe(classicSurface);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await pick('classic');
  await expect.poll(() => pixel(page, 2, 2)).toEqual([0, 0, 0]);
  expect(await page.evaluate(() => (window as unknown as { marker: number }).marker)).toBe(marker);
});

test('Dark is the default theme, including for settings saved before it was', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // version 1 settings always held a theme, Classic by default; only the other settings carry over
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      'circuitjs-next.settings',
      JSON.stringify({ themeId: 'classic', showOhm: true }),
    );
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByTestId('options-menu').click();
  await expect(page.getByRole('menuitemcheckbox', { name: /Show Ω/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('run/stop pauses and reset restarts time', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}`);
  await expect.poll(() => simTime(page)).not.toBe('t = 0 s');
  await page.getByTestId('run-stop').click();
  await page.waitForTimeout(300); // the status bar updates every 100 ms
  const paused = await simTime(page);
  await page.waitForTimeout(300);
  expect(await simTime(page)).toBe(paused);
  await page.getByTestId('reset').click();
  await expect.poll(() => simTime(page)).toBe('t = 0 s');
});

test('clicking a switch toggles it', async ({ page }) => {
  await page.goto(`/?cct=${cct(SWITCHED)}&running=false`);
  type Ctl = {
    circuit: { elements: { position?: number }[] };
    elementCenter(e: object): { x: number; y: number } | null;
  };
  const state = () =>
    page.evaluate(() => {
      const c = (window as unknown as { circuitjsNext: { controller: Ctl } }).circuitjsNext
        .controller;
      const sw = c.circuit.elements[1];
      return sw ? { position: sw.position, at: c.elementCenter(sw) } : null;
    });
  await expect.poll(async () => (await state())?.position).toBe(1);
  const at = (await state())?.at;
  expect(at).toBeTruthy();
  if (!at) return;
  await page.getByTestId('circuit-canvas').click({ position: at });
  await expect.poll(async () => (await state())?.position).toBe(0);
});

test('open link dialog loads a circuit', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}`);
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Open link…' }).click();
  await page
    .getByTestId('link-input')
    .fill(`http://localhost:5173/?ctz=${compressCircuit(SWITCHED)}`);
  await page.getByTestId('link-open').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              circuitjsNext: { controller: { circuit: { elements: object[] } } };
            }
          ).circuitjsNext.controller.circuit.elements.length,
      ),
    )
    .toBe(4);
});

test('a convergence failure stops the simulation with a message', async ({ page }) => {
  await page.goto(`/?cct=${cct(FAILS)}`);
  await expect(page.getByTestId('stop-message')).toHaveText(/Convergence failed/, {
    timeout: 15_000,
  });
  await expect(page.getByTestId('run-stop')).toHaveText(/Run/);
});

/** A diode straight across a 5 V source: upstream stops with "max current exceeded". */
const SHORTED_DIODE =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 96 224 96 96 0 0 40 5 0 0 0.5\n' +
  'w 96 96 224 96 0\n' +
  'w 96 224 224 224 0\n' +
  'd 224 96 224 224 2 default\n';

test('a stop from an element leaves the canvas drawing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?cct=${cct(SHORTED_DIODE)}`);
  await expect(page.getByTestId('stop-message')).toHaveText(/max current exceeded/, {
    timeout: 15_000,
  });
  // the frame loop survived the stop: a theme change still repaints the canvas
  const before = await canvasHash(page);
  await page.getByTestId('options-menu').click();
  await page.getByTestId('theme-classic').click();
  await expect.poll(() => canvasHash(page)).not.toBe(before);
  expect(errors).toEqual([]);
});

/** Three ends meeting at (256, 96) and at (256, 224). */
const TEE =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 96 224 96 96 0 0 40 5 0 0 0.5\n' +
  'w 96 96 256 96 0\n' +
  'r 256 96 416 96 0 1000\n' +
  'r 256 96 256 224 0 1000\n' +
  'w 416 96 416 224 0\n' +
  'w 96 224 256 224 0\n' +
  'w 256 224 416 224 0\n';

test('Junction dots marks every point where ends meet', async ({ page }) => {
  await page.goto(`/?cct=${cct(TEE)}`);
  await expect(page.getByTestId('circuit-title')).toBeVisible();
  await page.getByTestId('run-stop').click();
  await expect(page.getByTestId('run-stop')).toHaveText(/Run/);
  const off = await canvasHash(page);
  await page.getByTestId('options-menu').click();
  await page.getByTestId('menu-junction-dots').click();
  await expect.poll(() => canvasHash(page)).not.toBe(off);
  await page.getByTestId('options-menu').click();
  await page.getByTestId('menu-junction-dots').click();
  await expect.poll(() => canvasHash(page)).toBe(off);
});

test('the community dark themes apply', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}`);
  for (const id of ['nord', 'solarized-dark', 'gruvbox-dark', 'adwaita-dark']) {
    await page.getByTestId('options-menu').click();
    await page.getByTestId(`theme-${id}`).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', id);
  }
});

test('the time readout does not move as digits change', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}`);
  const readout = page.getByTestId('sim-time');
  const boxes = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const b = await readout.boundingBox();
    if (b) boxes.add(`${Math.round(b.x)},${Math.round(b.width)}`);
    await page.waitForTimeout(250);
  }
  expect(boxes.size).toBe(1);
});
