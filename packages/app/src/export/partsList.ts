// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { GraphicElm, getUnitText, type CircuitElm, type EditInfo } from '@perun/elements';
import { paletteItem } from '../editor/catalog.ts';

/** One line of a parts list (bill of materials): identical parts are counted together. */
export interface PartRow {
  count: number;
  part: string;
  value: string;
  details: string;
}

/** Connections, labels, measuring and display-only elements: nothing to buy. */
const NOT_PARTS = new Set([
  'WireElm',
  'RoutedWireElm',
  'GroundElm',
  'LabeledNodeElm',
  'ScopeElm',
  'ProbeElm',
  'OutputElm',
  'LogicOutputElm',
  'TestPointElm',
  'AmmeterElm',
  'OhmMeterElm',
  'WattmeterElm',
  'WattmeterTrueElm',
  'DataRecorderElm',
  'StopTriggerElm',
  'AudioOutputElm',
  'TextElm',
  'BoxElm',
  'LineElm',
]);

/** Unit names in edit field labels ("Resistance (ohms)") and their symbols. */
const UNIT_SYMBOLS: Record<string, string> = {
  ohms: 'Ω',
  ohm: 'Ω',
  Ω: 'Ω',
  F: 'F',
  farads: 'F',
  H: 'H',
  henries: 'H',
  V: 'V',
  volts: 'V',
  A: 'A',
  amps: 'A',
  Hz: 'Hz',
  s: 's',
  W: 'W',
};

/** Units named by the field's label when it has none in brackets. */
const UNIT_WORDS: [RegExp, string][] = [
  [/voltage/i, 'V'],
  [/current/i, 'A'],
  [/resistance/i, 'Ω'],
  [/capacitance/i, 'F'],
  [/inductance/i, 'H'],
  [/frequency/i, 'Hz'],
  [/time|delay/i, 's'],
];

function fieldName(ei: EditInfo): { name: string; unit: string | null } {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(ei.name);
  // "(ohms)" is a unit, "(on Reset)" is part of the name
  if (m !== null && (m[2] ?? '') in UNIT_SYMBOLS) return { name: m[1] ?? '', unit: m[2] ?? null };
  if (ei.dimensionless) return { name: ei.name, unit: null };
  const w = UNIT_WORDS.find(([re]) => re.test(ei.name));
  return { name: ei.name, unit: w ? w[1] : null };
}

/** A number with its unit symbol and SI prefix, or bare when it has no unit. */
function numberText(ei: EditInfo, unit: string | null): string {
  const sym = unit !== null ? UNIT_SYMBOLS[unit] : undefined;
  if (sym !== undefined) return getUnitText(ei.value, sym);
  return String(Number(ei.value.toPrecision(6)));
}

/** The element's properties as its edit panel lists them: a value, then the rest. */
function describe(e: CircuitElm): { value: string; details: string } {
  let value = '';
  const details: string[] = [];
  for (let n = 0; n < 64; n++) {
    const ei = e.getEditInfo(n);
    if (ei === null) break;
    if (ei.file !== null || ei.button !== null || ei.checkbox !== null || ei.isColor) continue;
    // a preset picker restates the number field next to it
    if (ei.derived) continue;
    const { name, unit } = fieldName(ei);
    // the state it starts in is simulation, not part of what to buy
    if (name === '' || /^initial/i.test(name)) continue;
    if (ei.choice !== null) {
      const text = ei.choice.items[ei.choice.selected] ?? '';
      if (text !== '') details.push(`${name}: ${text}`);
    } else if (ei.text !== null) {
      if (!ei.multiline && ei.text.trim() !== '') details.push(`${name}: ${ei.text.trim()}`);
    } else if (value === '' && unit !== null && ei.value !== 0) {
      // the first quantity with a unit is the part's value (10 kΩ, 4.7 μF)
      value = numberText(ei, unit);
    } else if (ei.value !== 0) {
      // zero settings (no offset, no delay, ideal) are left out
      details.push(`${name}: ${numberText(ei, unit)}`);
    }
  }
  return { value, details: details.join('; ') };
}

/** What the part is called: its palette name, else its kind, else its class. */
function partName(e: CircuitElm): string {
  const item = paletteItem(e.getClassName());
  if (item !== undefined) return item.label;
  const kind = e.getElmType();
  if (kind) return kind.charAt(0).toUpperCase() + kind.slice(1);
  return e.getClassName().replace(/Elm$/, '');
}

/**
 * The circuit's parts grouped by name, value and settings: sorted by name, then in order of
 * first appearance.
 */
export function partsList(elements: readonly CircuitElm[]): PartRow[] {
  const rows = new Map<string, PartRow>();
  for (const e of elements) {
    if (e instanceof GraphicElm || NOT_PARTS.has(e.getClassName())) continue;
    const part = partName(e);
    const { value, details } = describe(e);
    const key = `${part}\u0000${value}\u0000${details}`;
    const row = rows.get(key);
    if (row) row.count++;
    else rows.set(key, { count: 1, part, value, details });
  }
  return [...rows.values()].sort((a, b) => a.part.localeCompare(b.part));
}

function csvField(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The parts list as CSV with a header row. */
export function partsCsv(rows: readonly PartRow[]): string {
  const lines = ['Quantity,Part,Value,Details'];
  for (const r of rows)
    lines.push([String(r.count), r.part, r.value, r.details].map(csvField).join(','));
  return lines.join('\n') + '\n';
}
