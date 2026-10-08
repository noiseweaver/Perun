// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
//
// Icons for the example circuit categories (upstream setuplist.txt group titles): a component
// from the category drawn like the palette's, or a plain icon where the component would be a chip
// too small to read, or a folder where no one component stands for the category.

import { Icon, type IconName } from './Icon.tsx';
import { Preview } from './Palette.tsx';

/** Category title (as in setuplist.txt) to the element class drawn for it, or an icon. */
const CATEGORY_ICONS: Readonly<Record<string, string | { icon: IconName }>> = {
  Basics: 'ResistorElm',
  'A/C Circuits': 'ACRailElm',
  'Passive Filters': 'CapacitorElm',
  'Other Passive Circuits': 'InductorElm',
  Transformers: 'TransformerElm',
  Relays: 'RelayElm',
  Diodes: 'DiodeElm',
  'Zener Diodes': 'ZenerElm',
  'Op-Amps': 'OpAmpElm',
  Transistors: 'NTransistorElm',
  MOSFETs: 'NMosfetElm',
  '555 Timer Chip': { icon: 'timer' },
  'Active Filters': 'OpAmpSwapElm',
  'Logic Families': 'InverterElm',
  'Combinational Logic': 'AndGateElm',
  'Sequential Logic': { icon: 'chip' },
  'Analog/Digital': 'SquareRailElm',
  'Power Converters': { icon: 'bolt' },
  'Phase-Locked Loops': 'PhaseCompElm',
  'Transmission Lines': 'TransLineElm',
  'Controlled Sources': 'VCVSElm',
  Subcircuits: { icon: 'chip' },
  'Misc Devices': 'LampElm',
  JFETs: 'NJfetElm',
  'Tunnel Diodes': 'TunnelDiodeElm',
  Memristors: 'MemristorElm',
  Triodes: 'TriodeElm',
  'Silicon-Controlled Rectifiers': 'SCRElm',
  'Spark Gap': 'SparkGapElm',
  'Operational Transconductance Amplifier (OTA)': 'OTAElm',
  'Light Bulb': 'LampElm',
  Varactor: 'VaractorElm',
  'Norton Amplifier': 'NortonAmpElm',
  '2-D Scope': { icon: 'scope' },
  // this port's own examples (packages/app/examples/setuplist.txt)
  'Temperature Compensation': { icon: 'thermostat' },
};

export function CategoryIcon({ title }: { title: string }) {
  const it = CATEGORY_ICONS[title];
  return (
    <span className="category-icon" aria-hidden>
      {it === undefined ? (
        <Icon name="folder" />
      ) : typeof it === 'string' ? (
        <Preview className={it} />
      ) : (
        <Icon name={it.icon} />
      )}
    </span>
  );
}
