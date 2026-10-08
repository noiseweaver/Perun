// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import { iosAppHeight } from './pwa.ts';

describe('iosAppHeight', () => {
  // iPhone 17 Pro: iOS reports the screen in portrait whatever the orientation
  it('fills the screen held upright', () => {
    expect(iosAppHeight(402, 874, 402)).toBe(874);
  });
  it('fills the screen on its side', () => {
    expect(iosAppHeight(402, 874, 874)).toBe(402);
  });
  it('follows the window when the screen is reported rotated (iPadOS)', () => {
    expect(iosAppHeight(1194, 834, 834)).toBe(1194);
    expect(iosAppHeight(1194, 834, 1194)).toBe(834);
  });
  it('leaves split view and resized windows alone', () => {
    expect(iosAppHeight(834, 1194, 500)).toBeNull();
  });
});
