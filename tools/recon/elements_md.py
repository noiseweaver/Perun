#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Render the element table for docs/ELEMENTS.md from tools/recon/elements.py output.

Usage: python3 tools/recon/elements.py | python3 tools/recon/elements_md.py > table.md
"""
import json, sys

d = json.load(sys.stdin)
E = d['elements']

# Tier 1: the elements PLAN.md Phases 2 and 3 name, plus the base classes they need.
TIER1_LINEAR = {'WireElm', 'GroundElm', 'ResistorElm', 'CapacitorElm', 'InductorElm', 'VoltageElm',
                'DCVoltageElm', 'ACVoltageElm', 'RailElm', 'CurrentElm', 'SwitchElm', 'LabeledNodeElm',
                'ProbeElm'}
TIER1_NONLINEAR = {'DiodeElm', 'LEDElm', 'ZenerElm', 'TransistorElm', 'NTransistorElm', 'PTransistorElm',
                   'MosfetElm', 'NMosfetElm', 'PMosfetElm', 'OpAmpElm', 'PotElm', 'PushSwitchElm'}
# Tier 2: element families PLAN.md Phase 8 names, plus anything used in 5 or more bundled examples.
TIER2_NAMED = {'AndGateElm', 'NandGateElm', 'OrGateElm', 'NorGateElm', 'XorGateElm', 'XnorGateElm',
               'GateElm', 'InverterElm', 'DFlipFlopElm', 'JKFlipFlopElm', 'TFlipFlopElm', 'CounterElm',
               'Counter2Elm', 'RingCounterElm', 'TimerElm', 'TransformerElm', 'TappedTransformerElm',
               'RelayElm', 'RelayCoilElm', 'RelayContactElm', 'ADCElm', 'DACElm', 'SweepElm', 'NoiseElm',
               'ChipElm', 'CompositeElm', 'LogicInputElm', 'LogicOutputElm', 'ClockElm', 'SquareRailElm',
               'ACRailElm', 'VarRailElm', 'OutputElm', 'TextElm', 'GraphicElm', 'BoxElm', 'LineElm',
               'Switch2Elm', 'OpAmpSwapElm', 'CustomCompositeElm', 'CustomLogicElm'}

HOOK_ABBR = [('getInternalNodeCount', 'int'), ('getVoltageSourceCount', 'vs'), ('startIteration', 'si'),
             ('doStep', 'ds'), ('stepFinished', 'sf'), ('calculateCurrent', 'cc'), ('setCurrent', 'setc'),
             ('getCurrentIntoNode', 'cin'), ('getConnection', 'conn'), ('hasGroundConnection', 'gnd'),
             ('isWireEquivalent', 'wire'), ('setNodeVoltage', 'snv'), ('execute', 'exec')]

def tier(e):
    n = e['class']
    if n in TIER1_LINEAR or n in TIER1_NONLINEAR: return 1
    if n in TIER2_NAMED or e['exampleFiles'] >= 5 or e['xmlExampleFiles'] >= 5: return 2
    return 3

def lin(e):
    v = e['nonLinear']
    if v == 'true': return 'nonlinear'
    if v == 'false': return 'linear'
    return f'depends: `{v}`'

rows = []
for e in E:
    hooks = [a for h, a in HOOK_ABBR if h in e['hooks']]
    notes = []
    if e['abstract'] or not e['inMenu']: notes.append('base/abstract' if e['abstract'] else 'not in menu')
    if e['dumpType'] is None: notes.append('XML only (no text dump type)')
    if e['random']: notes.append(f"RNG via {e['random']}")
    rows.append((tier(e), e['class'], e))

rows.sort(key=lambda r: (r[0], r[1]))
print('| Tier | Class | Extends | Text dump type | XML tag | Linearity | Engine hooks | Examples (txt/xml) | Notes | Port status |')
print('|---|---|---|---|---|---|---|---|---|---|')
for t, n, e in rows:
    hooks = ' '.join(a for h, a in HOOK_ABBR if h in e['hooks']) or '-'
    notes = []
    if e['abstract']: notes.append('abstract')
    elif not e['inMenu']: notes.append('not in menu')
    if e['dumpType'] is None and not e['abstract']: notes.append('XML only')
    if e['random']: notes.append(f"RNG ({e['random']})")
    dt = f"`{e['dumpType']}`" if e['dumpType'] else '-'
    print(f"| {t} | {n} | {e['parent']} | {dt} | `{e['xmlTag']}` | {lin(e)} | {hooks} | "
          f"{e['exampleFiles']}/{e['xmlExampleFiles']} | {'; '.join(notes) or '-'} | not started |")
print()
from collections import Counter
c = Counter(t for t, _, _ in rows)
print(f"Totals: {len(rows)} element classes. Tier 1: {c[1]}, tier 2: {c[2]}, tier 3: {c[3]}. "
      f"Distinct text dump types: {len(set(e['dumpType'] for e in E if e['dumpType']))}.")
