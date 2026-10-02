// SPDX-License-Identifier: GPL-2.0-or-later
import { describe, expect, it } from 'vitest';
import { parseManifest, selectEntries } from './manifest.ts';

const text = JSON.stringify({
  defaults: { seed: 1, stepsPerSample: 40, samples: 100 },
  circuits: [
    { name: 'a', description: '', source: 'circuits/a.txt', tags: ['linear'] },
    { name: 'b', description: '', source: 'upstream:b.txt', tags: ['nonlinear'], samples: 5 },
  ],
});

describe('manifest', () => {
  it('applies defaults', () => {
    const [a, b] = parseManifest(text);
    expect(a).toMatchObject({ seed: 1, stepsPerSample: 40, samples: 100 });
    expect(b).toMatchObject({ samples: 5 });
  });

  it('rejects bad names, duplicates and settings', () => {
    const bad = (circuits: object[]) =>
      JSON.stringify({ defaults: { seed: 1, stepsPerSample: 1, samples: 1 }, circuits });
    expect(() => parseManifest(bad([{ name: 'A b', source: 'x', tags: [] }]))).toThrow(
      /bad circuit name/,
    );
    expect(() =>
      parseManifest(
        bad([
          { name: 'a', tags: [] },
          { name: 'a', tags: [] },
        ]),
      ),
    ).toThrow(/duplicate/);
    expect(() => parseManifest(bad([{ name: 'a', tags: [], samples: 0 }]))).toThrow(/bad samples/);
  });

  it('selects by name and tag', () => {
    const entries = parseManifest(text);
    expect(selectEntries(entries, []).map((e) => e.name)).toEqual(['a', 'b']);
    expect(selectEntries(entries, ['b']).map((e) => e.name)).toEqual(['b']);
    expect(selectEntries(entries, ['tag:linear']).map((e) => e.name)).toEqual(['a']);
    expect(() => selectEntries(entries, ['zzz'])).toThrow(/unknown circuit/);
  });
});
