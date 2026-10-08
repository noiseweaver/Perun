// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// Phase 6: scopes restored from upstream files draw below the circuit, and the scope menus and
// properties dialog change them. tools/golden/src/scopes.test.ts checks the restored scopes
// against upstream's own save of every bundled example.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@perun/format';

/** A 10 V source driving a resistor, drawn on a 16 px grid. */
const LOOP =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 96 224 96 96 0 0 40 10 0 0 0.5\n' +
  'r 96 96 256 96 0 1000\n' +
  'w 256 96 256 224 0\n' +
  'w 96 224 256 224 0\n';

const ready = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('circuit-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.perun?.controller.frames ?? 0) > 2);
};

/** Page coordinates of a circuit point. */
const at = async (page: Page, x: number, y: number): Promise<{ x: number; y: number }> => {
  const box = await page.getByTestId('circuit-canvas').boundingBox();
  const p = await page.evaluate(([x, y]) => window.perun?.controller.toScreen(x, y) ?? null, [
    x,
    y,
  ] as const);
  if (!box || !p) throw new Error('no canvas');
  return { x: box.x + p.x, y: box.y + p.y };
};

/** Page coordinates of a point in scope `i`'s rectangle, as a fraction of its size. */
const inScope = async (page: Page, i: number, fx = 0.5, fy = 0.5) => {
  const box = await page.getByTestId('circuit-canvas').boundingBox();
  const r = await page.evaluate((i) => window.perun?.controller.scopes.scopes[i]?.rect ?? null, i);
  if (!box || !r) throw new Error('no scope');
  return { x: box.x + r.x + r.width * fx, y: box.y + r.y + r.height * fy };
};

const scopeCount = (page: Page): Promise<number> =>
  page.evaluate(() => window.perun?.controller.scopes.scopeCount ?? -1);

const savedScopes = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (window.perun?.controller.circuit.dumpXml() ?? '')
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
    const c = window.perun?.controller;
    return c ? [c.circuitHeight(), c.scopeArea().height] : [];
  });
  expect(heights[1]).toBeGreaterThan(50);
  // traces are drawn
  const r = await page.evaluate(() => window.perun?.controller.scopes.scopes[0]?.rect);
  if (!r) throw new Error('no scope rect');
  await expect.poll(() => colorsIn(page, r)).toBeGreaterThan(4);
  // and saved back as upstream would
  const saved = await savedScopes(page);
  expect(saved).toHaveLength(3);
  expect(saved[0]).toContain('en="4"');
});

test('reset clears the scope traces, as upstream resetAction does', async ({ page }) => {
  await page.goto('/?startCircuit=moscurrentramp.txt');
  await ready(page);
  // largest |value| the first scope's first plot holds
  const peak = () =>
    page.evaluate(() => {
      const p = window.perun?.controller.scopes.scopes[0]?.plots[0];
      return p ? Math.max(0, ...Array.from(p.maxValues, Math.abs)) : -1;
    });
  await expect.poll(peak).toBeGreaterThan(0.5);
  const after = await page.evaluate(() => {
    const c = window.perun?.controller;
    c?.reset();
    const p = c?.scopes.scopes[0]?.plots[0];
    return p ? Math.max(0, ...Array.from(p.maxValues, Math.abs)) : -1;
  });
  expect(after).toBe(0);
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
  const dump = () => page.evaluate(() => window.perun?.controller.circuit.dumpXml());
  const before = await dump();
  await page.getByTestId('scope-show-power').click();
  await expect(page.getByTestId('scope-show-power')).toBeChecked();
  await page.getByTestId('scope-dialog-ok').click();
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate(() =>
      window.perun?.controller.scopes.scopes[0]?.plots.map((pl) => pl.value),
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
    page.evaluate(() => window.perun?.controller.scopes.scopes.map((s) => s.position));
  expect(await positions()).toEqual([0, 1, 2]);
  // let the last menu finish closing first: a click while it fades out can leave it shut
  const openScopes = async (): Promise<void> => {
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.getByTestId('scopes-menu').click();
    await expect(page.getByRole('menu')).toBeVisible();
  };
  await openScopes();
  await page.getByRole('menuitem', { name: 'Stack All', exact: true }).click();
  expect(await positions()).toEqual([0, 0, 0]);
  await openScopes();
  await page.getByRole('menuitem', { name: 'Combine All', exact: true }).click();
  expect(await scopeCount(page)).toBe(1);
  await openScopes();
  await page.getByTestId('scopes-separate-all').click();
  expect(await scopeCount(page)).toBe(3);
});

test('hovering an element shows its info', async ({ page }) => {
  await page.goto(`/?ctz=${compressCircuit(LOOP)}`);
  await ready(page);
  const p = await at(page, 176, 96);
  await page.mouse.move(p.x, p.y);
  await expect
    .poll(() => page.evaluate(() => window.perun?.controller.infoLines() ?? []))
    .toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^resistor/),
        expect.stringMatching(/^I = +10\.000 mA/),
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
      const c = window.perun?.controller;
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

/** A card part once the card has stopped moving (it flies into place after an undock). */
const settledCardPart = async (page: Page, i: number, kind: string, index = 0) => {
  let last = await cardPart(page, i, kind, index);
  for (let tries = 0; tries < 20; tries++) {
    await page.waitForTimeout(100);
    const now = await cardPart(page, i, kind, index);
    if (now.x === last.x && now.y === last.y) return now;
    last = now;
  }
  throw new Error(`${kind} on scope ${i} never settled`);
};

test.describe('the card look', () => {
  test('cards have settings and close buttons, and legend chips that hide a trace', async ({
    page,
  }) => {
    await page.goto('/?startCircuit=lrc.txt');
    await ready(page);
    expect(await page.evaluate(() => window.perun?.controller.scopes.look)).toBe('cards');

    // the current chip hides the current trace and shows it again
    const showI = () => page.evaluate(() => window.perun?.controller.scopes.scopes[0]?.showI);
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
    await page.getByTestId('menu-theme').click();
    await page.getByTestId('theme-classic').click();
    await expect
      .poll(() => page.evaluate(() => window.perun?.controller.scopes.look))
      .toBe('classic');
    await page.getByTestId('options-menu').click();
    await page.getByTestId('menu-theme').click();
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
    const active = () => page.evaluate(() => window.perun?.controller.scopes.activeColumn ?? -1);
    expect(await page.evaluate(() => window.perun?.controller.scopes.compact)).toBe(true);
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
    const slot = await page.evaluate(() => window.perun?.controller.scopes.scopes[2]?.slot);
    if (!box || !slot) throw new Error('no scope');
    await swipe(box.x + slot.x + 120, box.y + slot.y + 12);
    await expect.poll(active).toBe(1);
  });
});

test.describe('undocked scopes', () => {
  const undocked = (page: Page) =>
    page.evaluate(() => (window.perun?.controller.circuit.scopeElms() ?? []).map((e) => e.box()));

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
    const saved = await page.evaluate(() => window.perun?.controller.circuit.dumpXml());
    expect(saved).toMatch(/<Scope x="[-\d ]+" f="0">\n {4}<o en="3"/);
    // the card's leader line and plot are drawn
    const slot = await page.evaluate(
      () => window.perun?.controller.circuit.scopeElms()[0]?.elmScope.slot,
    );
    if (!slot) throw new Error('no undocked scope');
    await expect.poll(() => colorsIn(page, slot)).toBeGreaterThan(4);

    // drag the handle: the card moves by whole grid steps
    const before = (await undocked(page))[0];
    const handle = await settledCardPart(page, -1, 'handle');
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
    const grip = await settledCardPart(page, -1, 'resize');
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
      () => window.perun?.controller.circuit.scopeElms()[0]?.elmScope.rect,
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

  test('Undock All spreads every scope around the circuit, clear of it and of each other', async ({
    page,
  }) => {
    await page.goto('/?startCircuit=lrc.txt');
    await ready(page);
    expect(await scopeCount(page)).toBe(3);
    await page.getByTestId('scopes-menu').click();
    await page.getByTestId('scopes-undock-all').click();
    expect(await scopeCount(page)).toBe(0);
    const cards = await undocked(page);
    expect(cards).toHaveLength(3);
    const parts = await page.evaluate(() => {
      const c = window.perun?.controller.circuit;
      return (c?.elements ?? [])
        .filter((e) => e.getClassName() !== 'ScopeElm')
        .map((e) => ({
          x1: Math.min(e.x, e.x2),
          y1: Math.min(e.y, e.y2),
          x2: Math.max(e.x, e.x2),
          y2: Math.max(e.y, e.y2),
        }));
    });
    type B = { x1: number; y1: number; x2: number; y2: number };
    const overlap = (a: B, b: B) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
    for (const c of cards) for (const p of parts) expect(overlap(c, p)).toBe(false);
    cards.forEach((a, i) => cards.forEach((b, j) => i < j && expect(overlap(a, b)).toBe(false)));
    // every card is on screen
    const view = await page.getByTestId('circuit-canvas').boundingBox();
    for (const c of cards) {
      const a = await at(page, c.x1, c.y1);
      const b = await at(page, c.x2, c.y2);
      expect(a.x).toBeGreaterThanOrEqual(view?.x ?? 0);
      expect(b.x).toBeLessThanOrEqual((view?.x ?? 0) + (view?.width ?? 0));
    }
    // one undo docks them all again
    await page.keyboard.press('Control+z');
    expect(await scopeCount(page)).toBe(3);
    expect(await undocked(page)).toHaveLength(0);
    // and Dock All puts them back too
    await page.keyboard.press('Control+y');
    expect(await undocked(page)).toHaveLength(3);
    await page.getByTestId('scopes-menu').click();
    await page.getByTestId('scopes-dock-all').click();
    expect(await scopeCount(page)).toBe(3);
    expect(await undocked(page)).toHaveLength(0);
    await expect(page.getByTestId('scopes-menu')).toBeVisible();
    await page.getByTestId('scopes-menu').click();
    await expect(page.getByTestId('scopes-dock-all')).toHaveAttribute('data-disabled', '');
    await page.keyboard.press('Escape');
  });

  test('Undock All around a small circuit keeps the cards big enough for their titles', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const scopes = [0, 1, 2, 1]
      .map((i, k) => `o ${i} 64 0 ${k === 3 ? 4098 : 4099} 10 0.1 0 1\n`)
      .join('');
    await page.goto(`/?ctz=${compressCircuit(LOOP + scopes)}`);
    await ready(page);
    await page.getByTestId('scopes-menu').click();
    await page.getByTestId('scopes-undock-all').click();
    const cards = await undocked(page);
    expect(cards).toHaveLength(4);
    // each card shows at about its own size on screen (224 px wide), not shrunk by the fit
    for (const c of cards) {
      const a = await at(page, c.x1, c.y1);
      const b = await at(page, c.x2, c.y2);
      expect(b.x - a.x).toBeGreaterThan(215);
    }
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
  const before = await page.evaluate(() => window.perun?.controller.circuit.options.speed);
  await page.getByTestId('speed-slider').getByRole('slider').focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => page.evaluate(() => window.perun?.controller.circuit.options.speed))
    .toBe((before ?? 0) + 1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('speed-popover')).toBeHidden();
});

test('a spectrum finds its peak, and the cursor snaps to it', async ({ page }) => {
  await page.goto('/?startCircuit=lrc.txt');
  await ready(page);
  await page.evaluate(() => window.perun?.controller.scopes.scopes[0]?.fftPlot.show(true));
  // the LC circuit rings at 1 / (2π √(1 H × 15 μF)) ≈ 41 Hz, less a little for its resistance
  await expect
    .poll(
      async () => {
        const f = await page.evaluate(
          () => window.perun?.controller.scopes.scopes[0]?.fftPlot.strongestPeak()?.freq,
        );
        return f !== undefined && f > 35 && f < 48;
      },
      { timeout: 20000 },
    )
    .toBe(true);
  await page.evaluate(() => window.perun?.controller.setRunning(false));
  const peak = await page.evaluate(() => {
    const f = window.perun?.controller.scopes.scopes[0]?.fftPlot;
    const pk = f?.strongestPeak();
    return pk && f ? { freq: pk.freq, x: f.frequencyToX(pk.freq) } : null;
  });
  if (!peak) throw new Error('no peak');
  const snapped = await page.evaluate(
    (x) => window.perun?.controller.scopes.scopes[0]?.fftPlot.cursorFrequency(x + 4),
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
  expect(await page.evaluate(() => window.perun?.controller.circuit.scopeElms().length)).toBe(1);
  await page.mouse.move(5, 5);
  const dock = await cardPart(page, -1, 'dock');
  await page.mouse.click(dock.x, dock.y);
  await expect.poll(() => scopeCount(page)).toBe(3);
});

test.describe('last round', () => {
  test('the freeze button holds the trace while the simulation runs', async ({ page }) => {
    await page.goto('/?startCircuit=lrc.txt');
    await ready(page);
    const trace = () =>
      page.evaluate(() => {
        const s = window.perun?.controller.scopes.scopes[0];
        return s ? Array.from(s.plots[0]?.maxValues ?? []).join(',') : '';
      });
    const freeze = await cardPart(page, 0, 'freeze');
    await page.mouse.click(freeze.x, freeze.y);
    const held = await trace();
    await page.waitForTimeout(300);
    expect(await trace()).toBe(held);
    expect(
      await page.evaluate(() => window.perun?.controller.scopes.scopes[0]?.frozen),
    ).not.toBeNull();
    await page.mouse.click(freeze.x, freeze.y);
    expect(await page.evaluate(() => window.perun?.controller.scopes.scopes[0]?.frozen)).toBeNull();
    await expect.poll(trace).not.toBe(held);
  });

  test('Ctrl+wheel over a scope changes its time scale', async ({ page }) => {
    await page.goto('/?startCircuit=lrc.txt');
    await ready(page);
    const speed = () => page.evaluate(() => window.perun?.controller.scopes.scopes[0]?.speed ?? 0);
    const before = await speed();
    const s = await inScope(page, 0);
    await page.mouse.move(s.x, s.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await expect.poll(speed).toBe(before / 2);
  });

  test('the time cursor snaps to the waveform and reads its period', async ({ page }) => {
    await page.goto('/?startCircuit=lrc.txt');
    await ready(page);
    // let the LC ring for a few periods (at full speed), then hold it still
    await page.evaluate(() => {
      const c = window.perun?.controller;
      if (c) c.circuit.options.speed = 259;
    });
    await expect
      .poll(() => page.evaluate(() => window.perun?.controller.circuit.sim.t ?? 0), {
        timeout: 20000,
      })
      .toBeGreaterThan(0.1);
    await page.evaluate(() => window.perun?.controller.setRunning(false));
    const snaps: { kind: string; period: number }[] = [];
    const r = await page.evaluate(() => window.perun?.controller.scopes.scopes[0]?.rect);
    const box = await page.getByTestId('circuit-canvas').boundingBox();
    if (!r || !box) throw new Error('no scope');
    for (let x = r.x + 20; x < r.x + r.width - 20; x += 6) {
      await page.mouse.move(box.x + x, box.y + r.y + r.height / 2);
      const s = await page.evaluate(() => {
        const m = window.perun?.controller.scopes;
        return m?.cursorSnap ? { ...m.cursorSnap } : null;
      });
      if (s !== null) snaps.push(s);
    }
    expect(snaps.length).toBeGreaterThan(3);
    // the LC rings at about 41 Hz: a period near 24 ms
    const periods = snaps.filter((s) => s.period > 0).map((s) => s.period);
    expect(periods.length).toBeGreaterThan(0);
    for (const p of periods) {
      expect(p).toBeGreaterThan(0.018);
      expect(p).toBeLessThan(0.03);
    }
  });

  test('an undocked leader can be pinned to a post of what it shows', async ({ page }) => {
    await page.goto(`/?ctz=${compressCircuit(LOOP)}`);
    await ready(page);
    const p = await at(page, 176, 96);
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.getByTestId('ctx-view-in-undocked-scope').click();
    await page.waitForTimeout(400);
    // select the card: its leader end (on the resistor's middle) becomes a handle
    const handle = await settledCardPart(page, -1, 'handle');
    await page.mouse.click(handle.x, handle.y);
    expect(
      await page.evaluate(() => window.perun?.controller.circuit.scopeElms()[0]?.selected),
    ).toBe(true);
    // drag that end onto the resistor's right post
    const post = await at(page, 256, 96);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(post.x - 4, post.y + 3, { steps: 6 });
    await page.mouse.up();
    const lp = () =>
      page.evaluate(() => window.perun?.controller.circuit.scopeElms()[0]?.leaderPost);
    expect(await lp()).toBe(1);
    expect(await page.evaluate(() => window.perun?.controller.circuit.dumpXml())).toMatch(
      /<Scope [^>]*lp="1"/,
    );
    await page.keyboard.press('Control+z');
    expect(await lp()).toBe(-1);
    await expect(page.getByTestId('toast')).toHaveText('Undid move leader');
  });
});

test.describe('pinch on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('two fingers spreading over a scope shorten its time span', async ({ page }) => {
    await page.goto('/?startCircuit=lrc.txt');
    await ready(page);
    const speed = () =>
      page.evaluate(() => {
        const m = window.perun?.controller.scopes;
        return m?.scopes.find((s) => m.isShown(s))?.speed ?? 0;
      });
    const before = await speed();
    const r = await page.evaluate(() => {
      const m = window.perun?.controller.scopes;
      return m?.scopes.find((s) => m.isShown(s))?.rect ?? null;
    });
    const box = await page.getByTestId('circuit-canvas').boundingBox();
    if (!r || !box) throw new Error('no scope');
    const cx = box.x + r.x + r.width / 2;
    const cy = box.y + r.y + r.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', d: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints:
          type === 'touchEnd'
            ? []
            : [
                { x: cx - d, y: cy, id: 1 },
                { x: cx + d, y: cy, id: 2 },
              ],
      });
    await touch('touchStart', 20);
    for (let d = 24; d <= 80; d += 8) await touch('touchMove', d);
    await touch('touchEnd', 0);
    await expect.poll(speed).toBeLessThan(before);
  });
});

test('the property panel adds the element to a new docked or undocked scope', async ({ page }) => {
  await page.goto(`/?ctz=${compressCircuit(LOOP)}`);
  await ready(page);
  const p = await at(page, 176, 96);
  await page.mouse.click(p.x, p.y);
  await page.getByTestId('action-view-in-scope').click();
  await expect.poll(() => scopeCount(page)).toBe(1);
  await page.getByTestId('action-view-in-undocked-scope').click();
  await expect
    .poll(() => page.evaluate(() => window.perun?.controller.circuit.scopeElms().length))
    .toBe(1);
});

test.describe('viewing in a scope on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('closes the property sheet so the scope shows', async ({ page }) => {
    await page.goto(`/?ctz=${compressCircuit(LOOP)}`);
    await ready(page);
    const p = await at(page, 176, 96);
    await page.mouse.click(p.x, p.y);
    const sheet = page.getByTestId('inspector');
    await expect(sheet).toBeVisible();
    await page.getByTestId('action-view-in-scope').tap();
    await expect.poll(() => scopeCount(page)).toBe(1);
    await expect(sheet).toBeHidden();
  });
});

test.describe('moving an undocked card on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('does not open the property panel', async ({ page }) => {
    await page.goto(`/?ctz=${compressCircuit(LOOP)}`);
    await ready(page);
    await page.evaluate(() => {
      const c = window.perun?.controller;
      const r = c?.circuit.elements.find((e) => e.getClassName() === 'ResistorElm');
      if (c && r) c.viewInUndockedScope(r);
    });
    await page.waitForTimeout(400);
    const handle = await settledCardPart(page, -1, 'handle');
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', d: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x: handle.x + d, y: handle.y + d }],
      });
    await touch('touchStart', 0);
    for (let d = 5; d <= 40; d += 5) await touch('touchMove', d);
    await touch('touchEnd', 0);
    expect(
      await page.evaluate(() => window.perun?.controller.circuit.scopeElms()[0]?.selected),
    ).toBe(true);
    await expect(page.getByTestId('inspector')).toHaveCount(0);
  });
});

test('dragging a docked card by its title stacks it, and undo puts it back', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const box = await page.getByTestId('circuit-canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const slot = (i: number) =>
    page.evaluate((i) => window.perun?.controller.scopes.scopes[i]?.slot ?? null, i);
  const positions = () =>
    page.evaluate(() => window.perun?.controller.scopes.scopes.map((s) => s.position));
  const s0 = await slot(0);
  const s2 = await slot(2);
  if (!s0 || !s2) throw new Error('no scopes');
  expect(await positions()).toEqual([0, 1, 2]);
  await page.mouse.move(box.x + s0.x + 12, box.y + s0.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + s2.x + s2.width / 2, box.y + s2.y + s2.height * 0.85, {
    steps: 5,
  });
  await page.mouse.up();
  expect(await positions()).toEqual([0, 1, 1]);
  await page.keyboard.press('Control+z');
  expect(await positions()).toEqual([0, 1, 2]);
});
