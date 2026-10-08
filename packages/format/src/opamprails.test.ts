// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { OpAmpElm } from '@perun/elements';
import { describe, expect, it } from 'vitest';
import { Circuit } from './circuit.ts';

const OPAMP = '$ 1 5.0E-6 10 50 5.0\na 256 176 352 176 8 12 -12 1000000 0 0 100000\n';

describe('op-amp supply rails (not in upstream, DEVIATIONS.md)', () => {
  it('saves nothing extra while the rails are hidden', () => {
    const c = new Circuit();
    c.read(OPAMP);
    expect((c.elements[0] as OpAmpElm).showRails).toBe(false);
    expect(c.dumpXml()).not.toMatch(/ rl=/);
  });

  it('round-trips Show supply rails through XML', () => {
    const c = new Circuit();
    c.read(OPAMP);
    const o = c.elements[0] as OpAmpElm;
    const ei = o.getEditInfo(3);
    if (ei?.checkbox == null) throw new Error('expected the Show supply rails checkbox');
    ei.checkbox.state = true;
    o.setEditValue(3, ei);
    expect(o.showRails).toBe(true);
    const xml = c.dumpXml();
    expect(xml).toMatch(/ rl="1"/);
    const d = new Circuit();
    d.read(xml);
    const u = d.elements[0] as OpAmpElm;
    expect([u.showRails, u.maxOut, u.minOut]).toEqual([true, 12, -12]);
  });
});
