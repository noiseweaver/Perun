// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WireElm, viewFor, type CircuitElm } from '@perun/elements';
import { Circuit, readCircuit } from '@perun/format';
import { describe, expect, it } from 'vitest';
import { Editor, type EditorHost } from './Editor.ts';
import { connectivity, tidy, type TidyOptions } from './tidy.ts';

const HEAD = '$ 1 5.0E-6 10 50 5.0\n';

function setup(body: string) {
  const circuit = new Circuit();
  circuit.read(HEAD + body);
  const host: EditorHost = {
    bbox: (e) => viewFor(e)?.bbox(e) ?? null,
    circuitChanged: () => circuit.sim.setElements(circuit.elements),
    selectionChanged: () => {},
    restore: (xml) => circuit.read(xml),
    visibleArea: () => ({ x1: 0, y1: 0, x2: 800, y2: 600 }),
  };
  return { circuit, ed: new Editor(circuit, host) };
}

const wires = (c: Circuit): number[][] =>
  c.elements.filter((e) => e instanceof WireElm).map((w) => [w.x, w.y, w.x2, w.y2]);

const opts = (c: Circuit): TidyOptions => ({
  gridSize: c.sim.gridSize,
  bbox: (e: CircuitElm) => viewFor(e)?.bbox(e) ?? null,
  only: null,
  keep: new Set(),
});

/** Wires running through the inside of a part's box. */
function bodyCrossings(els: readonly CircuitElm[]): number {
  let n = 0;
  for (const w of els) {
    if (!(w instanceof WireElm) || (w.x !== w.x2 && w.y !== w.y2)) continue;
    for (const e of els) {
      if (e instanceof WireElm || e.getPostCount() === 0) continue;
      const b = viewFor(e)?.bbox(e);
      if (!b) continue;
      const inX = (x: number) => x > b.x1 && x < b.x2;
      const inY = (y: number) => y > b.y1 && y < b.y2;
      const [x1, x2] = [Math.min(w.x, w.x2), Math.max(w.x, w.x2)];
      const [y1, y2] = [Math.min(w.y, w.y2), Math.max(w.y, w.y2)];
      if (w.y === w.y2 && inY(w.y) && x2 > b.x1 && x1 < b.x2) n++;
      else if (w.x === w.x2 && inX(w.x) && y2 > b.y1 && y1 < b.y2) n++;
    }
  }
  return n;
}

describe('tidy up', () => {
  it('joins a straight run of wires into one', () => {
    const { circuit, ed } = setup(
      'r 0 0 64 0 0 1000\nw 64 0 96 0 0\nw 96 0 128 0 0\nw 128 0 160 0 0\nr 160 0 224 0 0 1000\n',
    );
    const r = ed.tidyUp();
    expect(r).toMatchObject({ wiresBefore: 3, wiresAfter: 1, partsMoved: 0, changed: true });
    expect(wires(circuit)).toEqual([[64, 0, 160, 0]]);
    expect(ed.history.undoLabel).toBe('Tidy up');
    ed.history.undo();
    expect(wires(circuit)).toHaveLength(3);
  });

  it('turns a staircase or a slanted wire into an L', () => {
    const { circuit, ed } = setup(
      'r 0 0 64 0 0 1000\nw 64 0 96 0 0\nw 96 0 96 32 0\nw 96 32 128 32 0\nw 128 32 128 64 0\n' +
        'w 128 64 192 64 0\nr 192 64 256 64 0 1000\n' +
        'r 0 160 64 160 0 1000\nw 64 160 128 224 0\nr 128 224 192 224 0 1000\n',
    );
    ed.tidyUp();
    const ws = wires(circuit);
    expect(ws.length).toBeLessThanOrEqual(4);
    for (const [x, y, x2, y2] of ws) expect(x === x2 || y === y2).toBe(true);
  });

  it('keeps junctions where they are', () => {
    const { circuit, ed } = setup(
      'r 0 0 64 0 0 1000\nw 64 0 96 0 0\nw 96 0 128 0 0\nw 96 0 96 64 0\nr 96 64 96 128 0 1000\n' +
        'r 128 0 192 0 0 1000\n',
    );
    expect(ed.tidyUp()?.changed).toBe(false);
    expect(wires(circuit)).toHaveLength(3);
  });

  it('routes around a part instead of through it', () => {
    // the horizontal-first L from (64,0) would run along y=0 into R2's body
    const { circuit, ed } = setup(
      'r 0 0 64 0 0 1000\nw 64 0 64 64 0\nw 64 64 160 64 0\nw 160 64 160 80 0\n' +
        'r 96 0 160 0 0 1000\nr 160 80 160 144 0 1000\n',
    );
    ed.tidyUp();
    expect(wires(circuit)).toHaveLength(2);
    expect(bodyCrossings(circuit.elements)).toBe(0);
  });

  it('removes a wire drawn twice', () => {
    const { circuit, ed } = setup(
      'r 0 0 64 0 0 1000\nw 64 0 128 0 0\nw 128 0 64 0 0\nr 128 0 192 0 0 1000\n',
    );
    ed.tidyUp();
    expect(wires(circuit)).toEqual([[64, 0, 128, 0]]);
  });

  it('nudges a part into line so its wires run straight', () => {
    const { circuit, ed } = setup(
      'r 0 0 64 0 0 1000\nw 64 0 96 0 0\nw 96 0 96 16 0\nw 96 16 128 16 0\nr 128 16 192 16 0 1000\n' +
        'w 192 16 224 16 0\nw 224 16 224 0 0\nw 224 0 256 0 0\nr 256 0 320 0 0 1000\n',
    );
    const r = ed.tidyUp();
    expect(r?.partsMoved).toBe(1);
    const mid = circuit.elements[4] as CircuitElm;
    expect([mid.y, mid.y2]).toEqual([0, 0]);
    expect(wires(circuit)).toEqual([
      [64, 0, 128, 0],
      [192, 0, 256, 0],
    ]);
  });

  it('turns a part drawn at a slant to lie along the grid, and drops a loose stub', () => {
    const { circuit, ed } = setup(
      'v 0 192 0 0 0 1 40 5 0 0 0.5\nw 0 0 96 0 0\nr 96 0 160 0 0 180\nw 160 0 256 0 0\n' +
        'w 256 0 272 96 0\nl 272 96 288 160 0 1 0\nw 288 160 304 256 0\nw 304 256 0 256 0\n' +
        'w 0 192 0 256 0\nw 0 256 -48 256 0\n',
    );
    const sig = connectivity(circuit.elements);
    const r = ed.tidyUp();
    expect(r?.changed).toBe(true);
    expect(connectivity(circuit.elements)).toBe(sig);
    const l = circuit.elements.find((e) => e.getClassName() === 'InductorElm') as CircuitElm;
    expect(l.x).toBe(l.x2);
    expect(Math.abs(l.y2 - l.y)).toBe(64);
    for (const [x, y, x2, y2] of wires(circuit)) expect(x === x2 || y === y2).toBe(true);
    expect(wires(circuit).some(([x, , x2]) => Math.min(x, x2) < 0)).toBe(false);
    expect(bodyCrossings(circuit.elements)).toBe(0);
    expect(ed.tidyUp()?.changed).toBe(false);
  });

  it('stands slanted resistors upright, moving the labels and parts joined to them', () => {
    const { circuit, ed } = setup(
      'v 0 512 0 0 0 0 40 10 0 0 0.5\nw 0 0 208 0 0\nw 208 0 512 0 0\n' +
        'r 208 0 208 224 0 10000\nO 208 224 272 224 1 0\nw 208 224 224 336 0\n' +
        'r 224 336 240 432 0 10000\nw 240 432 256 512 0\nw 0 512 256 512 0\nw 256 512 496 512 0\n' +
        'r 512 0 480 112 0 10000\nO 480 112 544 112 1 0\nr 480 112 480 224 0 10000\n' +
        'O 480 224 544 224 1 0\nr 480 224 496 352 0 10000\nO 496 352 560 352 1 0\n' +
        'r 496 352 496 512 0 10000\n',
    );
    const sig = connectivity(circuit.elements);
    expect(ed.tidyUp()?.changed).toBe(true);
    expect(connectivity(circuit.elements)).toBe(sig);
    for (const e of circuit.elements)
      if (e.getClassName() === 'ResistorElm') expect(e.x === e.x2 || e.y === e.y2).toBe(true);
    // every wire straight, no jogs
    for (const [x, y, x2, y2] of wires(circuit)) expect(x === x2 || y === y2).toBe(true);
    expect(wires(circuit)).toHaveLength(6);
    expect(bodyCrossings(circuit.elements)).toBe(0);
    expect(ed.tidyUp()?.changed).toBe(false);
  });

  it('turns a slanted ground upright so the wire beside it can run straight', () => {
    const { circuit, ed } = setup(
      'i 0 320 0 0 0 0.01\nw 0 0 96 0 0\nr 96 0 96 320 0 600\n' +
        'w 0 320 96 352 0\nw 96 352 96 320 0\ng 0 320 16 384 0 0\n',
    );
    const sig = connectivity(circuit.elements);
    expect(ed.tidyUp()?.changed).toBe(true);
    expect(connectivity(circuit.elements)).toBe(sig);
    const gnd = circuit.elements.find((e) => e.getClassName() === 'GroundElm') as CircuitElm;
    expect([gnd.x, gnd.y, gnd.x2, gnd.y2]).toEqual([0, 320, 0, 384]);
    expect(wires(circuit)).toContainEqual([0, 320, 96, 320]);
    expect(ed.tidyUp()?.changed).toBe(false);
  });

  it('leaves a part at 45 degrees and a stub pointing at a label as they are', () => {
    const { circuit, ed } = setup(
      'r 0 -64 0 0 0 1000\nw 0 0 0 64 0\nd 0 64 64 128 2 default\nw 64 128 64 192 0\n' +
        'r 64 192 64 256 0 1000\n' +
        'r 128 0 192 0 0 1000\nw 192 0 192 -64 0\nx 180 -80 240 -77 4 16 control\n',
    );
    expect(ed.tidyUp()?.changed).toBe(false);
    expect(wires(circuit)).toHaveLength(3);
  });

  it('only touches the selection when there is one', () => {
    const { circuit, ed } = setup(
      'r 0 0 64 0 0 1000\nw 64 0 96 0 0\nw 96 0 128 0 0\nr 128 0 192 0 0 1000\n' +
        'r 0 96 64 96 0 1000\nw 64 96 96 96 0\nw 96 96 128 96 0\nr 128 96 192 96 0 1000\n',
    );
    for (const e of circuit.elements.slice(0, 4)) e.selected = true;
    ed.tidyUp();
    expect(wires(circuit)).toEqual([
      [64, 0, 128, 0],
      [64, 96, 96, 96],
      [96, 96, 128, 96],
    ]);
  });

  it('leaves wires a scope plots alone', () => {
    const { circuit, ed } = setup(
      'r 0 0 64 0 0 1000\nw 64 0 96 0 0\nw 96 0 128 0 0\nr 128 0 192 0 0 1000\n' +
        'o 1 64 0 4099 5 0.1 0 2 1 3\n',
    );
    ed.tidyUp();
    expect(wires(circuit)).toHaveLength(2);
  });

  it('never changes what connects to what in any bundled example', () => {
    const dirs = [
      new URL(
        '../../../../reference/circuitjs1/src/com/lushprojects/circuitjs1/public/circuits/',
        import.meta.url,
      ),
      new URL('../../examples/circuits/', import.meta.url),
    ].map((u) => fileURLToPath(u));
    let tidied = 0;
    let before = 0;
    let after = 0;
    for (const dir of dirs)
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.txt'))) {
        const c = readCircuit(readFileSync(dir + f, 'utf8'));
        const sig = connectivity(c.elements);
        const crossings = bodyCrossings(c.elements);
        const r = tidy(c.elements, opts(c));
        expect(connectivity(c.elements), f).toBe(sig);
        expect(bodyCrossings(c.elements), f).toBeLessThanOrEqual(crossings);
        if (r.changed) tidied++;
        before += r.wiresBefore;
        after += r.wiresAfter;
        // a second pass finds nothing left to do
        expect(tidy(c.elements, opts(c)).changed, f).toBe(false);
      }
    console.log({ tidied, before, after });
    expect(tidied).toBeGreaterThan(40);
    expect(after).toBeLessThan(before);
  }, 120_000);
});
