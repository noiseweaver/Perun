// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CirSim.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: register(), createCe() and constructElement().
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { Simulation } from '@circuitjs-next/engine';
import { elementType, type CircuitElm, type ElementType } from './CircuitElm.ts';
import { elementFactory } from './factory.ts';
import { CapacitorElmType } from './elm/CapacitorElm.ts';
import { DiodeElmType } from './elm/DiodeElm.ts';
import { LEDElmType } from './elm/LEDElm.ts';
import { MosfetElmType, NMosfetElmType, PMosfetElmType } from './elm/MosfetElm.ts';
import { JfetElmType, NJfetElmType, PJfetElmType } from './elm/JfetElm.ts';
import { OpAmpElmType, OpAmpSwapElmType } from './elm/OpAmpElm.ts';
import { PushSwitchElmType } from './elm/PushSwitchElm.ts';
import { RailElmType } from './elm/RailElm.ts';
import { TextElmType } from './elm/TextElm.ts';
import { NTransistorElmType, PTransistorElmType, TransistorElmType } from './elm/TransistorElm.ts';
import { ZenerElmType } from './elm/ZenerElm.ts';
import { CurrentElmType } from './elm/CurrentElm.ts';
import { GroundElmType } from './elm/GroundElm.ts';
import { InductorElmType } from './elm/InductorElm.ts';
import { LabeledNodeElmType } from './elm/LabeledNodeElm.ts';
import { OutputElmType } from './elm/OutputElm.ts';
import { PotElmType } from './elm/PotElm.ts';
import { ProbeElmType } from './elm/ProbeElm.ts';
import { ResistorElmType } from './elm/ResistorElm.ts';
import { SwitchElmType } from './elm/SwitchElm.ts';
import { ACVoltageElm, DCVoltageElm, VoltageElmType } from './elm/VoltageElm.ts';
import { WireElmType } from './elm/WireElm.ts';
import { TransformerElmType } from './elm/TransformerElm.ts';
import { TappedTransformerElmType } from './elm/TappedTransformerElm.ts';
import { TransLineElmType } from './elm/TransLineElm.ts';
import { RelayElmType } from './elm/RelayElm.ts';
import { RelayCoilElmType, RelayContactElmType } from './elm/RelayCoilElm.ts';
import { PolarCapacitorElmType } from './elm/PolarCapacitorElm.ts';
import { VaractorElmType } from './elm/VaractorElm.ts';
import { TunnelDiodeElmType } from './elm/TunnelDiodeElm.ts';
import { MemristorElmType } from './elm/MemristorElm.ts';
import { SparkGapElmType } from './elm/SparkGapElm.ts';
import { LampElmType } from './elm/LampElm.ts';
import { SCRElmType } from './elm/SCRElm.ts';
import { TriacElmType } from './elm/TriacElm.ts';
import { BoxElmType, LineElmType } from './elm/GraphicElm.ts';
import {
  ComparatorElmType,
  CrystalElmType,
  DarlingtonElmType,
  NDarlingtonElmType,
  NortonAmpElmType,
  OTAElmType,
  PDarlingtonElmType,
  UnijunctionElmType,
} from './elm/compositeParts.ts';
import { CustomCompositeElm, CustomCompositeElmType } from './elm/CustomCompositeElm.ts';
import { RoutedWireElmType } from './elm/RoutedWireElm.ts';
import { ROMElmType, SRAMElmType } from './elm/SRAMElm.ts';
import { InstructionDisplayElmType } from './elm/InstructionDisplayElm.ts';
import { CC2ElmType, CC2NegElmType } from './elm/CC2Elm.ts';
import { AudioOutputElmType } from './elm/AudioOutputElm.ts';
import { CCCSElmType, CCVSElmType, VCCSElmType, VCVSElmType } from './elm/VCCSElm.ts';
import { DiacElmType } from './elm/DiacElm.ts';
import { TriodeElmType } from './elm/TriodeElm.ts';
import { AmmeterElmType } from './elm/AmmeterElm.ts';
import { ScopeElmType } from './scope/ScopeElm.ts';
import { AudioInputElmType, DataInputElmType } from './elm/AudioInputElm.ts';
import { BatteryElmType } from './elm/BatteryElm.ts';
import {
  ACRailElmType,
  AntennaElmType,
  ClockElmType,
  ExtVoltageElmType,
  NoiseElmType,
  SquareRailElmType,
  VarRailElmType,
} from './elm/RailVariants.ts';
import { AMElmType, FMElmType, SweepElmType } from './elm/SweepElm.ts';
import {
  CrossSwitchElmType,
  DPDTSwitchElmType,
  MBBSwitchElmType,
  Switch2ElmType,
} from './elm/Switch2Elm.ts';
import {
  BusLogicInputElmType,
  LogicInputElmType,
  LogicOutputElmType,
} from './elm/LogicInputElm.ts';
import { AnalogSwitch2ElmType, AnalogSwitchElmType } from './elm/AnalogSwitchElm.ts';
import {
  AndGateElmType,
  NandGateElmType,
  NorGateElmType,
  OrGateElmType,
  XnorGateElmType,
  XorGateElmType,
} from './elm/GateElm.ts';
import {
  DelayBufferElmType,
  InverterElmType,
  InvertingSchmittElmType,
  SchmittElmType,
  TriStateElmType,
} from './elm/InverterElm.ts';
import { DFlipFlopElmType, JKFlipFlopElmType, TFlipFlopElmType } from './elm/FlipFlopElm.ts';
import {
  Counter2ElmType,
  CounterElmType,
  RingCounterElmType,
  SeqGenElmType,
} from './elm/CounterElm.ts';
import { LatchElmType, PisoShiftElmType, SipoShiftElmType } from './elm/ShiftElm.ts';
import { DeMultiplexerElmType, MultiplexerElmType } from './elm/MultiplexerElm.ts';
import { FullAdderElmType, HalfAdderElmType } from './elm/AdderElm.ts';
import {
  DecimalDisplayElmType,
  SevenSegDecoderElmType,
  SevenSegElmType,
} from './elm/SevenSegElm.ts';
import { BusSplitterElmType, BusTransceiverElmType } from './elm/BusElm.ts';
import { MonostableElmType, PhaseCompElmType, TimerElmType, VCOElmType } from './elm/TimerElm.ts';
import { ADCElmType, DACElmType } from './elm/ConverterElm.ts';
import type { StringTokenizer } from './StringTokenizer.ts';
import { OhmMeterElmType } from './elm/OhmMeterElm.ts';
import { GyratorElmType } from './elm/GyratorElm.ts';
import { LEDArrayElmType } from './elm/LEDArrayElm.ts';
import { CustomLogicElmType } from './elm/CustomLogicElm.ts';
import { ThreePhaseMotorElmType } from './elm/ThreePhaseMotorElm.ts';
import { MotorProtectionSwitchElmType } from './elm/MotorProtectionSwitchElm.ts';
import { FuseElmType } from './elm/FuseElm.ts';
import { LDRElmType } from './elm/LDRElm.ts';
import { ThermistorNTCElmType } from './elm/ThermistorNTCElm.ts';
import { TestPointElmType } from './elm/TestPointElm.ts';
import { StopTriggerElmType } from './elm/StopTriggerElm.ts';
import { DataRecorderElmType } from './elm/DataRecorderElm.ts';
import { WattmeterElmType, WattmeterTrueElmType } from './elm/WattmeterElm.ts';

/** Every ported element class. */
export const ELEMENT_TYPES: readonly ElementType[] = [
  WireElmType,
  GroundElmType,
  ResistorElmType,
  CapacitorElmType,
  InductorElmType,
  VoltageElmType,
  CurrentElmType,
  SwitchElmType,
  LabeledNodeElmType,
  ProbeElmType,
  OutputElmType,
  PotElmType,
  PushSwitchElmType,
  RailElmType,
  DiodeElmType,
  ZenerElmType,
  LEDElmType,
  TransistorElmType,
  MosfetElmType,
  OpAmpElmType,
  TextElmType,
  ScopeElmType,
  // menu-only variants; their dump types are already registered under the base class
  NTransistorElmType,
  PTransistorElmType,
  NMosfetElmType,
  PMosfetElmType,
  elementType('DCVoltageElm', DCVoltageElm),
  elementType('ACVoltageElm', ACVoltageElm),
  // Phase 8: inputs and sources
  ACRailElmType,
  SquareRailElmType,
  ClockElmType,
  SweepElmType,
  BatteryElmType,
  VarRailElmType,
  AntennaElmType,
  AMElmType,
  FMElmType,
  NoiseElmType,
  AudioInputElmType,
  DataInputElmType,
  ExtVoltageElmType,
  // Phase 8: switches, logic input and output
  Switch2ElmType,
  DPDTSwitchElmType,
  MBBSwitchElmType,
  CrossSwitchElmType,
  LogicInputElmType,
  LogicOutputElmType,
  BusLogicInputElmType,
  AnalogSwitchElmType,
  AnalogSwitch2ElmType,
  // Phase 8: logic gates and buffers
  InverterElmType,
  NandGateElmType,
  NorGateElmType,
  AndGateElmType,
  OrGateElmType,
  XorGateElmType,
  XnorGateElmType,
  TriStateElmType,
  SchmittElmType,
  InvertingSchmittElmType,
  DelayBufferElmType,
  // Phase 8: digital and mixed-signal chips
  DFlipFlopElmType,
  JKFlipFlopElmType,
  TFlipFlopElmType,
  SevenSegElmType,
  SevenSegDecoderElmType,
  MultiplexerElmType,
  DeMultiplexerElmType,
  SipoShiftElmType,
  PisoShiftElmType,
  CounterElmType,
  Counter2ElmType,
  RingCounterElmType,
  LatchElmType,
  SeqGenElmType,
  FullAdderElmType,
  HalfAdderElmType,
  MonostableElmType,
  DecimalDisplayElmType,
  BusTransceiverElmType,
  BusSplitterElmType,
  TimerElmType,
  PhaseCompElmType,
  DACElmType,
  ADCElmType,
  VCOElmType,
  TransformerElmType,
  TappedTransformerElmType,
  TransLineElmType,
  RelayElmType,
  RelayCoilElmType,
  RelayContactElmType,
  JfetElmType,
  NJfetElmType,
  PJfetElmType,
  PolarCapacitorElmType,
  VaractorElmType,
  TunnelDiodeElmType,
  MemristorElmType,
  SparkGapElmType,
  LampElmType,
  SCRElmType,
  TriacElmType,
  DiacElmType,
  TriodeElmType,
  AmmeterElmType,
  VCVSElmType,
  VCCSElmType,
  CCVSElmType,
  CCCSElmType,
  AudioOutputElmType,
  CC2ElmType,
  CC2NegElmType,
  OTAElmType,
  NortonAmpElmType,
  DarlingtonElmType,
  NDarlingtonElmType,
  PDarlingtonElmType,
  CrystalElmType,
  BoxElmType,
  LineElmType,
  CustomCompositeElmType,
  RoutedWireElmType,
  SRAMElmType,
  ROMElmType,
  InstructionDisplayElmType,
  OhmMeterElmType,
  ComparatorElmType,
  OpAmpSwapElmType,
  UnijunctionElmType,
  GyratorElmType,
  LEDArrayElmType,
  CustomLogicElmType,
  ThreePhaseMotorElmType,
  MotorProtectionSwitchElmType,
  FuseElmType,
  LDRElmType,
  ThermistorNTCElmType,
  TestPointElmType,
  StopTriggerElmType,
  DataRecorderElmType,
  WattmeterElmType,
  WattmeterTrueElmType,
];

/** Old class names upstream's constructElement still accepts (saved shortcuts, subcircuits). */
const CLASS_ALIASES: ReadonlyMap<string, string> = new Map([['DecadeElm', 'RingCounterElm']]);

const byClassName = new Map<string, ElementType>();
/** Text dump type (char code or number) to class name, first registration wins. */
const dumpTypeMap = new Map<number, string>();
/** XML tag to class name, first registration wins. */
const xmlDumpTypeMap = new Map<string, string>();

// composites build their parts through this while their samples are made below
elementFactory.construct = constructElement;
elementFactory.createCe = createCe;
elementFactory.classNameForXmlTag = classNameForXmlTag;

const sampleSim = new Simulation();
for (const type of ELEMENT_TYPES) {
  byClassName.set(type.className, type);
  // upstream registers a sample element of each class and asks it for its dump types
  const sample = type.create(0, 0, sampleSim);
  const cls = type.dumpClass ?? type.className;
  const t = sample.getDumpType();
  if (t > 0 && !dumpTypeMap.has(t)) dumpTypeMap.set(t, cls);
  const xt = sample.getXmlDumpType();
  if (!xmlDumpTypeMap.has(xt)) xmlDumpTypeMap.set(xt, cls);
}

/**
 * A new element of the named class at (x, y), or null for an unknown class. Like upstream,
 * a class registered under its base class (TransistorElm, MosfetElm) builds the N-type variant.
 */
export function constructElement(
  className: string,
  x: number,
  y: number,
  sim: Simulation = new Simulation(),
): CircuitElm | null {
  // "CustomCompositeElm:name" is a subcircuit of that model (menu entries for built-in ones)
  if (className.startsWith('CustomCompositeElm:')) {
    const e = new CustomCompositeElm(x, y, x, y, 0);
    e.sim = sim;
    e.flags = e.getDefaultFlags();
    e.initWithModel(className.substring('CustomCompositeElm:'.length));
    e.allocNodes();
    return e;
  }
  const name = CLASS_ALIASES.get(className) ?? className;
  return byClassName.get(name)?.create(x, y, sim) ?? null;
}

/** Class name for an XML tag, or undefined if no ported class uses it. */
export function classNameForXmlTag(tag: string): string | undefined {
  return xmlDumpTypeMap.get(tag);
}

/** Read a text-format element line, or null for an unknown dump type. Throws on bad fields. */
export function createCe(
  tint: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  f: number,
  st: StringTokenizer,
  sim: Simulation = new Simulation(),
): CircuitElm | null {
  // for old files
  if (tint === 'n'.charCodeAt(0)) return NoiseElmType.load(x1, y1, x2, y2, f, st, sim);
  const name = dumpTypeMap.get(tint);
  if (name === undefined) return null;
  return byClassName.get(name)?.load(x1, y1, x2, y2, f, st, sim) ?? null;
}
