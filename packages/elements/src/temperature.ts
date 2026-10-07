// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Temperature equations from SPICE3f5 (diotemp.c, bjttemp.c, mos1temp.c), which define the
// semantics; no SPICE code is copied.

/**
 * Temperature effects (PLAN.md Phase 15). Not in upstream (DEVIATIONS.md): upstream's diode,
 * transistor and MOSFET models are all at SPICE's nominal temperature, 27 °C. Every function here
 * returns upstream's own value at 27 °C exactly, so circuits at the default temperature simulate
 * bit for bit as before.
 */

/** SPICE's nominal temperature (TNOM) in °C, the temperature upstream's models are at. */
export const NOMINAL_TEMPERATURE = 27;
/** The nominal temperature in kelvin. */
const T_NOM = 300.15;
/** Upstream's thermal voltage kT/q at the nominal temperature. */
const VT_NOM = 0.025865;
/** Silicon band gap in eV at 300 K, SPICE's default EG for diodes and BJTs. */
export const EG_SILICON = 1.11;
/** SPICE's default saturation current temperature exponent XTI for diodes and BJTs. */
export const XTI_DEFAULT = 3;

export function kelvin(celsius: number): number {
  return celsius + 273.15;
}

/** Thermal voltage kT/q at a temperature in °C: upstream's 0.025865 V at 27 °C, scaled with T. */
export function thermalVoltage(celsius: number): number {
  if (celsius === NOMINAL_TEMPERATURE) return VT_NOM;
  return (VT_NOM * kelvin(celsius)) / T_NOM;
}

/**
 * The natural log of SPICE's saturation current factor, (T/Tnom - 1) EG/Vt + XTI ln(T/Tnom).
 * A diode's IS scales by exp(f/N), a BJT's IS by exp(f) and its ISE and ISC by exp(f/NE) and
 * exp(f/NC). Zero at the nominal temperature.
 */
export function saturationCurrentLogFactor(
  celsius: number,
  eg = EG_SILICON,
  xti = XTI_DEFAULT,
): number {
  if (celsius === NOMINAL_TEMPERATURE) return 0;
  const ratio = kelvin(celsius) / T_NOM;
  return ((ratio - 1) * eg) / thermalVoltage(celsius) + xti * Math.log(ratio);
}

/** Silicon band gap at T kelvin (SPICE's egfet). */
function bandGap(t: number): number {
  return 1.16 - (7.02e-4 * t * t) / (t + 1108);
}

/** SPICE's pbfact: how the junction potential moves with temperature, at T kelvin. */
function potentialFactor(t: number): number {
  const kOverQ = VT_NOM / T_NOM;
  const arg = (-bandGap(t) / (2 * t) + 1.1150877 / (2 * T_NOM)) / kOverQ;
  return -2 * thermalVoltage(t - 273.15) * (1.5 * Math.log(t / T_NOM) + arg);
}

/** Surface potential PHI SPICE uses for a level 1 MOSFET with no PHI given. */
const PHI = 0.6;

/**
 * A level 1 MOSFET's threshold and transconductance at a temperature (SPICE mos1temp.c with
 * GAMMA = 0 and PHI = 0.6, as upstream's model has neither): the transconductance scales as
 * (T/Tnom)^-1.5 with the carrier mobility, and the threshold moves with the band gap and the
 * surface potential. `threshold` is the magnitude the element uses for either polarity.
 */
export function mosfetAtTemperature(
  threshold: number,
  beta: number,
  pmos: boolean,
  celsius: number,
): { threshold: number; beta: number } {
  if (celsius === NOMINAL_TEMPERATURE) return { threshold, beta };
  const t = kelvin(celsius);
  const ratio = t / T_NOM;
  const pbfact1 = potentialFactor(T_NOM);
  const phio = PHI - pbfact1;
  const tPhi = ratio * phio + potentialFactor(t);
  const gap = 0.5 * (bandGap(T_NOM) - bandGap(t));
  const surface = 0.5 * (tPhi - PHI);
  // SPICE: tVto = VTO + gap + type * surface, with VTO negative for PMOS
  const shift = pmos ? surface - gap : gap + surface;
  return { threshold: threshold + shift, beta: beta / (ratio * Math.sqrt(ratio)) };
}

/** A resistance with a first-order temperature coefficient in ppm/°C. */
export function resistanceAtTemperature(r: number, ppm: number, celsius: number): number {
  if (ppm === 0 || celsius === NOMINAL_TEMPERATURE) return r;
  return r * (1 + ppm * 1e-6 * (celsius - NOMINAL_TEMPERATURE));
}
