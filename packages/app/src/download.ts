// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/** Offer text to the browser as a file download. */
export function download(fileName: string, text: string, type: string): void {
  downloadBlob(fileName, new Blob([text], { type }));
}

/** Offer binary data (an image) as a file download. */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
