// SPDX-License-Identifier: GPL-2.0-or-later
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { UPSTREAM_PUBLIC, upstreamExamples } from './vite-plugin-examples';
import { bundledLicenses } from './vite-plugin-licenses';

const root = (p: string): string => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const version = (JSON.parse(readFileSync(root('package.json'), 'utf8')) as { version: string })
  .version;

function commit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  plugins: [react(), upstreamExamples(UPSTREAM_PUBLIC), bundledLicenses(root('LICENSE'))],
  server: { port: 5173, strictPort: true },
  define: {
    'import.meta.env.APP_VERSION': JSON.stringify(version),
    'import.meta.env.APP_COMMIT': JSON.stringify(commit()),
    'import.meta.env.APP_BUILD_DATE': JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
});
