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
      use: {
        ...devices['Desktop Chrome'],
        // Optional override for environments with a preinstalled Chromium.
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @circuitjs-next/app dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
  },
});
