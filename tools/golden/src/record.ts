// SPDX-License-Identifier: GPL-2.0-or-later
// pnpm golden:record [name | tag:<tag> ...] [--check]
// Records golden traces from the patched reference build into fixtures/golden/<name>.json.
// --check records into memory and fails if any fixture on disk differs (reproducibility check).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { compareTrace, formatResult } from './compare.ts';
import { formatFixture, parseFixture } from './json.ts';
import {
  FIXTURE_DIR,
  REPO_ROOT,
  loadManifest,
  readCircuitSource,
  selectEntries,
} from './manifest.ts';
import { launchBrowser, readBuildInfo, recordCircuit, serveSite } from './reference.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { check: { type: 'boolean', default: false } },
});

const entries = selectEntries(loadManifest(), positionals);
const build = readBuildInfo();
const { url, server } = await serveSite();
const browser = await launchBrowser();
let differ = 0;
try {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  for (const entry of entries) {
    const fixture = await recordCircuit(browser, url, build, {
      ...entry,
      circuit: readCircuitSource(entry.source),
    });
    const text = formatFixture(fixture);
    const path = join(FIXTURE_DIR, `${entry.name}.json`);
    const rel = relative(REPO_ROOT, path);
    const stop = fixture.stop
      ? ` stopped: ${fixture.stop.message} at step ${fixture.stop.step}`
      : '';
    if (values.check) {
      const old = existsSync(path) ? readFileSync(path, 'utf8') : null;
      const same = old === text;
      if (!same) differ++;
      console.log(`${same ? 'same  ' : 'DIFFER'} ${rel}${stop}`);
      if (old !== null && !same) {
        // Say how far apart they are: last-bit noise or a real change.
        const stored = parseFixture(old);
        if (stored.export !== fixture.export) console.log('       export differs');
        const r = compareTrace(stored, fixture);
        const w = r.worst;
        console.log(
          w
            ? `       largest difference: ${w.quantity} at step ${w.step}, ${w.expected} vs ${w.actual} (${w.excess.toPrecision(3)}x compare tolerance)`
            : '       ' + formatResult(r),
        );
      }
    } else {
      writeFileSync(path, text);
      console.log(`wrote ${rel}: ${fixture.samples.length} samples${stop}`);
    }
  }
} finally {
  await browser.close();
  server.close();
}
if (values.check && differ > 0) {
  console.error(`${differ} fixture(s) differ from a fresh recording`);
  process.exit(1);
}
