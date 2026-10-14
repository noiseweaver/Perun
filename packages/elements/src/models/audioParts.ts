// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/**
 * Named parts common in audio circuits (pedals, synths, preamps): transistors, diodes and JFETs.
 * Not in upstream (docs/deviations/audio-part-library.md). Every part is a parameter set for the
 * existing upstream models, so nothing about how a model is simulated changes. The parts are
 * read-only in the model editor but are saved into every circuit that uses them, like a custom
 * model, so CircuitJS1 opens those circuits with the same parameters.
 *
 * `source` says where the numbers come from: `spice` is the widely distributed manufacturer SPICE
 * model of that part (only the parameters our models use are kept; series resistances, XTF/VTF/ITF
 * and noise parameters are dropped), `fit` means fitted by us to datasheet typical values, which
 * the comment next to the part lists. audioParts.test.ts checks every part against datasheet
 * figures.
 */

export type PartSource = 'spice' | 'fit';

/** A bipolar transistor. Values in SPICE units; omitted values take SPICE's defaults. */
export interface BjtPart {
  name: string;
  description: string;
  source: PartSource;
  pnp: boolean;
  /** BF, the forward beta. Perun keeps beta on the transistor, so picking the part sets it. */
  bf: number;
  is: number;
  vaf?: number;
  ikf?: number;
  ise?: number;
  ne?: number;
  br?: number;
  var?: number;
  ikr?: number;
  isc?: number;
  nc?: number;
  nf?: number;
  nr?: number;
  cje?: number;
  vje?: number;
  mje?: number;
  cjc?: number;
  vjc?: number;
  mjc?: number;
  tf?: number;
  tr?: number;
}

export const BJT_PARTS: readonly BjtPart[] = [
  {
    name: '2N3904',
    description: 'NPN, general purpose',
    source: 'spice',
    pnp: false,
    bf: 416.4,
    is: 6.734e-15,
    vaf: 74.03,
    ikf: 66.78e-3,
    ise: 6.734e-15,
    ne: 1.259,
    br: 0.7371,
    nc: 2,
    cje: 4.493e-12,
    mje: 0.2593,
    cjc: 3.638e-12,
    mjc: 0.3085,
    tf: 301.2e-12,
    tr: 239.5e-9,
  },
  {
    name: '2N3906',
    description: 'PNP, general purpose',
    source: 'spice',
    pnp: true,
    bf: 180.7,
    is: 1.41e-15,
    vaf: 18.7,
    ikf: 80e-3,
    ne: 1.5,
    br: 4.977,
    nc: 2,
    cje: 8.063e-12,
    mje: 0.3677,
    cjc: 9.728e-12,
    mjc: 0.5776,
    tf: 179.3e-12,
    tr: 33.42e-9,
  },
  {
    name: '2N2222A',
    description: 'NPN, general purpose',
    source: 'spice',
    pnp: false,
    bf: 255.9,
    is: 14.34e-15,
    vaf: 74.03,
    ikf: 0.2847,
    ise: 14.34e-15,
    ne: 1.307,
    br: 6.092,
    nc: 2,
    cje: 22.01e-12,
    mje: 0.377,
    cjc: 7.306e-12,
    mjc: 0.3416,
    tf: 411.1e-12,
    tr: 46.91e-9,
  },
  {
    name: '2N5088',
    description: 'NPN, high gain, low noise',
    source: 'spice',
    pnp: false,
    bf: 1122,
    is: 5.911e-15,
    vaf: 62.37,
    ikf: 14.92e-3,
    ise: 5.911e-15,
    ne: 1.394,
    br: 1.271,
    nc: 2,
    cje: 4.973e-12,
    mje: 0.4146,
    cjc: 4.017e-12,
    mjc: 0.3174,
    tf: 821.7e-12,
    tr: 4.673e-9,
  },
  {
    name: 'BC547B',
    description: 'NPN, general purpose',
    source: 'spice',
    pnp: false,
    bf: 294.3,
    is: 2.39e-14,
    nf: 1.008,
    ise: 3.545e-15,
    ne: 1.541,
    ikf: 0.1357,
    vaf: 63.2,
    nr: 1.004,
    isc: 6.272e-14,
    nc: 1.243,
    br: 7.946,
    ikr: 0.1144,
    var: 25.9,
    cje: 1.358e-11,
    vje: 0.65,
    mje: 0.3279,
    tf: 4.391e-10,
    cjc: 3.728e-12,
    vjc: 0.3997,
    mjc: 0.2955,
  },
  // Germanium PNP, fitted: hFE about 125 at 1 mA (datasheet 55 to 175), VBE about 0.22 V at
  // 1 mA, ICBO about 2 µA so ICEO is about 200 µA (germanium fuzz builders look for 100 to
  // 250 µA), fT about 1.5 MHz. Leakage follows the circuit temperature like silicon's, slower
  // than real germanium.
  {
    name: 'AC128',
    description: 'PNP, germanium',
    source: 'fit',
    pnp: true,
    bf: 90,
    is: 2e-7,
    vaf: 50,
    ikf: 0.5,
    br: 5,
    isc: 2e-6,
    nc: 2,
    cjc: 30e-12,
    tf: 100e-9,
  },
];

/** A diode, in the upstream diode model's terms. */
export interface DiodePart {
  name: string;
  description: string;
  source: PartSource;
  is: number;
  rs: number;
  n: number;
  /** Breakdown voltage, 0 for none. */
  bv: number;
}

export const DIODE_PARTS: readonly DiodePart[] = [
  // the same die as the 1N4148; same model as upstream's 1N4148
  {
    name: '1N914',
    description: 'switching',
    source: 'spice',
    is: 4.352e-9,
    rs: 0.6458,
    n: 1.906,
    bv: 75,
  },
  // fitted: 0.17 V at 0.1 mA, 0.27 V at 1 mA, 0.5 V at 10 mA (datasheet: at most 1 V at 5 mA)
  {
    name: '1N34A',
    description: 'germanium',
    source: 'fit',
    is: 1.076e-6,
    rs: 16.05,
    n: 1.437,
    bv: 60,
  },
  // fitted LEDs for clipping: forward voltage at 1 mA and 20 mA (typical datasheet curves)
  // red 1.65 V and 1.95 V
  { name: 'led-red', description: 'red LED', source: 'fit', is: 6.55e-12, rs: 2, n: 3.381, bv: 0 },
  // green (GaP) 1.85 V and 2.15 V
  {
    name: 'led-green',
    description: 'green LED, GaP',
    source: 'fit',
    is: 6.66e-13,
    rs: 2,
    n: 3.381,
    bv: 0,
  },
  // blue and white (InGaN) 2.6 V and 3.1 V
  {
    name: 'led-blue',
    description: 'blue or white LED',
    source: 'fit',
    is: 4.61e-12,
    rs: 5,
    n: 5.227,
    bv: 0,
  },
];

/**
 * An N or P channel JFET in SPICE terms. Perun's JFET is upstream's square-law model with
 * threshold VTO and beta = 2 * BETA (upstream's beta is SPICE's KP, SPICE's JFET BETA is KP / 2).
 */
export interface JfetPart {
  name: string;
  description: string;
  source: PartSource;
  pnp: boolean;
  vto: number;
  /** SPICE JFET BETA (A/V^2). */
  beta: number;
  lambda: number;
  /** Gate junction saturation current. */
  is: number;
  cgs: number;
  cgd: number;
}

export const JFET_PARTS: readonly JfetPart[] = [
  {
    name: '2N3819',
    description: 'N-channel',
    source: 'spice',
    pnp: false,
    vto: -3,
    beta: 1.304e-3,
    lambda: 2.25e-3,
    is: 33.57e-15,
    cgs: 2.414e-12,
    cgd: 1.6e-12,
  },
  {
    name: '2N5457',
    description: 'N-channel',
    source: 'spice',
    pnp: false,
    vto: -1.372,
    beta: 1.125e-3,
    lambda: 2.3e-3,
    is: 33.57e-15,
    cgs: 2.16e-12,
    cgd: 2.16e-12,
  },
  // fitted: VGS(off) -0.8 V (datasheet -0.3 to -1.5 V), IDSS 0.6 mA (0.2 to 1 mA), IGSS in pA
  {
    name: 'J201',
    description: 'N-channel, low cutoff',
    source: 'fit',
    pnp: false,
    vto: -0.8,
    beta: 0.9375e-3,
    lambda: 4e-3,
    is: 1e-14,
    cgs: 0,
    cgd: 0,
  },
  // fitted: VGS(off) 1.8 V (datasheet 0.75 to 6 V), IDSS 2.5 mA (1 to 5 mA)
  {
    name: '2N5460',
    description: 'P-channel',
    source: 'fit',
    pnp: true,
    vto: -1.8,
    beta: 0.772e-3,
    lambda: 4e-3,
    is: 1e-14,
    cgs: 0,
    cgd: 0,
  },
];
