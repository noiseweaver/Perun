// SPDX-License-Identifier: GPL-2.0-or-later
// Phase 6 acceptance: scope `o` records of every bundled upstream example restore the same scopes
// as upstream. fixtures/scopes/upstream-examples.json holds upstream's save of each example right
// after loading (record-scopes.ts); this loads the same file and compares the scope records.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSupportedElementTag, readCircuit } from '@perun/format';
import { describe, expect, it } from 'vitest';
import {
  EXAMPLES_DIR,
  SCOPE_FIXTURE,
  scopeExampleFiles,
  topLevelRecords,
  type ScopeFixture,
} from './record-scopes.ts';

const fixture = JSON.parse(readFileSync(SCOPE_FIXTURE, 'utf8')) as ScopeFixture;

/** Top-level records that are not circuit elements (they take no element number). */
const NOT_ELEMENTS = new Set(['o', 'adj', 'h', 'dm', 'tm', 'mm', 'rlm', 'clm', 'ccm']);

/**
 * Upstream element number to ours, or null for elements this port can't load yet (it skips
 * them, so later elements move down).
 */
function elementMap(tags: string[]): (number | null)[] {
  const map: (number | null)[] = [];
  let n = 0;
  for (const tag of tags) {
    if (NOT_ELEMENTS.has(tag)) continue;
    map.push(!isSupportedElementTag(tag) ? null : n++);
  }
  return map;
}

/** Upstream's record with element numbers mapped to ours, or null if it shows a skipped one. */
function remap(record: string, map: (number | null)[]): string | null {
  let missing = false;
  const out = record.replace(/ (en|e)="(-?\d+)"/g, (_m, attr: string, num: string) => {
    const to = map[Number(num)];
    if (to === null || to === undefined) {
      missing = true;
      return '';
    }
    return ` ${attr}="${to}"`;
  });
  return missing ? null : out;
}

describe('scopes of upstream examples', () => {
  it('the fixture covers every example with scopes', () => {
    expect(fixture.examples.map((e) => e.file)).toEqual(scopeExampleFiles());
  });

  let restored = 0;
  let skipped = 0;
  for (const ex of fixture.examples) {
    it(`${ex.file}: restores upstream's scopes`, () => {
      const text = readFileSync(join(EXAMPLES_DIR, ex.file), 'utf8');
      const circuit = readCircuit(text);
      const ours = topLevelRecords(circuit.dumpXml())
        .filter((r) => r.tag === 'o')
        .map((r) => r.text);
      const map = elementMap(ex.tags);
      const expected: string[] = [];
      for (const s of ex.scopes) {
        const r = remap(s, map);
        if (r === null) skipped++;
        else expected.push(r);
      }
      restored += expected.length;
      expect(ours).toEqual(expected);
    });
  }

  it('restores every scope', () => {
    // every upstream element loads, so no scope is dropped (docs/DEVIATIONS.md)
    expect(skipped).toBe(0);
    expect(restored).toBeGreaterThan(0);
  });
});
