// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { embedConfig, type EmbedMessage } from './embedConfig.ts';

/** Offer text to the browser as a file download. */
export function download(fileName: string, text: string, type: string): void {
  if (embedConfig !== null) {
    toHost({ perun: 'file', name: fileName, data: text });
    return;
  }
  downloadBlob(fileName, new Blob([text], { type }));
}

/** Offer binary data (an image) as a file download. */
export function downloadBlob(fileName: string, blob: Blob): void {
  if (embedConfig !== null) {
    blob.arrayBuffer().then(
      (data) => toHost({ perun: 'file', name: fileName, data }),
      () => undefined,
    );
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * In the Obsidian plugin's frame a download goes nowhere (and does nothing at all on phones):
 * the host writes the file into the vault instead, next to the circuit.
 */
function toHost(m: EmbedMessage): void {
  window.parent.postMessage(m, '*');
}
