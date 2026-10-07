// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 ts/SimulationManager.ts (dev-ts) at
// 7ec858d662d8be1d76d54241ba3a5c1d1c524f51: circuit analysis, node numbering, closures, stamping,
// the run loop and wire currents. Checked line by line against
// src/com/lushprojects/circuitjs1/client/SimulationManager.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032, which the golden fixtures come from; where the two
// differ this follows master (see the notes on setNodeVoltages and makeNodeList).
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { CircuitMatrix, CircuitNode, VoltageSource } from './CircuitNode.ts';
import { JavaRandom } from './JavaRandom.ts';
import { luFactorDense, luSolveDense } from './lu.ts';
import { Point } from './Point.ts';
import type { SimElement } from './SimElement.ts';
import { DMatrixSparseCSC } from './sparse/DMatrixSparseCSC.ts';
import { SparseLU } from './sparse/SparseLU.ts';

/** One bit of a wire-like element, with what it needs to compute its current. */
export class WireSegment {
  wire: SimElement;
  bit: number;
  endpoint0: string;
  endpoint1: string | null;
  /** Neighbours at the endpoint used for the current calculation. */
  neighbors: SimElement[] = [];
  /** Other segments sharing this segment's label endpoint. */
  labelNeighbors: WireSegment[] = [];
  /** Which endpoint is used: 0 or 1. */
  post = 0;
  /** Set by calcWireCurrents, read by label neighbours. */
  current = 0;

  constructor(wire: SimElement, bit: number, ep0: string, ep1: string | null) {
    this.wire = wire;
    this.bit = bit;
    this.endpoint0 = ep0;
    this.endpoint1 = ep1;
  }
}

class NodeMapEntry {
  node: CircuitNode | null;
  constructor(node: CircuitNode | null = null) {
    this.node = node;
  }
}

/** Bus widths found so far, by post position (`Point.key()` with z = 0) and by label name. */
export interface BusWidthMaps {
  readonly width: Map<string, number>;
  readonly label: Map<string, number>;
  /** Positions where two different widths meet. */
  readonly mismatches: Point[];
}

/** First post seen for each label name during wire closure (upstream `LabeledNodeElm.labelList`). */
export interface LabelEntry {
  point: Point;
  node: CircuitNode | null;
}

export const SolverType = { AUTO: 0, DENSE: 1, SPARSE: 2 } as const;
export type SolverType = (typeof SolverType)[keyof typeof SolverType];

/** Matrices of this many rows or more use the sparse LU when the solver is AUTO. */
export const SPARSE_THRESHOLD = 150;

/**
 * The simulator: owns the element list, the node list and the matrices, and advances time.
 * Upstream splits this between `SimulationManager` and global `CirSim` state; everything the
 * simulation reads lives here, so several circuits can run in one process.
 */
export class Simulation {
  /** Top-level elements in file order (upstream `app.elmList`). */
  elements: SimElement[] = [];
  /**
   * The elements as the editor has them now, which `elements` catches up with at the next
   * analysis. Routed wires route around these (upstream reads `app.elmList` directly).
   */
  currentElements: () => readonly SimElement[] = () => this.elements;
  /** Flattened list actually simulated: top-level elements, then composite children. */
  elmList: SimElement[] = [];
  elmArr: SimElement[] = [];
  nodeList: CircuitNode[] = [];
  voltageSources: VoltageSource[] = [];
  matrices: CircuitMatrix[] | null = null;
  circuitNonLinear = false;
  voltageSourceCount = 0;
  needsStamp = false;
  /** Set when the circuit changed; the next `step()` re-analyzes. */
  analyzeFlag = false;
  /** Find the DC operating point on the next step (capacitors open, sources at bias). */
  dcAnalysisFlag = false;

  /** The ground node of the current analysis (upstream's static `CircuitNode.ground`). */
  ground: CircuitNode = new CircuitNode();

  t = 0;
  /** Current timestep; below maxTimeStep only while the adaptive timestep is backing off. */
  timeStep = 5e-6;
  maxTimeStep = 5e-6;
  minTimeStep = 50e-12;
  adjustTimeStep = false;
  timeStepAccum = 0;
  timeStepCount = 0;
  /** An element asked to pause the simulation (see requestPause). */
  pauseRequested = false;
  solverType: SolverType = SolverType.AUTO;
  usingSparse = false;
  /**
   * Circuit temperature in °C (not in upstream, DEVIATIONS.md). Upstream's semiconductor models
   * are all at SPICE's nominal 27 °C, and at 27 °C the elements run upstream's code unchanged.
   * With a ramp it is the starting ambient temperature; see `ambientTemperature()`.
   */
  temperature = 27;
  /**
   * Not in upstream (DEVIATIONS.md): the ambient temperature moves linearly from `temperature`
   * to `to` °C over `duration` seconds of simulated time, then stays there. Null for none.
   */
  temperatureRamp: { to: number; duration: number } | null = null;
  /**
   * Not in upstream (DEVIATIONS.md): parts heat from their own power and cool towards the
   * ambient temperature (elements' `thermal`). Off by default.
   */
  selfHeating = false;
  /**
   * Set by an element whose stamped values went stale (a resistor whose temperature moved): the
   * matrices are stamped again before the next timestep. Never set at the default temperature.
   */
  restampRequested = false;

  converged = false;
  subIterations = 0;

  /**
   * Grid spacing (upstream `app.gridSize`: 8 with the small-grid option, else 16). Not a
   * simulation setting, but some elements snap their posts to it (potentiometer).
   */
  gridSize = 16;

  /** Upstream's `CirSim.random`. Seed it for reproducible noise. */
  random: JavaRandom = new JavaRandom(Date.now());

  stopMessage: string | null = null;
  stopElm: SimElement | null = null;

  /**
   * With no scope watching a wire, upstream computes wire currents once per frame instead of per
   * step (`ScopeManager.canDelayWireProcessing`). Values after a `step()` call are the same.
   */
  delayWireProcessing = true;

  /** Asked at the start of each `step()`; scopes set it (upstream asks the scope manager). */
  canDelayWireProcessing: (() => boolean) | null = null;

  /** Called after every timestep, as upstream `CirSim.onTimeStep()` (scopes sample here). */
  onTimeStep: (() => void) | null = null;

  // Wire-closure state (upstream keeps these in statics on GroundElm and LabeledNodeElm).
  firstGround: Point | null = null;
  labelList = new Map<string, LabelEntry>();

  private nodeMap = new Map<string, NodeMapEntry>();
  wireInfoList: WireSegment[] = [];
  private wireInfoElmSet = new Set<SimElement>();
  private wireInfoResolved = new Map<SimElement, Set<number>>();
  unconnectedNodes: number[] = [];
  nodesWithGroundConnection: SimElement[] = [];

  /** Replace the circuit. Elements get `sim` set; the next step re-analyzes. */
  setElements(elements: SimElement[]): void {
    this.elements = elements;
    for (const e of elements) this.attach(e);
    this.matrices = null;
    this.analyzeFlag = true;
  }

  private attach(e: SimElement): void {
    e.sim = this;
    const children = e.getChildElmList();
    if (children) for (const c of children) this.attach(c);
  }

  /** The ambient temperature in °C at the current simulated time. */
  ambientTemperature(): number {
    const ramp = this.temperatureRamp;
    if (ramp === null) return this.temperature;
    const f = ramp.duration > 0 ? Math.min(this.t / ramp.duration, 1) : 1;
    return this.temperature + (ramp.to - this.temperature) * f;
  }

  resetTime(): void {
    this.t = this.timeStepAccum = 0;
    this.timeStepCount = 0;
    this.pauseRequested = false;
  }

  /** Zero every node voltage (dev-ts `resetNodes`, used by the reset button). */
  resetNodes(): void {
    for (const cn of this.nodeList) cn.v = 0;
  }

  getElm(n: number): SimElement | null {
    return n < this.elmList.length ? this.elmList[n] : null;
  }

  newWireSegment(wire: SimElement, bit: number, ep0: string, ep1: string | null): WireSegment {
    return new WireSegment(wire, bit, ep0, ep1);
  }

  // ---- analysis ------------------------------------------------------------------------------

  /**
   * Group points joined by wires, grounds and labels so they share one node. The node itself is
   * not allocated yet; joined points share a NodeMapEntry.
   */
  calculateWireClosure(): void {
    this.labelList = new Map();
    this.firstGround = null;
    const list = this.elmList;
    const nm = new Map<string, NodeMapEntry>();
    this.wireInfoList = [];
    this.wireInfoElmSet = new Set(list);
    for (const ce of list) {
      if (!ce.isRemovableWire()) continue;
      // must come before getConnectedPost() below: grounds and labels record their first post
      ce.getWireSegments(this.wireInfoList);

      const bw = ce.getBusWidth();
      for (let j = 0; j < bw; j++) {
        const k0 = ce.getPost(j).key();
        let cn = nm.get(k0);

        // what post are we connected to
        const p1 = ce.getConnectedPost(j);
        if (p1 === null) {
          // no connected post (first labeled node of its name, or the first ground)
          if (cn === undefined) {
            cn = new NodeMapEntry();
            nm.set(k0, cn);
          }
          continue;
        }
        const k1 = p1.key();
        const cn2 = nm.get(k1);
        if (cn !== undefined && cn2 !== undefined) {
          // merge: every key pointing to cn2 now points to cn
          for (const [key, val] of nm) if (val === cn2) nm.set(key, cn);
        } else if (cn !== undefined) {
          nm.set(k1, cn);
        } else if (cn2 !== undefined) {
          nm.set(k0, cn2);
        } else {
          cn = new NodeMapEntry();
          nm.set(k0, cn);
          nm.set(k1, cn);
        }
      }
    }
    this.nodeMap = nm;
  }

  private isWireInfoResolved(ce: SimElement, bit: number): boolean {
    return this.wireInfoResolved.get(ce)?.has(bit) ?? false;
  }

  private setWireInfoResolved(ce: SimElement, bit: number): void {
    let bits = this.wireInfoResolved.get(ce);
    if (!bits) {
      bits = new Set();
      this.wireInfoResolved.set(ce, bits);
    }
    bits.add(bit);
  }

  /**
   * Order the wire segments so each one's current can be computed from neighbours already
   * known. Wires are not in the matrix, so their currents come from the elements around them.
   */
  calcWireInfo(): boolean {
    let moved = 0;
    this.wireInfoResolved = new Map();

    // label endpoint -> segments sharing it
    const labelMap = new Map<string, WireSegment[]>();
    for (const ws of this.wireInfoList) {
      if (ws.endpoint1?.startsWith('label:')) {
        let list = labelMap.get(ws.endpoint1);
        if (!list) {
          list = [];
          labelMap.set(ws.endpoint1, list);
        }
        list.push(ws);
      }
    }

    const list = this.wireInfoList;
    for (let i = 0; i !== list.length; i++) {
      const ws = list[i];
      const wire = ws.wire;
      const cn1 = wire.getNode(ws.bit);
      const neighbors0: SimElement[] = [];
      const neighbors1: SimElement[] = [];
      const labelNeighbors: WireSegment[] = [];
      let isReady0 = true;
      let isReady1 = !wire.isGroundElm();

      // position-based matching via cn.links
      for (const cnl of cn1.links) {
        const ce = cnl.elm;
        if (ce === wire) continue;
        if (!this.wireInfoElmSet.has(ce)) continue;
        if (cnl.num >= ce.getPostCount()) continue;
        const ptKey = ce.getPost(cnl.num).key();
        const neighborBit = cnl.num % ce.getBusWidth();
        const notReady = ce.isRemovableWire() && !this.isWireInfoResolved(ce, neighborBit);
        if (ws.endpoint0 === ptKey) {
          neighbors0.push(ce);
          if (notReady) isReady0 = false;
        } else if (
          ws.endpoint1 !== null &&
          !ws.endpoint1.startsWith('label:') &&
          ws.endpoint1 === ptKey
        ) {
          neighbors1.push(ce);
          if (notReady) isReady1 = false;
        }
      }

      // label-based matching: other segments sharing the same label endpoint
      if (ws.endpoint1?.startsWith('label:')) {
        for (const other of labelMap.get(ws.endpoint1) ?? []) {
          if (other === ws) continue;
          labelNeighbors.push(other);
          if (!this.isWireInfoResolved(other.wire, other.bit)) isReady1 = false;
        }
      }

      if (isReady0) {
        ws.neighbors = neighbors0;
        ws.post = 0;
        this.setWireInfoResolved(wire, ws.bit);
        moved = 0;
      } else if (isReady1 && (ws.endpoint1 !== null || !wire.isGroundElm())) {
        ws.neighbors = neighbors1;
        ws.labelNeighbors = labelNeighbors;
        ws.post = 1;
        this.setWireInfoResolved(wire, ws.bit);
        moved = 0;
      } else {
        // not ready from either side yet; retry after the others
        list.push(list.splice(i--, 1)[0]);
        moved++;
        if (moved > list.length * 2) {
          this.stop('wire loop detected', wire);
          return false;
        }
      }
    }
    return true;
  }

  /** Allocate the ground node and bind it to the first ground (or a fallback voltage source). */
  setGroundNode(subcircuit: boolean): void {
    let gotGround = false;
    let gotRail = false;
    let volt: SimElement | null = null;
    let battery: SimElement | null = null;

    const cn = new CircuitNode();
    cn.index = 0;
    this.nodeList.push(cn);
    this.ground = cn;

    for (const ce of this.elmList) {
      if (ce.isGroundElm()) {
        gotGround = true;
        const nme = this.nodeMap.get(ce.getPost(0).key());
        if (nme) nme.node = cn;
        break;
      }
      if (ce.isRailElm()) gotRail = true;
      if (volt === null && ce.isVoltageElm()) volt = ce;
      if (battery === null && ce.isBatteryElm()) battery = ce;
    }

    // no ground and no rails: the first voltage source's first terminal is ground (not for
    // subcircuits); fall back to a battery's negative terminal
    const src = volt ?? battery;
    if (!subcircuit && !gotGround && src !== null && !gotRail) {
      const key = src.getPost(0).key();
      const cln = this.nodeMap.get(key);
      if (cln) cln.node = cn;
      else this.nodeMap.set(key, new NodeMapEntry(cn));
    }
  }

  /** Allocate a node for every post and internal node, in element order. */
  makeNodeList(): void {
    let vscount = 0;
    // preStamp() first so composites can size their internal node lists
    for (const ce of this.elmList) ce.preStamp();

    for (const ce of this.elmList) {
      // upstream sizes nodes[] in constructors and setters; here once per analysis, since node
      // counts can depend on state (capacitor series resistance, DC analysis)
      ce.allocNodes();
      const inodes = ce.getInternalNodeCount();
      const ivs = ce.getVoltageSourceCount();
      const posts = ce.getPostCount();

      for (let j = 0; j !== posts; j++) {
        const key = ce.getPost(j).key();
        const cln = this.nodeMap.get(key);
        // allocate nodes only here, in this order: changing the allocation order changes which
        // node an unconnected island is tied to ground through, and so circuit behaviour
        if (cln === undefined || cln.node === null) {
          const cn = new CircuitNode();
          cn.index = this.nodeList.length;
          cn.links.push({ num: j, elm: ce });
          ce.setNode(j, cn);
          if (cln !== undefined) cln.node = cn;
          else this.nodeMap.set(key, new NodeMapEntry(cn));
          this.nodeList.push(cn);
        } else {
          const cn = cln.node;
          cn.links.push({ num: j, elm: ce });
          ce.setNode(j, cn);
          // if it's the ground node, make sure the node voltage is 0, cause it may not get set later
          if (cn === this.ground) ce.setNodeVoltage(j, 0);
        }
      }
      for (let j = 0; j !== inodes; j++) {
        const cn = new CircuitNode();
        cn.index = this.nodeList.length;
        cn.internal = true;
        cn.links.push({ num: j + posts, elm: ce });
        ce.setNode(j + posts, cn);
        this.nodeList.push(cn);
      }
      vscount += ivs;
    }
    this.voltageSources = new Array<VoltageSource>(vscount);
  }

  /** Append the leaf children of composites to elmList and link their nodes. */
  private addChildElms(list: SimElement[]): void {
    for (const ce of list) {
      const children = ce.getChildElmList();
      if (children !== null) {
        this.addChildElms(children);
        continue;
      }
      this.elmList.push(ce);
      for (let i = 0; i !== ce.getNodeCount(); i++) {
        const cn = ce.getNode(i);
        cn.links.push({ num: i, elm: ce });
        // needed so findUnconnectedNodes() works
        cn.internal = false;
        // if it's the ground node, make sure the node voltage is 0
        if (cn.index === 0) ce.setNodeVoltage(i, 0);
      }
    }
  }

  /** Find islands not connected to ground; each gets a 100M resistor to ground when stamped. */
  findUnconnectedNodes(): void {
    const totalNodes = this.nodeList.length;
    const closure = new Array<boolean>(totalNodes).fill(false);
    this.unconnectedNodes = [];
    this.nodesWithGroundConnection = [];
    closure[0] = true;

    for (const ce of this.elmList) {
      let hasGround = false;
      for (let j = 0; j < ce.getPostCount(); j++) {
        if (ce.hasGroundConnection(j)) {
          hasGround = true;
          closure[ce.getNode(j).index] = true;
        }
      }
      if (hasGround) this.nodesWithGroundConnection.push(ce);
    }

    // breadth-first through element connections; when the queue drains, seed the next
    // unconnected node so its whole island is absorbed before flagging another
    const queue: number[] = [];
    for (let i = 0; i < totalNodes; i++) if (closure[i]) queue.push(i);
    let qHead = 0;
    let scanFrom = 1;
    for (;;) {
      if (qHead < queue.length) {
        const cn = this.nodeList[queue[qHead++]];
        for (const cnl of cn.links) {
          const ce = cnl.elm;
          const post1 = cnl.num;
          for (let k = 0; k !== ce.getPostCount(); k++) {
            if (k === post1) continue;
            const kn = ce.getNode(k).index;
            if (!closure[kn] && ce.getConnection(post1, k)) {
              closure[kn] = true;
              queue.push(kn);
            }
          }
        }
      } else {
        let found = false;
        for (; scanFrom < totalNodes; scanFrom++) {
          if (!closure[scanFrom] && !this.nodeList[scanFrom].internal) {
            this.unconnectedNodes.push(scanFrom);
            closure[scanFrom] = true;
            queue.push(scanFrom++);
            found = true;
            break;
          }
        }
        if (!found) break;
      }
    }
  }

  /** Split nodes into independent matrices: one per set connected other than through ground. */
  calculateClosures(): void {
    const totalNodes = this.nodeList.length;
    const closureIndex = new Array<number>(totalNodes).fill(-1);
    closureIndex[0] = -2; // ground

    let closureCount = 0;
    for (let i = 1; i !== totalNodes; i++) {
      if (closureIndex[i] >= 0) continue;
      const stack = [i];
      closureIndex[i] = closureCount;
      while (stack.length > 0) {
        const cn = this.nodeList[stack.pop() as number];
        for (const cnl of cn.links) {
          const ce = cnl.elm;
          const post1 = cnl.num;
          for (let k = 0; k !== ce.getNodeCount(); k++) {
            if (k === post1 || !ce.getMatrixConnection(post1, k)) continue;
            const kn = ce.getNode(k).index;
            if (kn === 0) continue; // don't flood through ground
            if (closureIndex[kn] < 0) {
              closureIndex[kn] = closureCount;
              stack.push(kn);
            }
          }
        }
      }
      closureCount++;
    }

    if (closureCount === 0) closureCount = 1;
    const matrices = Array.from({ length: closureCount }, () => new CircuitMatrix());
    this.matrices = matrices;
    for (let i = 1; i !== totalNodes; i++) {
      const ci = closureIndex[i];
      if (ci < 0) continue;
      const cn = this.nodeList[i];
      const m = matrices[ci];
      m.nodeCount++;
      cn.row = m.nodeCount;
      cn.matrix = m;
      m.nodeList.push(cn);
    }
    this.ground.row = 0;
    this.ground.matrix = null;
  }

  connectUnconnectedNodes(): void {
    for (const n of this.unconnectedNodes) this.stampResistor(this.ground, this.nodeList[n], 1e8);
  }

  validateCircuit(): boolean {
    for (const ce of this.elmList) if (!ce.validate()) return false;
    return true;
  }

  /** Start a new analysis. Most of the work is in preStampCircuit, run when stepping. */
  analyzeCircuit(): void {
    this.stopMessage = null;
    this.stopElm = null;
    this.elmList = this.elements;
    if (this.elmList.length === 0) return;
    this.detectBusWidths(this.elmList);
    this.needsStamp = true;
  }

  /** Positions where buses of different widths meet, from the last analysis. */
  busMismatchList: Point[] = [];

  /** Give wires and labels the width of the buses they connect to (upstream `detectBusWidths`). */
  detectBusWidths(list: readonly SimElement[]): void {
    const maps: BusWidthMaps = { width: new Map(), label: new Map(), mismatches: [] };
    this.busMismatchList = maps.mismatches;
    for (const ce of list) {
      if (ce.isRemovableWire()) continue;
      for (let j = 0; j < ce.getPostCount(); j++) {
        const w = ce.getPostWidth(j);
        if (w <= 1) continue;
        const pt = ce.getPost(j);
        const key = new Point(pt.x, pt.y); // z = 0 for the map key
        const existing = maps.width.get(key.key());
        if (existing !== undefined && existing !== w) maps.mismatches.push(key);
        if (existing === undefined || w > existing) maps.width.set(key.key(), w);
      }
    }
    // propagate through wire chains and matching labels until stable
    let changed = true;
    while (changed) {
      changed = false;
      for (const ce of list) if (ce.propagateBusWidth(maps)) changed = true;
    }
    // compare each element's bus posts with the propagated widths, to catch mismatches through
    // wires too
    for (const ce of list) {
      if (ce.isRemovableWire()) continue;
      for (let j = 0; j < ce.getPostCount(); j++) {
        const w = ce.getPostWidth(j);
        if (w <= 1) continue;
        const pt = ce.getPost(j);
        const key = new Point(pt.x, pt.y);
        const propagated = maps.width.get(key.key());
        if (propagated !== undefined && propagated !== w) maps.mismatches.push(key);
      }
    }
  }

  /** Node numbering, closures, validation and voltage-source rows. False means retry or stop. */
  preStampCircuit(subcircuit: boolean): boolean {
    this.nodeList = [];
    this.elmList = this.elements;
    this.calculateWireClosure();
    this.setGroundNode(subcircuit);
    this.makeNodeList();
    if (!this.calcWireInfo()) return false;
    this.nodeMap = new Map();

    this.elmList = [...this.elements];
    for (const elm of this.elements) {
      const children = elm.getChildElmList();
      if (children !== null) this.addChildElms(children);
    }
    // composite children's sources are not in the top-level count; size from the flat list
    let total = 0;
    for (const ce of this.elmList) total += ce.getVoltageSourceCount();
    if (total > this.voltageSources.length) this.voltageSources = new Array(total);

    let vscount = 0;
    this.circuitNonLinear = false;
    for (const ce of this.elmList) {
      if (ce.nonLinear()) this.circuitNonLinear = true;
      const ivs = ce.getVoltageSourceCount();
      for (let j = 0; j !== ivs; j++) {
        const vs = new VoltageSource(ce);
        vs.index = vscount;
        this.voltageSources[vscount] = vs;
        ce.setVoltageSource(j, vs);
        vscount++;
      }
    }
    this.voltageSourceCount = vscount;

    this.findUnconnectedNodes();
    this.calculateClosures();
    if (!this.validateCircuit()) return false;

    const matrices = this.matrices as CircuitMatrix[];
    const vsPerMatrix = new Array<number>(matrices.length).fill(0);
    for (let i = 0; i !== vscount; i++) this.voltageSources[i].assignMatrix(this.ground);
    for (let i = 0; i !== vscount; i++) {
      const vs = this.voltageSources[i];
      const m = vs.matrix as CircuitMatrix;
      const mi = matrices.indexOf(m);
      vsPerMatrix[mi]++;
      vs.row = m.nodeCount + vsPerMatrix[mi];
      m.voltageSourceList.push(vs);
    }
    for (let i = 0; i !== matrices.length; i++)
      matrices[i].size = matrices[i].nodeCount + vsPerMatrix[i];

    // only needed for validation
    this.nodesWithGroundConnection = [];
    this.timeStep = this.maxTimeStep;
    this.needsStamp = true;
    return true;
  }

  preStampAndStampCircuit(): void {
    // validate() may repair the circuit and ask for another pass; give up after 10
    let i: number;
    for (i = 0; i !== 10; i++) if (this.preStampCircuit(false) || this.stopMessage !== null) break;
    if (this.stopMessage !== null) return;
    if (i === 10) {
      this.stop('failed to stamp circuit', null);
      return;
    }
    this.stampCircuit();
  }

  /** Fill the matrices with everything that is constant until the next re-stamp. */
  stampCircuit(): void {
    const matrices = this.matrices as CircuitMatrix[];
    for (const m of matrices) {
      const sz = m.size;
      m.matrix = Array.from({ length: sz }, () => new Array<number>(sz).fill(0));
      m.rightSide = new Array<number>(sz).fill(0);
      m.origMatrix = Array.from({ length: sz }, () => new Array<number>(sz).fill(0));
      m.origRightSide = new Array<number>(sz).fill(0);
      m.permute = new Array<number>(sz).fill(0);
      m.nodeVoltages = new Array<number>(m.nodeCount).fill(0);
      if (m.lastNodeVoltages === null || m.lastNodeVoltages.length !== m.nodeCount)
        m.lastNodeVoltages = new Array<number>(m.nodeCount).fill(0);
      // per-matrix linearity is not exploited: one nonlinear element makes all nonlinear
      m.nonLinear = this.circuitNonLinear;
    }

    this.connectUnconnectedNodes();
    for (const ce of this.elmList) {
      ce.setParentList(this.elmList);
      ce.stamp();
    }
    // a stamp() may have called stop()
    if (this.matrices === null) return;

    let maxMatrixSize = 0;
    for (const m of matrices) {
      const sz = m.size;
      if (sz > maxMatrixSize) maxMatrixSize = sz;
      for (let i = 0; i !== sz; i++) m.origRightSide[i] = m.rightSide[i];
      for (let i = 0; i !== sz; i++)
        for (let j = 0; j !== sz; j++) m.origMatrix[i][j] = m.matrix[i][j];
    }
    if (this.solverType === SolverType.SPARSE) this.usingSparse = true;
    else if (this.solverType === SolverType.DENSE) this.usingSparse = false;
    else this.usingSparse = maxMatrixSize >= SPARSE_THRESHOLD;

    // a linear matrix is factored once here instead of every step
    for (const m of matrices) {
      if (!m.nonLinear && !this.luFactor(m)) {
        this.stop('Singular matrix!', null);
        return;
      }
    }
    this.elmArr = [...this.elmList];
    this.needsStamp = false;
  }

  /**
   * Pause without an error (upstream `app.setSimRunning(false)`, used by the stop trigger). The
   * step loop ends after the current step; the host clears the flag and stops running.
   */
  requestPause(): void {
    this.pauseRequested = true;
  }

  stop(message: string, ce: SimElement | null): void {
    this.stopMessage = message;
    this.stopElm = ce;
    this.matrices = null;
    this.analyzeFlag = false;
  }

  // ---- stamp helpers ---------------------------------------------------------------------------

  /** Control voltage source `vs` with the voltage from n1 to n2 (after stampVoltageSource). */
  stampVCVS(n1: CircuitNode, n2: CircuitNode, coef: number, vs: VoltageSource): void {
    this.stampMatrixVN(vs, n1, coef);
    this.stampMatrixVN(vs, n2, -coef);
  }

  /**
   * Independent voltage source `vs` from n1 to n2: V(n2) - V(n1) = v. Without `v`, the value is
   * supplied every subiteration with updateVoltageSource().
   */
  stampVoltageSource(n1: CircuitNode, n2: CircuitNode, vs: VoltageSource | null, v?: number): void {
    if (vs === null) return;
    this.stampMatrixVN(vs, n1, -1);
    this.stampMatrixVN(vs, n2, 1);
    if (v !== undefined) this.stampRightSideVS(vs, v);
    this.stampMatrixNV(n1, vs, 1);
    this.stampMatrixNV(n2, vs, -1);
  }

  /** Stamp voltage source `vs` between the nodes saved in it by `setNodes`. */
  stampVoltageSourceVS(vs: VoltageSource | null, v: number): void {
    if (vs === null || vs.n1 === null || vs.n2 === null) return;
    this.stampVoltageSource(vs.n1, vs.n2, vs, v);
  }

  updateVoltageSource(
    _n1: CircuitNode,
    _n2: CircuitNode,
    vs: VoltageSource | null,
    v: number,
  ): void {
    if (vs === null) return;
    this.stampRightSideVS(vs, v);
  }

  stampResistor(n1: CircuitNode, n2: CircuitNode, r: number): void {
    const r0 = 1 / r;
    // upstream master throws here (deliberate int division by zero); dev-ts logs and skips
    if (Number.isNaN(r0) || !Number.isFinite(r0)) throw new Error(`bad resistance ${r} ${r0}`);
    this.stampMatrix(n1, n1, r0);
    this.stampMatrix(n2, n2, r0);
    this.stampMatrix(n1, n2, -r0);
    this.stampMatrix(n2, n1, -r0);
  }

  stampConductance(n1: CircuitNode, n2: CircuitNode, r0: number): void {
    this.stampMatrix(n1, n1, r0);
    this.stampMatrix(n2, n2, r0);
    this.stampMatrix(n1, n2, -r0);
    this.stampMatrix(n2, n1, -r0);
  }

  /** Current g * (V(vn1) - V(vn2)) flows from cn1 to cn2. */
  stampVCCurrentSource(
    cn1: CircuitNode,
    cn2: CircuitNode,
    vn1: CircuitNode,
    vn2: CircuitNode,
    g: number,
  ): void {
    this.stampMatrix(cn1, vn1, g);
    this.stampMatrix(cn2, vn2, g);
    this.stampMatrix(cn1, vn2, -g);
    this.stampMatrix(cn2, vn1, -g);
  }

  /** Current i flows from n1 to n2 through the source. */
  stampCurrentSource(n1: CircuitNode, n2: CircuitNode, i: number): void {
    this.stampRightSide(n1, -i);
    this.stampRightSide(n2, i);
  }

  /** Current from n1 to n2 equal to `gain` times the current through `vs`. */
  stampCCCS(n1: CircuitNode, n2: CircuitNode, vs: VoltageSource, gain: number): void {
    this.stampMatrixNV(n1, vs, gain);
    this.stampMatrixNV(n2, vs, -gain);
  }

  /**
   * Add x at row i, column j: a voltage change dv at node j raises the current into node i by
   * x * dv. Ground (row 0) is dropped.
   */
  stampMatrix(i: CircuitNode, j: CircuitNode, x: number): void {
    if (i.row > 0 && j.row > 0) {
      // a cross-matrix stamp is logged upstream but still lands in i's matrix
      const m = i.matrix as CircuitMatrix;
      m.matrix[i.row - 1][j.row - 1] += x;
    }
  }

  /** Voltage-source row, node column. */
  stampMatrixVN(i: VoltageSource, j: CircuitNode, x: number): void {
    if (j.row > 0) (i.matrix as CircuitMatrix).matrix[i.row - 1][j.row - 1] += x;
  }

  /** Node row, voltage-source column. */
  stampMatrixNV(i: CircuitNode, j: VoltageSource, x: number): void {
    if (i.row > 0) (j.matrix as CircuitMatrix).matrix[i.row - 1][j.row - 1] += x;
  }

  stampMatrixVV(i: VoltageSource, j: VoltageSource, x: number): void {
    (i.matrix as CircuitMatrix).matrix[i.row - 1][j.row - 1] += x;
  }

  /**
   * Independent current x flowing into node n. Without `x` this is upstream's marker that the
   * right side at n changes every step (used by the removed RowInfo optimisation): a no-op.
   */
  stampRightSide(n: CircuitNode, x?: number): void {
    if (x === undefined) return;
    if (n.row > 0) (n.matrix as CircuitMatrix).rightSide[n.row - 1] += x;
  }

  stampRightSideVS(vs: VoltageSource, x: number): void {
    (vs.matrix as CircuitMatrix).rightSide[vs.row - 1] += x;
  }

  /** Upstream markers for the removed RowInfo optimisation; kept so element code ports 1:1. */
  stampNonLinear(_n: CircuitNode): void {}

  // ---- LU dispatch ---------------------------------------------------------------------------

  private luFactor(m: CircuitMatrix): boolean {
    if (this.usingSparse) {
      const sparse = DMatrixSparseCSC.convert(m.matrix, DMatrixSparseCSC.EPS);
      m.sparseLU ??= new SparseLU();
      return m.sparseLU.setA(sparse);
    }
    return luFactorDense(m.matrix, m.size, m.permute);
  }

  private luSolve(m: CircuitMatrix): void {
    if (this.usingSparse && m.sparseLU !== null) {
      m.sparseLU.solve(m.rightSide, m.rightSide);
      return;
    }
    luSolveDense(m.matrix, m.size, m.permute, m.rightSide);
  }

  // ---- running -------------------------------------------------------------------------------

  /**
   * Run exactly `n` timesteps, analyzing and stamping first if the circuit changed. Returns the
   * number completed (fewer if the simulation stopped). Mirrors the simulation half of upstream's
   * per-frame `updateCircuit()` minus wall-clock pacing, like the golden harness's `step(n)`
   * (tools/reference-patch).
   */
  step(n: number): number {
    if (this.analyzeFlag || this.dcAnalysisFlag) {
      this.analyzeCircuit();
      this.analyzeFlag = false;
    }
    if (this.stopMessage !== null) return 0;
    if (this.needsStamp) this.preStampAndStampCircuit();
    if (this.stopMessage !== null || this.matrices === null || n <= 0) return 0;
    const done = this.runCircuit(n);
    if (this.dcAnalysisFlag) {
      // the operating point is found; re-analyze in transient mode on the next call
      this.dcAnalysisFlag = false;
      this.analyzeFlag = true;
    }
    return done;
  }

  /** Upstream `runCircuit` with the wall-clock budget replaced by a step count. */
  private runCircuit(steps: number): number {
    if (this.matrices === null || this.elmList.length === 0) {
      this.matrices = null;
      return 0;
    }
    // upstream's loop works on a local copy: stop() clears this.matrices mid-step
    const allMatrices = this.matrices;
    if (this.canDelayWireProcessing !== null)
      this.delayWireProcessing = this.canDelayWireProcessing();
    const delayWireProcessing = this.delayWireProcessing;
    let goodIterations = 100;
    let done = 0;

    for (;;) {
      if (goodIterations >= 3 && this.timeStep < this.maxTimeStep) {
        // things are going well, double the time step
        this.timeStep = Math.min(this.timeStep * 2, this.maxTimeStep);
        this.stampCircuit();
        goodIterations = 0;
      }

      if (this.restampRequested) {
        this.restampRequested = false;
        this.stampCircuit();
        if (this.stopMessage !== null) return done;
      }

      const elmArr = this.elmArr;
      for (const e of elmArr) e.startIteration();
      const subiterCount = this.adjustTimeStep && this.timeStep / 2 > this.minTimeStep ? 100 : 5000;
      let subiter: number;
      for (subiter = 0; subiter !== subiterCount; subiter++) {
        this.converged = true;
        this.subIterations = subiter;
        const matrices = allMatrices;
        for (const m of matrices) {
          for (let i = 0; i !== m.size; i++) m.rightSide[i] = m.origRightSide[i];
          if (m.nonLinear) {
            for (let i = 0; i !== m.size; i++)
              for (let j = 0; j !== m.size; j++) m.matrix[i][j] = m.origMatrix[i][j];
          }
        }
        for (const e of elmArr) e.doStep();
        if (this.stopMessage !== null) return done;
        for (const m of matrices) {
          if (m.size < 8) {
            for (let j = 0; j !== m.size; j++) {
              for (let i = 0; i !== m.size; i++) {
                const x = m.matrix[i][j];
                if (Number.isNaN(x) || !Number.isFinite(x)) {
                  this.stop('nan/infinite matrix!', null);
                  return done;
                }
              }
            }
          }
          if (m.nonLinear) {
            // converged: keep the previous solve and stop
            if (this.converged && subiter > 0) continue;
            if (!this.luFactor(m)) {
              this.stop('Singular matrix!', null);
              return done;
            }
          }
          this.luSolve(m);
          this.applySolvedRightSide(m);
        }
        if (!this.circuitNonLinear) break;
        if (this.converged && subiter > 0) break;
      }
      if (subiter === subiterCount) {
        // convergence failed
        goodIterations = 0;
        if (this.adjustTimeStep) this.timeStep /= 2;
        if (this.timeStep < this.minTimeStep || !this.adjustTimeStep) {
          this.stop('Convergence failed!', null);
          break;
        }
        // retry the step at half the timestep from the state at its start
        for (const m of allMatrices) this.setNodeVoltages(m, m.lastNodeVoltages as number[]);
        this.stampCircuit();
        continue;
      }
      if (subiter < 3) goodIterations++;
      else goodIterations = 0;
      this.t += this.timeStep;
      this.timeStepAccum += this.timeStep;
      if (this.timeStepAccum >= this.maxTimeStep) {
        this.timeStepAccum -= this.maxTimeStep;
        this.timeStepCount++;
      }
      for (const e of elmArr) e.stepFinished();
      if (!delayWireProcessing) this.calcWireCurrents();
      this.onTimeStep?.();
      // save node voltages so a failed next step can restart from here
      for (const m of allMatrices) {
        const last = m.lastNodeVoltages as number[];
        for (let i = 0; i !== m.nodeCount; i++) last[i] = m.nodeVoltages[i];
      }
      if (++done >= steps) break;
      // stepFinished can stop the simulation (max current exceeded); upstream then leaves the
      // loop because stop() clears simRunning
      if (this.stopMessage !== null) break;
      if (this.pauseRequested) break;
    }
    if (delayWireProcessing) this.calcWireCurrents();
    return done;
  }

  /** Copy one matrix's solution into node voltages and voltage-source currents. */
  applySolvedRightSide(m: CircuitMatrix): void {
    for (let j = 0; j !== m.size; j++) {
      const res = m.rightSide[j];
      if (Number.isNaN(res)) {
        this.converged = false;
        break;
      }
      if (j < m.nodeCount) m.nodeVoltages[j] = res;
    }
    for (const vs of m.voltageSourceList) {
      const res = m.rightSide[vs.row - 1];
      if (!Number.isNaN(res)) vs.elm.setCurrent(vs, res);
    }
    this.setNodeVoltages(m, m.nodeVoltages);
  }

  /**
   * Set the voltage of every node in `m` and tell each attached element (master
   * `setNodeVoltage(post, v)` per link, which also recomputes the current except for capacitors).
   */
  setNodeVoltages(m: CircuitMatrix, nv: number[]): void {
    for (const cn of m.nodeList) {
      const res = nv[cn.row - 1];
      cn.v = res;
      for (const cnl of cn.links) cnl.elm.setNodeVoltage(cnl.num, res);
    }
  }

  /** Wires are not in the matrix; derive their currents from their neighbours. */
  calcWireCurrents(): void {
    for (const ws of this.wireInfoList) {
      let cur = 0;
      if (ws.post === 0) {
        const p = ws.wire.getPost(ws.bit);
        for (const ce of ws.neighbors) cur += ce.getCurrentIntoNode(ce.getNodeAtPoint(p));
      } else if (ws.endpoint1?.startsWith('label:')) {
        for (const other of ws.labelNeighbors) cur += other.current;
      } else {
        const p = ws.wire.getConnectedPost(ws.bit);
        if (p !== null)
          for (const ce of ws.neighbors) cur += ce.getCurrentIntoNode(ce.getNodeAtPoint(p));
      }
      if (ws.post !== 0) cur = -cur;
      ws.wire.setWireCurrent(ws.bit, cur);
      ws.current = cur;
    }
  }

  // ---- inspection ----------------------------------------------------------------------------

  /** Voltage of every node by index (0 is ground), as the golden harness reports it. */
  nodeVoltages(): number[] {
    return this.nodeList.map((cn) =>
      cn.matrix !== null && cn.row > 0 ? cn.matrix.nodeVoltages[cn.row - 1] : 0,
    );
  }

  /** Voltage of the first labeled node with this name, 0 if none (upstream JS API). */
  getLabeledNodeVoltage(name: string): number {
    const le = this.labelList.get(name);
    return le?.node ? le.node.v : 0;
  }
}
