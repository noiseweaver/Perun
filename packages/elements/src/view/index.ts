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
import { labeledNodeView, outputView, probeView, textView } from './labels.ts';
import {
  capacitorView,
  groundView,
  inductorView,
  potView,
  resistorView,
  wireView,
} from './passive.ts';
import { diodeView, ledView, mosfetView, opAmpView, transistorView, zenerView } from './semis.ts';
import {
  batteryView,
  currentView,
  modulatedView,
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
import { BusLogicInputElm, LogicInputElm, LogicOutputElm } from '../elm/LogicInputElm.ts';
import { CrossSwitchElm, DPDTSwitchElm, MBBSwitchElm, Switch2Elm } from '../elm/Switch2Elm.ts';

/** Undocked scopes are drawn by the scope renderer, over the circuit; this only places them. */
const scopeElmView: ElementView<ScopeElm> = {
  draw() {},
  bbox: (e) => e.box(),
};

type AnyCtor = abstract new (...args: never[]) => CircuitElm;

/** Views by element class, subclasses before their base classes. */
const VIEWS: [AnyCtor, ElementView<never>][] = [
  [WireElm, wireView],
  [GroundElm, groundView],
  [ResistorElm, resistorView],
  [CapacitorElm, capacitorView],
  [InductorElm, inductorView],
  [PotElm, potView],
  [RailElm, railView],
  [VoltageElm, voltageView],
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
  [LabeledNodeElm, labeledNodeView],
  [ProbeElm, probeView],
  [OutputElm, outputView],
  [TextElm, textView],
  [LEDElm, ledView],
  [ZenerElm, zenerView],
  [DiodeElm, diodeView],
  [TransistorElm, transistorView],
  [MosfetElm, mosfetView],
  [OpAmpElm, opAmpView],
  [ScopeElm, scopeElmView],
  [SweepElm, sweepView],
  [AMElm, modulatedView('AM')],
  [FMElm, modulatedView('FM')],
  [BatteryElm, batteryView],
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
