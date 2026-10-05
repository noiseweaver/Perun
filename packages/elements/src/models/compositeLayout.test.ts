// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import { SIDE_E, SIDE_N, SIDE_W } from '../elm/ChipElm.ts';
import { CustomCompositeModel, ExtListEntry } from './CustomCompositeModel.ts';
import { PinDrag, adjustChipSize, layoutNewModel, preservePinLayout } from './compositeLayout.ts';

/** Pins a, b, c on the left and d on the right of a 2 x 3 chip. */
function model(): CustomCompositeModel {
  const m = new CustomCompositeModel();
  m.extList = [
    new ExtListEntry('c', 3, 2, SIDE_W),
    new ExtListEntry('a', 1, 0, SIDE_W),
    new ExtListEntry('d', 4, 0, SIDE_E),
    new ExtListEntry('b', 2, 1, SIDE_W),
  ];
  expect(layoutNewModel(m)).toBeNull();
  return m;
}

const places = (m: CustomCompositeModel) => m.extList.map((p) => [p.name, p.side, p.pos]);

describe('pin layout', () => {
  it('sorts the pins by name and sizes the chip', () => {
    const m = model();
    expect(m.extList.map((p) => p.name)).toEqual(['a', 'b', 'c', 'd']);
    expect([m.sizeX, m.sizeY]).toEqual([2, 3]);
  });

  it('refuses two pins on one node', () => {
    const m = new CustomCompositeModel();
    m.extList = [new ExtListEntry('x', 1), new ExtListEntry('y', 1)];
    expect(layoutNewModel(m)).toBe("Can't have two input/output nodes connected!");
  });

  it('shrinks only while every pin stays on the chip', () => {
    const m = model();
    // c sits in the bottom slot and a in the top one: no room either way
    expect(adjustChipSize(m, 0, -1)).toBe(false);
    expect(adjustChipSize(m, 1, 1)).toBe(true);
    expect([m.sizeX, m.sizeY]).toEqual([3, 4]);
    // the empty bottom row goes again
    expect(adjustChipSize(m, 0, -1)).toBe(true);
    expect([m.sizeX, m.sizeY]).toEqual([3, 3]);
  });

  it('drags a pin along its side, moving the ones it passes', () => {
    const m = model();
    const drag = new PinDrag(m, new Set([0]), 0);
    drag.move(2, SIDE_W);
    expect(places(m)).toEqual([
      ['a', SIDE_W, 2],
      ['b', SIDE_W, 0],
      ['c', SIDE_W, 1],
      ['d', SIDE_E, 0],
    ]);
    // moves start again from where the drag began
    drag.move(1, SIDE_W);
    expect(places(m).slice(0, 3)).toEqual([
      ['a', SIDE_W, 1],
      ['b', SIDE_W, 0],
      ['c', SIDE_W, 2],
    ]);
  });

  it('drags a pin to another side, pushing the pin there aside', () => {
    const m = model();
    new PinDrag(m, new Set([0]), 0).move(0, SIDE_E);
    expect(places(m)).toEqual([
      ['a', SIDE_E, 0],
      ['b', SIDE_W, 1],
      ['c', SIDE_W, 2],
      ['d', SIDE_E, 1],
    ]);
  });

  it('keeps the old places of pins an edited model still has', () => {
    const old = model();
    new PinDrag(old, new Set([0]), 0).move(1, SIDE_N);
    const next = new CustomCompositeModel();
    next.extList = [new ExtListEntry('a', 1), new ExtListEntry('e', 5)];
    expect(layoutNewModel(next)).toBeNull();
    preservePinLayout(next, old);
    expect([next.sizeX, next.sizeY]).toEqual([old.sizeX, old.sizeY]);
    expect(places(next)[0]).toEqual(['a', SIDE_N, 1]);
    // the new pin finds a free slot on its own side
    expect(next.extList[1].side).toBe(SIDE_W);
  });
});
