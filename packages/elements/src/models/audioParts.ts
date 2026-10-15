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
  // Low-noise, high-gain grade of the BC547 die: the BC547B model with BF raised to the
  // datasheet's hFE (420 to 800 at 2 mA, typically about 520)
  {
    name: 'BC549C',
    description: 'NPN, low noise, high gain',
    source: 'fit',
    pnp: false,
    bf: 510,
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
  // PNP complement of the BC547B: the 2N3906 model with BF raised to the datasheet's hFE
  // (220 to 475 at 2 mA, typically about 290)
  {
    name: 'BC557B',
    description: 'PNP, general purpose',
    source: 'fit',
    pnp: true,
    bf: 245,
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
  // the higher-gain grade of the 2N5088: its model with BF raised to the datasheet's hFE
  // (450 to 1800 at 1 mA; about 730)
  {
    name: '2N5089',
    description: 'NPN, high gain, low noise',
    source: 'fit',
    pnp: false,
    bf: 1434,
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
  // the 2N5088 die model with BF set for the datasheet's hFE (500 to 1500 at 1 mA; about 770)
  {
    name: 'MPSA18',
    description: 'NPN, low noise, high gain',
    source: 'fit',
    pnp: false,
    bf: 1600,
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
  // Germanium PNP of the Fuzz Face, fitted like the AC128: hFE about 80 (sold in pairs of about
  // 70 and 110), VBE about 0.2 V, ICEO about 150 µA
  {
    name: 'NKT275',
    description: 'PNP, germanium',
    source: 'fit',
    pnp: true,
    bf: 64,
    is: 2e-7,
    vaf: 50,
    ikf: 0.5,
    br: 5,
    isc: 2.2e-6,
    nc: 2,
    cjc: 30e-12,
    tf: 150e-9,
  },
  // Germanium PNP of the Rangemaster, fitted: hFE about 75, ICEO about 80 µA, faster than the
  // AC128 (fT about 15 MHz)
  {
    name: 'OC44',
    description: 'PNP, germanium',
    source: 'fit',
    pnp: true,
    bf: 64,
    is: 1e-7,
    vaf: 50,
    ikf: 0.3,
    br: 5,
    isc: 1e-6,
    nc: 2,
    cjc: 10e-12,
    tf: 10e-9,
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
  // blue (InGaN) 2.6 V and 3.1 V
  {
    name: 'led-blue',
    description: 'blue LED',
    source: 'fit',
    is: 4.61e-12,
    rs: 5,
    n: 5.227,
    bv: 0,
  },
  // yellow (AlGaInP) 1.8 V and 2.05 V
  {
    name: 'led-yellow',
    description: 'yellow LED',
    source: 'fit',
    is: 9.24e-15,
    rs: 2,
    n: 2.737,
    bv: 0,
  },
  // white (InGaN with phosphor) 2.65 V and 3.2 V
  {
    name: 'led-white',
    description: 'white LED',
    source: 'fit',
    is: 2.734e-11,
    rs: 5,
    n: 5.875,
    bv: 0,
  },
  // fitted: 0.57 V at 1 mA, 0.69 V at 10 mA, 0.96 V at 1 A (datasheet: at most 1.1 V at 1 A)
  {
    name: '1N4001',
    description: 'rectifier',
    source: 'fit',
    is: 14.11e-9,
    rs: 0.03389,
    n: 1.984,
    bv: 50,
  },
  // Schottky, fitted: 0.18 V at 1 mA, 0.3 V at 0.1 A, 0.4 V at 1 A (datasheet: at most 0.45 V
  // at 1 A)
  {
    name: '1N5817',
    description: 'Schottky',
    source: 'fit',
    is: 1.08e-6,
    rs: 0.045,
    n: 1,
    bv: 20,
  },
  // small-signal Schottky, fitted: 0.32 V at 1 mA, 0.96 V at 200 mA (datasheet: at most 0.45 V
  // and 1 V)
  {
    name: 'BAT41',
    description: 'Schottky',
    source: 'fit',
    is: 1e-8,
    rs: 2.5,
    n: 1.05,
    bv: 100,
  },
  // point-contact germanium, fitted: about 0.3 V at 1 mA, softer than the 1N34A above that
  {
    name: 'OA91',
    description: 'germanium',
    source: 'fit',
    is: 5e-7,
    rs: 30,
    n: 1.5,
    bv: 90,
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
  // fitted: VGS(off) -2.5 V (datasheet -1 to -7 V), IDSS 6 mA (2 to 9 mA)
  {
    name: '2N5458',
    description: 'N-channel',
    source: 'fit',
    pnp: false,
    vto: -2.5,
    beta: 0.96e-3,
    lambda: 2.3e-3,
    is: 33.57e-15,
    cgs: 2.16e-12,
    cgd: 2.16e-12,
  },
  // fitted: VGS(off) -3 V (datasheet at most -8 V), IDSS 9 mA (2 to 20 mA)
  {
    name: 'MPF102',
    description: 'N-channel',
    source: 'fit',
    pnp: false,
    vto: -3,
    beta: 1e-3,
    lambda: 2.25e-3,
    is: 33.57e-15,
    cgs: 2.4e-12,
    cgd: 1.6e-12,
  },
  // fitted: VGS(off) -1.5 V (datasheet -0.5 to -3 V), IDSS 7 mA (at least 2 mA)
  {
    name: 'J113',
    description: 'N-channel, switch',
    source: 'fit',
    pnp: false,
    vto: -1.5,
    beta: 3.11e-3,
    lambda: 4e-3,
    is: 1e-14,
    cgs: 0,
    cgd: 0,
  },
  // GR grade, fitted: VGS(off) -1.2 V (datasheet -0.4 to -5 V), IDSS 4 mA (2.6 to 6.5 mA)
  {
    name: '2SK30A',
    description: 'N-channel, low noise',
    source: 'fit',
    pnp: false,
    vto: -1.2,
    beta: 2.78e-3,
    lambda: 5e-3,
    is: 1e-14,
    cgs: 0,
    cgd: 0,
  },
];

/**
 * An N-channel enhancement MOSFET in upstream's square-law terms: threshold VTO and KP (upstream's
 * beta), with the body diode.
 */
export interface MosfetPart {
  name: string;
  description: string;
  source: PartSource;
  vto: number;
  /** SPICE KP (A/V^2), upstream's beta. */
  kp: number;
  lambda: number;
  cgs: number;
  cgd: number;
}

export const MOSFET_PARTS: readonly MosfetPart[] = [
  // fitted: VGS(th) 2.1 V (datasheet 0.8 to 3 V), RDS(on) 1.2 ohms at VGS 10 V (at most 5)
  {
    name: '2N7000',
    description: 'N-channel, small signal',
    source: 'fit',
    vto: 2.1,
    kp: 0.105,
    lambda: 0.01,
    cgs: 20e-12,
    cgd: 5e-12,
  },
  // fitted: VGS(th) 2.1 V (datasheet 0.8 to 3 V), RDS(on) 1.2 ohms at VGS 10 V (at most 5)
  {
    name: 'BS170',
    description: 'N-channel, small signal',
    source: 'fit',
    vto: 2.1,
    kp: 0.105,
    lambda: 0.01,
    cgs: 24e-12,
    cgd: 5e-12,
  },
];

/**
 * A behavioural op-amp (elm/opAmpMacro.ts), from the datasheet's typical figures at ±15 V
 * (single-supply parts at 5 V).
 */
export interface OpAmpPart {
  name: string;
  description: string;
  /** Unity-gain bandwidth (Hz). */
  gbw: number;
  /** Slew rate (V/µs). */
  slewRate: number;
  /** DC open-loop gain (V/V). */
  avol: number;
  /** Differential input resistance (Ω). */
  rin: number;
  /** Input bias current into each input (A); negative flows out (PNP inputs), 0 for FET inputs. */
  ib: number;
  /** Quiescent supply current per op-amp (A). */
  iq: number;
  /** Output short-circuit current (A). */
  ilim: number;
  /** Open-loop output resistance (Ω). */
  rout: number;
  /** How close the output gets to V+ and to V- with a light load (V). */
  headroomHigh: number;
  headroomLow: number;
}

/** TI TL072/TL082, TI/Philips NE5532, JRC 4558, TI LM358, ON LM833 and TI OPA2134 datasheets. */
export const OPAMP_PARTS: readonly OpAmpPart[] = [
  {
    name: 'TL072',
    description: 'JFET input, low noise',
    gbw: 3e6,
    slewRate: 13,
    avol: 200e3,
    rin: 1e12,
    ib: 0,
    iq: 1.4e-3,
    ilim: 26e-3,
    rout: 100,
    headroomHigh: 1.5,
    headroomLow: 1.5,
  },
  // the same die as the TL072, with looser noise figures; the same model
  {
    name: 'TL082',
    description: 'JFET input',
    gbw: 3e6,
    slewRate: 13,
    avol: 200e3,
    rin: 1e12,
    ib: 0,
    iq: 1.4e-3,
    ilim: 26e-3,
    rout: 100,
    headroomHigh: 1.5,
    headroomLow: 1.5,
  },
  {
    name: 'NE5532',
    description: 'bipolar, low noise',
    gbw: 10e6,
    slewRate: 9,
    avol: 100e3,
    rin: 300e3,
    ib: 200e-9,
    iq: 4e-3,
    ilim: 38e-3,
    rout: 30,
    headroomHigh: 1.3,
    headroomLow: 1.3,
  },
  {
    name: 'RC4558',
    description: 'bipolar, Tube Screamer',
    gbw: 3e6,
    slewRate: 1,
    avol: 100e3,
    rin: 5e6,
    ib: 25e-9,
    iq: 1.75e-3,
    ilim: 25e-3,
    rout: 75,
    headroomHigh: 1,
    headroomLow: 1,
  },
  // single supply: the output reaches V- and the bias current flows out of the inputs
  {
    name: 'LM358',
    description: 'bipolar, single supply',
    gbw: 0.7e6,
    slewRate: 0.3,
    avol: 100e3,
    rin: 2e6,
    ib: -20e-9,
    iq: 0.35e-3,
    ilim: 40e-3,
    rout: 100,
    headroomHigh: 1.5,
    headroomLow: 0.02,
  },
  {
    name: 'LM833',
    description: 'bipolar, low noise, audio',
    gbw: 15e6,
    slewRate: 7,
    avol: 316e3,
    rin: 175e3,
    ib: 300e-9,
    iq: 2.5e-3,
    ilim: 40e-3,
    rout: 40,
    headroomHigh: 1.2,
    headroomLow: 1.2,
  },
  {
    name: 'OPA2134',
    description: 'FET input, audio',
    gbw: 8e6,
    slewRate: 20,
    avol: 1e6,
    rin: 1e13,
    ib: 5e-12,
    iq: 4e-3,
    ilim: 40e-3,
    rout: 20,
    headroomHigh: 1,
    headroomLow: 1,
  },
];
