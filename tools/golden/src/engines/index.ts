// SPDX-License-Identifier: GPL-2.0-or-later
// Engines that `pnpm golden:compare --engine <name>` can run.

import type { GoldenEngine } from '../types.ts';
import { nextEngine } from './next.ts';
import { stubEngine } from './stub.ts';

export const ENGINES: Record<string, GoldenEngine> = {
  [nextEngine.name]: nextEngine,
  [stubEngine.name]: stubEngine,
};
