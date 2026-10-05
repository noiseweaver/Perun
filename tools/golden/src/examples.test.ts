// SPDX-License-Identifier: GPL-2.0-or-later
// Phase 8 bulk run: every bundled upstream example against its reference recording
// (fixtures/examples/). Examples listed in tools/golden/examples-passing.txt must keep passing, and
// docs/EXAMPLES.md must match the current results (regenerate both with
// `pnpm golden:examples --report`).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PASSING_PATH, REPORT_PATH, checkAll, formatReport } from './examples-cli.ts';
import {
  EXAMPLE_FIXTURE_DIR,
  EXAMPLE_SCHEDULE,
  exampleFiles,
  fixtureName,
  formatExampleFixture,
  parseExampleFixture,
} from './examples.ts';

const files = exampleFiles();
const results = checkAll(files);

describe('upstream examples', () => {
  it('has a recording of every example', () => {
    const missing = files.filter((f) => !existsSync(join(EXAMPLE_FIXTURE_DIR, fixtureName(f))));
    expect(missing).toEqual([]);
  });

  it('stores recordings in their canonical form', () => {
    for (const f of files.slice(0, 20)) {
      const text = readFileSync(join(EXAMPLE_FIXTURE_DIR, fixtureName(f)), 'utf8');
      const fx = parseExampleFixture(text);
      expect(formatExampleFixture(fx)).toBe(text);
      expect(fx.samples.every((s, i) => s.step === EXAMPLE_SCHEDULE[i])).toBe(true);
    }
  });

  it('keeps every previously passing example passing', () => {
    const expected = readFileSync(PASSING_PATH, 'utf8').split('\n').filter(Boolean);
    const now = new Set(results.filter((r) => r.status === 'pass').map((r) => r.file));
    const regressed = expected
      .filter((f) => !now.has(f))
      .map((f) => {
        const r = results.find((x) => x.file === f);
        return `${f}: ${r?.reason ?? 'missing'}`;
      });
    expect(regressed).toEqual([]);
  });

  it('has an up-to-date report', () => {
    expect(readFileSync(REPORT_PATH, 'utf8')).toBe(formatReport(results));
  });
});
