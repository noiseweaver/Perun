// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Phase 7 acceptance (success criterion 3): a theme shared as a file or a single URL applies for
// another user with no code changes. Also the editor, library and combined circuit links.

import { expect, test, type Page } from '@playwright/test';
import {
  BUILTIN_THEMES,
  encodeThemeParam,
  parseColor,
  resolveTheme,
  themeToJson,
  type Theme,
} from '@circuitjs-next/theme';

const RC =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 96 224 96 96 0 1 40 5 0 0 0.5\n' +
  'r 96 96 256 96 0 1000\n' +
  'c 256 96 256 224 0 0.000001 0\n' +
  'w 96 224 256 224 0\n';

const cct = (text: string): string => encodeURIComponent(text).replaceAll('%24', '$');

/** A theme someone made: Dark with a purple canvas and a gold accent. */
const SHARED: Theme = resolveTheme({
  schemaVersion: 1,
  meta: { name: 'Night Bench', author: 'gady', base: 'dark' },
  canvas: { background: '#2a1040' },
  ui: { accent: '#ffc857' },
});

const DARK = BUILTIN_THEMES['dark'] as Theme;

const rgbOf = (css: string): number[] => {
  const c = parseColor(css);
  return c ? [c.r, c.g, c.b] : [];
};

const pixel = (page: Page, x: number, y: number) =>
  page.getByTestId('circuit-canvas').evaluate(
    (c: HTMLCanvasElement, [x, y]) => {
      const dpr = c.width / c.clientWidth;
      const d = c.getContext('2d')?.getImageData(x * dpr, y * dpr, 1, 1).data;
      return d ? [d[0], d[1], d[2]] : null;
    },
    [x, y] as const,
  );

const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

async function themeMenu(page: Page): Promise<void> {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByTestId('options-menu').click();
  await page.getByTestId('menu-theme').click();
}

/**
 * Picks an item in Options > Theme. The submenu can close under the pointer while it is still
 * placing itself (the pointer crosses the parent menu on its way), so a miss reopens it and
 * tries again rather than waiting out the test timeout.
 */
async function pickFromThemeMenu(page: Page, testId: string): Promise<void> {
  await expect(async () => {
    while ((await page.getByRole('menu').count()) > 0) await page.keyboard.press('Escape');
    await themeMenu(page);
    await page.getByTestId(testId).click({ timeout: 3000 });
  }).toPass({ timeout: 20000 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase('circuitjs-next');
      req.onsuccess = req.onerror = req.onblocked = r;
    });
  });
});

test('every built-in theme applies', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}`);
  for (const [id, t] of Object.entries(BUILTIN_THEMES)) {
    await pickFromThemeMenu(page, `theme-${id}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', id);
    await expect.poll(() => pixel(page, 2, 2)).toEqual(rgbOf(t.canvas.background));
  }
});

test('a theme link previews the theme, and Apply keeps it', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}&theme=${await encodeThemeParam(SHARED)}`);
  await expect(page.getByTestId('theme-banner')).toContainText('Night Bench');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'preview');
  await expect.poll(() => pixel(page, 2, 2)).toEqual([0x2a, 0x10, 0x40]);
  expect(await cssVar(page, '--ui-accent')).toBe('#ffc857');

  // nothing is kept until the user says so
  await page.goto(`/?cct=${cct(RC)}`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.goto(`/?cct=${cct(RC)}&theme=${await encodeThemeParam(SHARED)}`);
  await page.getByTestId('theme-banner-apply').click();
  await expect(page.getByTestId('theme-banner')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', /^user:/);

  // applied themes survive a reload, from the first frame on
  await page.goto(`/?cct=${cct(RC)}`);
  await expect.poll(() => pixel(page, 2, 2)).toEqual([0x2a, 0x10, 0x40]);
  await themeMenu(page);
  await expect(page.getByTestId('theme-user-Night Bench')).toHaveAttribute('aria-checked', 'true');
});

test('Dismiss goes back and Save keeps the theme without switching', async ({ page }) => {
  const link = `/?cct=${cct(RC)}&theme=${await encodeThemeParam(SHARED)}`;
  await page.goto(link);
  await page.getByTestId('theme-banner-dismiss').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => pixel(page, 2, 2)).toEqual(rgbOf(DARK.canvas.background));

  await page.goto(link);
  await page.getByTestId('theme-banner-save').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await themeMenu(page);
  await expect(page.getByTestId('theme-user-Night Bench')).toBeVisible();
});

test('a damaged theme link says so and changes nothing', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}&theme=AAAA-not-a-theme`);
  await expect(page.getByTestId('load-error')).toContainText('theme');
  await expect(page.getByTestId('theme-banner')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('a theme only link opens the default circuit in the preview', async ({ page }) => {
  await page.goto(`/?theme=${await encodeThemeParam(SHARED)}`);
  await expect(page.getByTestId('theme-banner')).toBeVisible();
  await expect(page.getByTestId('circuit-title')).not.toHaveText('');
});

test('Export link can carry the theme with the circuit', async ({ page, context }) => {
  await page.goto(`/?cct=${cct(RC)}`);
  await pickFromThemeMenu(page, 'theme-high-contrast');
  await page.getByTestId('file-menu').click();
  await page.getByRole('menuitem', { name: /Export link/ }).click();
  await expect(page.getByTestId('link-here')).not.toHaveValue(/theme=/);
  await page.getByTestId('link-with-theme').check();
  await expect(page.getByTestId('link-here')).toHaveValue(/\?ctz=[^&]+&theme=/);
  await expect(page.getByTestId('link-upstream')).not.toHaveValue(/theme=/);
  const link = await page.getByTestId('link-here').inputValue();

  // someone else opens it: the circuit, with the sender's theme as a preview
  const other = await context.newPage();
  await other.goto(link);
  await expect(other.getByTestId('theme-banner')).toContainText('High Contrast');
  await expect.poll(() => pixel(other, 2, 2)).toEqual([0, 0, 0]);
  await expect
    .poll(() => other.evaluate(() => window.circuitjsNext?.controller.circuit.elements.length))
    .toBe(4);
});

test('theme files import and export', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}`);
  await page.getByTestId('theme-file-input').setInputFiles({
    name: 'night-bench.theme.json',
    mimeType: 'application/json',
    buffer: Buffer.from(themeToJson(SHARED)),
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', /^user:/);
  await expect.poll(() => pixel(page, 2, 2)).toEqual([0x2a, 0x10, 0x40]);

  await pickFromThemeMenu(page, 'menu-themes');
  const download = page.waitForEvent('download');
  await page.getByTestId('theme-row-Night Bench').getByTestId('theme-row-export').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('night-bench.theme.json');
  const text = await (await file.createReadStream()).toArray();
  expect(JSON.parse(Buffer.concat(text).toString())).toEqual(SHARED);
});

test('a file that is not a theme is refused with a reason', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}`);
  await page.getByTestId('theme-file-input').setInputFiles({
    name: 'evil.theme.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":1,"canvas":{"background":"url(javascript:alert(1))"}}'),
  });
  await expect(page.getByTestId('load-error')).toContainText('canvas.background');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the editor previews live, warns about contrast, and saves', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}`);
  await pickFromThemeMenu(page, 'menu-edit-theme');
  await expect(page.getByTestId('theme-preview')).toBeVisible();
  await expect(page.getByTestId('text-name')).toHaveValue('Custom Dark');
  await expect(page.getByTestId('theme-contrast')).toContainText('enough contrast');

  // the sample circuit is drawn in the draft
  const sample = () =>
    page.getByTestId('theme-preview').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')?.getImageData(4, 4, 1, 1).data;
      return d ? [d[0], d[1], d[2]] : null;
    });
  await page.getByTestId('color-canvas.background').fill('#0a3d2a');
  await expect.poll(sample).toEqual([0x0a, 0x3d, 0x2a]);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'preview');

  await page.getByTestId('color-circuit.text').fill('#0b3e2b');
  await expect(page.getByTestId('warning-circuit.text')).toContainText('needs 4.5:1');
  await expect(page.getByTestId('theme-contrast')).toContainText('Values');

  // an invalid color is pointed out and not applied
  await page.getByTestId('color-ui.accent').fill('url(x)');
  await expect(page.getByTestId('field-ui.accent')).toContainText('Use hex');
  expect(await cssVar(page, '--ui-accent')).toBe(DARK.ui.accent);

  await page.getByTestId('text-name').fill('Forest');
  await page.getByTestId('theme-editor-save').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', /^user:/);
  await page.reload();
  await expect.poll(() => pixel(page, 2, 2)).toEqual([0x0a, 0x3d, 0x2a]);
  await themeMenu(page);
  await expect(page.getByTestId('theme-user-Forest')).toHaveAttribute('aria-checked', 'true');
});

test('Cancel in the editor puts the theme back', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}`);
  await pickFromThemeMenu(page, 'menu-edit-theme');
  await page.getByTestId('color-canvas.background').fill('#ff0000');
  await expect.poll(() => pixel(page, 2, 2)).toEqual([255, 0, 0]);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => pixel(page, 2, 2)).toEqual(rgbOf(DARK.canvas.background));
});

test('the library edits and deletes saved themes', async ({ page }) => {
  await page.goto(`/?cct=${cct(RC)}&theme=${await encodeThemeParam(SHARED)}`);
  await page.getByTestId('theme-banner-apply').click();
  await pickFromThemeMenu(page, 'menu-themes');
  const row = page.getByTestId('theme-row-Night Bench');
  await row.getByTestId('theme-row-edit').click();
  await expect(page.getByTestId('text-name')).toHaveValue('Night Bench');
  await page.getByTestId('text-name').fill('Night Bench 2');
  await page.getByTestId('theme-editor-save').click();

  await pickFromThemeMenu(page, 'menu-themes');
  // edited in place, not added
  await expect(page.getByTestId('theme-row-Night Bench')).toHaveCount(0);
  const edited = page.getByTestId('theme-row-Night Bench 2');
  await edited.getByTestId('theme-row-delete').click();
  await edited.getByTestId('theme-row-delete-confirm').click();
  await expect(edited).toHaveCount(0);
  // deleting the theme in use falls back to the default
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
