// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { Circuit } from '@circuitjs-next/format';
import { describe, expect, it } from 'vitest';
import { partsCsv, partsList } from './partsList.ts';

const LRC = `$ 1 5.0E-6 10 50 5.0
r 96 96 192 96 0 1000
r 96 192 192 192 0 1000
r 96 288 192 288 0 2200
c 192 96 288 96 0 1.5E-5 -10
w 288 96 288 192 0
g 96 288 96 336 0
x 300 300 400 304 4 24 hello
v 96 96 96 192 0 0 40 5 0 0 0.5
`;

describe('parts list', () => {
  it('counts identical parts and leaves out wires, ground and text', () => {
    const c = new Circuit();
    c.read(LRC);
    const rows = partsList(c.elements);
    expect(rows.map((r) => [r.count, r.part, r.value])).toEqual([
      [1, 'Capacitor', '15 μF'],
      [2, 'Resistor', '1 kΩ'],
      [1, 'Resistor', '2.2 kΩ'],
      [1, 'Voltage source', '5 V'],
    ]);
    // the starting voltage is simulation state, not part of the part
    expect(rows[0]?.details).toBe('');
  });

  it('writes CSV with a header and quotes fields that need it', () => {
    const csv = partsCsv([
      { count: 2, part: 'Resistor', value: '1 kΩ', details: '' },
      { count: 1, part: 'Op Amp (ideal, - on top)', value: '15 V', details: 'say "hi"' },
    ]);
    expect(csv).toBe(
      'Quantity,Part,Value,Details\n2,Resistor,1 kΩ,\n1,"Op Amp (ideal, - on top)",15 V,"say ""hi"""\n',
    );
  });
});
