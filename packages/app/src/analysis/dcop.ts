// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import {
  CapacitorElm,
  ChipElm,
  GraphicElm,
  GroundElm,
  InductorElm,
  Inductor,
  LabeledNodeElm,
  MosfetElm,
  OpAmpElm,
  OutputElm,
  ProbeElm,
  ScopeElm,
  TransistorElm,
  WireElm,
  type CircuitElm,
} from '@circuitjs-next/elements';
import type { CircuitNode, SimElement } from '@circuitjs-next/engine';
import { readCircuit, type Circuit } from '@circuitjs-next/format';

/**
 * The DC operating point (PLAN.md Phase 13): every node voltage and every part's current and
 * power with no signal applied. The solve runs the engine's own DC analysis (sources sit at their
 * DC bias) with capacitors open and inductors shorted, on a copy of the circuit, so the live simulation, its
 * engine and the golden tests are untouched. The same tables can also be read off the running
 * circuit (`readOperatingPoint`), which is what the panel's Live mode shows.
 */

export interface OpNode {
  /** The node's name: "GND", a label's text, or a generated "N1", "N2" ... */
  name: string;
  ground: boolean;
  /** A labeled node names it. */
  labeled: boolean;
  v: number;
  /** Indexes in the circuit's element list of the parts with a post on this node. */
  elements: number[];
}

/** One post of a part with more than two. */
export interface OpTerminal {
  post: number;
  /** "B", "C", "E" for a transistor, the pin's name on a chip, else "1", "2" ... */
  label: string;
  v: number;
  /** Current into the part through this post. */
  i: number;
}

export interface OpPart {
  /** Index in the circuit's element list (the same in the copy and the live circuit). */
  element: number;
  /** Voltage across (post 1 to post 2), or the node voltage for one-post parts. */
  v: number;
  /** Current through, from the first post to the second (getCurrent). */
  i: number;
  /** Power taken in; negative when the part delivers power (a source). */
  p: number;
  /** Per-post values for parts with more than two posts, else null. */
  terminals: OpTerminal[] | null;
}

export interface OperatingPoint {
  nodes: OpNode[];
  parts: OpPart[];
  /** False when node voltages were still changing at the step limit. */
  settled: boolean;
  /** DC timesteps run. */
  steps: number;
  /** The engine stopped (singular matrix, no convergence ...), with its message. */
  error: string | null;
}

/** Most DC steps to run while waiting for the node voltages to stop changing. */
const MAX_STEPS = 20000;
/** Wall clock limit for one solve, in ms. */
const MAX_MS = 3000;
/** Consecutive calm steps that count as settled. */
const CALM_STEPS = 5;
/** A node is calm when it moved less than this (absolute volts plus share of its voltage). */
const CALM_ABS = 1e-9;
const CALM_REL = 1e-9;
/** Inductance that stands in for a short circuit in the copy. */
const SHORT_INDUCTANCE = 1e-12;

/** Parts that carry no current worth listing: wires, grounds, labels, drawings, meters' faces. */
export function isOpPart(e: CircuitElm): boolean {
  if (e.getPostCount() === 0) return false;
  return !(
    e instanceof WireElm ||
    e instanceof GroundElm ||
    e instanceof LabeledNodeElm ||
    e instanceof GraphicElm ||
    e instanceof ScopeElm ||
    e instanceof OutputElm ||
    e instanceof ProbeElm ||
    e.getClassName() === 'TestPointElm'
  );
}

/** Short names for the posts of the parts people know by their pins. */
function postLabel(e: CircuitElm, n: number): string {
  if (e instanceof TransistorElm) return ['B', 'C', 'E'][n] ?? String(n + 1);
  if (e instanceof MosfetElm) return ['G', 'S', 'D', 'B'][n] ?? String(n + 1);
  if (e instanceof OpAmpElm) return ['−', '+', 'out'][n] ?? String(n + 1);
  if (e instanceof ChipElm) {
    const text = e.pins[n]?.text ?? '';
    // chip pin names can carry overline markup ("_Q"): show them plain
    const plain = text.replace(/_/g, '').trim();
    if (plain !== '') return plain;
  }
  return String(n + 1);
}

/**
 * Read the tables off a circuit that has been simulated: its nodes as the engine joined them, and
 * each part's values as its info box shows them.
 */
export function readOperatingPoint(circuit: Circuit): Omit<OperatingPoint, 'settled' | 'steps'> {
  const sim = circuit.sim;
  const els = circuit.elements;
  const byNode = new Map<CircuitNode, OpNode>();
  const order: OpNode[] = [];
  els.forEach((e, ei) => {
    const posts = e.getPostCount();
    for (let j = 0; j < posts; j++) {
      const cn = e.nodes[j];
      if (cn === undefined || cn.index < 0) continue;
      let node = byNode.get(cn);
      if (node === undefined) {
        const ground = cn === sim.ground || cn.index === 0;
        node = { name: '', ground, labeled: false, v: ground ? 0 : cn.v, elements: [] };
        byNode.set(cn, node);
        order.push(node);
      }
      if (!node.elements.includes(ei)) node.elements.push(ei);
      if (e instanceof LabeledNodeElm && !node.labeled && !node.ground && e.text !== '') {
        node.name = e.text;
        node.labeled = true;
      }
    }
  });
  let n = 0;
  for (const node of order) {
    if (node.ground) node.name = 'GND';
    else if (!node.labeled) node.name = `N${++n}`;
  }
  // ground first, then labeled nodes by name, then the rest in the order the circuit meets them
  const nodes = [
    ...order.filter((x) => x.ground).slice(0, 1),
    ...order
      .filter((x) => x.labeled)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    ...order.filter((x) => !x.ground && !x.labeled),
  ];

  const parts: OpPart[] = [];
  els.forEach((e, ei) => {
    if (!isOpPart(e)) return;
    const posts = e.getPostCount();
    if (posts <= 2) {
      parts.push({
        element: ei,
        v: posts === 1 ? (e.volts[0] ?? 0) : e.getVoltageDiff(),
        i: e.getCurrent(),
        p: e.getPower(),
        terminals: null,
      });
      return;
    }
    const terminals: OpTerminal[] = [];
    let p = 0;
    for (let j = 0; j < posts; j++) {
      const v = e.volts[j] ?? 0;
      const i = -e.getCurrentIntoNode(j);
      terminals.push({ post: j, label: postLabel(e, j), v, i });
      p += v * i;
    }
    parts.push({ element: ei, v: 0, i: 0, p, terminals });
  });
  return { nodes, parts, error: sim.stopMessage };
}

/**
 * Find the DC operating point of a circuit (its saved text) on a copy: capacitors open,
 * inductors shorted, sources at their DC level. Runs DC steps until no node voltage moves, so
 * nonlinear parts (diodes, transistors, op-amp output limits) have converged.
 */
export function solveOperatingPoint(circuitText: string): OperatingPoint {
  const circuit = readCircuit(circuitText);
  const sim = circuit.sim;
  const visit = (list: readonly SimElement[]): void => {
    for (const e of list) {
      const children = e.getChildElmList();
      if (children !== null) visit(children);
      // the engine's DC analysis keeps inductors as they are on the first timestep (nearly
      // open); at DC they are wires
      if (e instanceof InductorElm) {
        e.initialCurrent = 0;
        e.ind.setup(SHORT_INDUCTANCE, 0, e.ind.flags | Inductor.FLAG_BACK_EULER, 0);
      }
      // and capacitors are open, without the 100 MΩ the engine puts in their place
      if (e instanceof CapacitorElm) e.dcOpen = true;
    }
  };
  visit(circuit.elements);
  circuit.reset();
  sim.dcAnalysisFlag = true;
  sim.canDelayWireProcessing = () => true;

  let prev: number[] | null = null;
  let calm = 0;
  let settled = false;
  const start = Date.now();
  sim.onTimeStep = () => {
    const v = sim.nodeVoltages();
    if (prev !== null && prev.length === v.length) {
      let still = true;
      for (let k = 0; k < v.length; k++) {
        const a = v[k] ?? 0;
        if (Math.abs(a - (prev[k] ?? 0)) > CALM_ABS + CALM_REL * Math.abs(a)) {
          still = false;
          break;
        }
      }
      calm = still ? calm + 1 : 0;
    }
    prev = v;
    if (calm >= CALM_STEPS) {
      settled = true;
      sim.pauseRequested = true;
    } else if (Date.now() - start > MAX_MS) sim.pauseRequested = true;
  };
  // one call: every step runs in DC mode (step() leaves DC mode once it returns)
  const steps = sim.step(MAX_STEPS);
  sim.pauseRequested = false;
  const read = readOperatingPoint(circuit);
  return { ...read, settled, steps };
}

/** The tables as CSV: nodes, then parts (one row per post for parts with more than two). */
export function operatingPointCsv(
  op: Pick<OperatingPoint, 'nodes' | 'parts'>,
  partName: (element: number) => string,
): string {
  const q = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ['node,voltage_V'];
  for (const n of op.nodes) lines.push(`${q(n.name)},${n.v}`);
  lines.push('', 'part,pin,voltage_V,current_A,power_W');
  for (const p of op.parts) {
    const name = q(partName(p.element));
    if (p.terminals === null) lines.push(`${name},,${p.v},${p.i},${p.p}`);
    else {
      lines.push(`${name},,,,${p.p}`);
      for (const t of p.terminals) lines.push(`${name},${q(t.label)},${t.v},${t.i},`);
    }
  }
  return lines.join('\n') + '\n';
}
