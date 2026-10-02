// SPDX-License-Identifier: GPL-2.0-or-later
// Keeps the committed fixtures in step with the manifest, the circuits and the reference patch.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareTrace } from './compare.ts';
import { stubEngine } from './engines/stub.ts';
import { parseFixture } from './json.ts';
import { REFERENCE_BROWSER } from './reference.ts';
import {
  FIXTURE_DIR,
  REPO_ROOT,
  UPSTREAM_DIR,
  loadManifest,
  readCircuitSource,
} from './manifest.ts';

const manifest = loadManifest();
const patchSha = createHash('sha256')
  .update(readFileSync(join(REPO_ROOT, 'tools/reference-patch/harness.patch')))
  .digest('hex');
const pinnedSha = /`([0-9a-f]{40})`/.exec(
  readFileSync(join(REPO_ROOT, 'docs/UPSTREAM.md'), 'utf8'),
)?.[1];
const submodulePresent = existsSync(join(UPSTREAM_DIR, 'src'));

describe('golden fixtures', () => {
  it('has exactly one fixture per manifest entry', () => {
    const files = readdirSync(FIXTURE_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();
    expect(files).toEqual(manifest.map((e) => `${e.name}.json`).sort());
  });

  for (const entry of manifest) {
    describe(entry.name, () => {
      const fixture = parseFixture(readFileSync(join(FIXTURE_DIR, `${entry.name}.json`), 'utf8'));

      it('matches its manifest entry and the pinned reference', () => {
        expect(fixture.name).toBe(entry.name);
        expect(fixture.source).toBe(entry.source);
        expect(fixture.tags).toEqual(entry.tags);
        expect(fixture.description).toBe(entry.description);
        expect(fixture.settings).toMatchObject({
          seed: entry.seed,
          stepsPerSample: entry.stepsPerSample,
          samples: entry.samples,
        });
        expect(fixture.reference.upstreamSha).toBe(pinnedSha);
        expect(fixture.reference.harnessPatchSha256).toBe(patchSha);
        expect(fixture.reference.browser).toBe(REFERENCE_BROWSER);
        expect(
          fixture.stop === null ? fixture.samples.length : fixture.samples.length + 1,
        ).toBeLessThanOrEqual(entry.samples);
      });

      it.skipIf(!submodulePresent && entry.source.startsWith('upstream:'))(
        'was recorded from the current circuit file',
        () => {
          expect(fixture.circuit).toBe(readCircuitSource(entry.source));
        },
      );

      it('passes against itself and fails against the stub engine', async () => {
        expect(
          compareTrace(fixture, {
            topology: fixture.topology,
            stop: fixture.stop,
            samples: fixture.samples,
          }).pass,
        ).toBe(true);
        const stub = await stubEngine.run({
          name: fixture.name,
          circuit: fixture.circuit,
          settings: fixture.settings,
          sampleTimes: fixture.samples.map((s) => s.t),
          referenceTopology: fixture.topology,
        });
        expect(compareTrace(fixture, stub).pass).toBe(false);
      });
    });
  }
});
