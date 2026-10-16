// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { WireElm, viewFor, type CircuitElm } from '@perun/elements';
import { Circuit } from '@perun/format';
import { describe, expect, it } from 'vitest';
import { Editor, NO_MODIFIERS, type EditorHost, type Modifiers } from './Editor.ts';
import { alignmentGuides } from './guides.ts';
import { connectivity } from './tidy.ts';

const HEAD = '$ 1 5.0E-6 10 50 5.0\n';

function setup(body = '') {
  const circuit = new Circuit();
  circuit.read(HEAD + body);
  const host: EditorHost = {
    bbox: (e) => viewFor(e)?.bbox(e) ?? null,
    circuitChanged: () => circuit.sim.setElements(circuit.elements),
    selectionChanged: () => {},
    restore: (xml) => circuit.read(xml),
    visibleArea: () => ({ x1: 0, y1: 0, x2: 800, y2: 600 }),
  };
  circuit.sim.setElements(circuit.elements);
  return { circuit, ed: new Editor(circuit, host) };
}

const wires = (c: Circuit): number[][] =>
  c.elements.filter((e) => e instanceof WireElm).map((w) => [w.x, w.y, w.x2, w.y2]);
const parts = (c: Circuit): CircuitElm[] => c.elements.filter((e) => !(e instanceof WireElm));
const pos = (e: CircuitElm) => [e.x, e.y, e.x2, e.y2];

function drag(ed: Editor, pts: number[][], mods: Modifiers = NO_MODIFIERS) {
  const [x0, y0] = pts[0];
  ed.hover(x0, y0);
  ed.pointerDown(x0, y0, mods);
  for (const [x, y] of pts.slice(1)) ed.pointerDrag(x, y, mods);
  ed.pointerUp(mods);
}

describe('drop onto a wire', () => {
  it('splices a part dropped from the palette into the wire', () => {
    const { circuit, ed } = setup('w 0 96 320 96 0\n');
    ed.paletteDragMove('ResistorElm', { x: 96, y: 96 }, false);
    ed.paletteDragEnd();
    const r = parts(circuit)[0];
    expect(pos(r)).toEqual([96, 96, 160, 96]);
    expect(wires(circuit).sort()).toEqual([
      [0, 96, 96, 96],
      [160, 96, 320, 96],
    ]);
    ed.history.undo();
    expect(wires(circuit)).toEqual([[0, 96, 320, 96]]);
  });

  it('splices across a run of several wires', () => {
    const { circuit, ed } = setup('w 0 96 112 96 0\nw 112 96 320 96 0\n');
    ed.paletteDragMove('CapacitorElm', { x: 96, y: 96 }, false);
    ed.paletteDragEnd();
    expect(wires(circuit).sort()).toEqual([
      [0, 96, 96, 96],
      [160, 96, 320, 96],
    ]);
  });

  it('leaves a junction between the posts alone', () => {
    const { circuit, ed } = setup('w 0 96 128 96 0\nw 128 96 320 96 0\nw 128 96 128 192 0\n');
    ed.paletteDragMove('ResistorElm', { x: 96, y: 96 }, false);
    ed.paletteDragEnd();
    // not spliced: the wire is only cut at the posts, as before
    expect(wires(circuit)).toHaveLength(5);
  });

  it('can be switched off', () => {
    const { circuit, ed } = setup('w 0 96 320 96 0\n');
    ed.spliceOnDrop = false;
    ed.paletteDragMove('ResistorElm', { x: 96, y: 96 }, false);
    ed.paletteDragEnd();
    expect(wires(circuit)).toHaveLength(3);
  });

  it('splices a loose part dragged onto a wire', () => {
    const { circuit, ed } = setup('w 0 96 320 96 0\nr 96 192 160 192 0 1000\n');
    drag(ed, [
      [128, 192],
      [128, 144],
      [128, 96],
    ]);
    expect(pos(parts(circuit)[0])).toEqual([96, 96, 160, 96]);
    expect(wires(circuit).sort()).toEqual([
      [0, 96, 96, 96],
      [160, 96, 320, 96],
    ]);
  });
});

describe('wire routing', () => {
  it('draws an L for a slanted drag, first leg the way the drag started', () => {
    const { circuit, ed } = setup();
    ed.setAddMode('WireElm');
    drag(ed, [
      [0, 0],
      [64, 0],
      [128, 96],
    ]);
    expect(wires(circuit)).toEqual([
      [0, 0, 128, 0],
      [128, 0, 128, 96],
    ]);
  });

  it('goes round a part instead of through it', () => {
    // a resistor sits across the straight line from (0,96) to (320,96)
    const { circuit, ed } = setup('r 128 64 128 128 0 1000\n');
    const before = parts(circuit).length;
    ed.setAddMode('WireElm');
    drag(ed, [
      [0, 96],
      [160, 96],
      [320, 96],
    ]);
    const ws = wires(circuit);
    expect(ws.length).toBeGreaterThan(1);
    for (const [x, y, x2, y2] of ws) expect(x === x2 || y === y2).toBe(true);
    // the resistor is not connected to the new wire
    expect(parts(circuit)).toHaveLength(before);
    const r = parts(circuit)[0];
    for (const [x, y, x2, y2] of ws)
      for (const p of [r.getPost(0), r.getPost(1)])
        expect([x, y].join() === [p.x, p.y].join() || [x2, y2].join() === [p.x, p.y].join()).toBe(
          false,
        );
    expect(ws[0].slice(0, 2)).toEqual([0, 96]);
    expect(ws[ws.length - 1].slice(2)).toEqual([320, 96]);
  });

  it('draws straight with Alt held while drawing, or when switched off', () => {
    const { circuit, ed } = setup();
    ed.setAddMode('WireElm');
    ed.pointerDown(0, 0, NO_MODIFIERS);
    ed.pointerDrag(128, 96, { ...NO_MODIFIERS, alt: true });
    ed.pointerUp(NO_MODIFIERS);
    expect(wires(circuit)).toEqual([[0, 0, 128, 96]]);
    ed.history.undo();
    ed.routeWires = false;
    drag(ed, [
      [0, 0],
      [128, 96],
    ]);
    expect(wires(circuit)).toEqual([[0, 0, 128, 96]]);
  });
});

describe('alignment guides', () => {
  it('lines from moving posts to the nearest post across and down', () => {
    const g = alignmentGuides(
      [{ x: 0, y: 0 }],
      [
        { x: 0, y: 64 },
        { x: 0, y: 160 },
        { x: 96, y: 0 },
        { x: 32, y: 32 },
      ],
    );
    expect(g.lines).toEqual([
      { x1: 0, y1: 0, x2: 0, y2: 64 },
      { x1: 0, y1: 0, x2: 96, y2: 0 },
    ]);
    expect(g.marks).toHaveLength(2);
  });

  it('shows while a part is dragged and clears on drop', () => {
    const { ed } = setup('r 0 0 64 0 0 1000\nr 128 96 192 96 0 1000\n');
    ed.hover(160, 96);
    ed.pointerDown(160, 96, NO_MODIFIERS);
    ed.pointerDrag(160, 64, NO_MODIFIERS);
    ed.pointerDrag(160, 0, NO_MODIFIERS);
    expect(ed.guides.lines.some((l) => l.y1 === 0 && l.y2 === 0)).toBe(true);
    ed.pointerUp(NO_MODIFIERS);
    expect(ed.guides.lines).toHaveLength(0);
  });
});

describe('align and spread', () => {
  const ROW = 'r 0 0 64 0 0 1000\nr 128 32 192 32 0 1000\nr 256 -32 320 -32 0 1000\n';

  it('lines parts up on their middles, one undo step', () => {
    const { circuit, ed } = setup(ROW);
    ed.selectAll();
    expect(ed.align('middle')).toBe('moved');
    expect(parts(circuit).map((e) => e.y)).toEqual([0, 0, 0]);
    expect(ed.history.undoLabel).toBe('Align');
    ed.history.undo();
    expect(parts(circuit).map((e) => e.y)).toEqual([0, 32, -32]);
  });

  it('aligns tops and lefts', () => {
    const { circuit, ed } = setup(ROW);
    ed.selectAll();
    ed.align('top');
    expect(parts(circuit).map((e) => e.y)).toEqual([-32, -32, -32]);
    // all on one row now: lined up on the right they would lie on top of each other
    ed.align('right');
    expect(parts(circuit).map((e) => e.x)).toEqual([0, 128, 256]);
    ed.history.undo();
    ed.selectAll();
    ed.align('right');
    expect(parts(circuit).map((e) => e.x)).toEqual([256, 256, 256]);
  });

  it('wires follow the parts they join', () => {
    const { circuit, ed } = setup('r 0 0 64 0 0 1000\nw 64 0 128 32 0\nr 128 32 192 32 0 1000\n');
    for (const e of parts(circuit)) e.selected = true;
    const sig = connectivity(circuit.elements);
    ed.align('middle');
    expect(connectivity(circuit.elements)).toBe(sig);
  });

  it('spreads parts out with equal gaps', () => {
    const { circuit, ed } = setup(
      'r 0 0 64 0 0 1000\nr 80 96 144 96 0 1000\nr 320 192 384 192 0 1000\n',
    );
    ed.selectAll();
    expect(ed.spread('x')).toBe('moved');
    // span 0..384, three 64-wide parts: gaps of 96
    expect(parts(circuit).map((e) => e.x)).toEqual([0, 160, 320]);
  });

  it('refuses a move that would join two parts', () => {
    const { circuit, ed } = setup('r 0 0 64 0 0 1000\nr 64 64 128 64 0 1000\n');
    ed.selectAll();
    expect(ed.align('top')).toBe('refused');
    expect(parts(circuit).map((e) => e.y)).toEqual([0, 64]);
  });
});

describe('replace with', () => {
  it('offers parts whose posts land on the same points, and swaps one in', () => {
    const { circuit, ed } = setup('w 0 0 96 0 0\nr 96 0 160 0 0 1000\nw 160 0 224 0 0\n');
    const r = parts(circuit)[0];
    const fits = ed.replacementsFor(r, ['CapacitorElm', 'DiodeElm', 'TransistorElm', 'WireElm']);
    expect(fits).toEqual(['CapacitorElm', 'DiodeElm']);
    const sig = connectivity(circuit.elements);
    const c = ed.replaceWith(r, 'CapacitorElm');
    expect(c?.getClassName()).toBe('CapacitorElm');
    expect(pos(parts(circuit)[0])).toEqual([96, 0, 160, 0]);
    expect(connectivity(circuit.elements)).toBe(sig);
    expect(ed.history.undoLabel).toBe('Replace');
    ed.history.undo();
    expect(parts(circuit)[0].getClassName()).toBe('ResistorElm');
  });
});
