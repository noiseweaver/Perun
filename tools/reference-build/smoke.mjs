// SPDX-License-Identifier: GPL-2.0-or-later
// Smoke test for the reference build: loads circuitjs.html, waits for the JS API,
// checks that simulated time advances, and prints the start of the exported circuit.
// Usage: pnpm reference:serve (in another shell), then node tools/reference-build/smoke.mjs
import { chromium } from '@playwright/test';

const url = process.env.REFERENCE_URL ?? 'http://localhost:8000/circuitjs.html';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
await page.goto(url);
await page.waitForFunction(() => window.CircuitJS1 !== undefined, null, { timeout: 30000 });
const t0 = await page.evaluate(() => window.CircuitJS1.getTime());
await page.waitForTimeout(1000);
const result = await page.evaluate(() => ({
  t1: window.CircuitJS1.getTime(),
  running: window.CircuitJS1.isRunning(),
  timeStep: window.CircuitJS1.getTimeStep(),
  maxTimeStep: window.CircuitJS1.getMaxTimeStep(),
  elements: window.CircuitJS1.getElements().length,
  dump: window.CircuitJS1.exportCircuit().split('\n').slice(0, 3),
}));
await page.screenshot({ path: process.env.SCREENSHOT ?? 'test-results/reference-smoke.png' });
await browser.close();
console.log(JSON.stringify({ t0, ...result }, null, 2));
if (!(result.t1 > t0)) {
  console.error('Simulation time did not advance');
  process.exit(1);
}
