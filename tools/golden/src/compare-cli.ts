// SPDX-License-Identifier: GPL-2.0-or-later
// pnpm golden:compare [--engine stub] [--json report.json] [name | tag:<tag> ...]
// Runs an engine on every golden circuit and compares the result with fixtures/golden/.
// Exits 1 if any circuit fails or its fixture is missing.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { compareTrace, formatResult, type CompareResult } from './compare.ts';
import { ENGINES } from './engines/index.ts';
import { parseFixture } from './json.ts';
import { FIXTURE_DIR, loadManifest, selectEntries } from './manifest.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    engine: { type: 'string', default: 'stub' },
    json: { type: 'string' },
  },
});

const engine = ENGINES[values.engine];
if (!engine) {
  console.error(`unknown engine "${values.engine}". Available: ${Object.keys(ENGINES).join(', ')}`);
  process.exit(2);
}

const entries = selectEntries(loadManifest(), positionals);
console.log(
  `golden compare: ${entries.length} circuits, engine ${engine.name}: ${engine.description}\n`,
);

const results: CompareResult[] = [];
for (const entry of entries) {
  const path = join(FIXTURE_DIR, `${entry.name}.json`);
  if (!existsSync(path)) {
    const r: CompareResult = {
      name: entry.name,
      pass: false,
      compared: 0,
      failed: 0,
      problems: ['no fixture; run pnpm golden:record'],
      firstDivergence: null,
      worst: null,
    };
    results.push(r);
    console.log(formatResult(r));
    continue;
  }
  const fixture = parseFixture(readFileSync(path, 'utf8'));
  let result: CompareResult;
  try {
    const trace = await engine.run({
      name: fixture.name,
      circuit: fixture.circuit,
      settings: {
        seed: fixture.settings.seed,
        stepsPerSample: fixture.settings.stepsPerSample,
        samples: fixture.settings.samples,
      },
      sampleTimes: fixture.samples.map((s) => s.t),
      referenceTopology: fixture.topology,
    });
    result = compareTrace(fixture, trace);
  } catch (e) {
    result = {
      name: fixture.name,
      pass: false,
      compared: 0,
      failed: 0,
      problems: [`engine threw: ${e instanceof Error ? e.message : String(e)}`],
      firstDivergence: null,
      worst: null,
    };
  }
  results.push(result);
  console.log(formatResult(result));
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed} passed, ${results.length - passed} failed, ${results.length} total`);
if (values.json)
  writeFileSync(values.json, JSON.stringify({ engine: engine.name, results }, null, 2) + '\n');
process.exit(passed === results.length ? 0 : 1);
