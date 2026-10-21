// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// The circuit's integration method (docs/deviations/integration-method.md) and the scope's
// solver ringing notice, on the owner's circuit whose op-amp output flipped sign on every step.

import { CapacitorElm, IntegrationMethod, type Scope } from '@perun/elements';
import { describe, expect, it } from 'vitest';
import { readCircuit, type Circuit } from './circuit.ts';

/**
 * A 1 kHz source on a 2N3904's collector, its emitter on an inverting op-amp's input with 1 kΩ
 * feedback, base biased through 1 MΩ, three scopes (owner's report, 2026-10-21). With
 * trapezoidal junction capacitances the op-amp output flips sign on every 10 µs step, growing to
 * ±59 mV by 0.3 s (the reference build gives the same numbers); the signal is under 1 mV.
 */
const CIRCUIT = [
  '<cir f="65" ts="0.000009999999999999999" ic="244.56918652031501" cb="19" pb="50" vr="5" mts="5e-11" sp="248.25">',
  '<a x="192 224 256 224" f="8" ma="9" mi="-9" ga="100000"/>',
  '<r x="192 128 256 128" f="0" r="1000"/>',
  '<w x="256 128 288 128" f="0"/>',
  '<w x="288 128 288 224" f="0"/>',
  '<w x="288 224 256 224" f="0"/>',
  '<w x="192 208 160 208" f="0"/>',
  '<w x="160 208 160 128" f="0"/>',
  '<w x="160 128 192 128" f="0"/>',
  '<g x="176 240 176 256" f="0"/>',
  '<w x="176 240 192 240" f="0"/>',
  '<tm nm="2N3904" f="0" is="6.734e-15" ikf="14.974543276430067" ise="6.734e-15" ne="1.259" ikr="0" isc="0" nc="2" nf="1" nr="1" vaf="0.013508037282182899" var="0" br="0.7371" cje="4.493e-12" vje="0.75" mje="0.2593" cjc="3.638e-12" vjc="0.75" mjc="0.3085" tf="3.012e-10" tr="2.395e-7"/>',
  '<t x="64 80 112 80" f="0" pn="1" be="416.4" mo="2N3904" vbe="0.42168422650319604" vbc="-0.1302296288669286"/>',
  '<w x="112 128 160 128" f="0"/>',
  '<w x="112 96 112 128" f="0"/>',
  '<r x="64 80 0 80" f="0" r="1000000"/>',
  '<pt x="0 176 0 112" f="1" ma="100000" po="0.1733" sl="Resistance"/>',
  '<g x="-48 192 -48 208" f="0"/>',
  '<w x="-48 192 -48 144" f="0"/>',
  '<s x="-224 80 -160 80" f="0" p="1" mm="true"/>',
  '<w x="-32 80 0 80" f="0"/>',
  '<c x="-96 80 -96 144" f="0" c="1e-7" iv="0.001" sr="0.1" vd="-0.004580316289160936"/>',
  '<g x="-96 144 -96 176" f="0"/>',
  '<w x="-96 80 -32 80" f="0"/>',
  '<R x="-224 80 -288 80" f="16" wf="0" maxv="9"/>',
  '<r x="64 -16 96 -16" f="0" r="220"/>',
  '<r x="128 -16 176 -16" f="0" r="47"/>',
  '<w x="96 -16 112 -16" f="0"/>',
  '<w x="112 -16 128 -16" f="0"/>',
  '<w x="112 -16 112 64" f="0"/>',
  '<g x="176 -16 176 16" f="0"/>',
  '<R x="64 -16 0 -16" f="80" wf="4" fr="1000" maxv="5"/>',
  '<Scope x="448 -32 672 112" f="0">',
  '<o en="3" sp="1024" f="x2" p="-1">',
  '<p v="0" sc="0.625"/>',
  '<p v="3" sc="0.003125"/>',
  '</o>',
  '</Scope>',
  '<r x="-80 16 -144 16" f="0" r="1"/>',
  '<w x="-160 80 -96 80" f="0"/>',
  '<v x="-352 208 -352 144" f="16" wf="0" maxv="9"/>',
  '<g x="-352 208 -352 240" f="0"/>',
  '<Scope x="-400 -176 -176 -32" f="0">',
  '<o en="19" sp="4" f="x3" p="-1">',
  '<p v="0" sc="0.009765625"/>',
  '<p v="3" sc="0.00009765625"/>',
  '</o>',
  '</Scope>',
  '<w x="-48 144 -16 144" f="0"/>',
  '<w x="0 112 0 80" f="0"/>',
  '<c x="288 128 352 128" f="0" c="0.000001" iv="0.001" sr="0" vd="0.00004016788543931282"/>',
  '<g x="352 192 352 240" f="0"/>',
  '<r x="352 144 352 192" f="0" r="100000"/>',
  '<w x="352 144 352 128" f="0"/>',
  '<Scope x="464 160 944 512" f="0">',
  '<o en="41" sp="256" f="x3" p="-1">',
  '<p v="0" sc="1.25"/>',
  '<p v="3" sc="0.00009765625"/>',
  '</o>',
  '</Scope>',
  '<adj e="31" ei="0" en="Resistance (ohms)" mn="1" mx="1000" st="Resistance"/>',
  '</cir>',
].join('\n');

const at = (method: IntegrationMethod): Circuit => {
  const c = readCircuit(CIRCUIT);
  c.sim.integration = method;
  c.sim.setElements(c.elements);
  return c;
};

/** Peak op-amp output and how often its direction flips over 400 steps, after 0.1 s. */
function ringing(c: Circuit): { peak: number; flips: number } {
  const sim = c.sim;
  const out = c.elements[0];
  while (sim.t < 0.1) sim.step(50);
  expect(sim.stopMessage).toBeNull();
  let prev = out.volts[2];
  let lastDiff = 0;
  let flips = 0;
  let peak = 0;
  for (let k = 0; k !== 400; k++) {
    sim.step(1);
    const v = out.volts[2];
    const d = v - prev;
    if (k > 0 && Math.sign(d) !== Math.sign(lastDiff)) flips++;
    lastDiff = d;
    prev = v;
    peak = Math.max(peak, Math.abs(v));
  }
  return { peak, flips };
}

/** The card that plots the wire after the coupling capacitor. */
const wireScope = (c: Circuit): Scope => {
  const s = c.scopeElms().at(-1);
  if (s === undefined) throw new Error('no scope');
  return s.elmScope;
};

describe('integration method', () => {
  it('is per part (CircuitJS1) unless a circuit saves another', () => {
    const c = readCircuit(CIRCUIT);
    expect(c.sim.integration).toBe(IntegrationMethod.PER_PART);
    expect(c.dumpXml()).not.toContain(' im=');
    for (const m of [IntegrationMethod.BACKWARD_EULER, IntegrationMethod.DAMP_SEMICONDUCTORS]) {
      c.sim.integration = m;
      const text = c.dumpXml();
      expect(text).toContain(`im="${m}"`);
      expect(readCircuit(text).sim.integration).toBe(m);
    }
    expect(readCircuit(CIRCUIT.replace('<cir ', '<cir im="7" ')).sim.integration).toBe(
      IntegrationMethod.PER_PART,
    );
  });

  it('per part: the transistor capacitances ring on every step, as in CircuitJS1', () => {
    const r = ringing(at(IntegrationMethod.PER_PART));
    expect(r.peak).toBeGreaterThan(0.004);
    expect(r.flips).toBe(399);
  });

  it('damping transistor capacitances or backward Euler stops the ringing', () => {
    for (const m of [IntegrationMethod.DAMP_SEMICONDUCTORS, IntegrationMethod.BACKWARD_EULER]) {
      const r = ringing(at(m));
      expect(r.peak).toBeLessThan(0.001);
      expect(r.flips).toBeLessThan(40);
    }
  });

  it('backward Euler overrides a capacitor set to trapezoidal; the others leave it', () => {
    for (const m of [
      IntegrationMethod.PER_PART,
      IntegrationMethod.DAMP_SEMICONDUCTORS,
      IntegrationMethod.BACKWARD_EULER,
    ]) {
      const c = at(m);
      c.sim.step(1);
      const cap = c.elements.find((e): e is CapacitorElm => e instanceof CapacitorElm);
      if (cap === undefined) throw new Error('no capacitor');
      expect(cap.isTrapezoidal()).toBe(true);
      const dt = c.sim.timeStep;
      expect(cap.compResistance).toBeCloseTo(
        m === IntegrationMethod.BACKWARD_EULER ? dt / cap.capacitance : dt / (2 * cap.capacitance),
        12,
      );
    }
  });
});

describe('solver ringing notice', () => {
  it('shows on the scope of a ringing trace and not once damped', () => {
    const ringingCase = at(IntegrationMethod.PER_PART);
    while (ringingCase.sim.t < 0.1) ringingCase.sim.step(50);
    expect(wireScope(ringingCase).isRinging()).toBe(true);
    const damped = at(IntegrationMethod.DAMP_SEMICONDUCTORS);
    while (damped.sim.t < 0.1) damped.sim.step(50);
    expect(wireScope(damped).isRinging()).toBe(false);
    expect(damped.scopeElms().some((s) => s.elmScope.isRinging())).toBe(false);
  });

  it('does not show for noise or a fast sine', () => {
    const c = readCircuit(
      '$ 1 0.000005 10.2 50 5 50 5e-11\n' +
        'n 96 160 96 64 0 0.5\n' +
        'r 96 64 208 64 0 1000\n' +
        'g 96 160 96 208 0\n' +
        'g 208 64 208 112 0\n' +
        'v 304 160 304 64 0 1 50000 5 0 0 0.5\n' +
        'g 304 160 304 208 0\n' +
        'r 304 64 400 64 0 1000\n' +
        'g 400 64 400 112 0\n' +
        'o 0 1 0 2 5 0.05\n' +
        'o 4 1 0 2 5 0.05\n',
    );
    c.sim.setElements(c.elements);
    c.sim.step(20000);
    expect(c.scopes.scopes.length).toBe(2);
    for (const s of c.scopes.scopes) {
      expect(s.visiblePlots.length).toBeGreaterThan(0);
      expect(s.isRinging()).toBe(false);
    }
  });
});
