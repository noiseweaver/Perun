// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { TextElm } from '@perun/elements';
import { describe, expect, it } from 'vitest';
import { Circuit } from './circuit.ts';

const TEXT = '$ 1 5.0E-6 10 50 5.0\nx 96 96 112 96 4 24 hello\n';

describe('text box fonts (not in upstream, DEVIATIONS.md)', () => {
  it('saves nothing extra while a box follows the Options default', () => {
    const c = new Circuit();
    c.read(TEXT);
    const xml = c.dumpXml();
    expect(xml).not.toMatch(/ ff=| fs=/);
  });

  it('round-trips a chosen font and style through XML', () => {
    const c = new Circuit();
    c.read(TEXT);
    const t = c.elements[0] as TextElm;
    t.family = 'serif';
    t.fontStyle = 'boldItalic';
    const xml = c.dumpXml();
    expect(xml).toMatch(/ ff="serif"/);
    const d = new Circuit();
    d.read(xml);
    const u = d.elements[0] as TextElm;
    expect([u.family, u.fontStyle, u.text]).toEqual(['serif', 'boldItalic', 'hello']);
  });

  it('ignores values it does not know', () => {
    const c = new Circuit();
    c.read(TEXT);
    const xml = c.dumpXml().replace(' te=', ' ff="comic" fs="wavy" te=');
    const d = new Circuit();
    d.read(xml);
    const u = d.elements[0] as TextElm;
    expect([u.family, u.fontStyle]).toEqual(['options', 'options']);
  });
});
