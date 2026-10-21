// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { platform } from './platform/index.ts';

/** Give the user text as a file (a download; in Obsidian, a file in the vault). */
export function download(fileName: string, text: string, type: string): void {
  platform.saveFile(fileName, text, type);
}

/** Give the user binary data (an image) as a file. */
export function downloadBlob(fileName: string, blob: Blob): void {
  platform.saveFile(fileName, blob, blob.type);
}
