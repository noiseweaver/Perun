// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 ts/CircuitNode.ts, ts/CircuitNodeLink.ts, ts/VoltageSource.ts and
// ts/CircuitMatrix.ts (dev-ts) at 7ec858d662d8be1d76d54241ba3a5c1d1c524f51.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import type { SimElement } from './SimElement.ts';
import type { SparseLU } from './sparse/SparseLU.ts';

/** One post (or internal node) of one element attached to a node. */
export interface CircuitNodeLink {
  num: number;
  elm: SimElement;
}

export class CircuitNode {
  links: CircuitNodeLink[] = [];
  internal = false;
  index = 0;
  matrix: CircuitMatrix | null = null;
  /** Row in `matrix`, 1-based; 0 means ground or not in any matrix. */
  row = 0;
  /** Node voltage, written after every solve (upstream master keeps a copy per element). */
  v = 0;

  toString(): string {
    return `node ${this.index}`;
  }
}

/**
 * Placeholder in an element's `nodes` before analysis assigns real nodes. Upstream master leaves
 * those slots null; dev-ts fills them with the ground node. Never stamped (row 0).
 */
export const UNASSIGNED_NODE: CircuitNode = new CircuitNode();
UNASSIGNED_NODE.index = -1;

/** A voltage-source unknown: one extra row and column in its matrix. */
export class VoltageSource {
  index = 0;
  elm: SimElement;
  matrix: CircuitMatrix | null = null;
  /** Row in `matrix`, 1-based, after the node rows. */
  row = 0;
  /** Nodes the source is stamped between, used to pick its matrix. */
  n1: CircuitNode | null = null;
  n2: CircuitNode | null = null;

  constructor(elm: SimElement) {
    this.elm = elm;
  }

  setNodes(n1: CircuitNode, n2: CircuitNode): void {
    this.n1 = n1;
    this.n2 = n2;
  }

  /** Use the matrix of the non-ground terminal, else the element's last post's matrix. */
  assignMatrix(ground: CircuitNode): void {
    if (this.n1 !== null && this.n1 !== ground && this.n1.matrix !== null)
      this.matrix = this.n1.matrix;
    else if (this.n2 !== null && this.n2 !== ground && this.n2.matrix !== null)
      this.matrix = this.n2.matrix;
    else this.matrix = this.elm.getNode(this.elm.getPostCount() - 1).matrix;
  }
}

/** One independent MNA system: the nodes of one closure plus their voltage sources. */
export class CircuitMatrix {
  matrix: number[][] = [];
  rightSide: number[] = [];
  origRightSide: number[] = [];
  origMatrix: number[][] = [];
  permute: number[] = [];
  size = 0;
  /** Node rows come first; voltage-source rows follow. */
  nodeCount = 0;
  nonLinear = false;
  nodeVoltages: number[] = [];
  lastNodeVoltages: number[] | null = null;
  sparseLU: SparseLU | null = null;
  nodeList: CircuitNode[] = [];
  voltageSourceList: VoltageSource[] = [];
}
