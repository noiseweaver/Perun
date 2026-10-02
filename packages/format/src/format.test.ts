// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { LabeledNodeElm, PotElm, SwitchElm } from '@circuitjs-next/elements';
import { describe, expect, it } from 'vitest';
import { readCircuit } from './circuit.ts';
import { XmlElement, parseXml, prettyPrint } from './xml.ts';

describe('XML parser and printer', () => {
  it('parses attributes in order, entities and nesting', () => {
    const root = parseXml(
      '<?xml version="1.0"?>\n<!-- c --><cir a="1" b=\'x &amp; &lt;y&gt; &#65;\'>\n  <w x="1 2 3 4"/>\n  <t>hi</t>\n</cir>\n',
    );
    expect(root.name).toBe('cir');
    expect(root.attributes).toEqual([
      ['a', '1'],
      ['b', 'x & <y> A'],
    ]);
    expect(root.elements().map((e) => e.name)).toEqual(['w', 't']);
    expect(root.elements()[1]?.firstText()).toBe('hi');
  });

  it('rejects malformed documents', () => {
    for (const s of [
      '<a>',
      '<a></b>',
      '<a x=1/>',
      '<a x="1" x="2"/>',
      '<a/><b/>',
      '<a>&bogus;</a>',
    ])
      expect(() => parseXml(s)).toThrow();
  });

  it('prints like upstream prettyPrint', () => {
    const root = new XmlElement('cir');
    root.setAttribute('f', '1');
    const child = new XmlElement('o');
    child.appendChild(new XmlElement('p'));
    root.appendChild(child);
    root.appendChild(new XmlElement('h'));
    expect(prettyPrint(root)).toBe('<cir f="1">\n  <o>\n    <p/>\n  </o>\n  <h/>\n</cir>\n');
  });
});

describe('reading and saving circuits', () => {
  it('reads the text format with old and new style fields', () => {
    const c = readCircuit(
      '$ 3 0.000005 10 50 5 50 5e-11\n' +
        '207 96 96 96 64 0 two words\n' +
        '207 96 96 96 64 4 a\\sb&c\n' +
        's 256 96 256 176 4 1 true sw\\s1\n' +
        'x 0 0 16 0 0\n' +
        '174 208 320 432 224 1 1000 0.5 Some Text\n',
    );
    expect(c.warnings).toEqual(['unrecognized dump type: x']);
    expect(c.sim.gridSize).toBe(8);
    const [l1, l2, sw, pot] = c.elements;
    expect((l1 as LabeledNodeElm).text).toBe('two words');
    expect((l2 as LabeledNodeElm).text).toBe('a b&c');
    expect((sw as SwitchElm).label).toBe('sw 1');
    expect((sw as SwitchElm).momentary).toBe(true);
    expect((pot as PotElm).sliderText).toBe('Some Text');
  });

  it('skips a broken element line and keeps the rest', () => {
    const c = readCircuit('r 0 0 64 0 0 abc\nr 0 0 64 0 0 100\n');
    expect(c.elements).toHaveLength(1);
    expect(c.warnings).toHaveLength(1);
  });

  it('round-trips awkward label text through XML (double escaped, as upstream)', () => {
    const c = readCircuit('<cir><ln x="0 0 0 16" f="0" te="a&amp;amp;b&amp;quot;&lt;"/></cir>');
    const label = c.elements[0] as LabeledNodeElm;
    expect(label.text).toBe('a&b"<');
    const saved = c.dumpXml();
    expect(saved).toContain('te="a&amp;amp;b&amp;quot;&amp;lt;"');
    expect((readCircuit(saved).elements[0] as LabeledNodeElm).text).toBe('a&b"<');
  });

  it('keeps the hint and solver type', () => {
    const c = readCircuit('<cir st="1"><h t="1" i1="4" i2="3"/></cir>');
    expect(c.hint).toEqual({ type: 1, item1: 4, item2: 3 });
    expect(c.dumpXml()).toBe(
      '<cir f="0" ts="0.000005" ic="1.0312258501325766" cb="50" pb="50" vr="5" mts="5e-11" st="1">\n  <h t="1" i1="4" i2="3"/>\n</cir>\n',
    );
  });
});
