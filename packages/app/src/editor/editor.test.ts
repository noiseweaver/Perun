// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { BoxElm, ResistorElm, SwitchElm, viewFor, WireElm, type CircuitElm } from '@perun/elements';
import { Circuit } from '@perun/format';
import { describe, expect, it } from 'vitest';
import { badPosts } from '@perun/render';
import {
  BAD_CONNECTION_NOTICE,
  Editor,
  MouseMode,
  NO_MODIFIERS,
  type EditorHost,
} from './Editor.ts';

function setup(text = '$ 1 5.0E-6 10 50 5.0\n') {
  const circuit = new Circuit();
  circuit.read(text);
  let changes = 0;
  const host: EditorHost = {
    bbox: (e) => viewFor(e)?.bbox(e) ?? null,
    circuitChanged: () => {
      circuit.sim.setElements(circuit.elements);
      changes++;
    },
    selectionChanged: () => {},
    restore: (xml) => circuit.read(xml),
    visibleArea: () => ({ x1: 0, y1: 0, x2: 800, y2: 600 }),
  };
  const ed = new Editor(circuit, host);
  return { circuit, ed, changes: () => changes };
}

const pos = (e: CircuitElm) => [e.x, e.y, e.x2, e.y2];

function drag(ed: Editor, x1: number, y1: number, x2: number, y2: number, mods = NO_MODIFIERS) {
  ed.hover(x1, y1);
  ed.pointerDown(x1, y1, mods);
  ed.pointerDrag((x1 + x2) / 2, (y1 + y2) / 2, mods);
  ed.pointerDrag(x2, y2, mods);
  ed.pointerUp(mods);
}

describe('Editor', () => {
  it('places an element by dragging it out, snapped to the grid', () => {
    const { circuit, ed } = setup();
    ed.setAddMode('ResistorElm');
    drag(ed, 101, 99, 197, 102);
    expect(circuit.elements).toHaveLength(1);
    const r = circuit.elements[0] as ResistorElm;
    expect(r).toBeInstanceOf(ResistorElm);
    expect(pos(r)).toEqual([96, 96, 192, 96]);
    expect(r.resistance).toBe(1000);
    expect(ed.history.canUndo).toBe(true);
  });

  it('does not create a zero-length element on a click', () => {
    const { circuit, ed } = setup();
    ed.setAddMode('WireElm');
    drag(ed, 100, 100, 101, 101);
    expect(circuit.elements).toHaveLength(0);
    expect(ed.history.canUndo).toBe(false);
  });

  it('selects with a click and moves the selection by dragging', () => {
    const { circuit, ed } = setup(
      '$ 1 5.0E-6 10 50 5.0\nr 96 96 192 96 0 1000\nw 192 96 192 192 0\n',
    );
    const [r, w] = circuit.elements as [CircuitElm, CircuitElm];
    ed.wiresFollow = false;
    ed.hover(144, 96);
    ed.pointerDown(144, 96, NO_MODIFIERS);
    ed.pointerUp(NO_MODIFIERS);
    expect(r.selected).toBe(true);
    expect(w.selected).toBe(false);
    drag(ed, 144, 96, 144 + 32, 96 + 48);
    expect(pos(r)).toEqual([128, 144, 224, 144]);
    expect(pos(w)).toEqual([192, 96, 192, 192]);
    ed.history.undo();
    expect(pos(circuit.elements[0] as CircuitElm)).toEqual([96, 96, 192, 96]);
    ed.history.redo();
    expect(pos(circuit.elements[0] as CircuitElm)).toEqual([128, 144, 224, 144]);
  });

  describe('boxes', () => {
    const BOXED = '$ 1 5.0E-6 10 50 5.0\nb 64 64 320 224 0\nr 96 128 192 128 0 1000\n';

    it('selects a box by area only when the area holds all of it, as upstream', () => {
      const { circuit, ed } = setup(BOXED);
      const [box, r] = circuit.elements as [CircuitElm, CircuitElm];
      // an area around the resistor, inside the box
      drag(ed, 80, 112, 208, 144);
      expect([box.selected, r.selected]).toEqual([false, true]);
      drag(ed, 48, 48, 336, 240);
      expect([box.selected, r.selected]).toEqual([true, true]);
    });

    it('resizes from a corner that is not one of its two points', () => {
      const { circuit, ed } = setup(BOXED);
      const box = circuit.elements[0] as CircuitElm;
      // the top right corner
      drag(ed, 320, 64, 352, 48);
      expect(pos(box)).toEqual([64, 48, 352, 224]);
    });

    it('resizes from just outside a corner', () => {
      const { circuit, ed } = setup(BOXED);
      const box = circuit.elements[0] as CircuitElm;
      // a press a few units past the bottom right corner, outside the box
      drag(ed, 326, 230, 358, 262);
      expect(pos(box)).toEqual([64, 64, 352, 256]);
    });

    it('places a new box with a title', () => {
      const { circuit, ed } = setup();
      ed.setAddMode('BoxElm');
      drag(ed, 64, 64, 256, 192);
      const box = circuit.elements[0] as BoxElm;
      expect(box).toBeInstanceOf(BoxElm);
      expect(box.title).toBe('Label');
    });
  });

  describe('wires following a moved part', () => {
    const RW = '$ 1 5.0E-6 10 50 5.0\nr 96 96 192 96 0 1000\nw 192 96 192 192 0\n';

    it('bends a straight wire into an L, keeping its direction at the part', () => {
      const { circuit, ed } = setup(RW);
      drag(ed, 144, 96, 144 + 32, 96 + 48);
      expect(circuit.elements).toHaveLength(3);
      const [r, w, c] = circuit.elements as [CircuitElm, CircuitElm, CircuitElm];
      expect(pos(r)).toEqual([128, 144, 224, 144]);
      expect(pos(w)).toEqual([224, 192, 192, 192]);
      expect(c).toBeInstanceOf(WireElm);
      expect(pos(c)).toEqual([224, 192, 224, 144]);
      ed.history.undo();
      expect(circuit.elements.map(pos)).toEqual([
        [96, 96, 192, 96],
        [192, 96, 192, 192],
      ]);
    });

    it('stretches a wire in line with the move, and drops one that shrinks to nothing', () => {
      const { circuit, ed } = setup(
        '$ 1 5.0E-6 10 50 5.0\nr 96 96 192 96 0 1000\nw 192 96 288 96 0\n',
      );
      drag(ed, 144, 96, 176, 96);
      expect(circuit.elements.map(pos)).toEqual([
        [128, 96, 224, 96],
        [224, 96, 288, 96],
      ]);
      ed.select(circuit.elements[0] as CircuitElm);
      drag(ed, 176, 96, 240, 96);
      expect(circuit.elements.map(pos)).toEqual([[192, 96, 288, 96]]);
    });

    it('stays behind while Alt is held, or with the setting off', () => {
      const alt = { ...NO_MODIFIERS, alt: true };
      const a = setup(RW);
      a.ed.hover(144, 96);
      a.ed.pointerDown(144, 96, NO_MODIFIERS);
      a.ed.pointerDrag(160, 120, NO_MODIFIERS);
      expect(a.circuit.elements).toHaveLength(3);
      a.ed.pointerDrag(176, 144, alt);
      a.ed.pointerUp(alt);
      expect(a.circuit.elements.map(pos)).toEqual([
        [128, 144, 224, 144],
        [192, 96, 192, 192],
      ]);
      const b = setup(RW);
      b.ed.wiresFollow = false;
      drag(b.ed, 144, 96, 176, 144);
      expect(pos(b.circuit.elements[1] as CircuitElm)).toEqual([192, 96, 192, 192]);
    });

    it('moves both ends of a wire between two moved parts, and follows arrow keys', () => {
      const { circuit, ed } = setup(
        '$ 1 5.0E-6 10 50 5.0\nr 96 96 192 96 0 1000\nw 192 96 288 96 0\nr 288 96 384 96 0 1000\nw 384 96 384 192 0\n',
      );
      ed.select(circuit.elements[0] as CircuitElm);
      ed.select(circuit.elements[2] as CircuitElm, true);
      ed.moveSelected(0, 16);
      expect(circuit.elements.map(pos)).toEqual([
        [96, 112, 192, 112],
        [192, 112, 288, 112],
        [288, 112, 384, 112],
        [384, 112, 384, 192],
      ]);
    });
  });

  it('selects an area with a rubber band and clears it with a click on empty space', () => {
    const { circuit, ed } = setup(
      '$ 1 5.0E-6 10 50 5.0\nr 96 96 192 96 0 1000\nr 96 400 192 400 0 1000\n',
    );
    drag(ed, 80, 80, 300, 200);
    expect(circuit.elements.map((e) => e.selected)).toEqual([true, false]);
    ed.hover(500, 500);
    ed.pointerDown(500, 500, NO_MODIFIERS);
    ed.pointerUp(NO_MODIFIERS);
    expect(circuit.elements.some((e) => e.selected)).toBe(false);
  });

  it('stretches an element by its end post', () => {
    const { circuit, ed } = setup('$ 1 5.0E-6 10 50 5.0\nw 96 96 192 96 0\n');
    drag(ed, 192, 96, 192, 160);
    expect(pos(circuit.elements[0] as CircuitElm)).toEqual([96, 96, 192, 160]);
  });

  it('splits a wire when a new wire ends on its middle', () => {
    const { circuit, ed } = setup('$ 1 5.0E-6 10 50 5.0\nw 96 96 224 96 0\n');
    ed.setAddMode('WireElm');
    drag(ed, 160, 192, 160, 96);
    const wires = circuit.elements.filter((e) => e instanceof WireElm).map(pos);
    expect(wires).toContainEqual([96, 96, 160, 96]);
    expect(wires).toContainEqual([160, 96, 224, 96]);
    expect(wires).toContainEqual([160, 192, 160, 96]);
  });

  it('splits a new wire where it crosses a junction', () => {
    const { circuit, ed } = setup(
      '$ 1 5.0E-6 10 50 5.0\nw 160 32 160 96 0\nw 160 96 160 160 0\nw 160 96 224 96 0\n',
    );
    ed.setAddMode('WireElm');
    drag(ed, 96, 96, 224, 96);
    const wires = circuit.elements.filter((e) => e instanceof WireElm).map(pos);
    // 96..160 is new; 160..224 already exists, so it is not doubled
    expect(wires).toContainEqual([96, 96, 160, 96]);
    expect(wires.filter((p) => p[1] === 96 && p[3] === 96)).toHaveLength(2);
  });

  it('deletes, copies and pastes, and every step undoes', () => {
    const { circuit, ed } = setup('$ 1 5.0E-6 10 50 5.0\nr 96 96 192 96 0 470\n');
    const r = circuit.elements[0] as ResistorElm;
    ed.select(r);
    const clip = ed.copySelected(null);
    expect(clip).toContain('<r ');
    expect(ed.paste()).toBe(true);
    expect(circuit.elements).toHaveLength(2);
    const pasted = circuit.elements[1] as ResistorElm;
    expect(pasted.resistance).toBe(470);
    expect(pasted.selected).toBe(true);
    expect(pos(pasted)).not.toEqual(pos(r));
    ed.deleteSelected(null);
    expect(circuit.elements).toHaveLength(1);
    ed.history.undo();
    expect(circuit.elements).toHaveLength(2);
    ed.history.undo();
    expect(circuit.elements).toHaveLength(1);
  });

  it('rotates the selection a quarter turn as upstream does', () => {
    const { circuit, ed } = setup('$ 1 5.0E-6 10 50 5.0\nr 96 96 192 96 0 1000\n');
    ed.selectAll();
    ed.rotateCW();
    const r = circuit.elements[0] as CircuitElm;
    // centre (144, 96): a horizontal resistor becomes vertical through the same centre
    expect(r.x).toBe(r.x2);
    expect(Math.abs(r.y2 - r.y)).toBe(96);
    ed.rotateCCW();
    expect(pos(r)).toEqual([96, 96, 192, 96]);
  });

  it('toggles a switch on click without recording an edit', () => {
    const { circuit, ed } = setup('$ 1 5.0E-6 10 50 5.0\ns 96 96 192 96 0 0 false\n');
    const s = circuit.elements[0] as SwitchElm;
    ed.hover(144, 92);
    expect(ed.pointerDown(144, 92, NO_MODIFIERS)).toBe('switch');
    ed.pointerUp(NO_MODIFIERS);
    expect(s.position).toBe(1);
    expect(ed.history.canUndo).toBe(false);
  });

  it('asks the app to pan with alt-drag and edits nothing', () => {
    const { circuit, ed } = setup('$ 1 5.0E-6 10 50 5.0\nr 96 96 192 96 0 1000\n');
    const alt = { ...NO_MODIFIERS, alt: true };
    expect(ed.pointerDown(144, 96, alt)).toBe('pan');
    expect(ed.isPanning).toBe(true);
    ed.pointerDrag(300, 300, alt);
    ed.pointerUp(alt);
    expect(pos(circuit.elements[0] as CircuitElm)).toEqual([96, 96, 192, 96]);
    expect(ed.tempMouseMode).toBe(MouseMode.SELECT);
  });

  it('drops an element dragged from the palette at its default size', () => {
    const { circuit, ed } = setup();
    ed.paletteDragMove('CapacitorElm', { x: 99, y: 130 }, false);
    ed.paletteDragMove('CapacitorElm', { x: 120, y: 160 }, true);
    const c = ed.paletteDragEnd();
    expect(c).not.toBeNull();
    expect(circuit.elements).toHaveLength(1);
    expect(pos(circuit.elements[0] as CircuitElm)).toEqual([112, 160, 112, 224]);
  });

  it('drops an element picked on the radial wheel centred where it opened', () => {
    const { circuit, ed } = setup();
    expect(ed.placeAt('ResistorElm', 200, 100, false)).not.toBeNull();
    expect(ed.placeAt('CapacitorElm', 200, 300, true)).not.toBeNull();
    // (200, 100) snaps to (192, 96) and (200, 300) to (192, 304)
    expect(circuit.elements.map((e) => pos(e))).toEqual([
      [160, 96, 224, 96],
      [192, 272, 192, 336],
    ]);
  });

  it('leaves a placed part unselected unless asked to open its properties', () => {
    const { circuit, ed } = setup('$ 1 5.0E-6 10 50 5.0\nw 96 304 192 304 0\n');
    const w = circuit.elements[0] as CircuitElm;
    w.selected = true;
    const r = ed.placeAt('ResistorElm', 200, 100, false);
    expect(r?.selected).toBe(false);
    expect(w.selected).toBe(false);
    ed.selectPlaced = true;
    const c = ed.placeAt('CapacitorElm', 400, 100, false);
    expect(ed.selectedElements()).toEqual([c]);
  });

  describe('no bad connections', () => {
    // a resistor short enough to have no leads to join, its middle at (128, 96)
    const R = 'r 96 96 160 96 0 1000\n';

    it('moves a wire end dropped on a part onto its nearest pin', () => {
      const { circuit, ed } = setup(`$ 1 5.0E-6 10 50 5.0\n${R}w 224 192 288 192 0\n`);
      const w = circuit.elements[1] as CircuitElm;
      drag(ed, 224, 192, 128, 96);
      expect(pos(w)).toEqual([96, 96, 288, 192]);
      expect(badPosts(circuit.elements)).toEqual([]);
      ed.history.undo();
      expect(pos(circuit.elements[1] as CircuitElm)).toEqual([224, 192, 288, 192]);
    });

    it('joins a wire drawn to end on a part', () => {
      const { circuit, ed } = setup(`$ 1 5.0E-6 10 50 5.0\n${R}`);
      ed.routeWires = false;
      ed.setAddMode('WireElm');
      drag(ed, 128, 192, 128, 96);
      expect(pos(circuit.elements[1] as CircuitElm)).toEqual([128, 192, 96, 96]);
      expect(badPosts(circuit.elements)).toEqual([]);
    });

    it('moves a dropped part so its pin lands on the pin it was dropped on', () => {
      const { circuit, ed } = setup(`$ 1 5.0E-6 10 50 5.0\n${R}`);
      const r = ed.placeAt('ResistorElm', 128, 128, true);
      expect(r && pos(r)).toEqual([96, 96, 96, 160]);
      expect(badPosts(circuit.elements)).toEqual([]);
    });

    it('splits a wire a moved part leaves its pin on', () => {
      const { circuit, ed } = setup(
        '$ 1 5.0E-6 10 50 5.0\nw 64 96 192 96 0\nr 128 192 128 256 0 1000\n',
      );
      drag(ed, 128, 224, 128, 128);
      expect(circuit.elements).toHaveLength(3);
      expect(badPosts(circuit.elements)).toEqual([]);
    });

    it('puts a move back that would leave a pin on a part, and says why', () => {
      const { circuit, ed } = setup(`$ 1 5.0E-6 10 50 5.0\n${R}r 128 192 128 256 0 1000\n`);
      const notices: string[] = [];
      (ed as unknown as { host: EditorHost }).host.notice = (t) => notices.push(t);
      drag(ed, 128, 224, 128, 128);
      expect(circuit.elements.map(pos)).toEqual([
        [96, 96, 160, 96],
        [128, 192, 128, 256],
      ]);
      expect(notices).toEqual([BAD_CONNECTION_NOTICE]);
      expect(ed.history.canUndo).toBe(false);
    });

    it('leaves the bad connections a file came with', () => {
      const { circuit, ed } = setup(
        `$ 1 5.0E-6 10 50 5.0\n${R}w 128 96 128 160 0\nr 304 96 368 96 0 1000\n`,
      );
      expect(badPosts(circuit.elements)).toHaveLength(1);
      drag(ed, 336, 96, 336, 160);
      expect(pos(circuit.elements[2] as CircuitElm)).toEqual([304, 160, 368, 160]);
    });
  });

  describe('touch', () => {
    const WIRE = '$ 1 5.0E-6 10 50 5.0\nw 96 96 288 96 0\nr 96 192 192 192 0 1000\n';

    it('grabs a wire end a finger lands near, not only right on it', () => {
      const { circuit, ed } = setup(WIRE);
      const w = circuit.elements[0] as CircuitElm;
      // 14 units short of the end and 10 below the wire: a mouse here grabs nothing
      expect(ed.pick(274, 106).elm).toBeNull();
      ed.touchReach = 20;
      expect(ed.pick(274, 106)).toEqual({ elm: w, post: 1 });
      ed.pointerDown(274, 106, NO_MODIFIERS);
      expect(ed.tempMouseMode).toBe(MouseMode.DRAG_POST);
      ed.pointerDrag(274, 170, NO_MODIFIERS);
      ed.pointerUp(NO_MODIFIERS);
      expect(pos(w)).toEqual([96, 96, 288, 160]);
    });

    it('moves the whole wire from its middle third', () => {
      const { circuit, ed } = setup('$ 1 5.0E-6 10 50 5.0\nw 96 96 144 96 0\n');
      const w = circuit.elements[0] as CircuitElm;
      ed.wiresFollow = false;
      ed.touchReach = 40;
      ed.pointerDown(120, 100, NO_MODIFIERS);
      expect(ed.tempMouseMode).toBe(MouseMode.SELECT);
      ed.pointerDrag(120, 164, NO_MODIFIERS);
      ed.pointerUp(NO_MODIFIERS);
      expect(pos(w)).toEqual([96, 160, 144, 160]);
    });

    it('grabs a wire end with another part selected, and a tap on the end selects the wire', () => {
      const { circuit, ed } = setup(WIRE);
      const [w, r] = circuit.elements as [CircuitElm, CircuitElm];
      ed.select(r);
      ed.touchReach = 20;
      ed.pointerDown(100, 100, NO_MODIFIERS);
      expect(ed.tempMouseMode).toBe(MouseMode.DRAG_POST);
      ed.pointerUp(NO_MODIFIERS);
      // a tap: nothing split or moved, the wire is selected
      expect(circuit.elements).toHaveLength(2);
      expect(pos(w)).toEqual([96, 96, 288, 96]);
      expect(ed.selectedElements()).toEqual([w]);
    });
  });

  it('saves a circuit it built that reads back the same', () => {
    const { circuit, ed } = setup();
    ed.setAddMode('DCVoltageElm');
    drag(ed, 96, 192, 96, 96);
    ed.setAddMode('ResistorElm');
    drag(ed, 96, 96, 224, 96);
    ed.setAddMode('WireElm');
    drag(ed, 224, 96, 224, 192);
    drag(ed, 224, 192, 96, 192);
    const xml = circuit.dumpXml();
    const again = new Circuit();
    again.read(xml);
    expect(again.dumpXml()).toBe(xml);
    expect(again.elements.map((e) => e.getClassName())).toEqual([
      'DCVoltageElm',
      'ResistorElm',
      'WireElm',
      'WireElm',
    ]);
  });
});
