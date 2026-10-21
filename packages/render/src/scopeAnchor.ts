// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { ProbeElm, cardPlotRect, viewFor, type CircuitElm, type ScopeElm } from '@perun/elements';
import type { Viewport } from './Viewport.ts';

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

/**
 * Place an undocked scope where its rectangle is on screen (upstream ScopeElm.setScopeRect): its
 * slot, and the card or plot rectangle inside it. Returns the screen point its leader line goes
 * to, or null when the scope shows nothing.
 */
export function placeUndocked(
  e: ScopeElm,
  vp: Viewport,
  cards: boolean,
): { x: number; y: number } | null {
  const b = e.box();
  const a = vp.toScreen(b.x1, b.y1);
  const c = vp.toScreen(b.x2, b.y2);
  const slot = {
    x: Math.round(a.x),
    y: Math.round(a.y),
    width: Math.max(1, Math.round(c.x - a.x)),
    height: Math.max(1, Math.round(c.y - a.y)),
  };
  const s = e.elmScope;
  s.position = -1;
  s.slot = slot;
  const rect = cards ? cardPlotRect(slot, true) : slot;
  const o = s.rect;
  if (rect.x !== o.x || rect.y !== o.y || rect.width !== o.width || rect.height !== o.height)
    s.setRect(rect);
  const shown = s.getElm();
  const t = shown !== null ? scopeAnchor(shown, e.leaderPost) : null;
  return t !== null ? vp.toScreen(t.x, t.y) : null;
}
