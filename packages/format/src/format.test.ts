// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import {
  DiodeElm,
  LabeledNodeElm,
  MosfetElm,
  OpAmpElm,
  PotElm,
  PushSwitchElm,
  SwitchElm,
  TextElm,
  TransistorElm,
  constructElement,
  modelsFor,
} from '@perun/elements';
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
        '9999 0 0 16 0 0\n' +
        '174 208 320 432 224 1 1000 0.5 Some Text\n',
    );
    expect(c.warnings).toEqual(['unrecognized dump type: 9999']);
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

describe('device models and nonlinear elements', () => {
  it('reads a text diode model record and saves it before the first diode using it', () => {
    const c = readCircuit(
      '$ 1 0.000005 10 50 5 50\n' +
        '34 my\\sdiode 0 1e-12 0.5 1.5 0 0\n' +
        'd 0 0 64 0 2 my\\sdiode\n' +
        'd 0 64 64 64 2 my\\sdiode\n',
    );
    expect(c.warnings).toEqual([]);
    const d = c.elements[0] as DiodeElm;
    expect(d.modelName).toBe('my diode');
    expect(d.getModel().saturationCurrent).toBe(1e-12);
    expect(d.hasResistance).toBe(true);
    const saved = c.dumpXml();
    const lines = saved.split('\n');
    expect(lines[1]).toBe('  <dm nm="my diode" f="0" is="1e-12" rs="0.5" n="1.5" bv="0"/>');
    expect(lines[2]).toBe('  <d x="0 0 64 0" f="2" mo="my diode"/>');
    // dumped once per save, and again on the next save
    expect(saved.match(/<dm /g)).toHaveLength(1);
    expect(c.dumpXml()).toBe(saved);
    // and it loads back to the same model
    const back = readCircuit(saved);
    expect((back.elements[0] as DiodeElm).getModel().seriesResistance).toBe(0.5);
    expect(back.dumpXml()).toBe(saved);
  });

  it('turns old forward-drop diodes into shared fwdrop models', () => {
    const c = readCircuit('d 0 0 64 0 1 0.6\nd 0 64 64 64 1 0.6\nd 0 128 64 128 0\n');
    const [d1, d2, d3] = c.elements as DiodeElm[];
    expect(d1.modelName).toBe('fwdrop=0.6');
    expect(d2.model).toBe(d1.model);
    expect(d1.getModel().oldStyle).toBe(true);
    // the default drop matches the built-in default model
    expect(d3.modelName).toBe('default');
    expect(c.dumpXml()).toContain('<dm nm="fwdrop=0.6" f="0"');
  });

  it('keeps models per simulation, as upstream keeps them per page', () => {
    const a = readCircuit('34 m 0 1e-9 0 2 0 0\nd 0 0 64 0 2 m\n');
    const b = readCircuit('d 0 0 64 0 2 m\n');
    expect((a.elements[0] as DiodeElm).modelName).toBe('m');
    // unknown model in a fresh circuit: upstream falls back to the default
    expect((b.elements[0] as DiodeElm).modelName).toBe('default');
    expect(modelsFor(a.sim).diode.modelMap.has('m')).toBe(true);
    expect(modelsFor(b.sim).diode.modelMap.has('m')).toBe(false);
  });

  it('round-trips transistor and MOSFET models through XML', () => {
    const xml =
      '<cir f="1" ts="0.000005" ic="10.20027730826997" cb="50" pb="50" vr="5" mts="5e-11">\n' +
      '  <tm nm="q1" f="0" is="1e-14" ikf="0" ise="0" ne="1.5" ikr="0" isc="0" nc="2" nf="1" nr="1" vaf="0.01" var="0" br="1" cje="1e-12" vje="0.75" mje="0.33"/>\n' +
      '  <t x="0 0 32 0" f="0" pn="-1" be="200" mo="q1" vbe="0" vbc="0"/>\n' +
      '  <mm nm="m1" f="0" vt="2" be="0.5" la="0.01" sb="1" dsy="0" bd="1" bt="1" sbd="0"/>\n' +
      '  <f x="0 64 32 64" f="1" mo="m1"/>\n' +
      '</cir>\n';
    const c = readCircuit(xml);
    expect(c.warnings).toEqual([]);
    const t = c.elements[0] as TransistorElm;
    expect(t.getClassName()).toBe('NTransistorElm');
    expect(t.pnp).toBe(-1);
    expect(t.getModel().invEarlyVoltF).toBe(0.01);
    const m = c.elements[1] as MosfetElm;
    expect(m.pnp).toBe(-1);
    expect(m.getPostCount()).toBe(4);
    expect(c.dumpXml()).toBe(xml);
  });

  it('keeps loaded transistor junction voltages until the first solve', () => {
    const c = readCircuit('t 0 0 32 0 0 1 -5 0.6 100 default\nr 0 0 0 64 0 1000\ng 0 64 0 80 0\n');
    const t = c.elements[0] as TransistorElm;
    // before analysis the file values are what gets saved
    expect(c.dumpXml()).toContain('vbe="-5" vbc="0.6"');
    // each element keeps its own copy, as master's volts[] does
    c.sim.step(0);
    expect(t.volts).toEqual([0, 5, -0.6]);
  });

  it('builds the N-type variant from a base class name, like upstream', () => {
    expect(constructElement('TransistorElm', 0, 0)?.getClassName()).toBe('NTransistorElm');
    expect(constructElement('MosfetElm', 0, 0)?.getClassName()).toBe('NMosfetElm');
    const p = constructElement('PTransistorElm', 0, 0) as TransistorElm;
    expect(p.pnp).toBe(-1);
    const pm = constructElement('PMosfetElm', 0, 0) as MosfetElm;
    expect(pm.pnp).toBe(-1);
    expect(pm.flags).toBe(1);
    const push = constructElement('PushSwitchElm', 0, 0) as PushSwitchElm;
    expect(push.momentary).toBe(true);
    expect(push.position).toBe(1);
    expect(push.getDumpType()).toBe('s'.charCodeAt(0));
  });

  it('reads op-amp gain the way master does', () => {
    // gain is the sixth token, after two input voltages; without them the gain flag decides
    const c = readCircuit('a 0 0 64 0 0 15 -15 1000000\na 0 64 64 64 4 15 -15 1e6\n');
    const [a1, a2] = c.elements as OpAmpElm[];
    expect(a1.gain).toBe(100000);
    expect(a2.gain).toBe(1000);
  });

  it('reads text elements with old and escaped text', () => {
    // the editor stores line breaks as a literal \n, which the escaped form doubles
    const c = readCircuit('x 0 0 16 0 0 24 two%2b words\nx 0 32 16 32 4 12 a\\\\nb\\sc\n');
    const [t1, t2] = c.elements as TextElm[];
    expect(t1.text).toBe('two+ words');
    expect(t2.lines).toEqual(['a', 'b c']);
    expect(t1.getPostCount()).toBe(0);
  });
});
