// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 ts/FindPathInfo.ts (dev-ts) at 7ec858d662d8be1d76d54241ba3a5c1d1c524f51.
// Checked against src/com/lushprojects/circuitjs1/client/FindPathInfo.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { CircuitNode } from './CircuitNode.ts';
import type { SimElement } from './SimElement.ts';
import type { Simulation } from './Simulation.ts';

export const PathType = {
  /** A path free of current sources (inductors, current sources need one). */
  INDUCT: 1,
  /** A loop of voltage sources and wires only. */
  VOLTAGE: 2,
  /** A path of wires only. */
  SHORT: 3,
  /** A loop of ideal capacitors, voltage sources and wires. */
  CAP_V: 4,
} as const;
export type PathType = (typeof PathType)[keyof typeof PathType];

/** Depth-first search for a path from a node back to `dest`, avoiding `firstElm`. */
export class FindPathInfo {
  private readonly visited: boolean[];
  private readonly dest: CircuitNode;
  private readonly firstElm: SimElement;
  private readonly type: PathType;
  private readonly sim: Simulation;

  constructor(type: PathType, elm: SimElement, dest: CircuitNode, sim: Simulation) {
    this.dest = dest;
    this.type = type;
    this.firstElm = elm;
    this.sim = sim;
    this.visited = new Array<boolean>(sim.nodeList.length).fill(false);
  }

  findPath(n1: CircuitNode): boolean {
    if (n1 === this.dest) return true;

    // depth first search, don't need to revisit already visited nodes
    if (this.visited[n1.index]) return false;
    this.visited[n1.index] = true;

    for (const cnl of n1.links) if (this.checkElm(n1, cnl.elm)) return true;
    if (n1 === this.sim.ground) {
      for (const ce of this.sim.nodesWithGroundConnection)
        if (this.checkElm(this.sim.ground, ce)) return true;
    }
    return false;
  }

  private checkElm(n1: CircuitNode, ce: SimElement): boolean {
    if (ce === this.firstElm) return false;
    // inductors need a path free of current sources
    if (this.type === PathType.INDUCT && ce.isCurrentElm()) return false;
    // when checking for voltage loops, we only care about voltage sources/wires/ground
    if (
      this.type === PathType.VOLTAGE &&
      !(ce.isWireEquivalent() || ce.isVoltageElm() || ce.isLogicInputElm() || ce.isGroundElm())
    )
      return false;
    // when checking for shorts, just check wires
    if (this.type === PathType.SHORT && !ce.isWireEquivalent()) return false;
    if (
      this.type === PathType.CAP_V &&
      !(ce.isWireEquivalent() || ce.isIdealCapacitor() || ce.isVoltageElm() || ce.isLogicInputElm())
    )
      return false;

    const ground = this.sim.ground;
    if (n1 === ground) {
      // our path can go through ground, via posts that have a ground connection
      for (let j = 0; j < ce.getPostCount(); j++)
        if (ce.hasGroundConnection(j) && this.findPath(ce.getNode(j))) return true;
    }
    for (let j = 0; j < ce.getPostCount(); j++) {
      if (ce.getNode(j) !== n1) continue;
      if (ce.hasGroundConnection(j) && this.findPath(ground)) return true;
      if (this.type === PathType.INDUCT && ce.isInductorElm()) {
        // inductors can use paths with other inductors of matching current
        let c = ce.getCurrent();
        if (j === 0) c = -c;
        if (Math.abs(c - this.firstElm.getCurrent()) > 1e-10) continue;
      }
      for (let k = 0; k < ce.getPostCount(); k++) {
        if (j === k) continue;
        if (ce.getConnection(j, k) && this.findPath(ce.getNode(k))) return true;
      }
    }
    return false;
  }
}
