// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { ProbeElm, viewFor, type CircuitElm } from '@perun/elements';

/**
 * The circuit point an undocked scope's leader line goes to: the post of a one-post element
 * (a labeled node, an output), else the middle of the element.
 */
export function scopeAnchor(elm: CircuitElm, post = -1): { x: number; y: number } {
  if (post >= 0 && post < elm.getPostCount()) return elm.getPost(post);
  if (elm.getPostCount() === 1) return elm.getPost(0);
  // a scope probe without its circle is drawn as two short stubs with nothing in the middle
  // (upstream draws it so): point at its + end, on the node it measures
  if (elm instanceof ProbeElm && !elm.drawAsCircle()) return elm.getPost(0);
  const b = viewFor(elm)?.bbox(elm);
  if (b === undefined) return { x: (elm.x + elm.x2) / 2, y: (elm.y + elm.y2) / 2 };
  return { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
}
