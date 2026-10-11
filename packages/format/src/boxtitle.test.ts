// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
/* eslint-disable local/no-color-literals -- box color names, not colors */

import { BoxElm } from '@perun/elements';
import { describe, expect, it } from 'vitest';
import { Circuit } from './circuit.ts';

const BOX = '$ 1 5.0E-6 10 50 5.0\nb 96 96 320 224 0\n';

function load(text: string): BoxElm {
  const c = new Circuit();
  c.read(text);
  return c.elements[0] as BoxElm;
}

describe('box titles and styles (not in upstream, docs/deviations/box-titles.md)', () => {
  it("saves nothing extra for upstream's plain box", () => {
    const c = new Circuit();
    c.read(BOX);
    const b = c.elements[0] as BoxElm;
    expect([b.title, b.color, b.border, b.shaded]).toEqual(['', 'default', 'dashed', false]);
    expect(c.dumpXml()).not.toMatch(/ (tt|tz|tp|bc|bs|sh)=/);
  });

  it('round-trips every option through XML', () => {
    const c = new Circuit();
    c.read(BOX);
    const b = c.elements[0] as BoxElm;
    b.title = 'Power <supply> & "filter"';
    b.titleSize = 20;
    b.titlePlace = 'inside';
    b.color = 'green';
    b.border = 'dotted';
    b.shaded = true;
    const d = new Circuit();
    d.read(c.dumpXml());
    const u = d.elements[0] as BoxElm;
    expect([u.title, u.titleSize, u.titlePlace, u.color, u.border, u.shaded]).toEqual([
      'Power <supply> & "filter"',
      20,
      'inside',
      'green',
      'dotted',
      true,
    ]);
    expect([u.x, u.y, u.x2, u.y2]).toEqual([96, 96, 320, 224]);
  });

  it('ignores values it does not know', () => {
    const c = new Circuit();
    c.read(BOX);
    const xml = c.dumpXml().replace('<b ', '<b tz="900" tp="left" bc="teal" bs="wavy" sh="maybe" ');
    const u = load(xml);
    expect([u.titleSize, u.titlePlace, u.color, u.border, u.shaded]).toEqual([
      16,
      'border',
      'default',
      'dashed',
      false,
    ]);
  });

  it('edits through the property fields', () => {
    const b = load(BOX);
    const title = b.getEditInfo(0);
    if (title === null) throw new Error('expected a Title field');
    title.text = 'Filter\nstage';
    b.setEditValue(0, title);
    expect(b.title).toBe('Filter stage');
    const color = b.getEditInfo(3);
    if (color?.choice == null) throw new Error('expected a Color choice');
    color.choice.selected = 4;
    b.setEditValue(3, color);
    expect(b.color).toBe('blue');
  });

  it('resizes from all four corners', () => {
    const b = load(BOX);
    // the top right corner is handle 2, the bottom left handle 3
    expect(b.getHandleGrabbedClose(320, 96, 25, 256)).toBe(2);
    b.movePoint(2, 32, -16);
    expect(b.rect()).toEqual({ x1: 96, y1: 80, x2: 352, y2: 224 });
    expect(b.getHandleGrabbedClose(96, 224, 25, 256)).toBe(3);
    b.movePoint(3, -16, 16);
    expect(b.rect()).toEqual({ x1: 80, y1: 80, x2: 352, y2: 240 });
    expect(b.closestHandle(350, 238)).toBe(1);
    // never flat
    b.movePoint(2, -272, 0);
    expect(b.rect()).toEqual({ x1: 80, y1: 80, x2: 352, y2: 240 });
  });

  it('is picked on its title as well as its edges', () => {
    const b = load(BOX);
    b.title = 'Filter';
    b.titlePlace = 'inside';
    // inside the box, under the top left corner
    expect(b.getMouseDistance(140, 115)).toBe(0);
    expect(b.getMouseDistance(200, 160)).toBe(-1);
  });
});
