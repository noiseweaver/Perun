// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 ts/Point.ts (dev-ts) at 7ec858d662d8be1d76d54241ba3a5c1d1c524f51.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

/** A grid point. `z` tells the bits of a bus apart; it is 0 for ordinary posts. */
export class Point {
  x: number;
  y: number;
  z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  static copy(p: Point): Point {
    return new Point(p.x, p.y, p.z);
  }

  equals(other: Point | null): boolean {
    return other !== null && this.x === other.x && this.y === other.y && this.z === other.z;
  }

  /** Map key with the same equality as `equals` (upstream's `SimulationManager.pointKey`). */
  key(): string {
    return `${this.x},${this.y},${this.z}`;
  }

  toString(): string {
    return this.z !== 0 ? `Point(${this.x},${this.y},${this.z})` : `Point(${this.x},${this.y})`;
  }
}
