// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/EditCompositeModelDialog.java
// (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: the pin layout logic, without the dialog.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { SIDE_E, SIDE_N, SIDE_S, SIDE_W } from '../elm/ChipElm.ts';
import type { CustomCompositeChipElm } from '../elm/CustomCompositeElm.ts';
import type { CustomCompositeModel, ExtListEntry } from './CustomCompositeModel.ts';

/**
 * Upstream `createModel`, after `getCircuitAsComposite`: sort the pins by name, check them, and
 * size the chip to fit. Returns an error message, or null when the model is ready.
 */
export function layoutNewModel(model: CustomCompositeModel): string | null {
  if (model.extList.length === 0) return 'Device has no external inputs/outputs!';
  // Java's String.compareTo on lowercased names (a stable sort, like Collections.sort)
  model.extList.sort((a, b) => {
    const x = a.name.toLowerCase();
    const y = b.name.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const postCount = model.extList.length;
  const sideCounts = [0, 0, 0, 0];
  const nodeSet = new Set<number>();
  for (const pin of model.extList) {
    // only the first pin of each bus counts for the layout
    if (pin.busZ === 0) sideCounts[pin.side] += 1;
    if (nodeSet.has(pin.node)) return "Can't have two input/output nodes connected!";
    nodeSet.add(pin.node);
  }
  const xOffsetLeft = sideCounts[SIDE_W] > 0 ? 1 : 0;
  const xOffsetRight = sideCounts[SIDE_E] > 0 ? 1 : 0;
  for (let i = 0; i !== postCount; i++) {
    const pin = model.extList[i];
    if (pin.side === SIDE_N || pin.side === SIDE_S) pin.pos += xOffsetLeft;
  }
  const minHeight = sideCounts[SIDE_N] > 0 && sideCounts[SIDE_S] > 0 ? 2 : 1;
  const minWidth = 2;
  const pinsNS = Math.max(sideCounts[SIDE_N], sideCounts[SIDE_S]);
  const pinsWE = Math.max(sideCounts[SIDE_W], sideCounts[SIDE_E]);
  model.sizeX = Math.max(minWidth, pinsNS + xOffsetLeft + xOffsetRight);
  model.sizeY = Math.max(minHeight, pinsWE);
  return null;
}

/** Upstream `createPinsFromModel`: the chip shows the model's pins, outline and selection. */
export function createPinsFromModel(
  chip: CustomCompositeChipElm,
  model: CustomCompositeModel,
  selectedPins: ReadonlySet<number>,
): void {
  const postCount = model.extList.length;
  chip.allocPins(postCount);
  chip.sizeX = model.sizeX;
  chip.sizeY = model.sizeY;
  for (let i = 0; i !== postCount; i++) {
    const pin = model.extList[i];
    chip.setPin(i, pin.pos, pin.side, pin.name);
    chip.pins[i].busWidth = pin.busWidth;
    chip.pins[i].busZ = pin.busZ;
    if (selectedPins.has(i)) chip.pins[i].selected = true;
  }
  chip.allocNodes();
  chip.setPoints();
}

/**
 * Upstream `adjustChipSize`: grow or shrink the outline by one slot. Shrinking keeps every pin
 * on the chip, moving the side pins up if there is room at the top. Returns whether it changed.
 */
export function adjustChipSize(model: CustomCompositeModel, dx: number, dy: number): boolean {
  const pins = model.extList;
  if (dx < 0) {
    for (const p of pins) {
      if (p.busZ > 0) continue;
      if ((p.side === SIDE_N || p.side === SIDE_S) && p.pos >= model.sizeX + dx) return false;
    }
  }
  if (dy < 0) {
    let needShift = false;
    for (const p of pins) {
      if (p.busZ > 0) continue;
      if ((p.side === SIDE_E || p.side === SIDE_W) && p.pos >= model.sizeY + dy) {
        needShift = true;
        break;
      }
    }
    if (needShift) {
      // there must be room at the top (no side pin at 0)
      for (const p of pins) {
        if (p.busZ > 0) continue;
        if ((p.side === SIDE_E || p.side === SIDE_W) && p.pos === 0) return false;
      }
      for (const p of pins) if (p.side === SIDE_E || p.side === SIDE_W) p.pos -= 1;
    }
  }
  if (model.sizeX + dx < 1 || model.sizeY + dy < 1) return false;
  model.sizeX += dx;
  model.sizeY += dy;
  return true;
}

/** Set a pin's place, and that of every other bit of the same bus. */
function placePin(pins: ExtListEntry[], i: number, pos: number, side?: number): void {
  const pj = pins[i];
  pj.pos = pos;
  if (side !== undefined) pj.side = side;
  for (const pjj of pins) {
    if (pjj.name === pj.name && pjj.busWidth === pj.busWidth) {
      pjj.pos = pos;
      if (side !== undefined) pjj.side = side;
    }
  }
}

/**
 * Dragging selected pins along the outline (upstream's mouse handlers). Every move starts again
 * from the places the pins had when the drag began, so moves don't accumulate.
 */
export class PinDrag {
  private readonly startPos: number[];
  private readonly startSide: number[];
  private readonly dragStartPos: number;
  private readonly dragStartSide: number;
  /** The side the dragged pin is on now (getPinPos keeps it unless another is clearly nearer). */
  currentSide: number;

  private readonly model: CustomCompositeModel;
  private readonly selectedPins: ReadonlySet<number>;

  constructor(model: CustomCompositeModel, selectedPins: ReadonlySet<number>, selectedPin: number) {
    this.model = model;
    this.selectedPins = selectedPins;
    this.startPos = model.extList.map((p) => p.pos);
    this.startSide = model.extList.map((p) => p.side);
    const sp = model.extList[selectedPin];
    this.dragStartPos = sp.pos;
    this.dragStartSide = this.currentSide = sp.side;
  }

  /** Move the dragged pin to slot `pos` on `side` (from the chip's getPinPos). */
  move(pos: number, side: number): void {
    const pins = this.model.extList;
    const postCount = pins.length;
    const { startPos, startSide, dragStartPos, dragStartSide, selectedPins } = this;
    this.currentSide = side;
    for (let i = 0; i < postCount; i++) {
      pins[i].pos = startPos[i];
      pins[i].side = startSide[i];
    }
    const sizeX = this.model.sizeX;
    const sizeY = this.model.sizeY;
    let newSide = side;
    let maxNewPos = newSide === SIDE_N || newSide === SIDE_S ? sizeX - 1 : sizeY - 1;
    let minOff = Number.MAX_SAFE_INTEGER;
    let maxOff = Number.MIN_SAFE_INTEGER;
    let sameSideCount = 0;
    for (const idx of selectedPins) {
      if (startSide[idx] !== dragStartSide) continue;
      sameSideCount++;
      const off = startPos[idx] - dragStartPos;
      if (off < minOff) minOff = off;
      if (off > maxOff) maxOff = off;
    }
    const groupSize = maxOff - minOff + 1;
    // a group that doesn't fit on the target side stays on its own side
    if (groupSize > maxNewPos + 1) {
      newSide = dragStartSide;
      maxNewPos = newSide === SIDE_N || newSide === SIDE_S ? sizeX - 1 : sizeY - 1;
    }
    const anchor = Math.max(-minOff, Math.min(maxNewPos - maxOff, pos));
    const delta = anchor - dragStartPos;
    const sameSide = newSide === dragStartSide;
    const contiguous = groupSize === sameSideCount;
    const free = (i: number): boolean => !selectedPins.has(i) && pins[i].busZ === 0;

    if (sameSide && contiguous) {
      // every pin the group sweeps over shifts by the group's size the other way
      for (let i = 0; i < postCount; i++) {
        if (!free(i) || startSide[i] !== dragStartSide) continue;
        const origPos = startPos[i];
        let newPos: number;
        if (delta >= 0)
          newPos =
            origPos >= dragStartPos + maxOff + 1 && origPos <= anchor + maxOff
              ? origPos - groupSize
              : origPos;
        else
          newPos =
            origPos >= anchor + minOff && origPos <= dragStartPos + minOff - 1
              ? origPos + groupSize
              : origPos;
        if (newPos !== origPos) placePin(pins, i, newPos);
      }
    } else {
      // across sides, or a group with gaps: only pins where the group lands move, the other way
      const groupPos = new Set<number>();
      for (const idx of selectedPins) {
        if (startSide[idx] !== dragStartSide) continue;
        groupPos.add(anchor + startPos[idx] - dragStartPos);
      }
      const displaced: number[] = [];
      const taken = new Set<number>();
      for (let i = 0; i < postCount; i++) {
        if (!free(i) || startSide[i] !== newSide) continue;
        if (groupPos.has(startPos[i])) displaced.push(i);
        else taken.add(startPos[i]);
      }
      const available: number[] = [];
      for (let slot = 0; slot <= maxNewPos; slot++)
        if (!groupPos.has(slot) && !taken.has(slot)) available.push(slot);
      displaced.sort((a, b) => startPos[a] - startPos[b]);
      const slots: number[] = [];
      const below = (): void => {
        for (let k = available.length - 1; k >= 0 && slots.length < displaced.length; k--)
          if (available[k] < anchor) slots.push(available[k]);
      };
      const above = (): void => {
        for (let k = 0; k < available.length && slots.length < displaced.length; k++)
          if (available[k] > anchor + maxOff) slots.push(available[k]);
      };
      if (delta >= 0) {
        below();
        above();
      } else {
        above();
        below();
      }
      slots.sort((a, b) => a - b);
      for (let k = 0; k < displaced.length && k < slots.length; k++)
        placePin(pins, displaced[k], slots[k]);
    }
    // the selected pins go to their new places
    for (const idx of selectedPins) {
      if (startSide[idx] !== dragStartSide) continue;
      placePin(pins, idx, anchor + startPos[idx] - dragStartPos, newSide);
    }
  }
}

/** The pin (not a bus bit) whose name is within 20 units of (x, y), or -1. */
export function findNearestPin(chip: CustomCompositeChipElm, x: number, y: number): number {
  let bestdist = 20;
  let best = -1;
  for (let i = 0; i !== chip.pins.length; i++) {
    const p = chip.pins[i];
    if (p.busZ > 0) continue;
    const dist = Math.hypot(Math.trunc(x) - p.textloc.x, Math.trunc(y) - p.textloc.y);
    if (dist < bestdist) {
      bestdist = dist;
      best = i;
    }
  }
  return best;
}

/** Upstream `pinToGrid`: a pin's cell in the chip's grid, to tell when two pins collide. */
function pinToGrid(pos: number, side: number, sizeX: number, sizeY: number): number {
  if (side === SIDE_N) return pos;
  if (side === SIDE_S) return pos + sizeX * (sizeY - 1);
  if (side === SIDE_W) return pos * sizeX;
  if (side === SIDE_E) return pos * sizeX + sizeX - 1;
  return -1;
}

function pinIsOccupied(
  pos: number,
  side: number,
  placed: [number, number][],
  sizeX: number,
  sizeY: number,
): boolean {
  const g = pinToGrid(pos, side, sizeX, sizeY);
  if (g < 0) return true;
  for (const p of placed) if (pinToGrid(p[0], p[1], sizeX, sizeY) === g) return true;
  return false;
}

/**
 * Upstream `preservePinLayout`: pins of `newModel` keep the place and side they had in
 * `existingModel` (matched by name); new pins go in free slots on their side, growing the chip
 * only if they must.
 */
export function preservePinLayout(
  newModel: CustomCompositeModel,
  existingModel: CustomCompositeModel,
): void {
  const n = newModel.extList.length;
  const matched = new Array<boolean>(n).fill(false);
  let anyPreserved = false;
  const placed: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const ent = newModel.extList[i];
    if (ent.busZ !== 0) continue;
    for (const old of existingModel.extList) {
      if (old.busZ === 0 && old.name === ent.name) {
        ent.pos = old.pos;
        ent.side = old.side;
        matched[i] = true;
        anyPreserved = true;
        break;
      }
    }
    if (matched[i]) placed.push([ent.pos, ent.side]);
  }
  if (!anyPreserved) return;

  newModel.sizeX = existingModel.sizeX;
  newModel.sizeY = existingModel.sizeY;

  // expansions outside, positions inside, so a corner taken at one size can be free at the next
  for (let i = 0; i < n; i++) {
    if (matched[i]) continue;
    const ent = newModel.extList[i];
    if (ent.busZ !== 0) continue;
    const side = ent.side;
    const ns = side === SIDE_N || side === SIDE_S;
    let foundPos = -1;
    for (let expansion = 0; expansion <= n && foundPos < 0; expansion++) {
      const curSizeX = newModel.sizeX + (ns ? expansion : 0);
      const curSizeY = newModel.sizeY + (ns ? 0 : expansion);
      const maxPos = ns ? curSizeX : curSizeY;
      for (let p = 0; p < maxPos; p++) {
        if (!pinIsOccupied(p, side, placed, curSizeX, curSizeY)) {
          foundPos = p;
          newModel.sizeX = curSizeX;
          newModel.sizeY = curSizeY;
          break;
        }
      }
    }
    ent.pos = foundPos >= 0 ? foundPos : 0;
    placed.push([ent.pos, side]);
  }

  // bus bits follow their first bit
  for (const ent of newModel.extList) {
    if (ent.busZ === 0) continue;
    for (const anchor of newModel.extList) {
      if (anchor.busZ === 0 && anchor.name === ent.name) {
        ent.pos = anchor.pos;
        ent.side = anchor.side;
        break;
      }
    }
  }
}
