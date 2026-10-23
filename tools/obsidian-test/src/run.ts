// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/*
 * Tests the built Obsidian plugin (packages/obsidian/dist) in the real Obsidian app: downloads
 * Obsidian's Linux build (cached), opens a test vault with the plugin in it, and clicks through
 * circuits in a note, an embedded circuit file and the editor tab. Run before each release (the
 * Release Obsidian plugin workflow) or by hand: `pnpm obsidian:test` (on Linux without a screen,
 * under `xvfb-run -a`). Exits 1 when a check fails; screenshots go to test-results/obsidian/.
 *
 * Playwright drives Obsidian over the Chrome DevTools protocol (its Electron launcher times out
 * with Obsidian).
 */

import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Frame, type Locator, type Page } from '@playwright/test';

/**
 * The Obsidian version tested against; raise it on purpose, after trying the new one.
 * `OBSIDIAN_VERSION=1.6.7 pnpm obsidian:test` tries another (for the manifest's minAppVersion).
 */
const OBSIDIAN_VERSION = process.env['OBSIDIAN_VERSION'] ?? '1.14.4';
const PORT = 9333;

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../../..');

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return (i >= 0 ? process.argv[i + 1] : undefined) ?? fallback;
}

const pluginDir = resolve(arg('plugin', join(root, 'packages/obsidian/dist')));
const cacheDir = resolve(arg('cache', join(homedir(), '.cache/perun-obsidian-test')));
const outDir = resolve(arg('out', join(root, 'test-results/obsidian')));

/** Obsidian's app object, the little of it the checks use. */
interface ObsidianApp {
  workspace: {
    getLeaf(newLeaf: boolean): {
      openFile(file: unknown): Promise<void>;
      setViewState(state: unknown): Promise<void>;
    };
    getLeavesOfType(type: string): { view: unknown }[];
    getActiveFile(): { path: string } | null;
  };
  vault: {
    getAbstractFileByPath(path: string): unknown;
    getFiles(): { path: string }[];
    adapter: { read(path: string): Promise<string> };
  };
  plugins: {
    plugins: Record<
      string,
      {
        data?: { storage: Record<string, string>; followObsidian: boolean };
        newCircuit?(folder: string): Promise<void>;
      }
    >;
    enablePlugin(id: string): Promise<void>;
  };
  emulateMobile(on: boolean): void;
}
declare const app: ObsidianApp;

// ---- Obsidian ----------------------------------------------------------------------------------

/** Obsidian's app folder, downloaded and unpacked the first time. */
async function obsidian(): Promise<string> {
  const dir = join(cacheDir, `obsidian-${OBSIDIAN_VERSION}`);
  if (existsSync(join(dir, 'obsidian'))) return dir;
  mkdirSync(cacheDir, { recursive: true });
  const url = `https://github.com/obsidianmd/obsidian-releases/releases/download/v${OBSIDIAN_VERSION}/obsidian-${OBSIDIAN_VERSION}.tar.gz`;
  console.log(`Downloading Obsidian ${OBSIDIAN_VERSION}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const tarball = join(cacheDir, `obsidian-${OBSIDIAN_VERSION}.tar.gz`);
  writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  execFileSync('tar', ['xzf', tarball, '-C', cacheDir]);
  rmSync(tarball);
  return dir;
}

/** A test vault with the plugin turned on, and an Obsidian profile that opens it. */
function setUp(): { home: string } {
  const home = mkdtempSync(join(tmpdir(), 'perun-obsidian-'));
  const vault = join(home, 'vault');
  cpSync(join(here, '../vault'), vault, { recursive: true });
  const plugin = join(vault, '.obsidian/plugins/perun');
  mkdirSync(plugin, { recursive: true });
  for (const f of ['main.js', 'manifest.json', 'styles.css'])
    cpSync(join(pluginDir, f), join(plugin, f));
  writeFileSync(join(vault, '.obsidian/community-plugins.json'), '["perun"]');
  const config = join(home, 'config/obsidian');
  mkdirSync(config, { recursive: true });
  writeFileSync(
    join(config, 'obsidian.json'),
    JSON.stringify({ vaults: { test: { path: vault, ts: 1, open: true } }, updateDisabled: true }),
  );
  return { home };
}

async function waitForDevtools(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Obsidian did not start');
}

// ---- checks ------------------------------------------------------------------------------------

const results: { name: string; ok: boolean; detail: string }[] = [];
let shotCount = 0;

async function check(page: Page, name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    results.push({ name, ok: true, detail: '' });
    console.log(`  ok    ${name}`);
  } catch (e) {
    // a Playwright timeout names what it waited for further down its call log
    const lines = (e instanceof Error ? e.message : String(e)).split('\n');
    const waited = lines
      .find((l) => l.includes('waiting for'))
      ?.replaceAll(String.fromCharCode(27), '')
      .replace(/\[\d+m/g, '');
    const detail = [lines[0] ?? '', waited?.trim()].filter(Boolean).join(' ');
    results.push({ name, ok: false, detail });
    console.log(`  FAIL  ${name}: ${detail}`);
  }
  await page.screenshot({ path: join(outDir, `${String(++shotCount).padStart(2, '0')}.png`) });
}

function assert(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

/**
 * Clicks an item in the submenu its trigger opened, moving the mouse the way a hand does: across
 * into the submenu first, then along it. Playwright's one-step jump, or a diagonal over the
 * parent menu's other items, closes the submenu before the mouse gets there.
 */
async function clickInSubmenu(page: Page, trigger: Locator, item: Locator): Promise<void> {
  const from = await trigger.boundingBox();
  const to = await item.boundingBox();
  assert(from !== null && to !== null, 'the submenu is not on screen');
  const x = to.x + to.width / 2;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.move(x, from.y + from.height / 2, { steps: 8 });
  await page.mouse.move(x, to.y + to.height / 2, { steps: 8 });
  await item.click();
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The visible canvas of the nth circuit in the note, as an image. */
function canvasImage(page: Page, n: number): Promise<string> {
  return page.evaluate((n) => {
    const all = [...document.querySelectorAll<HTMLCanvasElement>('.perun-canvas')];
    return all.filter((c) => c.offsetParent !== null)[n]?.toDataURL() ?? '';
  }, n);
}

async function openNote(page: Page): Promise<void> {
  await page.evaluate(() =>
    app.workspace
      .getLeaf(false)
      .setViewState({ type: 'markdown', state: { file: 'Notes.md', mode: 'preview' } }),
  );
  await page.locator('.perun-canvas:visible').first().waitFor({ timeout: 20000 });
  await pause(1000);
}

async function openEditor(page: Page): Promise<Frame> {
  await page.evaluate(() =>
    app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Clipper.circuit')),
  );
  for (let i = 0; i < 60; i++) {
    for (const f of page.frames()) {
      if (f === page.mainFrame()) continue;
      if (
        (await f
          .locator('[data-testid=circuit-canvas]')
          .count()
          .catch(() => 0)) > 0
      ) {
        await pause(1500);
        return f;
      }
    }
    await pause(500);
  }
  throw new Error("the editor tab didn't open");
}

/** Clicks an empty corner of the editor's canvas, so keys go to the editor. */
async function focusEditor(page: Page, editor: Frame): Promise<void> {
  const box = await editor.locator('[data-testid=circuit-canvas]').boundingBox();
  assert(box !== null, 'no editor canvas');
  await page.mouse.click(box.x + box.width - 30, box.y + box.height - 30);
  await pause(300);
}

/** The file's text once it differs from `before`, or `before` after `ms`. */
async function changed(page: Page, path: string, before: string, ms: number): Promise<string> {
  for (let t = 0; t < ms; t += 250) {
    const now = await page.evaluate((p) => app.vault.adapter.read(p), path);
    if (now !== before) return now;
    await pause(250);
  }
  return before;
}

async function run(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await check(page, 'The plugin loads', async () => {
    await page
      .getByText('Trust author and enable plugins')
      .click({ timeout: 10000 })
      .catch(() => undefined);
    // the trust button loads it; turn it on by hand only if it hasn't come up after a while
    // (Obsidian reloads its window when the vault is trusted: an evaluate then may fail)
    const loaded = (): Promise<boolean> =>
      page.evaluate(() => app.plugins.plugins['perun'] !== undefined).catch(() => false);
    for (let i = 0; i < 20 && !(await loaded()); i++) await pause(500);
    if (!(await loaded())) await page.evaluate(() => app.plugins.enablePlugin('perun'));
    assert(await loaded(), 'not loaded');
  });

  await check(page, 'A circuit block runs', async () => {
    await openNote(page);
    const a = await canvasImage(page, 0);
    await pause(800);
    const b = await canvasImage(page, 0);
    assert(a.length > 1000, 'the canvas is empty');
    assert(a !== b, "the circuit doesn't move");
  });

  await check(page, 'Clicking a switch in a note changes the circuit', async () => {
    const block = page.locator('.perun-block:visible').nth(1);
    await block.scrollIntoViewIfNeeded();
    await block.getByRole('button', { name: 'Pause' }).click();
    await pause(500);
    const canvas = block.locator('.perun-canvas');
    const box = await canvas.boundingBox();
    assert(box !== null, 'no canvas');
    // find the switch by the pointer cursor it shows
    let found: { x: number; y: number } | null = null;
    for (let y = box.y + 4; y < box.y + box.height && found === null; y += 8) {
      for (let x = box.x + 4; x < box.x + box.width; x += 8) {
        await page.mouse.move(x, y);
        if (await canvas.evaluate((c) => c.classList.contains('is-over-switch'))) {
          found = { x, y };
          break;
        }
      }
    }
    assert(found !== null, 'no switch under the pointer anywhere');
    const before = await canvasImage(page, 1);
    await page.mouse.click(found.x, found.y);
    await pause(500);
    assert((await canvasImage(page, 1)) !== before, "the click didn't change the circuit");
  });

  await check(page, 'The Controls panel lines up each slider with its name', async () => {
    const block = page.locator('.perun-block').last();
    await block.scrollIntoViewIfNeeded();
    // a circuit with sliders opens with the panel open
    if ((await block.locator('.perun-controls.is-open').count()) === 0)
      await block.getByRole('button', { name: 'Controls' }).click();
    await pause(500);
    const rows = await block.locator('.perun-control').evaluateAll((els) =>
      els.map((row) => {
        const box = (sel: string): DOMRect =>
          row.querySelector(sel)?.getBoundingClientRect() ?? new DOMRect();
        const l = box('.perun-control-label');
        const s = box('.perun-control-slider');
        const v = box('.perun-control-value');
        return { label: l, slider: s, value: v };
      }),
    );
    // three circuit sliders and the two speeds
    assert(rows.length === 5, `${rows.length} rows`);
    const mid = (r: DOMRect): number => r.y + r.height / 2;
    for (const r of rows) {
      assert(
        Math.abs(mid(r.label) - mid(r.slider)) < 6,
        'a name and its slider are on different lines',
      );
      assert(
        r.label.right <= r.slider.left && r.slider.right <= r.value.left,
        'columns out of order',
      );
      assert(r.slider.width > 40, 'a slider is squashed');
    }
    assert(
      rows.every((r) => Math.abs(r.slider.left - (rows[0]?.slider.left ?? 0)) < 1),
      "the sliders don't line up",
    );
    await page.screenshot({ path: join(outDir, 'controls.png') });
  });

  await check(page, 'An embedded circuit file shows', async () => {
    const embed = page.locator('.perun-embed .perun-canvas:visible').first();
    await embed.scrollIntoViewIfNeeded();
    const box = await embed.boundingBox();
    assert(box !== null && box.height > 50, 'no embedded circuit');
  });

  let editor: Frame | null = null;
  await check(page, 'The editor tab opens, and an edit is written to the file', async () => {
    editor = await openEditor(page);
    const before = await page.evaluate(() => app.vault.adapter.read('Clipper.circuit'));
    await focusEditor(page, editor);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    // Obsidian writes a changed file a couple of seconds after the last change
    const after = await changed(page, 'Clipper.circuit', before, 8000);
    assert(after !== before && after.length < before.length, 'the file did not change');
    await page.keyboard.press('Control+z');
    await changed(page, 'Clipper.circuit', after, 8000);
  });

  await check(page, "Ctrl+P opens Obsidian's command palette from the editor", async () => {
    assert(editor !== null, 'no editor');
    await focusEditor(page, editor);
    await page.keyboard.press('Control+p');
    await page.locator('.prompt').waitFor({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.locator('.prompt').waitFor({ state: 'detached', timeout: 3000 });
  });

  await check(page, 'Export image puts a file in the vault', async () => {
    assert(editor !== null, 'no editor');
    const before = await page.evaluate(() => app.vault.getFiles().length);
    await editor.getByRole('button', { name: 'File', exact: true }).click();
    await editor.getByRole('menuitem', { name: /Export image/ }).click();
    await editor.locator('[role=dialog]').getByRole('button', { name: 'Save to vault' }).click();
    await pause(1500);
    await page.keyboard.press('Escape');
    const files = await page.evaluate(() => app.vault.getFiles().map((f) => f.path));
    assert(files.length > before, 'no new file');
    assert(
      files.some((f) => /^Clipper.*\.(svg|png)$/.test(f)),
      `no image among ${files.join(', ')}`,
    );
  });

  await check(page, "The editor's settings are kept in the plugin's data", async () => {
    assert(editor !== null, 'no editor');
    await editor.getByRole('button', { name: 'Options', exact: true }).click();
    await editor.getByRole('menuitemcheckbox', { name: /European resistors/ }).click();
    await pause(1500);
    const settings = await page.evaluate(
      () => app.plugins.plugins['perun']?.data?.storage['circuitjs-next.settings.v2'] ?? '{}',
    );
    assert((JSON.parse(settings) as { euroResistors?: boolean }).euroResistors === true, settings);
  });

  await check(page, 'A theme picked in one editor reaches the other tabs', async () => {
    assert(editor !== null, 'no editor');
    await page.evaluate(() => app.plugins.plugins['perun']?.newCircuit?.('/'));
    await pause(3000);
    // back in Clipper's tab, pick a theme there
    await page.evaluate(() =>
      app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Clipper.circuit')),
    );
    await pause(1500);
    const backgrounds = async (): Promise<string[]> => {
      const out: string[] = [];
      for (const f of page.frames()) {
        if (f === page.mainFrame()) continue;
        if (
          (await f
            .locator('[data-testid=circuit-canvas]')
            .count()
            .catch(() => 0)) === 0
        )
          continue;
        out.push(await f.evaluate(() => getComputedStyle(document.body).backgroundColor));
      }
      return out;
    };
    const light = await backgrounds();
    assert(light.length === 2, `${light.length} editors open, not 2`);
    const frame = await openEditor(page);
    await frame.getByRole('button', { name: 'Options', exact: true }).click();
    await frame.getByTestId('menu-theme').click();
    await clickInSubmenu(page, frame.getByTestId('menu-theme'), frame.getByTestId('theme-dracula'));
    await pause(1500);
    const dark = await backgrounds();
    assert(
      dark.every((b) => b === dark[0]) && dark[0] !== light[0],
      `backgrounds ${dark.join(', ')}`,
    );
    assert(
      (await page.evaluate(() => app.plugins.plugins['perun']?.data?.followObsidian)) === false,
      "picking a theme didn't stop following Obsidian",
    );
    // and back to Obsidian's
    await frame.getByRole('button', { name: 'Options', exact: true }).click();
    await frame.getByTestId('menu-theme').click();
    await clickInSubmenu(
      page,
      frame.getByTestId('menu-theme'),
      frame.getByTestId('menu-theme-follow'),
    );
    await pause(1500);
    const again = await backgrounds();
    assert(
      again.every((b) => b === light[0]),
      `backgrounds ${again.join(', ')}`,
    );
  });

  await check(page, 'Opening a circuit that is open in another tab goes to that tab', async () => {
    // Clipper and Circuit are open; from Circuit's tab, open Clipper again
    await page.evaluate(() =>
      app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Circuit.circuit')),
    );
    await pause(1000);
    await page.locator('.nav-file-title[data-path="Clipper.circuit"]').click();
    await pause(2500);
    const open = await page.evaluate(() =>
      app.workspace
        .getLeavesOfType('perun-circuit')
        .map((l) => (l.view as { file?: { path: string } }).file?.path ?? ''),
    );
    assert(open.length === 2 && open.includes('Circuit.circuit'), `tabs: ${open.join(', ')}`);
    assert(
      (await page.evaluate(() => app.workspace.getActiveFile()?.path)) === 'Clipper.circuit',
      "Clipper's tab isn't the active one",
    );
  });

  await check(page, 'Phone layout: a note and the editor', async () => {
    await page.evaluate(() => app.emulateMobile(true));
    await pause(3000);
    await openNote(page);
    assert((await canvasImage(page, 0)).length > 1000, 'the block is empty');
    await openEditor(page);
    await page.evaluate(() => app.emulateMobile(false));
    await pause(2000);
  });

  await check(page, 'An editor in a new window writes edits to the file', async () => {
    await page.locator('.nav-file-title[data-path="Clipper.circuit"]').click({ button: 'right' });
    await page.locator('.menu-item', { hasText: 'Open in new window' }).click();
    let frame: Frame | undefined;
    let win: Page | undefined;
    for (let i = 0; i < 40 && frame === undefined; i++) {
      await pause(500);
      for (const p of page.context().pages()) {
        if (p === page) continue;
        for (const f of p.frames()) {
          if (f === p.mainFrame()) continue;
          if (
            (await f
              .locator('[data-testid=circuit-canvas]')
              .count()
              .catch(() => 0)) > 0
          ) {
            frame = f;
            win = p;
          }
        }
      }
    }
    assert(frame !== undefined && win !== undefined, "the new window didn't open the editor");
    await pause(1500);
    const before = await page.evaluate(() => app.vault.adapter.read('Clipper.circuit'));
    await focusEditor(win, frame);
    await win.keyboard.press('Control+a');
    await win.keyboard.press('Delete');
    const after = await changed(page, 'Clipper.circuit', before, 8000);
    assert(after !== before, 'the file did not change');
    await win.keyboard.press('Control+z');
    await changed(page, 'Clipper.circuit', after, 8000);
    await win.close();
  });

  await check(page, 'No errors in the console', async () => {
    assert(errors.length === 0, errors.slice(0, 3).join(' | '));
  });
}

// ---- main --------------------------------------------------------------------------------------

async function main(): Promise<void> {
  assert(existsSync(join(pluginDir, 'main.js')), `no plugin in ${pluginDir}: build it first`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const dir = await obsidian();
  const { home } = setUp();
  const child: ChildProcess = spawn(
    join(dir, 'obsidian'),
    ['--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`],
    {
      env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, 'config') },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  child.stdout?.on('data', (d: Buffer) => (log += d.toString()));
  child.stderr?.on('data', (d: Buffer) => (log += d.toString()));
  let browser: Browser | null = null;
  try {
    await waitForDevtools();
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    let page: Page | undefined;
    for (let i = 0; i < 60 && page === undefined; i++) {
      page = browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().includes('index.html'));
      if (page === undefined) await pause(500);
    }
    assert(page !== undefined, "Obsidian's window didn't open");
    await page.waitForFunction(() => typeof app !== 'undefined' && app.workspace !== undefined);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => undefined);
    await run(page);
  } finally {
    await browser?.close().catch(() => undefined);
    const exited = new Promise((r) => child.once('exit', r));
    child.kill();
    await Promise.race([exited, pause(5000)]);
    writeFileSync(join(outDir, 'obsidian.log'), log);
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(
    failed.length === 0
      ? `All ${results.length} checks passed in Obsidian ${OBSIDIAN_VERSION}.`
      : `${failed.length} of ${results.length} checks failed (screenshots in ${outDir}).`,
  );
  if (failed.length > 0) process.exitCode = 1;
}

await main();
