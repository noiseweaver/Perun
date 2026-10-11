// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { constructElement, fixedTex, liveTex, TextElm, type CircuitElm } from '@perun/elements';
import { describe, expect, it } from 'vitest';
import { Circuit } from './circuit.ts';

// a 5 V source across a 1 kΩ resistor; the resistor's top is the labeled node "out"
const DIVIDER =
  '$ 1 5.0E-6 10 50 5.0\n' +
  'v 128 256 128 128 0 0 40 5 0 0 0.5\n' +
  'r 128 128 256 128 0 1000\n' +
  'w 256 128 256 256 0\n' +
  'w 128 256 256 256 0\n' +
  'g 128 256 128 288 0 0\n' +
  '207 128 128 96 128 4 out\n';

function addFormula(c: Circuit, src: string, links: CircuitElm[] = []): TextElm {
  const f = constructElement('FormulaElm', 300, 100, c.sim) as TextElm;
  f.formula = src;
  f.links = links;
  c.elements.push(f);
  c.sim.setElements(c.elements);
  return f;
}

describe('formula boxes (not in upstream, docs/deviations/formula-boxes.md)', () => {
  it('saves the LaTeX so upstream shows the source as a text box', () => {
    const c = new Circuit();
    const f = addFormula(c, 'I = \\frac{V}{R}\n\\nu = \\Omega');
    expect(f.math).toBe(true);
    expect(f.lines).toEqual(['I = \\frac{V}{R}', '\\nu = \\Omega']);
    const xml = c.dumpXml();
    expect(xml).toMatch(/ tex="1"/);
    // upstream ignores `tex` and reads a plain text box: same split, same lines
    const plain = new Circuit();
    plain.read(xml.replace(/ tex="1"/, ''));
    const t = plain.elements[0] as TextElm;
    expect(t.math).toBe(false);
    expect(t.lines).toEqual(['I = \\frac{V}{R}', '\\nu = \\Omega']);
  });

  it('round-trips the formula and its linked parts', () => {
    const c = new Circuit();
    c.read(DIVIDER);
    const r = c.elements[1];
    if (r === undefined) throw new Error('no resistor');
    addFormula(c, 'I = \\I', [r]);
    const d = new Circuit();
    d.read(c.dumpXml());
    const f = d.elements.at(-1) as TextElm;
    expect([f.math, f.formula, f.getElmType()]).toEqual([true, 'I = \\I', 'formula']);
    expect(f.links).toEqual([d.elements[1]]);
  });

  it('keeps links among pasted parts', () => {
    const c = new Circuit();
    c.read(DIVIDER);
    const r = c.elements[1];
    if (r === undefined) throw new Error('no resistor');
    const f = addFormula(c, '\\V', [r]);
    const copied = c.dumpElementsXml([r, f]);
    const added = c.readRetain(copied);
    const pf = added.find((e) => e instanceof TextElm) as TextElm;
    expect(pf.links.length).toBe(1);
    expect(pf.links[0]).not.toBe(r);
    expect(added).toContain(pf.links[0]);
  });

  it('writes nothing extra for plain text boxes', () => {
    const c = new Circuit();
    c.read('$ 1 5.0E-6 10 50 5.0\nx 100 100 140 100 4 24 hello\n');
    expect(c.dumpXml()).not.toMatch(/ tex=| tl=/);
  });

  it('fills in live values with a fixed width', () => {
    const c = new Circuit();
    c.read(DIVIDER);
    c.sim.step(10);
    const r = c.elements[1];
    if (r === undefined) throw new Error('no resistor');
    const out = liveTex('\\V{out} \\I \\P[2] \\V{nowhere}', [r], c.sim);
    expect(out).toContain(fixedTex(c.sim.getLabeledNodeVoltage('out'), 'V'));
    expect(out).toContain(fixedTex(r.getCurrent(), 'A'));
    expect(out.match(/\\text\{\?\}/g)?.length).toBe(2);
    // \Vout is another macro, not a live value
    expect(liveTex('\\Vout', [r], c.sim)).toBe('\\Vout');
  });

  it('gives every value the same slots', () => {
    // three integer places, filled with phantom zeros
    const places = (s: string): number =>
      (s.split('.')[0]?.match(/\\phantom\{0\}|\d/g) ?? []).length;
    expect([places(fixedTex(1.5, 'V')), places(fixedTex(-123.456, 'V'))]).toEqual([3, 3]);
    expect(fixedTex(-1.5, 'V')).toContain('\\llap{-}1.500');
    expect(fixedTex(0.0012, 'A')).toContain('\\llap{\\mathrm{m}}');
    expect(fixedTex(-2e-6, 'A')).toContain('\\llap{\\mathrm{\\upmu }}');
  });
});
