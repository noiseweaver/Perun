// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import { Circuit } from './circuit.ts';

const TEXT = '$ 1 5.0E-6 10 50 5.0\nr 96 96 192 96 0 1000\n';

describe('speed between slider notches (not in upstream, DEVIATIONS.md)', () => {
  it('saves nothing extra on a whole notch', () => {
    const c = new Circuit();
    c.read(TEXT);
    expect(c.options.speed).toBe(172);
    expect(c.dumpXml()).not.toMatch(/ sp=/);
  });

  it('round-trips a speed between notches, and upstream reads the nearest notch', () => {
    const c = new Circuit();
    c.read(TEXT);
    c.options.speed = 140.3;
    const xml = c.dumpXml();
    expect(xml).toMatch(/ sp="140.3"/);
    const d = new Circuit();
    d.read(xml);
    expect(d.options.speed).toBe(140.3);
    // without `sp`, as upstream reads it: ic alone lands on the nearest notch
    const e = new Circuit();
    e.read(xml.replace(/ sp="[^"]*"/, ''));
    expect(e.options.speed).toBe(140);
  });

  it('ignores a value it cannot read and clamps to the slider', () => {
    const c = new Circuit();
    c.read(TEXT);
    c.options.speed = 140.3;
    const xml = c.dumpXml();
    const d = new Circuit();
    d.read(xml.replace(/ sp="[^"]*"/, ' sp="fast"'));
    expect(d.options.speed).toBe(140);
    d.read(xml.replace(/ sp="[^"]*"/, ' sp="900.5"'));
    expect(d.options.speed).toBe(259);
  });
});
