// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { EmbedConfig } from '@perun/app/embedConfig';
// the whole app as one page, made by build.ts from `vite build --mode embed`
import editorPage from '../generated/editor.html?raw';
import { fillConfig } from './shim.ts';

/** The editor page for a frame's srcdoc, opening the circuit `config` names. */
export function editorSrcdoc(config: EmbedConfig): string {
  return fillConfig(editorPage, config);
}
