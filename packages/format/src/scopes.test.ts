// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { ScopeElm, plotName } from '@circuitjs-next/elements';
import { describe, expect, it } from 'vitest';
import { Circuit, readCircuit } from './circuit.ts';

/** upstream lrc.txt: three scopes on the inductor, capacitor and resistor. */
const LRC =
  '$ 1 0.000005 10.20027730826997 50 5 43 5e-11\n' +
  'r 176 80 384 80 0 10\n' +
  's 384 80 448 80 0 1 false\n' +
  'w 176 80 176 352 0\n' +
  'c 384 352 176 352 0 0.000015 -9.86 -10\n' +
  'l 384 80 384 352 0 1 0.03 0\n' +
  'v 448 352 448 80 0 0 40 5 0 0 0.5\n' +
  'r 384 352 448 352 0 100\n' +
  'o 4 64 0 4099 20 0.05 0 2 4 3\n' +
  'o 3 64 0 4099 20 0.05 1 2 3 3\n' +
  'o 0 64 0 4099 0.625 0.05 2 2 0 3\n';

/** upstream multivib-a.txt: four undocked scopes on the transistors and capacitors. */
const MULTIVIB =
  '$ 1 0.000005 8.281975887399955 50 5 50\n' +
  'w 112 48 208 48 0\n' +
  'w 208 48 288 48 0\n' +
  'w 288 48 384 48 0\n' +
  'r 112 48 112 176 0 330\n' +
  'r 208 48 208 176 0 1020\n' +
  'r 288 48 288 176 0 1020\n' +
  'r 384 48 384 176 0 320\n' +
  'c 112 176 208 176 0 0.000018 3.7024016598584764\n' +
  'c 384 176 288 176 0 0.000018 -0.5571050333713464\n' +
  'w 384 176 384 240 0\n' +
  't 288 256 384 256 0 1 0.6334943517995971 0.6821481504454086 100\n' +
  'w 208 176 288 256 0\n' +
  'w 288 176 208 256 0\n' +
  't 208 256 112 256 0 1 -3.778790978286727 0.6057588320171579 100\n' +
  'w 112 176 112 240 0\n' +
  'R 112 48 64 48 0 0 40 5 0 0 0.5\n' +
  'g 112 272 112 304 0\n' +
  'g 384 272 384 304 0\n' +
  'x 159 212 179 215 4 16 C1\n' +
  'x 317 213 337 216 4 16 C2\n' +
  'x 85 260 106 263 4 16 Q1\n' +
  'x 390 259 411 262 4 16 Q2\n' +
  '403 192 208 224 240 0 12_256_0_4102_5_0.1_0_2_12_3\n' +
  '403 272 208 304 240 0 11_256_0_4102_5_0.4_0_2_11_3\n' +
  '403 320 128 352 160 0 8_128_0_4102_5_0.4_0_2_8_3\n' +
  '403 144 128 176 160 0 7_128_0_4102_5_0.1_0_2_7_3\n' +
  'o 13 64 6 4099 8.840953122049878 0.0001 0 2 10 6\n';

const scopeRecords = (c: Circuit): string[] =>
  c
    .dumpXml()
    .split('\n')
    .filter((l) => /^ {2}<o[ >]/.test(l) || /^ {4}<p /.test(l));

describe('scopes', () => {
  it('reads text scope lines and saves them as XML that reads back the same', () => {
    const c = readCircuit(LRC);
    const mgr = c.scopes;
    expect(mgr.scopeCount).toBe(3);
    expect(mgr.scopes.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(mgr.scopes.map((s) => s.plots[0]?.elm?.getClassName())).toEqual([
      'InductorElm',
      'CapacitorElm',
      'ResistorElm',
    ]);
    const saved = scopeRecords(c);
    expect(saved.filter((l) => l.startsWith('  <o'))).toHaveLength(3);
    // like upstream, a scope read from XML saves its speed as 0 until it is set up again
    const again = readCircuit(c.dumpXml());
    expect(scopeRecords(again)).toEqual(saved.map((l) => l.replace(/ sp="\d+"/, ' sp="0"')));
  });

  it('fills its plots as the simulation runs', () => {
    const c = readCircuit(LRC);
    const mgr = c.scopes;
    mgr.setupScopes({ x: 0, y: 400, width: 900, height: 150 });
    const plot = mgr.scopes[1]?.plots[0];
    if (!plot) throw new Error('no plot');
    const start = plot.ptr;
    for (let k = 0; k < 20; k++) c.sim.step(50);
    expect(plot.ptr).not.toBe(start);
    // the capacitor starts at about -10 V and swings
    expect(Math.min(...plot.minValues)).toBeLessThan(-1);
  });

  it('stacks, combines and separates', () => {
    const mgr = readCircuit(LRC).scopes;
    mgr.stackAll();
    expect(mgr.scopes.map((s) => s.position)).toEqual([0, 0, 0]);
    mgr.unstackAll();
    expect(mgr.scopes.map((s) => s.position)).toEqual([0, 1, 2]);
    mgr.combineAll();
    // empty scopes go when the scopes are next laid out
    mgr.setupScopes({ x: 0, y: 400, width: 900, height: 150 });
    expect(mgr.scopeCount).toBe(1);
    expect(mgr.scopes[0]?.plots).toHaveLength(6);
    mgr.separateAll();
    mgr.setupScopes({ x: 0, y: 400, width: 900, height: 150 });
    expect(mgr.scopeCount).toBe(3);
  });

  it('adds a scope for an element and removes it on clear', () => {
    const c = readCircuit(LRC.split('\no ')[0] + '\n');
    const mgr = c.scopes;
    expect(mgr.scopeCount).toBe(0);
    const r = c.elements[0];
    if (!r) throw new Error('no element');
    mgr.viewInScope(r);
    expect(mgr.scopeCount).toBe(1);
    expect(scopeRecords(c)[0]).toContain('en="0"');
    c.clear();
    expect(c.scopes.scopeCount).toBe(0);
  });

  it('drops a scope on an unsupported element, counting element numbers as upstream does', () => {
    // element 1 is a type this port can't load; the scope on element 2 still finds the resistor
    const c = readCircuit(
      '$ 1 5.0E-6 10 50 5.0\n' +
        'v 96 224 96 96 0 0 40 5 0 0 0.5\n' +
        'm 96 96 96 160 0 100 16000 0 1e-8 1e-10\n' +
        'r 96 96 256 96 0 1000\n' +
        'o 1 64 0 4099 5 0.05 0 2 1 3\n' +
        'o 2 64 0 4099 5 0.05 1 2 2 3\n',
    );
    expect(c.scopes.scopeCount).toBe(1);
    expect(c.scopes.scopes[0]?.plots[0]?.elm?.getClassName()).toBe('ResistorElm');
    expect(c.warnings).toContain('a scope shows an element that is not supported yet');
  });

  it('lays out cards with the plot inside, and one column at a time when compact', () => {
    const mgr = readCircuit(LRC).scopes;
    mgr.look = 'cards';
    const area = { x: 0, y: 400, width: 960, height: 200 };
    mgr.setupScopes(area, 160);
    for (const s of mgr.scopes) {
      const { slot, rect } = s;
      expect(rect.x).toBeGreaterThan(slot.x);
      expect(rect.y).toBeGreaterThan(slot.y + 30); // two header lines
      expect(rect.x + rect.width).toBeLessThan(slot.x + slot.width);
      expect(rect.y + rect.height).toBeLessThan(slot.y + slot.height);
    }
    expect(mgr.scopes[1]?.slot.x).toBeGreaterThan(mgr.scopes[0]?.slot.x ?? 0);
    expect(mgr.scopeIndexAt((mgr.scopes[1]?.slot.x ?? 0) + 2, 410)).toBe(1);

    mgr.compact = true;
    mgr.activeColumn = 2;
    mgr.setupScopes(area, 0);
    expect(mgr.scopes.map((s) => mgr.isShown(s))).toEqual([false, false, true]);
    expect(mgr.scopes[2]?.slot.width).toBeGreaterThan(900);
    expect(mgr.scopeIndexAt(100, 450)).toBe(2);
  });

  it('names plots for the legend', () => {
    const mgr = readCircuit(LRC).scopes;
    const s = mgr.scopes[0];
    if (!s) throw new Error('no scope');
    expect(s.plots.map((p) => plotName(s, p))).toEqual(['V', 'I']);
    mgr.combineAll();
    const all = mgr.scopes[0];
    if (!all) throw new Error('no scope');
    expect(all.plots.map((p) => plotName(all, p))).toEqual(['V1', 'I1', 'V2', 'I2', 'V3', 'I3']);
  });

  it('loads undocked scopes (ScopeElm) from text and XML, and saves them inside the element', () => {
    const c = readCircuit(MULTIVIB);
    expect(c.warnings).toEqual([]);
    const elms = c.scopeElms();
    expect(elms).toHaveLength(4);
    const first = elms[0];
    if (!first) throw new Error('no scope element');
    expect(first.box()).toEqual({ x1: 192, y1: 208, x2: 224, y2: 240 });
    // `12_256_0_4102_...`: element 12, speed 256
    expect(first.elmScope.getElm()).toBe(c.elements[12]);
    expect(first.elmScope.speed).toBe(256);
    expect(first.elmScope.position).toBe(-1);
    expect(c.undockedScopes()).toHaveLength(4);
    // docked scopes still count the undocked ones as elements
    expect(c.scopes.scopes[0]?.plots[0]?.elm).toBe(c.elements[13]);

    const xml = c.dumpXml();
    expect(xml).toContain('<Scope x="192 208 224 240" f="0">');
    expect(xml).toMatch(/<Scope [^>]*>\n {4}<o en="12" sp="256"/);
    const again = readCircuit(xml);
    expect(again.scopeElms()).toHaveLength(4);
    expect(again.scopeElms()[0]?.elmScope.getElm()).toBe(again.elements[12]);
    // (docked scopes read from XML save their speed as 0, as upstream's do; undocked ones keep it)
    const docked = (l: string): string => (l.startsWith('  <o ') ? l.replace(/ sp="\d+"/, '') : l);
    expect(again.dumpXml().split('\n').map(docked)).toEqual(xml.split('\n').map(docked));

    // the undocked scopes step with the simulation
    const plot = first.elmScope.plots[0];
    if (!plot) throw new Error('no plot');
    const start = plot.ptr;
    for (let k = 0; k < 20; k++) c.sim.step(50);
    expect(plot.ptr).not.toBe(start);

    // a copy leaves them out, as upstream's does
    expect(c.dumpElementsXml(c.elements)).not.toContain('<Scope');

    // deleting what one shows removes it
    c.elements = c.elements.filter((e) => e !== c.elements[12]);
    expect(c.removeUnusedScopeElms()).toBe(true);
    expect(c.scopeElms()).toHaveLength(3);
    expect(c.elements.some((e) => e === first)).toBe(false);
    expect(first).toBeInstanceOf(ScopeElm);
  });
});
