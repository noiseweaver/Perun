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
      for (let i = 0; i < d.length; i += 4)
        seen.add(((d[i] ?? 0) << 16) | ((d[i + 1] ?? 0) << 8) | (d[i + 2] ?? 0));
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

/**
 * Page coordinates of the centre of a clickable part of scope `i`'s card (negative i: undocked
 * scope -i - 1).
 */
const cardPart = async (page: Page, i: number, kind: string, index = 0) => {
  const box = await page.getByTestId('circuit-canvas').boundingBox();
  const h = await page.evaluate(
    ([i, kind, index]) => {
      const c = window.circuitjsNext?.controller;
      const n = i as number;
      const s = n >= 0 ? c?.scopes.scopes[n] : c?.circuit.scopeElms()[-n - 1]?.elmScope;
      if (!c || !s) return null;
      // scan the card for the part (hit regions are recorded as the card is drawn)
      for (let y = s.slot.y; y < s.slot.y + s.slot.height; y += 2)
        for (let x = s.slot.x; x < s.slot.x + s.slot.width; x += 2) {
          const hit = c.cardHit(s, x, y);
          if (hit !== null && hit.kind === kind && hit.index === index)
            return { x: hit.x + hit.width / 2, y: hit.y + hit.height / 2 };
        }
      return null;
    },
    [i, kind, index] as const,
  );
  if (!box || !h) throw new Error(`no ${kind} on scope ${i}`);
  return { x: box.x + h.x, y: box.y + h.y };
};

test.describe('the card look', () => {
  test('cards have settings and close buttons, and legend chips that hide a trace', async ({
    page,
  }) => {
    await page.goto('/?startCircuit=lrc.txt');
    await ready(page);
    expect(await page.evaluate(() => window.circuitjsNext?.controller.scopes.look)).toBe('cards');

    // the current chip hides the current trace and shows it again
    const showI = () =>
      page.evaluate(() => window.circuitjsNext?.controller.scopes.scopes[0]?.showI);
    expect(await showI()).toBe(true);
    const chip = await cardPart(page, 0, 'chip', 1);
    await page.mouse.click(chip.x, chip.y);
    expect(await showI()).toBe(false);
    // the chips move as values come and go; and two quick clicks would be a double click
    await page.waitForTimeout(600);
    const again = await cardPart(page, 0, 'chip', 1);
    await page.mouse.click(again.x, again.y);
    expect(await showI()).toBe(true);

    const gear = await cardPart(page, 0, 'settings');
    await page.mouse.click(gear.x, gear.y);
    await expect(page.getByTestId('scope-dialog')).toBeVisible();
    await page.getByTestId('scope-dialog-ok').click();

    const close = await cardPart(page, 0, 'close');
    await page.mouse.click(close.x, close.y);
    await expect.poll(() => scopeCount(page)).toBe(2);
    await page.keyboard.press('Control+z');
    await expect.poll(() => scopeCount(page)).toBe(3);
  });

  test('Classic draws scopes as upstream does', async ({ page }) => {
    await page.goto('/?startCircuit=lrc.txt');
    await ready(page);
    await page.getByTestId('options-menu').click();
    await page.getByTestId('theme-classic').click();
    await expect
      .poll(() => page.evaluate(() => window.circuitjsNext?.controller.scopes.look))
      .toBe('classic');
    await page.getByTestId('options-menu').click();
    await page.getByTestId('theme-dark').click();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('one scope column shows at a time; tabs and a swipe switch between them', async ({
    page,
  }) => {
    await page.goto('/?startCircuit=lrc.txt');
    await ready(page);
    const active = () =>
      page.evaluate(() => window.circuitjsNext?.controller.scopes.activeColumn ?? -1);
    expect(await page.evaluate(() => window.circuitjsNext?.controller.scopes.compact)).toBe(true);
    expect(await active()).toBe(0);
    const tab = await cardPart(page, 0, 'tab', 2);
    await page.touchscreen.tap(tab.x, tab.y);
    await expect.poll(active).toBe(2);

    const cdp = await page.context().newCDPSession(page);
    const swipe = async (x: number, y: number) => {
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', tx: number) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: type === 'touchEnd' ? [] : [{ x: tx, y }],
        });
      await touch('touchStart', x - 80);
      for (let i = 1; i <= 8; i++) await touch('touchMove', x - 80 + i * 20);
      await touch('touchEnd', 0);
    };
    // a sideways drag over the plot measures; it doesn't switch columns
    const s = await inScope(page, 2);
    await swipe(s.x, s.y);
    await page.waitForTimeout(300);
    expect(await active()).toBe(2);

    // swipe right over the header (the title): back one column
    const box = await page.getByTestId('circuit-canvas').boundingBox();
    const slot = await page.evaluate(() => window.circuitjsNext?.controller.scopes.scopes[2]?.slot);
    if (!box || !slot) throw new Error('no scope');
    await swipe(box.x + slot.x + 120, box.y + slot.y + 12);
    await expect.poll(active).toBe(1);
  });
});

test.describe('undocked scopes', () => {
  const undocked = (page: Page) =>
    page.evaluate(() =>
      (window.circuitjsNext?.controller.circuit.scopeElms() ?? []).map((e) => e.box()),
    );

  test('a scope undocks onto the circuit, moves by its handle, resizes and docks again', async ({
    page,
  }) => {
    await page.goto('/?startCircuit=lrc.txt');
    await ready(page);
    const s = await inScope(page, 1);
    await page.mouse.click(s.x, s.y, { button: 'right' });
    await page.getByTestId('scope-undock').click();
    expect(await scopeCount(page)).toBe(2);
    expect(await undocked(page)).toHaveLength(1);
    const saved = await page.evaluate(() => window.circuitjsNext?.controller.circuit.dumpXml());
    expect(saved).toMatch(/<Scope x="[-\d ]+" f="0">\n {4}<o en="3"/);
    // the card's leader line and plot are drawn
    const slot = await page.evaluate(
      () => window.circuitjsNext?.controller.circuit.scopeElms()[0]?.elmScope.slot,
    );
    if (!slot) throw new Error('no undocked scope');
    await expect.poll(() => colorsIn(page, slot)).toBeGreaterThan(4);

    // drag the handle: the card moves by whole grid steps
    const before = (await undocked(page))[0];
    const handle = await cardPart(page, -1, 'handle');
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 60, handle.y + 40, { steps: 6 });
    await page.mouse.up();
    const after = (await undocked(page))[0];
    if (!before || !after) throw new Error('no box');
    expect(after.x1 - before.x1).toBeGreaterThan(0);
    expect(after.y1 - before.y1).toBeGreaterThan(0);
    expect(after.x2 - after.x1).toBe(before.x2 - before.x1);
    await page.keyboard.press('Control+z');
    expect((await undocked(page))[0]).toEqual(before);

    // the grip in the corner resizes it
    await page.mouse.move(10, 10);
    const grip = await cardPart(page, -1, 'resize');
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.mouse.move(grip.x + 50, grip.y + 50, { steps: 6 });
    await page.mouse.up();
    const bigger = (await undocked(page))[0];
    if (!bigger) throw new Error('no box');
    expect(bigger.x1).toBe(before.x1);
    expect(bigger.x2).toBeGreaterThan(before.x2);
    expect(bigger.y2).toBeGreaterThan(before.y2);

    // its menu docks it again, in a new column
    const plot = await page.evaluate(
      () => window.circuitjsNext?.controller.circuit.scopeElms()[0]?.elmScope.rect,
    );
    const box = await page.getByTestId('circuit-canvas').boundingBox();
    if (!plot || !box) throw new Error('no plot');
    await page.mouse.click(box.x + plot.x + plot.width / 2, box.y + plot.y + plot.height / 2, {
      button: 'right',
    });
    await page.getByTestId('scope-dock').click();
    expect(await undocked(page)).toHaveLength(0);
    expect(await scopeCount(page)).toBe(3);
  });

  test('View in New Undocked Scope, the close button, and deleting what it shows', async ({
    page,
  }) => {
    await page.goto(`/?ctz=${compressCircuit(LOOP)}`);
    await ready(page);
    const p = await at(page, 176, 96);
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.getByTestId('ctx-view-in-undocked-scope').click();
    expect(await undocked(page)).toHaveLength(1);
    expect(await scopeCount(page)).toBe(0);

    const close = await cardPart(page, -1, 'close');
    await page.mouse.click(close.x, close.y);
    await expect.poll(async () => (await undocked(page)).length).toBe(0);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await undocked(page)).length).toBe(1);

    // deleting the resistor takes its scope with it
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.getByTestId('ctx-delete').click();
    expect(await undocked(page)).toHaveLength(0);
  });

  test('an upstream file with undocked scopes loads them', async ({ page }) => {
    await page.goto('/?startCircuit=multivib-a.txt');
    await ready(page);
    expect(await undocked(page)).toHaveLength(4);
  });
});

test('the speed sliders open from a button', async ({ page }) => {
  await page.goto('/?startCircuit=lrc.txt');
  await ready(page);
  await expect(page.getByTestId('speed-slider')).toHaveCount(0);
  await page.getByTestId('speed-button').click();
  await expect(page.getByTestId('speed-popover')).toBeVisible();
  const before = await page.evaluate(() => window.circuitjsNext?.controller.circuit.options.speed);
  await page.getByTestId('speed-slider').getByRole('slider').focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => page.evaluate(() => window.circuitjsNext?.controller.circuit.options.speed))
    .toBe((before ?? 0) + 1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('speed-popover')).toBeHidden();
});

test('a spectrum finds its peak, and the cursor snaps to it', async ({ page }) => {
  await page.goto('/?startCircuit=lrc.txt');
  await ready(page);
  await page.evaluate(() => window.circuitjsNext?.controller.scopes.scopes[0]?.fftPlot.show(true));
  // the LC circuit rings at 1 / (2π √(1 H × 15 μF)) ≈ 41 Hz, less a little for its resistance
  await expect
    .poll(
      async () => {
        const f = await page.evaluate(
          () => window.circuitjsNext?.controller.scopes.scopes[0]?.fftPlot.strongestPeak()?.freq,
        );
        return f !== undefined && f > 35 && f < 48;
      },
      { timeout: 20000 },
    )
    .toBe(true);
  await page.evaluate(() => window.circuitjsNext?.controller.setRunning(false));
  const peak = await page.evaluate(() => {
    const f = window.circuitjsNext?.controller.scopes.scopes[0]?.fftPlot;
    const pk = f?.strongestPeak();
    return pk && f ? { freq: pk.freq, x: f.frequencyToX(pk.freq) } : null;
  });
  if (!peak) throw new Error('no peak');
  const snapped = await page.evaluate(
    (x) => window.circuitjsNext?.controller.scopes.scopes[0]?.fftPlot.cursorFrequency(x + 4),
    peak.x,
  );
  expect(snapped).toBeCloseTo(peak.freq, 3);
});

test('the header button undocks a docked scope and docks it back', async ({ page }) => {
  await page.goto('/?startCircuit=lrc.txt');
  await ready(page);
  const undock = await cardPart(page, 0, 'dock');
  await page.mouse.click(undock.x, undock.y);
  await expect.poll(() => scopeCount(page)).toBe(2);
  expect(
    await page.evaluate(() => window.circuitjsNext?.controller.circuit.scopeElms().length),
  ).toBe(1);
  await page.mouse.move(5, 5);
  const dock = await cardPart(page, -1, 'dock');
  await page.mouse.click(dock.x, dock.y);
  await expect.poll(() => scopeCount(page)).toBe(3);
});
