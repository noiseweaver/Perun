// SPDX-License-Identifier: GPL-2.0-or-later
// Records every bundled upstream example in the reference build (PLAN.md Phase 8 bulk run): its
// XML save after loading, topology, stop state and node voltages on EXAMPLE_SCHEDULE, into
// fixtures/examples/<name>.json. Each file loads in a fresh browser context, since upstream keeps
// models and subcircuits in static maps that would leak between circuits.
//
//   node tools/golden/src/record-examples.ts [--check] [file.txt ...]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import {
  EXAMPLE_FIXTURE_DIR,
  EXAMPLE_SCHEDULE,
  EXAMPLE_SEED,
  exampleFiles,
  fixtureName,
  formatExampleFixture,
  readExample,
  type ExampleFixture,
} from './examples.ts';
import { launchBrowser, readBuildInfo, serveSite, type ReferenceBuildInfo } from './reference.ts';
import type { StopInfo } from './types.ts';

interface PageRun {
  error?: string;
  exported: string;
  topology: ExampleFixture['topology'];
  stop: StopInfo | null;
  samples: ExampleFixture['samples'];
}

/** Runs inside the page; must be self-contained. */
function runInPage({
  circuit,
  schedule,
  seed,
}: {
  circuit: string;
  schedule: number[];
  seed: number;
}): PageRun {
  const api = window.CircuitJS1;
  const h = api?.harness;
  if (!api || !h) throw new Error('reference build has no harness API; rebuild with the patch');
  const arr = (a: ArrayLike<number>): number[] => Array.prototype.slice.call(a) as number[];
  api.importCircuit(circuit, false);
  const exported = api.exportCircuit();
  h.setSeed(seed);
  const samples: PageRun['samples'] = [];
  let topology: PageRun['topology'] | null = null;
  let stop: StopInfo | null = null;
  let step = 0;
  for (const target of schedule) {
    const want = target - step;
    const done = h.step(want);
    step += done;
    const nodes = arr(h.nodeVoltages());
    const topo = {
      nodeCount: nodes.length,
      elements: h.elements().map((e) => ({ type: e.type, nodes: arr(e.nodes) })),
    };
    if (topology === null) topology = topo;
    else if (JSON.stringify(topology) !== JSON.stringify(topo))
      return { error: `topology changed at step ${step}` } as PageRun;
    if (done < want) {
      stop = { message: h.stopMessage() ?? 'stopped', step, t: api.getTime() };
      break;
    }
    samples.push({ step, t: api.getTime(), nodes });
  }
  return {
    exported,
    topology: topology ?? { nodeCount: 0, elements: [] },
    stop,
    samples,
  };
}

const BLANK_CIRCUIT = '$ 1 5.0E-6 10 50 5.0 50\n';

async function recordExample(
  browser: Browser,
  siteUrl: string,
  build: ReferenceBuildInfo,
  file: string,
): Promise<ExampleFixture> {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    // upstream asks before replacing a circuit and on some errors; never block on a dialog
    page.on('dialog', (d) => void d.dismiss());
    await page.goto(`${siteUrl}?running=false&cct=${encodeURIComponent(BLANK_CIRCUIT)}`);
    await page.waitForFunction(() => window.CircuitJS1?.harness !== undefined, null, {
      timeout: 30000,
    });
    const raw = await page.evaluate(runInPage, {
      circuit: readExample(file),
      schedule: [...EXAMPLE_SCHEDULE],
      seed: EXAMPLE_SEED,
    });
    if (raw.error) throw new Error(`${file}: ${raw.error}`);
    return {
      file,
      reference: {
        upstreamSha: build.upstreamSha,
        harnessPatchSha256: build.harnessPatchSha256,
        browser: `chromium ${browser.version()}`,
      },
      export: raw.exported,
      topology: raw.topology,
      stop: raw.stop,
      samples: raw.samples,
    };
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const picked = args.filter((a) => !a.startsWith('--'));
  const files = picked.length > 0 ? picked : exampleFiles();
  const build = readBuildInfo();
  const { url, server } = await serveSite();
  const browser = await launchBrowser();
  mkdirSync(EXAMPLE_FIXTURE_DIR, { recursive: true });
  let differ = 0;
  let failed = 0;
  const queue = [...files];
  const worker = async (): Promise<void> => {
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
      let text: string;
      try {
        text = formatExampleFixture(await recordExample(browser, url, build, file));
      } catch (e) {
        failed++;
        console.log(`ERROR  ${file}: ${String(e)}`);
        continue;
      }
      const path = join(EXAMPLE_FIXTURE_DIR, fixtureName(file));
      if (check) {
        const same = existsSync(path) && readFileSync(path, 'utf8') === text;
        if (!same) differ++;
        console.log(`${same ? 'same  ' : 'DIFFER'} ${file}`);
      } else {
        writeFileSync(path, text);
        console.log(`wrote  ${file}`);
      }
    }
  };
  try {
    await Promise.all([worker(), worker(), worker(), worker()]);
  } finally {
    await browser.close();
    server.close();
  }
  if (failed > 0) console.error(`${failed} example(s) could not be recorded`);
  if (check && differ > 0)
    console.error(`${differ} example fixture(s) differ from a new recording`);
  if (failed > 0 || (check && differ > 0)) process.exitCode = 1;
}

await main();
