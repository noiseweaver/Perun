// SPDX-License-Identifier: GPL-2.0-or-later
// Drives the patched reference build (tools/reference-patch) in Chromium to record golden traces.

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, sep } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { REPO_ROOT } from './manifest.ts';
import type { ElementInfo, GoldenFixture, RunSettings, Sample, StopInfo } from './types.ts';

export const SITE_DIR = process.env['REFERENCE_SITE'] ?? join(REPO_ROOT, '.reference-site');

export interface ReferenceBuildInfo {
  upstreamSha: string;
  harnessPatchSha256: string;
  image: string;
}

export function readBuildInfo(): ReferenceBuildInfo {
  const path = join(SITE_DIR, 'reference-build.json');
  if (!existsSync(path))
    throw new Error(`${path} not found. Build the patched reference first: pnpm reference:build`);
  return JSON.parse(readFileSync(path, 'utf8')) as ReferenceBuildInfo;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};

/** Serve the static reference site on a free localhost port. */
export async function serveSite(root = SITE_DIR): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    const path = normalize(
      join(root, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)),
    );
    if (!path.startsWith(root + sep) || !existsSync(path) || !statSync(path).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    createReadStream(path).pipe(res);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/circuitjs.html`, server };
}

export async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE'];
  return chromium.launch(executablePath ? { executablePath } : {});
}

/** Shape of `window.CircuitJS1` with the harness patch applied. */
interface HarnessElement {
  type: string;
  dumpType: number;
  posts: number;
  nodes: ArrayLike<number>;
  volts: ArrayLike<number>;
  currents: ArrayLike<number>;
  current: number;
}
interface CircuitJS1Api {
  getTime(): number;
  getTimeStep(): number;
  getMaxTimeStep(): number;
  importCircuit(text: string, subcircuitsOnly: boolean): void;
  harness?: {
    version: number;
    setSeed(seed: number): void;
    step(n: number): number;
    stopMessage(): string | null;
    minTimeStep(): number;
    adjustTimeStep(): boolean;
    nodeVoltages(): ArrayLike<number>;
    elements(): HarnessElement[];
  };
}
declare global {
  interface Window {
    CircuitJS1?: CircuitJS1Api;
  }
}

const BLANK_CIRCUIT = '$ 1 5.0E-6 10 50 5.0 50\n';

interface RawRun {
  error?: string;
  timeStep: number;
  maxTimeStep: number;
  minTimeStep: number;
  adjustTimeStep: boolean;
  topology: { nodeCount: number; elements: ElementInfo[] };
  stop: StopInfo | null;
  samples: Sample[];
}

/** Runs inside the page. Must be self-contained: Playwright serializes it as source text. */
function runInPage({ circuit, settings }: { circuit: string; settings: RunSettings }): RawRun {
  const api = window.CircuitJS1;
  const h = api?.harness;
  if (!api || !h) throw new Error('reference build has no harness API; rebuild with the patch');
  const arr = (a: ArrayLike<number>): number[] => Array.prototype.slice.call(a) as number[];
  api.importCircuit(circuit, false);
  h.setSeed(settings.seed);
  const timeStep = api.getTimeStep();
  const maxTimeStep = api.getMaxTimeStep();
  const minTimeStep = h.minTimeStep();
  const adjustTimeStep = h.adjustTimeStep();
  const samples: Sample[] = [];
  let topology: RawRun['topology'] | null = null;
  let stop: StopInfo | null = null;
  let step = 0;
  for (let k = 0; k < settings.samples; k++) {
    const done = h.step(settings.stepsPerSample);
    step += done;
    const nodes = arr(h.nodeVoltages());
    const els = h.elements();
    const info = els.map((e) => ({
      type: e.type,
      dumpType: e.dumpType,
      posts: e.posts,
      nodes: arr(e.nodes),
    }));
    if (topology === null) topology = { nodeCount: nodes.length, elements: info };
    else if (
      JSON.stringify(topology) !== JSON.stringify({ nodeCount: nodes.length, elements: info })
    )
      return { error: `topology changed at step ${step}` } as RawRun;
    if (done < settings.stepsPerSample) {
      stop = { message: h.stopMessage() ?? 'stopped', step, t: api.getTime() };
      break;
    }
    samples.push({
      step,
      t: api.getTime(),
      timeStep: api.getTimeStep(),
      nodes,
      elements: els.map((e) => ({
        volts: arr(e.volts),
        currents: arr(e.currents),
        current: e.current,
      })),
    });
  }
  return {
    timeStep,
    maxTimeStep,
    minTimeStep,
    adjustTimeStep,
    topology: topology ?? { nodeCount: 0, elements: [] },
    stop,
    samples,
  };
}

export interface RecordRequest extends RunSettings {
  name: string;
  description: string;
  source: string;
  tags: string[];
  circuit: string;
}

/** Record one circuit in a fresh browser context (no shared localStorage or app state). */
export async function recordCircuit(
  browser: Browser,
  siteUrl: string,
  build: ReferenceBuildInfo,
  req: RecordRequest,
): Promise<GoldenFixture> {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // An empty circuit in cct= stops the app from fetching its default circuit, which would
    // otherwise arrive asynchronously and could replace ours. The real circuit goes through
    // importCircuit() (cct= mangles XML attribute quoting).
    await page.goto(`${siteUrl}?running=false&cct=${encodeURIComponent(BLANK_CIRCUIT)}`);
    await page.waitForFunction(() => window.CircuitJS1?.harness !== undefined, null, {
      timeout: 30000,
    });
    const settings: RunSettings = {
      seed: req.seed,
      stepsPerSample: req.stepsPerSample,
      samples: req.samples,
    };
    const raw = await page.evaluate(runInPage, { circuit: req.circuit, settings });
    if (raw.error) throw new Error(`${req.name}: ${raw.error}`);
    if (errors.length) throw new Error(`${req.name}: page errors: ${errors.join('; ')}`);
    return {
      schemaVersion: 1,
      name: req.name,
      description: req.description,
      source: req.source,
      tags: req.tags,
      reference: {
        upstreamSha: build.upstreamSha,
        harnessPatchSha256: build.harnessPatchSha256,
        build: 'java-master',
      },
      settings: {
        ...settings,
        timeStep: raw.timeStep,
        maxTimeStep: raw.maxTimeStep,
        minTimeStep: raw.minTimeStep,
        adjustTimeStep: raw.adjustTimeStep,
      },
      circuit: req.circuit,
      topology: raw.topology,
      stop: raw.stop,
      samples: raw.samples,
    };
  } finally {
    await context.close();
  }
}
