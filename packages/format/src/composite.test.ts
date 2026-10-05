// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import {
  constructElement,
  CustomCompositeElm,
  layoutNewModel,
  modelsFor,
  SIDE_E,
  SIDE_W,
  type CustomCompositeModel,
} from '@circuitjs-next/elements';
import { describe, expect, it } from 'vitest';
import { Circuit, getCircuitAsComposite, readCircuit } from './circuit.ts';

/** A divider between labels "top" and "bot", tapped by "mid", with a closed switch inside. */
const DIVIDER =
  '$ 1 0.000005 10.2 50 5 50 5e-11\n' +
  '207 96 96 48 96 4 top\n' +
  'r 96 96 96 192 0 1000\n' +
  's 96 192 96 224 0 0 false\n' +
  'r 96 224 96 320 0 1000\n' +
  '207 96 320 48 320 4 bot\n' +
  'w 96 192 192 192 0\n' +
  '207 192 192 240 192 4 mid\n';

function makeModel(): CustomCompositeModel {
  const c = readCircuit(DIVIDER);
  const r = getCircuitAsComposite(c);
  if (!('model' in r)) throw new Error(`no model: ${r.error}`);
  expect(layoutNewModel(r.model)).toBeNull();
  return r.model;
}

describe('getCircuitAsComposite', () => {
  it('turns labeled nodes into pins on the side they point to', () => {
    const m = makeModel();
    expect(m.extList.map((e) => [e.name, e.side, e.pos])).toEqual([
      ['bot', SIDE_W, 1],
      ['mid', SIDE_E, 0],
      ['top', SIDE_W, 0],
    ]);
    expect([m.sizeX, m.sizeY]).toEqual([2, 2]);
    // parts first, then wires and labels, each with its node numbers and position
    const tags = m.getElmEntries().map((e) => e.name);
    expect(tags).toEqual(['r', 's', 'r', 'ln', 'ln', 'w', 'ln']);
    expect(m.getElmEntries()[0].getAttribute('nn')).toBe('1 2');
    expect(m.canLoadModelCircuit()).toBe(true);
  });

  it('refuses a label on ground', () => {
    const grounded = readCircuit(DIVIDER + 'g 96 320 96 352 0\n');
    expect(getCircuitAsComposite(grounded)).toEqual({
      error: 'Node "bot" can\'t be connected to ground',
    });
  });

  it('builds a subcircuit that works like the circuit it came from', () => {
    const model = makeModel();
    model.name = 'div';
    const c = new Circuit();
    const lib = modelsFor(c.sim).composite;
    lib.localModelMap.set('div', model);
    const cc = constructElement('CustomCompositeElm', 160, 160, c.sim) as CustomCompositeElm;
    cc.initWithModel('div');
    cc.setPoints();
    const post = (name: string) => cc.getPost(model.extList.findIndex((e) => e.name === name));
    const top = post('top');
    const bot = post('bot');
    c.elements = [cc];
    const xml = c.dumpXml();
    const run = readCircuit(xml);
    run.readRetain(
      `v ${bot.x} ${bot.y + 64} ${top.x} ${top.y - 64} 0 0 40 10 0 0 0.5\n` +
        `w ${top.x} ${top.y - 64} ${top.x} ${top.y} 0\n` +
        `w ${bot.x} ${bot.y + 64} ${bot.x} ${bot.y} 0\n` +
        `g ${bot.x} ${bot.y + 64} ${bot.x} ${bot.y + 96} 0\n`,
    );
    run.sim.setElements(run.elements);
    run.sim.step(10);
    const sub = run.elements.find((e) => e instanceof CustomCompositeElm) as CustomCompositeElm;
    const mid = sub.getNode(model.extList.findIndex((e) => e.name === 'mid')).index;
    expect(run.sim.nodeVoltages()[mid]).toBeCloseTo(5, 4);
  });
});
