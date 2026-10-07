// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Phase 9 accessibility pass: axe finds no WCAG 2.2 A or AA problems in the main views, dialogs
// and every built-in theme, and the circuit can be worked from the keyboard.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BUILTIN_THEMES } from '@circuitjs-next/theme';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const ready = async (page: Page, query = ''): Promise<void> => {
  await page.goto(`/${query}`);
  await expect(page.getByTestId('circuit-title')).not.toHaveText('');
  await page.waitForFunction(() => (window.circuitjsNext?.controller.frames ?? 0) > 2);
};

const violations = async (page: Page): Promise<string[]> => {
  // axe measures contrast mid fade-in on a slow runner (a dialog opening, a menu): wait until
  // nothing but endless animations is still running
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity,
      ),
  );
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
};

test('the main view, property panel and sliders have no axe violations', async ({ page }) => {
  await ready(page);
  expect(await violations(page)).toEqual([]);
  await page.evaluate(() => {
    const c = window.circuitjsNext?.controller;
    const e = c?.circuit.elements[1];
    if (c && e) c.editor.select(e);
  });
  const inspector = page.getByTestId('inspector');
  await expect(inspector).toBeVisible();
  // axe measures contrast mid fade-in on a slow runner: let the panel finish arriving
  await expect
    .poll(() =>
      inspector.evaluate(
        (e) =>
          document
            .getAnimations()
            .filter(
              (a) => a.effect instanceof KeyframeEffect && e.contains(a.effect.target as Node),
            ).length,
      ),
    )
    .toBe(0);
  expect(await violations(page)).toEqual([]);
});

test('every built-in theme passes in the main view', async ({ page }) => {
  test.setTimeout(180_000);
  // no transitions: axe would otherwise sometimes catch a button halfway between the previous
  // theme's colors and this one's (Catppuccin Mocha to Latte failed that way in CI)
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.evaluate(() => window.circuitjsNext?.controller.setRunning(false));
  for (const id of Object.keys(BUILTIN_THEMES)) {
    await page.getByTestId('options-menu').click();
    await page.getByTestId('menu-theme').click();
    await page.getByTestId(`theme-${id}`).click();
    expect(await violations(page), id).toEqual([]);
  }
});

test('dialogs have no axe violations', async ({ page }) => {
  await ready(page);
  for (const item of ['menu-about', 'menu-save', 'menu-export-link']) {
    await page.getByTestId('file-menu').click();
    await page.getByTestId(item).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await violations(page), item).toEqual([]);
    await page.keyboard.press('Escape');
  }
  await page.getByTestId('options-menu').click();
  await page.getByTestId('menu-theme').click();
  await page.getByTestId('menu-themes').click();
  expect(await violations(page), 'themes').toEqual([]);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const c = window.circuitjsNext?.controller;
    const e = c?.circuit.elements[1];
    if (c && e) c.openSliderDialog(e);
  });
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await violations(page), 'sliders').toEqual([]);
});

test('an open menu has no axe violations', async ({ page }) => {
  await ready(page);
  await page.getByTestId('file-menu').click();
  await expect(page.getByRole('menu')).toBeVisible();
  // Radix hides the rest of the page from screen readers while a menu is open and keeps focus
  // in the menu, which axe can't tell from a page that hides focusable content by mistake
  const r = await new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules(['aria-hidden-focus'])
    .analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});

test('a phone layout has no axe violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  expect(await violations(page)).toEqual([]);
});

test('the circuit can be worked from the keyboard', async ({ page }) => {
  await ready(page);
  const canvas = page.getByTestId('circuit-canvas');
  await expect(canvas).toHaveAttribute('aria-label', /^Circuit: /);
  await canvas.focus();
  const count = await page.evaluate(() => window.circuitjsNext?.controller.circuit.elements.length);
  await page.keyboard.press(']');
  await expect(page.getByTestId('announcer')).toHaveText(new RegExp(`1 of ${count}\\.$`));
  await page.keyboard.press(']');
  await expect(page.getByTestId('announcer')).toHaveText(new RegExp(`2 of ${count}\\.$`));
  await page.keyboard.press('[');
  await expect(page.getByTestId('announcer')).toHaveText(new RegExp(`1 of ${count}\\.$`));
  const selected = () =>
    page.evaluate(() => window.circuitjsNext?.controller.editor.selectedElements().length);
  expect(await selected()).toBe(1);
  // the element menu opens on it, and Escape closes it again
  await page.keyboard.press('Shift+F10');
  await expect(page.getByTestId('context-menu')).toBeVisible();
  await expect(page.getByTestId('ctx-delete')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('context-menu')).toBeHidden();
});
