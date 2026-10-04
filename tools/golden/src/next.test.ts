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
 * Slider (`adj`) records are passed through verbatim until sliders are ported, while upstream
 * re-serializes them (docs/DEVIATIONS.md), so the export comparison leaves them out. Scope (`o`)
 * records are compared: they are rebuilt from the loaded scopes.
 */
function withoutSliders(xml: string): string {
  return xml.replace(/^ {2}<adj [^\n]*\n/gm, '');
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
      expect(withoutSliders(circuit.dumpXml())).toBe(withoutSliders(fixture.export));
    });

    it(`${entry.name}: XML round trip is byte-identical`, () => {
      // Upstream reads scope plots from XML without resetting them, so saving right after an XML
      // load writes sp="0" (auto-lrc's fixture shows it); the rest is unchanged.
      const expected = fixture.export.replace(/(<o en="-?\d+") sp="\d+"/g, '$1 sp="0"');
      expect(readCircuit(fixture.export).dumpXml()).toBe(expected);
    });
  }
});
