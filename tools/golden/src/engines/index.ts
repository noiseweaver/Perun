// SPDX-License-Identifier: GPL-2.0-or-later
// Engines that `pnpm golden:compare --engine <name>` can run. Phase 2 adds the real engine here.

import type { GoldenEngine } from '../types.ts';
import { stubEngine } from './stub.ts';

export const ENGINES: Record<string, GoldenEngine> = {
  [stubEngine.name]: stubEngine,
};
