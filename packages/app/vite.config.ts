// SPDX-License-Identifier: GPL-2.0-or-later
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { UPSTREAM_PUBLIC, upstreamExamples } from './vite-plugin-examples';

export default defineConfig({
  plugins: [react(), upstreamExamples(UPSTREAM_PUBLIC)],
  server: { port: 5173, strictPort: true },
});
