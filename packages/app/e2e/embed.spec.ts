// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// The app in a host page's frame (the Obsidian plugin's circuit editor, packages/obsidian): it
// opens the host's circuit, sends edits back and takes the host's theme. Here the page is its own
// host: window.parent is the window itself.

import { expect, test } from '@playwright/test';

const CIRCUIT = [
  '$ 1 0.000005 10.2 50 5 50 5e-11',
  'r 96 112 240 112 0 220',
  'w 96 112 96 240 0',
  'w 240 112 240 240 0',
  'v 96 240 240 240 0 0 40 5 0 0 0.5',
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.addInitScript((text) => {
    const w = window as Window & { perunEmbed?: unknown; posted?: unknown[] };
    w.perunEmbed = {
      text,
      title: 'Divider',
      themeId: 'obsidian-light',
      siteUrl: 'https://noiseweaver.github.io/Perun/',
      storage: {},
    };
    w.posted = [];
    window.addEventListener('message', (e) => w.posted?.push(e.data));
  }, CIRCUIT);
});

test("opens the host's circuit in the host's theme", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('circuit-title')).toHaveText('Divider');
  expect(await page.evaluate(() => window.perun?.controller.circuit.elements.length)).toBe(4);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'obsidian-light');
  // the host owns the file: no update banner, no last circuit kept by the app
  await expect(page.getByTestId('updated-banner')).toHaveCount(0);
});

test('sends the circuit back after an edit, not while it runs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('circuit-title')).toHaveText('Divider');
  await page.waitForTimeout(1000);
  const changed = () =>
    page.evaluate(() =>
      ((window as Window & { posted?: { perun?: string; text?: string }[] }).posted ?? []).filter(
        (m) => m?.perun === 'changed',
      ),
    );
  expect(await changed()).toEqual([]);
  await page.evaluate(() => window.perun?.controller.newCircuit());
  await expect.poll(async () => (await changed()).length).toBe(1);
  expect((await changed())[0]?.text).toContain('<cir');
});

test('follows the host: a new circuit and a new theme', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('circuit-title')).toHaveText('Divider');
  await page.evaluate(() => {
    window.postMessage({ perun: 'load', text: '$ 1 5.0E-6 10 50 5.0\n', title: 'Empty' }, '*');
    window.postMessage({ perun: 'theme', themeId: 'obsidian-dark' }, '*');
  });
  await expect(page.getByTestId('circuit-title')).toHaveText('Empty');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'obsidian-dark');
});
