// SPDX-License-Identifier: GPL-2.0-or-later
// Phase 2 and 3 acceptance, checked on every `pnpm check`: the circuitjs-next engine matches
// every golden circuit, and saving a loaded circuit gives upstream's own bytes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCircuit } from '@circuitjs-next/format';
import { describe, expect, it } from 'vitest';
import { compareTrace, formatResult } from './compare.ts';
import { nextEngine } from './engines/next.ts';
import { parseFixture } from './json.ts';
import { FIXTURE_DIR, loadManifest } from './manifest.ts';

/**
 * Scope (`o`) and slider (`adj`) records are passed through verbatim until Phase 6, while
 * upstream re-serializes them (docs/DEVIATIONS.md), so the export comparison leaves them out.
 */
function withoutScopesAndSliders(xml: string): string {
  return xml
    .replace(/^ {2}<o [^\n]*>\n(?: {4}[^\n]*\n)* {2}<\/o>\n/gm, '')
    .replace(/^ {2}<adj [^\n]*\n/gm, '');
}

describe('circuitjs-next engine on the golden circuits', () => {
  for (const entry of loadManifest()) {
    const fixture = parseFixture(readFileSync(join(FIXTURE_DIR, `${entry.name}.json`), 'utf8'));

    it(`${entry.name}: matches the reference trace`, async () => {
      const trace = await nextEngine.run({
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
      const result = compareTrace(fixture, trace);
      expect(result.pass, formatResult(result)).toBe(true);
    });

    it(`${entry.name}: saves as upstream does`, () => {
      const circuit = readCircuit(fixture.circuit);
      expect(circuit.warnings).toEqual([]);
      expect(circuit.sim.maxTimeStep).toBe(fixture.settings.maxTimeStep);
      expect(circuit.sim.minTimeStep).toBe(fixture.settings.minTimeStep);
      expect(circuit.sim.adjustTimeStep).toBe(fixture.settings.adjustTimeStep);
      expect(withoutScopesAndSliders(circuit.dumpXml())).toBe(
        withoutScopesAndSliders(fixture.export),
      );
    });

    it(`${entry.name}: XML round trip is byte-identical`, () => {
      expect(readCircuit(fixture.export).dumpXml()).toBe(fixture.export);
    });
  }
});
