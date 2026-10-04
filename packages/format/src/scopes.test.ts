// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

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
});
