// SPDX-License-Identifier: GPL-2.0-or-later
import { defineConfig, devices } from '@playwright/test';

const chromiumPath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE'];

export default defineConfig({
  testDir: 'packages/app/e2e',
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: 'http://localhost:5173' },
  projects: [
    {
      name: 'chromium',
      testIgnore: /pwa\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // Optional override for environments with a preinstalled Chromium.
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
    {
      // the production build: the service worker and the files it caches exist only there
      name: 'build',
      testMatch: /pwa\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4173',
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @circuitjs-next/app dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env['CI'],
    },
    {
      command:
        'pnpm --filter @circuitjs-next/app build && pnpm --filter @circuitjs-next/app preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
  ],
});
