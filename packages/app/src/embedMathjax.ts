// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

// Stands in for packages/render/src/mathjax.ts in the editor frame of the Obsidian plugin
// (`vite build --mode embed`, see vite.config.ts): formulas are typeset by the plugin's own
// MathJax, which the plugin hangs on the frame element (packages/obsidian/src/editorView.ts), so
// the plugin carries one copy of MathJax instead of two.

import type { SvgNode, Typeset } from '@perun/render';
import type { FrameHost } from './embedConfig.ts';

let typesetFn: Typeset | null = null;

const host = (window.frameElement as (Element & { perunHost?: FrameHost }) | null)?.perunHost;

export const ready: Promise<void> =
  host === undefined
    ? Promise.reject(new Error('no MathJax from the Obsidian plugin'))
    : host.loadTypeset().then((t) => {
        typesetFn = t;
      });

export function typeset(tex: string): SvgNode {
  if (typesetFn === null) throw new Error('MathJax is not loaded');
  return typesetFn(tex);
}
