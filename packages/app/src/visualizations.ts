// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import type { FieldOptions } from '@perun/render';

/** Options > Visualizations, in menu order: the switch label and what the legend says it shows. */
export const VISUALIZATIONS: readonly {
  readonly key: keyof FieldOptions;
  readonly label: string;
  readonly legend: string;
}[] = [
  { key: 'charge', label: 'Charge and electric field', legend: 'Charge on plates, field + to −' },
  { key: 'magnetic', label: 'Magnetic field', legend: 'Magnetic field, flowing with B' },
  { key: 'emf', label: 'Induced voltage (Lenz)', legend: 'Induced EMF, against the change' },
  { key: 'energy', label: 'Stored energy', legend: 'Stored energy' },
  { key: 'energyFlow', label: 'Energy flow', legend: 'Power in (absorbed) or out' },
  {
    key: 'semiconductors',
    label: 'Diode and MOSFET regions',
    legend: 'Depletion region, MOSFET channel',
  },
  { key: 'heat', label: 'Heat', legend: 'Warmer than ambient, in °C' },
];
