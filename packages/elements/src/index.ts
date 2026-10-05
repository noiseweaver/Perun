// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

export {
  CircuitElm,
  distanceSq,
  elementType,
  lineDistanceSq,
  type ElementType,
} from './CircuitElm.ts';
export {
  E12,
  EditInfo,
  noCommaFormat,
  parseUnits,
  stepE12,
  unitString,
  type EditCheckbox,
  type EditChoice,
  type EditFile,
  type Editable,
} from './edit/EditInfo.ts';
export {
  ADJ_FLAG_LOG,
  ADJ_FLAG_SHARED,
  Adjustable,
  SLIDER_MAX,
  clampPosition,
  findAdjustable,
  findEditItemByName,
  reorderAdjustables,
  sliderBeingShared,
} from './edit/Adjustable.ts';
export { SCALE_AUTO, SCALE_1, SCALE_M, SCALE_MU } from './constants.ts';
export { escapeToken, unescapeToken } from './escape.ts';
export {
  NumberFormatException,
  javaDoubleToInt,
  parseJavaBoolean,
  parseJavaDouble,
  parseJavaInt,
} from './java.ts';
export { StringTokenizer } from './StringTokenizer.ts';
export type { XmlAttrReader, XmlAttrWriter, XmlDocWriter } from './xml.ts';
export { ELEMENT_TYPES, classNameForXmlTag, constructElement, createCe } from './registry.ts';

export { CapacitorElm } from './elm/CapacitorElm.ts';
export { Diode } from './elm/Diode.ts';
export { DiodeElm } from './elm/DiodeElm.ts';
export { LEDElm } from './elm/LEDElm.ts';
export { MosfetElm, NMosfetElm, PMosfetElm } from './elm/MosfetElm.ts';
export { OpAmpElm } from './elm/OpAmpElm.ts';
export { PushSwitchElm } from './elm/PushSwitchElm.ts';
export { RailElm } from './elm/RailElm.ts';
export { TextElm } from './elm/TextElm.ts';
export { NTransistorElm, PTransistorElm, TransistorElm } from './elm/TransistorElm.ts';
export { ZenerElm } from './elm/ZenerElm.ts';
export { DiodeModel, DiodeModels } from './models/DiodeModel.ts';
export { ModelLibrary, modelsFor } from './models/ModelLibrary.ts';
export { MosfetModel, MosfetModels } from './models/MosfetModel.ts';
export { TransistorModel, TransistorModels } from './models/TransistorModel.ts';
export { CurrentElm } from './elm/CurrentElm.ts';
export { GroundElm } from './elm/GroundElm.ts';
export { Inductor, InductorElm } from './elm/InductorElm.ts';
export { LabeledNodeElm } from './elm/LabeledNodeElm.ts';
export { OutputElm } from './elm/OutputElm.ts';
export { PotElm } from './elm/PotElm.ts';
export { LDRElm } from './elm/LDRElm.ts';
export { ThermistorNTCElm } from './elm/ThermistorNTCElm.ts';
export { ProbeElm } from './elm/ProbeElm.ts';
export { ResistorElm } from './elm/ResistorElm.ts';
export { SwitchElm } from './elm/SwitchElm.ts';
export { ACVoltageElm, DCVoltageElm, VoltageElm } from './elm/VoltageElm.ts';
export { WireElm } from './elm/WireElm.ts';
export { AudioInputElm, DataInputElm } from './elm/AudioInputElm.ts';
export { BatteryElm } from './elm/BatteryElm.ts';
export {
  ACRailElm,
  AntennaElm,
  ClockElm,
  ExtVoltageElm,
  NoiseElm,
  SquareRailElm,
  VarRailElm,
} from './elm/RailVariants.ts';
export { AMElm, FMElm, SweepElm } from './elm/SweepElm.ts';

// The engine types loaders and runners need, so packages above elements need not depend on the
// engine directly (eslint.config.js dependency direction).
export { JavaRandom, Simulation, type CircuitNode } from '@circuitjs-next/engine';

// Views: drawing through the Painter interface (render implements it).
export * from './view/index.ts';

// Scopes: the model, drawing through ScopeGraphics (render implements it), and save format.
export * from './scope/constants.ts';
export {
  MIN_MAN_SCALE,
  Scope,
  getScaleUnitsText,
  nextHighestScale,
  type ScopeElementKinds,
  type ScopeRect,
} from './scope/Scope.ts';
export {
  CARD_GAP,
  cardHitTest,
  cardPlotRect,
  drawLeader,
  isMiniCard,
  leaderPath,
  plotName,
  type CardHit,
} from './scope/ScopeCardView.ts';
export type { ScopeGraphics, ScopeImage, ScopeInk, ScopeTextStyle } from './scope/ScopeGraphics.ts';
export {
  INFO_WIDTH,
  MAX_SCOPES,
  ScopeManager,
  defaultScopeElementKinds,
  scopesFor,
  type ScopeHost,
} from './scope/ScopeManager.ts';
export { SCOPE_ELM_DUMP_TYPE, ScopeElm, ScopeElmType } from './scope/ScopeElm.ts';
export { ScopePlot, V_POSITION_STEPS } from './scope/ScopePlot.ts';
export { ScopeSerializer, type ScopeDefaultsStore } from './scope/ScopeSerializer.ts';
export {
  TRIGGER_AUTO,
  TRIGGER_EDGE_FALLING,
  TRIGGER_EDGE_RISING,
  TRIGGER_FREERUN,
  TRIGGER_NORMAL,
} from './scope/ScopeTrigger.ts';
export { CrossSwitchElm, DPDTSwitchElm, MBBSwitchElm, Switch2Elm } from './elm/Switch2Elm.ts';
export { BusLogicInputElm, LogicInputElm, LogicOutputElm } from './elm/LogicInputElm.ts';
export { AnalogSwitch2Elm, AnalogSwitchElm } from './elm/AnalogSwitchElm.ts';
export {
  AndGateElm,
  GateElm,
  NandGateElm,
  NorGateElm,
  OrGateElm,
  XnorGateElm,
  XorGateElm,
  gateDefaults,
} from './elm/GateElm.ts';
export {
  DelayBufferElm,
  InverterElm,
  InvertingSchmittElm,
  SchmittElm,
  TriStateElm,
} from './elm/InverterElm.ts';
export { ChipElm, Pin, SIDE_E, SIDE_N, SIDE_S, SIDE_W } from './elm/ChipElm.ts';
export { DFlipFlopElm, JKFlipFlopElm, TFlipFlopElm } from './elm/FlipFlopElm.ts';
export { Counter2Elm, CounterElm, RingCounterElm, SeqGenElm } from './elm/CounterElm.ts';
export { LatchElm, PisoShiftElm, SipoShiftElm } from './elm/ShiftElm.ts';
export { DeMultiplexerElm, MultiplexerElm } from './elm/MultiplexerElm.ts';
export { FullAdderElm, HalfAdderElm } from './elm/AdderElm.ts';
export { DecimalDisplayElm, SevenSegDecoderElm, SevenSegElm } from './elm/SevenSegElm.ts';
export { BusSplitterElm, BusTransceiverElm } from './elm/BusElm.ts';
export { MonostableElm, PhaseCompElm, TimerElm, VCOElm } from './elm/TimerElm.ts';
export { ADCElm, DACElm } from './elm/ConverterElm.ts';
export { TransformerElm } from './elm/TransformerElm.ts';
export { TappedTransformerElm } from './elm/TappedTransformerElm.ts';
export { TransLineElm } from './elm/TransLineElm.ts';
export { RelayElm } from './elm/RelayElm.ts';
export { RelayCoilElm, RelayContactElm } from './elm/RelayCoilElm.ts';
export { JfetElm, NJfetElm, PJfetElm } from './elm/JfetElm.ts';
export { PolarCapacitorElm } from './elm/PolarCapacitorElm.ts';
export { VaractorElm } from './elm/VaractorElm.ts';
export { TunnelDiodeElm } from './elm/TunnelDiodeElm.ts';
export { MemristorElm } from './elm/MemristorElm.ts';
export { SparkGapElm } from './elm/SparkGapElm.ts';
export { LampElm } from './elm/LampElm.ts';
export { SCRElm } from './elm/SCRElm.ts';
export { TriacElm } from './elm/TriacElm.ts';
export { BoxElm, GraphicElm, LineElm } from './elm/GraphicElm.ts';
export { CompositeElm } from './elm/CompositeElm.ts';
export {
  CrystalElm,
  DarlingtonElm,
  NDarlingtonElm,
  NortonAmpElm,
  OTAElm,
  PDarlingtonElm,
} from './elm/compositeParts.ts';
export { CC2Elm, CC2NegElm } from './elm/CC2Elm.ts';
export { AudioOutputElm } from './elm/AudioOutputElm.ts';
export { CustomLogicElm } from './elm/CustomLogicElm.ts';
export { DataRecorderElm } from './elm/DataRecorderElm.ts';
export { RoutedWireElm } from './elm/RoutedWireElm.ts';
export { ROMElm, SRAMElm } from './elm/SRAMElm.ts';
export { InstructionDisplayElm } from './elm/InstructionDisplayElm.ts';
export {
  CustomCompositeChipElm,
  CustomCompositeElm,
  type SubcircuitHooks,
} from './elm/CustomCompositeElm.ts';
export {
  CustomCompositeModel,
  CustomCompositeModels,
  ExtListEntry,
} from './models/CustomCompositeModel.ts';
export { CCCSElm, CCVSElm, VCCSElm, VCVSElm } from './elm/VCCSElm.ts';
export { Expr, ExprParser, ExprState } from './Expr.ts';
export { DiacElm } from './elm/DiacElm.ts';
export { TriodeElm } from './elm/TriodeElm.ts';
export { AmmeterElm } from './elm/AmmeterElm.ts';
export { RelayModel, RelayModels } from './models/RelayModel.ts';
export {
  XmlElement,
  XmlParseError,
  escapeXml,
  parseXml,
  prettyPrint,
  type XmlText,
} from './xmldoc.ts';
export { AttrReader, AttrWriter } from './xmlattrs.ts';
export { LANGUAGES, LS, catalogLanguage, parseLocale, setLocalization } from './i18n.ts';
export { WireRouter, setRoutingBoundingBox } from './WireRouter.ts';
