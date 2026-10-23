// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { embedConfig } from '../embedConfig.ts';
import { obsidianPlatform } from './obsidian.ts';
import type { Platform } from './types.ts';
import { webPlatform } from './web.ts';

export type { KeyValueStore, Platform, RecordStore } from './types.ts';

/** The page the app runs in: its own web page, or the Obsidian plugin's frame. */
export const platform: Platform =
  embedConfig !== null ? obsidianPlatform(embedConfig) : webPlatform;
