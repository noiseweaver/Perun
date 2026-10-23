// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { Simulation, constructElement, type PotElm } from '@perun/elements';
import { BUILTIN_THEMES } from '@perun/theme';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEMATIC, schematicSvg } from './schematic.ts';

/** A 100 kΩ pot from (96, 96) down to (96, 224), wiper one grid step to the right. */
function pot(slider: number, x2 = 96, y2 = 224): PotElm {
  const sim = new Simulation();
  const e = constructElement('PotElm', 96, 96, sim) as PotElm;
  e.x2 = x2;
  e.y2 = y2;
  e.maxResistance = 100000;
  e.sliderValue = slider;
  e.setPoints();
  e.allocNodes();
  e.resistance1 = e.maxResistance * e.position;
  e.resistance2 = e.maxResistance - e.resistance1;
  return e;
}

const texts = (svg: string | null) =>
  [...(svg ?? '').matchAll(/<text x="([-\d.]+)" y="([-\d.]+)"[^>]*>([^<]*)<\/text>/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    s: m[3] ?? '',
  }));

const draw = (e: PotElm, tidyPots: boolean) =>
  schematicSvg([e], BUILTIN_THEMES.dark, { ...DEFAULT_SCHEMATIC, showOhm: true, tidyPots });

describe('potentiometer drawing', () => {
  it('tidy: values sit on the side away from the wiper and stay put as it moves', () => {
    const low = texts(draw(pot(5), true));
    const high = texts(draw(pot(95), true));
    expect(low.map((t) => t.s)).toEqual(['  5.5kΩ', ' 94.5kΩ']);
    expect(high.map((t) => t.s)).toEqual([' 94.6kΩ', '  5.4kΩ']);
    // the wiper is on the right (x 112), so the values end left of the body
    for (const t of low) expect(t.x).toBeLessThan(96 - 8);
    expect(high.map(({ x, y }) => [x, y])).toEqual(low.map(({ x, y }) => [x, y]));
  });

  it('tidy: horizontal values go above or below, R1 on point1 side', () => {
    // dragged right and up: the wiper goes above, so the values go below
    const e = pot(30, 224, 64);
    expect(e.post3.y).toBeLessThan(96);
    const t = texts(draw(e, true));
    expect(t.map((x) => x.s)).toEqual([' 30.2kΩ', ' 69.8kΩ']);
    for (const x of t) expect(x.y).toBeGreaterThan(96);
    expect(t[0]?.x ?? 0).toBeLessThan(t[1]?.x ?? 0);
  });

  it('tidy: a solid arrow that stays off the ends of the body', () => {
    const svg = draw(pot(100), true) ?? '';
    const tip = /<polygon points="([-\d.]+),([-\d.]+) /.exec(svg);
    expect(tip).not.toBeNull();
    // the body runs from y 144 to 176; the tip stays 4 inside its end
    expect(Number(tip?.[1])).toBe(104);
    expect(Number(tip?.[2])).toBeLessThanOrEqual(176 - 4);
  });

  it('off: drawn as upstream, values beside the arrow on the wiper side', () => {
    const svg = draw(pot(5), false);
    expect(svg).not.toContain('<polygon');
    const t = texts(svg);
    expect(t.map((x) => x.s)).toEqual(['94.5kΩ', '5.5kΩ']);
    for (const x of t) expect(x.x).toBeGreaterThan(96);
  });
});
