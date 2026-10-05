// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import type { CircuitElm } from '../CircuitElm.ts';
import { CapacitorElm } from '../elm/CapacitorElm.ts';
import { CurrentElm } from '../elm/CurrentElm.ts';
import { DiodeElm } from '../elm/DiodeElm.ts';
import { GroundElm } from '../elm/GroundElm.ts';
import { InductorElm } from '../elm/InductorElm.ts';
import { LabeledNodeElm } from '../elm/LabeledNodeElm.ts';
import { LEDElm } from '../elm/LEDElm.ts';
import { MosfetElm } from '../elm/MosfetElm.ts';
import { JfetElm } from '../elm/JfetElm.ts';
import { OpAmpElm } from '../elm/OpAmpElm.ts';
import { OutputElm } from '../elm/OutputElm.ts';
import { PotElm } from '../elm/PotElm.ts';
import { ProbeElm } from '../elm/ProbeElm.ts';
import { RailElm } from '../elm/RailElm.ts';
import { ResistorElm } from '../elm/ResistorElm.ts';
import { SwitchElm } from '../elm/SwitchElm.ts';
import { TextElm } from '../elm/TextElm.ts';
import { TransistorElm } from '../elm/TransistorElm.ts';
import { VoltageElm } from '../elm/VoltageElm.ts';
import { WireElm } from '../elm/WireElm.ts';
import { ZenerElm } from '../elm/ZenerElm.ts';
import { ScopeElm } from '../scope/ScopeElm.ts';
import type { ElementView } from './common.ts';
import { PolarCapacitorElm } from '../elm/PolarCapacitorElm.ts';
import { VaractorElm } from '../elm/VaractorElm.ts';
import { TunnelDiodeElm } from '../elm/TunnelDiodeElm.ts';
import { MemristorElm } from '../elm/MemristorElm.ts';
import { SparkGapElm } from '../elm/SparkGapElm.ts';
import { LampElm } from '../elm/LampElm.ts';
import { SCRElm } from '../elm/SCRElm.ts';
import { TriacElm } from '../elm/TriacElm.ts';
import { DiacElm } from '../elm/DiacElm.ts';
import { TriodeElm } from '../elm/TriodeElm.ts';
import { AmmeterElm } from '../elm/AmmeterElm.ts';
import {
  ammeterView,
  diacView,
  lampView,
  memristorView,
  polarCapacitorView,
  scrView,
  sparkGapView,
  triacView,
  triodeView,
  tunnelDiodeView,
  varactorView,
} from './tier3.ts';
import { TransformerElm } from '../elm/TransformerElm.ts';
import { TappedTransformerElm } from '../elm/TappedTransformerElm.ts';
import { TransLineElm } from '../elm/TransLineElm.ts';
import { RelayElm } from '../elm/RelayElm.ts';
import { RelayCoilElm, RelayContactElm } from '../elm/RelayCoilElm.ts';
import {
  relayCoilView,
  relayContactView,
  relayView,
  tappedTransformerView,
  transformerView,
  transLineView,
} from './magnetics.ts';
import {
  audioOutputView,
  boxView,
  instructionDisplayView,
  labeledNodeView,
  lineView,
  outputView,
  probeView,
  textView,
} from './labels.ts';
import { InstructionDisplayElm } from '../elm/InstructionDisplayElm.ts';
import { AudioOutputElm } from '../elm/AudioOutputElm.ts';
import { BoxElm, LineElm } from '../elm/GraphicElm.ts';
import {
  ComparatorElm,
  CrystalElm,
  DarlingtonElm,
  NortonAmpElm,
  OTAElm,
  UnijunctionElm,
} from '../elm/compositeParts.ts';
import {
  comparatorView,
  crystalView,
  darlingtonView,
  nortonAmpView,
  otaView,
  subcircuitView,
  unijunctionView,
} from './composites.ts';
import { CustomCompositeElm } from '../elm/CustomCompositeElm.ts';
import {
  capacitorView,
  groundView,
  inductorView,
  potView,
  resistorView,
  routedWireView,
  wireView,
} from './passive.ts';
import { RoutedWireElm } from '../elm/RoutedWireElm.ts';
import {
  diodeView,
  jfetView,
  ledView,
  mosfetView,
  opAmpView,
  transistorView,
  zenerView,
} from './semis.ts';
import {
  batteryView,
  currentView,
  modulatedView,
  ohmMeterView,
  railView,
  sweepView,
  voltageView,
} from './sources.ts';
import { BatteryElm } from '../elm/BatteryElm.ts';
import { AMElm, FMElm, SweepElm } from '../elm/SweepElm.ts';
import {
  analogSwitch2View,
  analogSwitchView,
  busLogicInputView,
  crossSwitchView,
  dpdtSwitchView,
  logicInputView,
  logicOutputView,
  mbbSwitchView,
  switch2View,
  switchView,
} from './switches.ts';
import { AnalogSwitch2Elm, AnalogSwitchElm } from '../elm/AnalogSwitchElm.ts';
import { GateElm } from '../elm/GateElm.ts';
import {
  DelayBufferElm,
  InverterElm,
  InvertingSchmittElm,
  TriStateElm,
} from '../elm/InverterElm.ts';
import { delayBufferView, gateView, inverterView, schmittView, triStateView } from './logic.ts';
import { BusLogicInputElm, LogicInputElm, LogicOutputElm } from '../elm/LogicInputElm.ts';
import { CrossSwitchElm, DPDTSwitchElm, MBBSwitchElm, Switch2Elm } from '../elm/Switch2Elm.ts';
import { ChipElm } from '../elm/ChipElm.ts';
import { DecimalDisplayElm, SevenSegElm } from '../elm/SevenSegElm.ts';
import { VCOElm } from '../elm/TimerElm.ts';
import { chipView, decimalDisplayView, sevenSegView, vcoView } from './chips.ts';
import { OhmMeterElm } from '../elm/OhmMeterElm.ts';

/** Undocked scopes are drawn by the scope renderer, over the circuit; this only places them. */
const scopeElmView: ElementView<ScopeElm> = {
  draw() {},
  bbox: (e) => e.box(),
};

type AnyCtor = abstract new (...args: never[]) => CircuitElm;

/** Views by element class, subclasses before their base classes. */
const VIEWS: [AnyCtor, ElementView<never>][] = [
  [PolarCapacitorElm, polarCapacitorView],
  [VaractorElm, varactorView],
  [TunnelDiodeElm, tunnelDiodeView],
  [MemristorElm, memristorView],
  [SparkGapElm, sparkGapView],
  [LampElm, lampView],
  [SCRElm, scrView],
  [TriacElm, triacView],
  [DiacElm, diacView],
  [TriodeElm, triodeView],
  [AmmeterElm, ammeterView],
  [RoutedWireElm, routedWireView],
  [InstructionDisplayElm, instructionDisplayView],
  [WireElm, wireView],
  [GroundElm, groundView],
  [ResistorElm, resistorView],
  [CapacitorElm, capacitorView],
  [InductorElm, inductorView],
  [PotElm, potView],
  [RailElm, railView],
  [VoltageElm, voltageView],
  [OhmMeterElm, ohmMeterView],
  [CurrentElm, currentView],
  [Switch2Elm, switch2View],
  [DPDTSwitchElm, dpdtSwitchView],
  [MBBSwitchElm, mbbSwitchView],
  [CrossSwitchElm, crossSwitchView],
  [LogicInputElm, logicInputView],
  [BusLogicInputElm, busLogicInputView],
  [SwitchElm, switchView],
  [LogicOutputElm, logicOutputView],
  [AnalogSwitch2Elm, analogSwitch2View],
  [AnalogSwitchElm, analogSwitchView],
  [GateElm, gateView],
  [InverterElm, inverterView],
  [InvertingSchmittElm, schmittView],
  [TriStateElm, triStateView],
  [DelayBufferElm, delayBufferView],
  [LabeledNodeElm, labeledNodeView],
  [ProbeElm, probeView],
  [OutputElm, outputView],
  [AudioOutputElm, audioOutputView],
  [BoxElm, boxView],
  [LineElm, lineView],
  [ComparatorElm, comparatorView],
  [UnijunctionElm, unijunctionView],
  [OTAElm, otaView],
  [NortonAmpElm, nortonAmpView],
  [DarlingtonElm, darlingtonView],
  [CrystalElm, crystalView],
  [CustomCompositeElm, subcircuitView],
  [TextElm, textView],
  [LEDElm, ledView],
  [ZenerElm, zenerView],
  [DiodeElm, diodeView],
  [TransistorElm, transistorView],
  [JfetElm, jfetView],
  [MosfetElm, mosfetView],
  [OpAmpElm, opAmpView],
  [ScopeElm, scopeElmView],
  [SweepElm, sweepView],
  [AMElm, modulatedView('AM')],
  [FMElm, modulatedView('FM')],
  [BatteryElm, batteryView],
  [SevenSegElm, sevenSegView],
  [DecimalDisplayElm, decimalDisplayView],
  [VCOElm, vcoView],
  [ChipElm, chipView],
  [TransformerElm, transformerView],
  [TappedTransformerElm, tappedTransformerView],
  [TransLineElm, transLineView],
  [RelayElm, relayView],
  [RelayCoilElm, relayCoilView],
  [RelayContactElm, relayContactView],
];

const cache = new Map<unknown, ElementView | null>();

/** The view that draws this element, or null for an element with no view yet. */
export function viewFor(e: CircuitElm): ElementView | null {
  const ctor = e.constructor;
  let v = cache.get(ctor);
  if (v === undefined) {
    v = null;
    for (const [c, view] of VIEWS) {
      if (e instanceof c) {
        v = view as ElementView;
        break;
      }
    }
    cache.set(ctor, v);
  }
  return v;
}

export type { ElementView } from './common.ts';
export { addCurCount, CURRENT_TOO_FAST } from './passive.ts';
export { switchRect } from './switches.ts';
export { boxAround, rectContains, rectOf, unionRect, type Rect } from './geometry.ts';
export type {
  ColorRole,
  DrawContext,
  Ink,
  Painter,
  Pt,
  StrokeStyle,
  TextFont,
  TextStyle,
} from './Painter.ts';
export {
  MU,
  OHM,
  formatNumber,
  getCurrentDText,
  getCurrentText,
  getShortUnitText,
  getTimeText,
  getUnitText,
  getUnitTextWithScale,
  getVoltageDText,
  getVoltageText,
  showFormat,
} from './units.ts';
