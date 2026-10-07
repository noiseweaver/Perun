// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Scope, ScopeManager, SwitchElm, type CircuitElm } from '@circuitjs-next/elements';
import { JavaRandom, readCircuit, type Circuit } from '@circuitjs-next/format';
import { describe, expect, it } from 'vitest';
import { History, type StateRoots } from './history.ts';

const UPSTREAM = fileURLToPath(
  new URL(
    '../../../../reference/circuitjs1/src/com/lushprojects/circuitjs1/public/circuits/',
    import.meta.url,
  ),
);
const OURS = fileURLToPath(new URL('../../examples/circuits/', import.meta.url));

/** What SimController keeps (historyRoots). */
function roots(c: Circuit): () => StateRoots {
  return () => ({
    elements: [...c.elements, ...c.sim.elmList],
    others: c.scopes.scopes,
    shallow: [{ obj: c.sim, keys: ['t', 'timeStep', 'timeStepAccum', 'timeStepCount'] }],
    skip: (o) => o === c || o instanceof ScopeManager,
    noFrameDiff: (o) => o instanceof Scope,
  });
}

function load(text: string): Circuit {
  const c = readCircuit(text);
  c.sim.random = new JavaRandom(1);
  return c;
}

/** One animation frame of the controller: steps, recorded when there is a history. */
function frame(c: Circuit, h: History | null, steps: number): boolean {
  h?.beforeStep();
  const done = c.sim.step(steps);
  if (done > 0) h?.afterStep(16, c.sim.t);
  return done === steps;
}

/** Everything the canvas shows of the parts: their voltages and currents. */
function snapshot(c: Circuit): number[] {
  const out: number[] = [c.sim.t];
  for (const e of c.sim.elmList as CircuitElm[]) {
    out.push(...e.volts, e.current);
    for (let i = 0; i < e.getPostCount(); i++) out.push(e.getCurrentIntoNode(i));
  }
  for (const s of c.scopes.scopes)
    for (const p of s.plots) out.push(p.ptr, ...p.minValues, ...p.maxValues);
  return out;
}

const RC = `$ 1 0.000005 10.20027730826997 50 5 50 5e-11
v 112 368 112 48 0 0 40 5 0 0 0.5
s 112 48 336 48 0 1 false
r 336 48 336 368 0 1000
c 336 368 112 368 0 0.00001 0 0.001
o 3 64 0 4099 5 0.05 0 2 3 3
`;

describe('rewind history', () => {
  it('shows each recorded frame again, then the run as it was', () => {
    const c = load(RC);
    const h = new History(roots(c));
    const seen: number[][] = [];
    for (let f = 0; f < 50; f++) {
      frame(c, h, 20);
      seen.push(snapshot(c));
    }
    expect(h.length).toBe(50);
    const live = snapshot(c);
    h.enter();
    for (const i of [10, 11, 12, 40, 3, 0, 49, 25]) {
      h.seek(i);
      expect(snapshot(c)).toEqual(seen[i]);
      expect(h.timeAt(i)).toBe(seen[i]?.[0]);
    }
    h.restoreLive();
    expect(snapshot(c)).toEqual(live);
  });

  it('shows a switch as it was, but leaves the selection alone', () => {
    const c = load(RC);
    const h = new History(roots(c));
    const sw = c.elements.find((e) => e instanceof SwitchElm) as SwitchElm;
    const closed = sw.position;
    for (let f = 0; f < 10; f++) frame(c, h, 20);
    sw.toggle();
    c.sim.analyzeFlag = true;
    for (let f = 0; f < 10; f++) frame(c, h, 20);
    const flipped = sw.position;
    expect(flipped).not.toBe(closed);
    sw.selected = true;
    h.enter();
    h.seek(2);
    expect(sw.position).toBe(closed);
    expect(sw.selected).toBe(true);
    h.restoreLive();
    expect(sw.position).toBe(flipped);
  });

  it('keeps only the last seconds and stays within its memory cap', () => {
    const c = load(RC);
    const h = new History(roots(c), { windowMs: 1000, maxBytes: 1 << 30, keyEvery: 10 });
    for (let f = 0; f < 300; f++) frame(c, h, 5);
    // 1000 ms of 16 ms frames, plus at most one key frame's group
    expect(h.length).toBeGreaterThanOrEqual(62);
    expect(h.length).toBeLessThanOrEqual(63 + 10);
    expect(h.clockAt(h.length - 1) - h.clockAt(0)).toBeGreaterThanOrEqual(1000 - 16);
    const small = new History(roots(c), { windowMs: 1e9, maxBytes: 20_000, keyEvery: 10 });
    for (let f = 0; f < 300; f++) frame(c, small, 5);
    expect(small.bytes).toBeLessThan(20_000 + 20 * 1024);
    expect(small.length).toBeLessThan(300);
  });

  it('starts again when the parts change', () => {
    const c = load(RC);
    const h = new History(roots(c));
    for (let f = 0; f < 5; f++) frame(c, h, 20);
    h.clear();
    expect(h.length).toBe(0);
    for (let f = 0; f < 5; f++) frame(c, h, 20);
    expect(h.length).toBe(5);
  });
});

/**
 * Every bundled example: rewinding and coming back changes nothing, so the run carries on bit for
 * bit as one that was never rewound (the goldens cannot see the history).
 */
describe('rewind on every example', () => {
  const files = [
    ...readdirSync(UPSTREAM).map((f) => UPSTREAM + f),
    ...readdirSync(OURS).map((f) => OURS + f),
  ].filter((f) => f.endsWith('.txt'));

  it('finds the examples', () => {
    expect(files.length).toBeGreaterThan(370);
  });

  it('replays every example exactly and returns to the same run', () => {
    const bad: string[] = [];
    let biggest = 0;
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const a = load(text);
      const b = load(text);
      const h = new History(roots(a));
      const seen: number[][] = [];
      let ok = true;
      for (let f = 0; f < 12 && ok; f++) {
        ok = frame(a, h, 8);
        frame(b, null, 8);
        seen.push(snapshot(a));
      }
      if (!ok) continue;
      h.enter();
      // the first frame's analysis reshapes the parts' arrays; the history keeps that frame too
      const skipped = seen.length - h.length;
      if (skipped > 0) bad.push(`${file}: kept ${h.length} frames, ${h.rebuilds} layouts`);
      for (const i of [3, 7, 0, 10]) {
        h.seek(i);
        if (JSON.stringify(snapshot(a)) !== JSON.stringify(seen[i + skipped])) {
          bad.push(`${file}: frame ${i} differs`);
          break;
        }
      }
      h.restoreLive();
      for (let f = 0; f < 6; f++) {
        frame(a, h, 8);
        frame(b, null, 8);
      }
      if (JSON.stringify(snapshot(a)) !== JSON.stringify(snapshot(b)))
        bad.push(`${file}: run differs after rewinding`);
      biggest = Math.max(biggest, h.bytes);
    }
    expect(bad).toEqual([]);
    // a dozen frames of the largest example stay small
    expect(biggest).toBeLessThan(8 * 1024 * 1024);
  }, 120_000);
});
