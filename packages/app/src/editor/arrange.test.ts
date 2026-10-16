// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WireElm, viewFor, type CircuitElm } from '@perun/elements';
import { Circuit, readCircuit } from '@perun/format';
import { describe, expect, it } from 'vitest';
import { Editor, type EditorHost } from './Editor.ts';
import { arrange, electricalSignature } from './arrange.ts';

const HEAD = '$ 1 5.0E-6 10 50 5.0\n';
const bbox = (e: CircuitElm) => viewFor(e)?.bbox(e) ?? null;

function setup(body: string) {
  const circuit = new Circuit();
  circuit.read(HEAD + body);
  const host: EditorHost = {
    bbox,
    circuitChanged: () => circuit.sim.setElements(circuit.elements),
    selectionChanged: () => {},
    restore: (xml) => circuit.read(xml),
    visibleArea: () => ({ x1: 0, y1: 0, x2: 800, y2: 600 }),
  };
  return { circuit, ed: new Editor(circuit, host) };
}

const byClass = (c: Circuit, name: string): CircuitElm[] =>
  c.elements.filter((e) => e.getClassName() === name);

describe('arrange circuit', () => {
  it('lays an RC low-pass out left to right with ground at the bottom', () => {
    // drawn badly: source on its side, the capacitor upside down, the resistor upright
    const { circuit, ed } = setup(
      'v 0 0 64 0 0 1 1000 5 0 0 0.5\n' +
        'r 160 64 160 128 0 1000\n' +
        'c 288 160 288 96 0 1e-6 0 0.001\n' +
        'g 0 160 0 192 0 0\n' +
        'w 64 0 160 64 0\nw 160 128 288 96 0\nw 0 0 0 160 0\nw 288 160 288 224 0\n' +
        'g 288 224 288 256 0 0\n',
    );
    const sig = electricalSignature(circuit.elements);
    const r = ed.arrange();
    expect(r.failure).toBeNull();
    expect(electricalSignature(circuit.elements)).toBe(sig.replace(/\|\d+$/, '|0'));
    const [v] = byClass(circuit, 'ACVoltageElm').concat(byClass(circuit, 'VoltageElm'));
    const [res] = byClass(circuit, 'ResistorElm');
    const [cap] = byClass(circuit, 'CapacitorElm');
    // source, resistor, capacitor from left to right
    expect(Math.max(v.x, v.x2)).toBeLessThan(Math.min(res.x, res.x2));
    expect(Math.max(res.x, res.x2)).toBeLessThan(Math.min(cap.x, cap.x2) + 1);
    // the resistor lies across, the capacitor stands up
    expect(res.y).toBe(res.y2);
    expect(cap.x).toBe(cap.x2);
    // every wire runs across or down
    for (const w of circuit.elements.filter((e) => e instanceof WireElm))
      expect(w.x === w.x2 || w.y === w.y2).toBe(true);
    // grounds sit below what they ground
    for (const g of byClass(circuit, 'GroundElm')) expect(g.y2).toBeGreaterThan(g.y);
    expect(ed.history.undoLabel).toBe('Arrange circuit');
    ed.history.undo();
    expect(byClass(circuit, 'ResistorElm')[0].x).toBe(160);
  });

  it('keeps a stray wire, moved under the circuit', () => {
    const { circuit, ed } = setup(
      'r 0 0 64 0 0 1000\nr 64 0 64 64 0 1000\ng 64 64 64 96 0 0\nw 0 0 0 -32 0\n' +
        'w 0 32 160 32 0\n',
    );
    const stray = circuit.elements[4];
    expect(ed.arrange().failure).toBeNull();
    expect(circuit.elements).toContain(stray);
    expect(Math.abs(stray.x2 - stray.x)).toBe(160);
    const parts = circuit.elements.filter((e) => !(e instanceof WireElm));
    const bottom = Math.max(...parts.map((e) => Math.max(e.y, e.y2)));
    expect(stray.y).toBeGreaterThan(bottom);
  });

  it('arranges an op-amp with a rail on each input', () => {
    // the two rails used to point up into each other
    const { circuit, ed } = setup(
      'a 160 880 224 880 8 15 -15 1000000 0 0 100000\nR 160 864 112 864 0 0 40 6 0 0 0.5\n' +
        'R 160 896 112 896 0 0 40 5 0 0 0.5\nr 224 880 224 944 0 1000\ng 224 944 224 976 0 0\n',
    );
    const sig = electricalSignature(circuit.elements);
    expect(ed.arrange().failure).toBeNull();
    expect(electricalSignature(circuit.elements)).toBe(sig.replace(/\|\d+$/, '|0'));
  });

  it('keeps every connection in every bundled example it can arrange', () => {
    const dirs = [
      new URL(
        '../../../../reference/circuitjs1/src/com/lushprojects/circuitjs1/public/circuits/',
        import.meta.url,
      ),
      new URL('../../examples/circuits/', import.meta.url),
    ].map((u) => fileURLToPath(u));
    const failures: Record<string, number> = {};
    let ok = 0;
    let slowest = 0;
    let slowestName = '';
    for (const dir of dirs)
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.txt'))) {
        const c = readCircuit(readFileSync(dir + f, 'utf8'));
        const sig = electricalSignature(c.elements);
        const t0 = performance.now();
        const r = arrange(c.elements, { gridSize: c.sim.gridSize, bbox });
        const ms = performance.now() - t0;
        if (ms > slowest) {
          slowest = ms;
          slowestName = f;
        }
        if (r.elements === null) {
          failures[r.failure ?? '?'] = (failures[r.failure ?? '?'] ?? 0) + 1;
          // put back exactly
          expect(electricalSignature(c.elements), f).toBe(sig);
          continue;
        }
        ok++;
        expect(electricalSignature(r.elements), f).toBe(sig.replace(/\|\d+$/, '|0'));
      }
    console.log({ ok, failures, slowest: Math.round(slowest), slowestName });
    expect(ok).toBeGreaterThan(150);
  }, 600_000);
});
