// SPDX-License-Identifier: GPL-2.0-or-later
// Records how the reference build restores and saves the scopes of every bundled upstream example
// that has any (Phase 6 acceptance: scope `o` lines restore equivalent scopes). For each file it
// keeps upstream's XML save right after loading, reduced to the element tags and the scope
// records, in fixtures/scopes/upstream-examples.json.
//
//   node tools/golden/src/record-scopes.ts [--check]

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './manifest.ts';
import { launchBrowser, readBuildInfo, serveSite } from './reference.ts';

export const EXAMPLES_DIR = join(
  REPO_ROOT,
  'reference/circuitjs1/src/com/lushprojects/circuitjs1/public/circuits',
);
export const SCOPE_FIXTURE = join(REPO_ROOT, 'fixtures/scopes/upstream-examples.json');

export interface ScopeExample {
  file: string;
  /** Tags of the saved top-level records, in order (elements, models, scopes, ...). */
  tags: string[];
  /** The saved `<o>` records, verbatim, one string per record. */
  scopes: string[];
}

export interface ScopeFixture {
  upstreamSha: string;
  harnessPatchSha256: string;
  examples: ScopeExample[];
}

/** Example files with a scope record (`o` line, `<o>` element) or an undocked scope (403). */
export function scopeExampleFiles(): string[] {
  return readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith('.txt'))
    .filter((f) => /^(o |403 )|^\s*<o /m.test(readFileSync(join(EXAMPLES_DIR, f), 'utf8')))
    .sort();
}

/** Split a pretty-printed `<cir>` save into its top-level records. */
export function topLevelRecords(xml: string): { tag: string; text: string }[] {
  const out: { tag: string; text: string }[] = [];
  const lines = xml.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^ {2}<([A-Za-z0-9_]+)/.exec(lines[i] ?? '');
    if (m === null) continue;
    let text = lines[i] ?? '';
    // multi-line unless self-closing or closed on the same line (`<rw ...>points</rw>`)
    const close = `</${m[1]}>`;
    if (!text.endsWith('/>') && !text.includes(close)) {
      while (i + 1 < lines.length && !(lines[i] ?? '').includes(close)) {
        i++;
        text += '\n' + (lines[i] ?? '');
      }
    }
    out.push({ tag: m[1] ?? '', text });
  }
  return out;
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const build = readBuildInfo();
  const files = scopeExampleFiles();
  const { url, server } = await serveSite();
  const browser = await launchBrowser();
  const examples: ScopeExample[] = [];
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const blank = '$ 1 5.0E-6 10 50 5.0 50\n';
    await page.goto(`${url}?running=false&cct=${encodeURIComponent(blank)}`);
    await page.waitForFunction(() => window.CircuitJS1?.harness !== undefined, null, {
      timeout: 30000,
    });
    for (const file of files) {
      const text = readFileSync(join(EXAMPLES_DIR, file), 'utf8');
      const exported = await page.evaluate((circuit) => {
        const api = window.CircuitJS1;
        if (!api) throw new Error('no CircuitJS1 API');
        api.importCircuit(circuit, false);
        return api.exportCircuit();
      }, text);
      const recs = topLevelRecords(exported);
      examples.push({
        file,
        tags: recs.map((r) => r.tag),
        scopes: recs.filter((r) => r.tag === 'o').map((r) => r.text),
      });
    }
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
  const fixture: ScopeFixture = {
    upstreamSha: build.upstreamSha,
    harnessPatchSha256: build.harnessPatchSha256,
    examples,
  };
  const json = JSON.stringify(fixture, null, 1) + '\n';
  if (check) {
    if (readFileSync(SCOPE_FIXTURE, 'utf8') !== json) {
      console.error(`${SCOPE_FIXTURE} differs from a new recording`);
      process.exitCode = 1;
    } else console.log('scope fixture is up to date');
    return;
  }
  mkdirSync(join(REPO_ROOT, 'fixtures/scopes'), { recursive: true });
  writeFileSync(SCOPE_FIXTURE, json);
  console.log(`recorded ${examples.length} examples to ${SCOPE_FIXTURE}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
