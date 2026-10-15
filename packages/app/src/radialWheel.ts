// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// The radial wheel: a ring of the favorite components that opens around the pointer (key q, a
// right-button flick on empty canvas, or a long press on a touch screen) and drops the one picked
// where it opened (not upstream).

import { create } from 'zustand';
import type { PaletteItem } from './editor/catalog.ts';
import { quickPickItems, useQuickPick } from './quickPick.ts';
import { useApp } from './store.ts';

/** Most wedges on the wheel: the first favorites. */
export const WHEEL_SLOTS = 8;

/** How far the pointer must move from the centre before a wedge lights up. */
export const WHEEL_DEAD_ZONE = 24;

/** How the wheel was opened, which decides what lifting the key, button or finger does. */
export type WheelVia = 'key' | 'flick' | 'touch';

export interface WheelState {
  /** Where it opened, in client pixels. */
  x: number;
  y: number;
  /** Where the part goes, in circuit coordinates. */
  gx: number;
  gy: number;
  via: WheelVia;
  /** The pointer that is still down while the wheel opens (flick and touch). */
  pointerId: number | null;
  /** When it opened (performance.now()), so a quick tap of q leaves it open. */
  openedAt: number;
}

export const useWheel = create<{ wheel: WheelState | null; lit: number }>(() => ({
  wheel: null,
  lit: -1,
}));

/** The parts on the wheel: the first favorites that this circuit can place. */
export function wheelItems(
  favorites: readonly string[] = useQuickPick.getState().favorites,
  models: readonly string[] = useApp.getState().subcircuitModels,
): PaletteItem[] {
  return quickPickItems(favorites, [], models).favorites.slice(0, WHEEL_SLOTS);
}

export function openWheel(w: Omit<WheelState, 'openedAt'>): void {
  useWheel.setState({ wheel: { ...w, openedAt: performance.now() }, lit: -1 });
}

export function closeWheel(): void {
  if (useWheel.getState().wheel !== null) useWheel.setState({ wheel: null, lit: -1 });
}

export function setLit(lit: number): void {
  if (useWheel.getState().lit !== lit) useWheel.setState({ lit });
}

/** The angle of wedge `i` of `n` in radians: the first at the top, then clockwise. */
export function wedgeAngle(i: number, n: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / n;
}

/** The wedge in the direction (dx, dy) from the centre (screen axes, y down), or -1 inside the dead zone. */
export function wedgeAt(dx: number, dy: number, n: number): number {
  if (n <= 0 || Math.hypot(dx, dy) < WHEEL_DEAD_ZONE) return -1;
  const turn = (Math.atan2(dy, dx) + Math.PI / 2) / (2 * Math.PI);
  return (((Math.round(turn * n) % n) + n) % n) | 0;
}

/** A part flicked straight up or down is placed upright, every other way lying down. */
export function wedgeVertical(i: number, n: number): boolean {
  return Math.abs(Math.sin(wedgeAngle(i, n))) > 0.9;
}
