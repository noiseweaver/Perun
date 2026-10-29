// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WireElm, viewFor } from '@perun/elements';
import { Circuit } from '@perun/format';
import { badPosts } from '@perun/render';
import { describe, expect, it } from 'vitest';
import { Editor, NO_MODIFIERS, type EditorHost } from './Editor.ts';

const keys = (c: Circuit): Set<string> => new Set(badPosts(c.elements).map((b) => `${b.x},${b.y}`));

describe('bad connections', () => {
  it('no drag of a wire end in any bundled example leaves a new one', () => {
    const dir = fileURLToPath(
      new URL(
        '../../../../reference/circuitjs1/src/com/lushprojects/circuitjs1/public/circuits/',
        import.meta.url,
      ),
    );
    let seed = 4242;
    const random = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    let dragged = 0;
    let putBack = 0;
    for (const f of readdirSync(dir)
      .filter((x) => x.endsWith('.txt'))
      .sort()) {
      const circuit = new Circuit();
      circuit.read(readFileSync(dir + f, 'utf8'));
      const host: EditorHost = {
        bbox: (e) => viewFor(e)?.bbox(e) ?? null,
        circuitChanged: () => circuit.sim.setElements(circuit.elements),
        selectionChanged: () => {},
        restore: (xml) => circuit.read(xml),
        visibleArea: () => ({ x1: 0, y1: 0, x2: 800, y2: 600 }),
        notice: () => putBack++,
      };
      const ed = new Editor(circuit, host);
      const g = circuit.sim.gridSize;
      for (let i = 0; i < 4; i++) {
        const wires = circuit.elements.filter((e) => e instanceof WireElm);
        if (wires.length === 0) break;
        const w = wires[Math.floor(random() * wires.length)];
        const end = random() < 0.5 ? { x: w.x, y: w.y } : { x: w.x2, y: w.y2 };
        const to = {
          x: end.x + Math.round((random() - 0.5) * 6) * g,
          y: end.y + Math.round((random() - 0.5) * 6) * g,
        };
        const before = keys(circuit);
        const ctrl = { ...NO_MODIFIERS, ctrl: true };
        ed.hover(end.x, end.y);
        ed.pointerDown(end.x, end.y, ctrl);
        ed.pointerDrag(to.x, to.y, ctrl);
        ed.pointerUp(ctrl);
        dragged++;
        const fresh = [...keys(circuit)].filter((k) => !before.has(k));
        expect(fresh, `${f}: ${end.x},${end.y} to ${to.x},${to.y}`).toEqual([]);
      }
    }
    console.log({ dragged, putBack });
    expect(dragged).toBeGreaterThan(1000);
    // most drags are joined, not refused
    expect(putBack / dragged).toBeLessThan(0.1);
  }, 120_000);
});
