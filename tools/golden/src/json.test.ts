// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { formatFixture, parseFixture } from './json.ts';
import type { GoldenFixture } from './types.ts';

const fixture: GoldenFixture = {
  schemaVersion: 1,
  name: 'x',
  description: 'd',
  source: 's',
  tags: ['linear', 'xml'],
  reference: { upstreamSha: 'a', harnessPatchSha256: 'b', build: 'java-master' },
  settings: {
    seed: 1,
    stepsPerSample: 2,
    samples: 2,
    timeStep: 5e-6,
    maxTimeStep: 5e-6,
    minTimeStep: 5e-11,
    adjustTimeStep: false,
  },
  circuit: '$ 1 5.0E-6 10 50 5.0 50\n',
  topology: {
    nodeCount: 2,
    elements: [{ type: 'ResistorElm', dumpType: 114, posts: 2, nodes: [0, 1] }],
  },
  stop: null,
  samples: [
    {
      step: 2,
      t: 1e-5,
      timeStep: 5e-6,
      nodes: [0, 0.1 + 0.2],
      elements: [{ volts: [NaN, Infinity], currents: [-Infinity, 1e-300], current: -0 }],
    },
    {
      step: 4,
      t: 2e-5,
      timeStep: 5e-6,
      nodes: [0, 1 / 3],
      elements: [{ volts: [0, 1], currents: [0, 0], current: 0 }],
    },
  ],
};

describe('fixture JSON', () => {
  it('round-trips doubles exactly, including non-finite values', () => {
    const back = parseFixture(formatFixture(fixture));
    expect(back).toEqual({ ...fixture, samples: back.samples });
    expect(back.samples[0]?.nodes[1]).toBe(0.1 + 0.2);
    expect(back.samples[1]?.nodes[1]).toBe(1 / 3);
    expect(back.samples[0]?.elements[0]?.volts).toEqual([NaN, Infinity]);
    expect(back.samples[0]?.elements[0]?.currents).toEqual([-Infinity, 1e-300]);
  });

  it('puts one sample per line and short arrays on one line', () => {
    const text = formatFixture(fixture);
    const lines = text.split('\n');
    expect(lines.filter((l) => l.startsWith('    {"step":'))).toHaveLength(2);
    expect(text).toContain('"tags": ["linear", "xml"]');
    expect(text).toContain('"nodes": [0, 1]');
    expect(text.endsWith('  ]\n}\n')).toBe(true);
  });

  it('is deterministic', () => {
    expect(formatFixture(fixture)).toBe(formatFixture(structuredClone(fixture)));
  });
});
