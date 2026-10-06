// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
//
// Phase 5 acceptance: the core editing flows, driven with the mouse and keyboard as a user would.

import { expect, test, type Page } from '@playwright/test';
import { compressCircuit } from '@circuitjs-next/format';

const BLANK = '$ 1 5.0E-6 10 50 5.0\n';

/** A 10 V source driving a resistor, drawn on a 16 px grid. */
const LOOP =
  '$ 1 0.000005 10.20027730826997 50 5 50 5e-11\n' +
  'v 96 224 96 96 0 0 40 10 0 0 0.5\n' +
  'r 96 96 256 96 0 1000\n' +
  'w 256 96 256 224 0\n' +
  'w 96 224 256 224 0\n';

const open = async (page: Page, text: string): Promise<void> => {
  await page.goto(`/?ctz=${compressCircuit(text)}`);
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

const dragCircuit = async (
  page: Page,
  from: [number, number],
  to: [number, number],
): Promise<void> => {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
};

const clickCircuit = async (page: Page, x: number, y: number): Promise<void> => {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
};

type ElmInfo = { cls: string; pos: number[]; selected: boolean };
const elements = (page: Page): Promise<ElmInfo[]> =>
  page.evaluate(() =>
    (window.circuitjsNext?.controller.circuit.elements ?? []).map((e) => ({
      cls: e.getClassName(),
      pos: [e.x, e.y, e.x2, e.y2],
      selected: e.selected,
    })),
  );

const resistorCurrent = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      window.circuitjsNext?.controller.circuit.elements.find(
        (e) => e.getClassName() === 'ResistorElm',
      )?.current ?? NaN,
  );

test('clicking an element selects it and dragging moves it', async ({ page }) => {
  await open(page, LOOP);
  await clickCircuit(page, 176, 96);
  await expect(page.getByTestId('inspector-title')).toHaveText('Resistor');
  await dragCircuit(page, [176, 96], [176, 160]);
  const r = (await elements(page)).find((e) => e.cls === 'ResistorElm');
  expect(r?.pos).toEqual([96, 160, 256, 160]);
  expect(r?.selected).toBe(true);
  // undo puts it back
  await page.getByTestId('undo').click();
  const back = (await elements(page)).find((e) => e.cls === 'ResistorElm');
  expect(back?.pos).toEqual([96, 96, 256, 96]);
  await page.getByTestId('redo').click();
  expect((await elements(page)).find((e) => e.cls === 'ResistorElm')?.pos).toEqual([
    96, 160, 256, 160,
  ]);
});

test('a circuit built from the palette runs', async ({ page }) => {
  await open(page, BLANK);
  // a source by drag and drop from the palette
  const item = page.getByTestId('palette-DCVoltageElm');
  // the palette is longer than the window now that it lists more parts
  await item.scrollIntoViewIfNeeded();
  const ib = await item.boundingBox();
  const drop = await at(page, 96, 96);
  if (!ib) throw new Error('no palette');
  await page.mouse.move(ib.x + 20, ib.y + ib.height / 2);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 10 });
  await page.mouse.up();
  let els = await elements(page);
  expect(els).toHaveLength(1);
  expect(els[0]?.cls).toBe('DCVoltageElm');
  const [x1, y1, x2, y2] = els[0]?.pos ?? [];
  expect(x1).toBe(x2); // sources drop vertically

  // a resistor by its shortcut key, dragged out on the canvas
  await page.getByTestId('circuit-canvas').focus();
  await page.keyboard.press('r');
  await expect(page.getByTestId('mode-chip')).toContainText('Resistor');
  const top = Math.min(y1 ?? 0, y2 ?? 0);
  const bottom = Math.max(y1 ?? 0, y2 ?? 0);
  await dragCircuit(page, [96, top], [240, top]);
  // wires by clicking the palette entry, then dragging
  await page.getByTestId('palette-WireElm').click();
  await dragCircuit(page, [240, top], [240, bottom]);
  await dragCircuit(page, [240, bottom], [96, bottom]);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('mode-chip')).toBeHidden();

  els = await elements(page);
  expect(els.map((e) => e.cls)).toEqual(['DCVoltageElm', 'ResistorElm', 'WireElm', 'WireElm']);
  // 5 V across 1 kΩ
  await expect.poll(() => resistorCurrent(page)).toBeCloseTo(0.005, 6);
  await expect(page.getByTestId('stop-message')).toHaveCount(0);
});

test('the property panel edits values while the circuit runs', async ({ page }) => {
  await open(page, LOOP);
  await expect.poll(() => resistorCurrent(page)).toBeCloseTo(0.01, 6);
  const r = await at(page, 176, 96);
  await page.mouse.dblclick(r.x, r.y);
  const field = page.getByTestId('field-0');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('1k');
  await field.fill('2k2');
  await field.press('Enter');
  await expect.poll(() => resistorCurrent(page)).toBeCloseTo(10 / 2200, 6);
  const t = await page.evaluate(() => window.circuitjsNext?.controller.circuit.sim.t ?? 0);
  expect(t).toBeGreaterThan(0);
  // undo restores the old value
  await page.getByTestId('circuit-canvas').focus();
  await page.keyboard.press('Control+z');
  await expect.poll(() => resistorCurrent(page)).toBeCloseTo(0.01, 6);
});

test('copy, paste, delete and rotate from the keyboard and context menu', async ({ page }) => {
  await open(page, LOOP);
  await clickCircuit(page, 176, 96);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  let els = await elements(page);
  expect(els.filter((e) => e.cls === 'ResistorElm')).toHaveLength(2);
  expect(els.at(-1)?.selected).toBe(true);
  await page.keyboard.press('Delete');
  els = await elements(page);
  expect(els.filter((e) => e.cls === 'ResistorElm')).toHaveLength(1);

  // right-click the resistor, rotate it
  const p = await at(page, 176, 96);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.getByTestId('ctx-rotate-cw').click();
  const r = (await elements(page)).find((e) => e.cls === 'ResistorElm');
  expect(r?.pos[0]).toBe(r?.pos[2]);

  // rubber band everything, delete, undo
  await dragCircuit(page, [40, 40], [320, 300]);
  expect((await elements(page)).every((e) => e.selected)).toBe(true);
  await page.keyboard.press('Delete');
  expect(await elements(page)).toHaveLength(0);
  await page.keyboard.press('Control+z');
  expect(await elements(page)).toHaveLength(4);
});

test('save downloads the circuit and export link reopens it', async ({ page }) => {
  await open(page, LOOP);
  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-save').click();
  await page.getByTestId('save-name').fill('loop');
  const download = page.waitForEvent('download');
  await page.getByTestId('save-ok').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('loop.txt');
  const saved = (await page.evaluate(() => window.circuitjsNext?.controller.saveText())) ?? '';
  expect(saved.startsWith('<cir ')).toBe(true);
  expect(saved).toContain('<r x="96 96 256 96"');

  await page.getByTestId('file-menu').click();
  await page.getByTestId('menu-export-link').click();
  const here = await page.getByTestId('link-here').inputValue();
  const upstream = await page.getByTestId('link-upstream').inputValue();
  expect(upstream.startsWith('https://www.falstad.com/circuit/circuitjs.html?ctz=')).toBe(true);
  expect(here.split('?ctz=')[1]).toBe(upstream.split('?ctz=')[1]);
  await page.goto(here);
  await page.waitForFunction(() => (window.circuitjsNext?.controller.frames ?? 0) > 2);
  const again = await page.evaluate(() => window.circuitjsNext?.controller.saveText());
  expect(again).toBe(saved);
});

test('a trackpad swipe pans, a pinch zooms, a mouse wheel zooms and shift+wheel pans', async ({
  page,
}) => {
  await open(page, LOOP);
  const view = () =>
    page.evaluate(() => {
      const c = window.circuitjsNext?.controller;
      const a = c?.toScreen(0, 0);
      const b = c?.toScreen(100, 0);
      return a && b ? { x: a.x, y: a.y, scale: (b.x - a.x) / 100 } : null;
    });
  type Wheel = {
    deltaX?: number;
    deltaY?: number;
    deltaMode?: number;
    ctrlKey?: boolean;
    shiftKey?: boolean;
  };
  const wheel = (init: Wheel) =>
    page.evaluate((init) => {
      const c = document.querySelector('[data-testid=circuit-canvas]');
      const r = c?.getBoundingClientRect();
      c?.dispatchEvent(
        new WheelEvent('wheel', {
          clientX: (r?.x ?? 0) + 100,
          clientY: (r?.y ?? 0) + 100,
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      );
    }, init);
  const start = await view();
  // two-finger swipe: pixel deltas in both directions
  await wheel({ deltaX: 30, deltaY: 40 });
  const panned = await view();
  expect(panned?.scale).toBe(start?.scale);
  expect(panned?.x).toBeCloseTo((start?.x ?? 0) - 30, 5);
  expect(panned?.y).toBeCloseTo((start?.y ?? 0) - 40, 5);
  // pinch: browsers send it as a wheel with ctrlKey
  await wheel({ deltaY: -20, ctrlKey: true });
  expect((await view())?.scale).toBeGreaterThan(panned?.scale ?? 0);
  // a mouse wheel notch (lines) zooms out
  const before = await view();
  await wheel({ deltaY: 3, deltaMode: 1 });
  // the zoom eases in over a few frames, about 8% per notch
  await expect
    .poll(async () => (await view())?.scale)
    .toBeCloseTo((before?.scale ?? 0) * Math.exp(-0.08), 5);
  const after = await view();
  // shift + a mouse wheel notch pans sideways, whichever delta the browser put it in
  await wheel({ deltaY: 3, deltaMode: 1, shiftKey: true });
  const side = await view();
  expect(side?.scale).toBe(after?.scale);
  expect(side?.x).toBeCloseTo((after?.x ?? 0) - 48, 5);
  expect(side?.y).toBe(after?.y);
  await wheel({ deltaX: -100, shiftKey: true });
  expect((await view())?.x).toBeCloseTo((side?.x ?? 0) + 100, 5);
});

test('the palette slides away and back, and stays as it was left', async ({ page }) => {
  await open(page, BLANK);
  const palette = page.getByTestId('palette');
  const canvasWidth = async () =>
    (await page.getByTestId('circuit-canvas').boundingBox())?.width ?? 0;
  const wide = await canvasWidth();
  await page.getByTestId('palette-hide').click();
  await expect(palette).toHaveAttribute('data-open', 'false');
  await expect.poll(canvasWidth).toBeGreaterThan(wide + 200);
  await page.reload();
  await expect(palette).toHaveAttribute('data-open', 'false');
  await page.getByTestId('palette-reveal').click();
  await expect(palette).toHaveAttribute('data-open', 'true');
  await expect(page.getByTestId('palette-ResistorElm')).toBeVisible();
});

test('palette categories fold away and stay folded', async ({ page }) => {
  await open(page, BLANK);
  const header = page.getByTestId('palette-group-Basic');
  await expect(page.getByTestId('palette-ResistorElm')).toBeVisible();
  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('palette-ResistorElm')).toHaveCount(0);
  await expect(page.getByTestId('palette-CapacitorElm')).toBeVisible();
  // a search still finds it
  await page.getByTestId('palette-search').fill('resis');
  await expect(page.getByTestId('palette-ResistorElm')).toBeVisible();
  await page.getByTestId('palette-search').fill('');
  await page.reload();
  await expect(page.getByTestId('palette-group-Basic')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('palette-group-Basic').click();
  await expect(page.getByTestId('palette-ResistorElm')).toBeVisible();
});

test.describe('on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a one-finger drag on empty space pans, even after a touch whose end was lost', async ({
    page,
  }) => {
    await open(page, LOOP);
    const box = await page.getByTestId('circuit-canvas').boundingBox();
    if (!box) throw new Error('no canvas');
    // a finger that went down on the canvas and lifted where the canvas never heard of it
    await page.evaluate(
      ([x, y]) => {
        document.querySelector('[data-testid=circuit-canvas]')?.dispatchEvent(
          new PointerEvent('pointerdown', {
            pointerId: 99,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: y,
            bubbles: true,
          }),
        );
      },
      [box.x + 20, box.y + 20] as const,
    );
    const view = () =>
      page.evaluate(() => {
        const c = window.circuitjsNext?.controller;
        const a = c?.toScreen(0, 0);
        const b = c?.toScreen(100, 0);
        return a && b ? { x: a.x, y: a.y, scale: (b.x - a.x) / 100 } : null;
      });
    const before = await view();
    const cdp = await page.context().newCDPSession(page);
    const at = (x: number, y: number) => [{ x: box.x + x, y: box.y + y }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(40, 560) });
    for (let i = 1; i <= 10; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: at(40 + 10 * i, 560 + 6 * i),
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = await view();
    expect(after?.scale).toBe(before?.scale);
    expect(after?.x).toBeCloseTo((before?.x ?? 0) + 100, 0);
    expect(after?.y).toBeCloseTo((before?.y ?? 0) + 60, 0);
  });
  test('a long press opens the element menu and selects no text', async ({ page }) => {
    await open(page, LOOP);
    const r = await at(page, 176, 96);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: r.x, y: r.y }],
    });
    await expect(page.getByTestId('ctx-delete')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // the press only opened the menu: nothing moved
    expect((await elements(page)).find((e) => e.cls === 'ResistorElm')?.pos).toEqual([
      96, 96, 256, 96,
    ]);
    expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).toBe('none');
    await page.getByTestId('ctx-delete').tap();
    expect((await elements(page)).some((e) => e.cls === 'ResistorElm')).toBe(false);
  });
  test('the property panel is a sheet that drags down to a tab and back up', async ({ page }) => {
    await open(page, LOOP);
    await clickCircuit(page, 176, 96);
    const sheet = page.getByTestId('inspector');
    await expect(sheet).toHaveAttribute('data-sheet', 'half');
    // let it finish sliding in before measuring where its handle is
    await expect.poll(() => sheet.evaluate((e) => e.getAnimations().length)).toBe(0);
    const height = () => sheet.evaluate((e) => (e as HTMLElement).offsetHeight);
    const half = await height();
    const handle = await page.getByTestId('sheet-handle').boundingBox();
    if (!handle) throw new Error('no handle');
    const cdp = await page.context().newCDPSession(page);
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', dy: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y: y + dy }],
      });
    await touch('touchStart', 0);
    for (let i = 1; i <= 10; i++) await touch('touchMove', 30 * i);
    await touch('touchEnd', 0);
    await expect(sheet).toHaveAttribute('data-sheet', 'peek');
    await expect.poll(height).toBeLessThan(half / 2);
    await expect(page.getByTestId('inspector-title')).toBeInViewport();
    // a tap on the handle brings it back
    await page.getByTestId('sheet-handle').tap();
    await expect(sheet).toHaveAttribute('data-sheet', 'half');
    await expect.poll(height).toBe(half);
  });
});

test('property checkboxes show their new state at once', async ({ page }) => {
  await open(page, BLANK + 's 96 96 256 96 0 1 false\n');
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.getByTestId('inspector-title')).toHaveText(/Switch/);
  const box = page.getByRole('checkbox', { name: 'Momentary Switch' });
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(box).toBeChecked();
  await box.click();
  await expect(box).not.toBeChecked();
});

test('placing a MOSFET draws nothing until it is dragged out', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, LOOP);
  await page.getByTestId('palette-search').fill('mosfet');
  await page.getByTestId('palette-NMosfetElm').click();
  const a = await at(page, 416, 96);
  const b = await at(page, 448, 96);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  // a few frames with the new element still zero length
  await page.waitForTimeout(150);
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () => (await elements(page)).some((e) => e.cls === 'NMosfetElm'))
    .toBe(true);
  expect(errors).toEqual([]);
});

test('a text box has its own font, saved with the circuit', async ({ page }) => {
  await open(page, BLANK + 'x 96 96 112 96 4 24 hello\n');
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.getByTestId('inspector-title')).toHaveText(/Text/);
  const font = page.getByRole('combobox', { name: 'Font' });
  await expect(font).toHaveValue('0');
  await font.selectOption({ label: 'Serif' });
  await page.getByRole('combobox', { name: 'Style' }).selectOption({ label: 'Bold' });
  const xml = await page.evaluate(() => window.circuitjsNext?.controller.saveText() ?? '');
  expect(xml).toContain('ff="serif"');
  expect(xml).toContain('fs="bold"');
  await page.getByTestId('undo').click();
  await expect
    .poll(() => page.evaluate(() => window.circuitjsNext?.controller.saveText() ?? ''))
    .not.toContain('fs="bold"');
});

test('a routed wire goes around an element in its way, and its middle drags a new route', async ({
  page,
}) => {
  // a vertical resistor in the middle of an empty circuit
  await open(page, BLANK + 'r 256 96 256 224 0 1000\n');
  await page.keyboard.press('Shift+W');
  await dragCircuit(page, [160, 160], [352, 160]);
  const route = (): Promise<number[][]> =>
    page.evaluate(() => {
      const w = window.circuitjsNext?.controller.circuit.elements.find(
        (e) => e.getClassName() === 'RoutedWireElm',
      ) as unknown as { route(): { x: number; y: number }[] } | undefined;
      return (w?.route() ?? []).map((p) => [p.x, p.y]);
    });
  const rp = await route();
  expect(rp[0]).toEqual([160, 160]);
  expect(rp[rp.length - 1]).toEqual([352, 160]);
  // it bends around the resistor's body instead of running through it
  expect(rp.length).toBeGreaterThan(2);
  for (let i = 0; i < rp.length - 1; i++) {
    const [ax, ay] = rp[i];
    const [bx, by] = rp[i + 1];
    if (ay === by && Math.min(ax, bx) <= 256 && Math.max(ax, bx) >= 256)
      expect(ay < 144 || ay > 176).toBe(true);
  }
  // dragging the wire's middle routes it through the pointer
  await page.keyboard.press('Escape');
  const mid = rp[1];
  await dragCircuit(page, [mid[0], mid[1]], [mid[0], 320]);
  const moved = await route();
  expect(moved.some(([, y]) => y === 320)).toBe(true);
  expect(moved[0]).toEqual([160, 160]);
});

test('a diode gets a new model from the model dialog', async ({ page }) => {
  await open(
    page,
    '$ 1 0.000005 10.2 50 5 50 5e-11\n' +
      'v 96 224 96 96 0 0 40 1 0 0 0.5\n' +
      'd 96 96 256 96 2 default\n' +
      'r 256 96 256 224 0 100\n' +
      'w 96 224 256 224 0\n',
  );
  await clickCircuit(page, 176, 96);
  await expect(page.getByTestId('inspector-title')).toHaveText('Diode');
  await page.getByRole('button', { name: 'Create New Simple Model' }).click();
  const dialog = page.getByTestId('model-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Edit Diode Model');
  await dialog.getByLabel('Forward Voltage').fill('0.65');
  await page.getByTestId('model-dialog-ok').click();
  await expect(dialog).toHaveCount(0);
  const modelName = await page.evaluate(
    () =>
      (
        window.circuitjsNext?.controller.circuit.elements.find(
          (e) => e.getClassName() === 'DiodeElm',
        ) as unknown as { modelName: string } | undefined
      )?.modelName,
  );
  expect(modelName).toBe('fwdrop=0.65');
  // the panel lists the new model, and it can now be edited in place
  await expect(page.getByTestId('field-0').locator('option:checked')).toHaveText('fwdrop=0.65');
  await expect(page.getByRole('button', { name: 'Edit Model' })).toBeVisible();
});

test.describe('drag to select on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('one finger draws a selection box once the toggle is on', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => (window.circuitjsNext?.controller.frames ?? 0) > 2);
    const selected = () =>
      page.evaluate(
        () => window.circuitjsNext?.controller.circuit.elements.filter((e) => e.selected).length,
      );
    const box = await page.getByTestId('circuit-canvas').boundingBox();
    if (box === null) throw new Error('no canvas');
    const cdp = await page.context().newCDPSession(page);
    const drag = async (): Promise<void> => {
      const at = (i: number) => [{ x: box.x + 5 + i * 35, y: box.y + 5 + i * 45, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
      for (let i = 1; i <= 10; i++)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    // by default a drag on empty canvas pans
    await drag();
    expect(await selected()).toBe(0);
    const toggle = page.getByTestId('box-select-toggle');
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    // the first drag panned the circuit away: bring it back under the box
    await page.evaluate(() => window.circuitjsNext?.controller.fit());
    await drag();
    await expect.poll(selected).toBeGreaterThan(0);
  });
});

test('the drag-to-select toggle is only shown on touch screens', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('draw-toggle')).toBeVisible();
  await expect(page.getByTestId('box-select-toggle')).toBeHidden();
});
