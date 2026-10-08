// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors
// Groups, names and order follow CircuitJS1 Menus.composeMainMenu
// (src/com/lushprojects/circuitjs1/client/Menus.java, master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.

import { Simulation, constructElement } from '@perun/elements';
import { tItem } from '../i18n.ts';

export interface PaletteItem {
  /** Upstream class name, as `constructElement` takes it. */
  className: string;
  /** Upstream menu text without "Add ". */
  label: string;
  /** Extra words the search matches. */
  keywords: string;
  /** Key that selects it (upstream `getShortcut()`), or null. */
  shortcut: string | null;
}

export interface PaletteGroup {
  title: string;
  items: PaletteItem[];
}

/**
 * The whole upstream menu. Items whose class is not ported yet are left out of the palette
 * (`paletteGroups` skips classes `constructElement` does not know).
 */
const GROUPS: [string, [string, string, string?][]][] = [
  [
    'Basic',
    [
      ['WireElm', 'Wire', 'connection line'],
      ['RoutedWireElm', 'Routed Wire', 'connection auto route'],
      ['ResistorElm', 'Resistor', 'ohm'],
      ['GroundElm', 'Ground', 'earth'],
    ],
  ],
  [
    'Passive Components',
    [
      ['CapacitorElm', 'Capacitor', 'farad'],
      ['PolarCapacitorElm', 'Capacitor (polarized)', 'electrolytic farad'],
      ['InductorElm', 'Inductor', 'coil henry'],
      ['SwitchElm', 'Switch', 'spst toggle'],
      ['PushSwitchElm', 'Push Switch', 'button momentary'],
      ['Switch2Elm', 'SPDT Switch', 'toggle changeover throw'],
      ['DPDTSwitchElm', 'DPDT Switch', 'toggle double pole'],
      ['MBBSwitchElm', 'Make-Before-Break Switch', 'toggle'],
      ['PotElm', 'Potentiometer', 'variable resistor pot'],
      ['TransformerElm', 'Transformer', 'coil winding'],
      ['TappedTransformerElm', 'Tapped Transformer', 'center tap coil winding'],
      ['CustomTransformerElm', 'Custom Transformer', 'coil winding'],
      ['TransLineElm', 'Transmission Line', 'coax cable delay'],
      ['RelayElm', 'Relay', 'coil contact'],
      ['RelayCoilElm', 'Relay Coil', 'coil'],
      ['RelayContactElm', 'Relay Contact', 'contact'],
      ['LDRElm', 'Photoresistor', 'ldr light'],
      ['ThermistorNTCElm', 'Thermistor', 'ntc temperature'],
      ['MemristorElm', 'Memristor', ''],
      ['SparkGapElm', 'Spark Gap', 'arc'],
      ['FuseElm', 'Fuse', 'protection'],
      ['CrystalElm', 'Crystal', 'quartz oscillator'],
      ['CrossSwitchElm', 'Cross Switch', 'reversing'],
      ['GyratorElm', 'Gyrator', ''],
    ],
  ],
  [
    'Inputs and Sources',
    [
      ['DCVoltageElm', 'Voltage Source (2-terminal)', 'dc battery supply'],
      ['ACVoltageElm', 'A/C Voltage Source (2-terminal)', 'ac sine generator'],
      ['RailElm', 'Voltage Source (1-terminal)', 'rail vcc supply'],
      ['ACRailElm', 'A/C Voltage Source (1-terminal)', 'ac rail sine'],
      ['SquareRailElm', 'Square Wave Source (1-terminal)', 'pulse rail'],
      ['ClockElm', 'Clock', 'square pulse'],
      ['SweepElm', 'A/C Sweep', 'chirp frequency'],
      ['BatteryElm', 'Battery', 'cell'],
      ['VarRailElm', 'Variable Voltage', 'slider adjustable rail'],
      ['AntennaElm', 'Antenna', 'radio'],
      ['AMElm', 'AM Source', 'modulation radio'],
      ['FMElm', 'FM Source', 'modulation radio'],
      ['CurrentElm', 'Current Source', 'amp'],
      ['NoiseElm', 'Noise Generator', 'random'],
      ['AudioInputElm', 'Audio Input', 'sound file wav'],
      ['DataInputElm', 'Data Input', 'file samples'],
      ['ExtVoltageElm', 'External Voltage (JavaScript)', 'api'],
    ],
  ],
  [
    'Outputs and Labels',
    [
      ['OutputElm', 'Analog Output', 'voltage display'],
      ['LEDElm', 'LED', 'light emitting diode'],
      ['LampElm', 'Lamp', 'bulb light'],
      ['TextElm', 'Text', 'label note'],
      ['BoxElm', 'Box', 'rectangle frame'],
      ['LineElm', 'Line', 'graphic'],
      ['LabeledNodeElm', 'Labeled Node', 'net name label'],
      ['ProbeElm', 'Voltmeter/Scope Probe', 'meter probe measure'],
      ['OhmMeterElm', 'Ohmmeter', 'resistance meter'],
      ['AmmeterElm', 'Ammeter', 'current meter'],
      ['WattmeterTrueElm', 'Wattmeter', 'power meter'],
      ['TestPointElm', 'Test Point', 'measure'],
      ['DecimalDisplayElm', 'Decimal Display', 'number'],
      ['InstructionDisplayElm', 'Instruction Display', ''],
      ['LEDArrayElm', 'LED Array', 'matrix'],
      ['DataRecorderElm', 'Data Export', 'recorder'],
      ['AudioOutputElm', 'Audio Output', 'sound speaker'],
      ['StopTriggerElm', 'Stop Trigger', 'halt'],
      ['DCMotorElm', 'DC Motor', ''],
      ['ThreePhaseMotorElm', '3-Phase Motor', 'induction'],
      ['WattmeterElm', 'Wattmeter (old)', 'power meter'],
    ],
  ],
  [
    'Active Components',
    [
      ['DiodeElm', 'Diode', 'rectifier'],
      ['ZenerElm', 'Zener Diode', 'regulator'],
      ['NTransistorElm', 'Transistor (bipolar, NPN)', 'bjt npn'],
      ['PTransistorElm', 'Transistor (bipolar, PNP)', 'bjt pnp'],
      ['NMosfetElm', 'MOSFET (N-Channel)', 'fet nmos'],
      ['PMosfetElm', 'MOSFET (P-Channel)', 'fet pmos'],
      ['NJfetElm', 'JFET (N-Channel)', 'fet'],
      ['PJfetElm', 'JFET (P-Channel)', 'fet'],
      ['SCRElm', 'SCR', 'thyristor'],
      ['DiacElm', 'DIAC', ''],
      ['TriacElm', 'TRIAC', ''],
      ['NDarlingtonElm', 'Darlington Pair (NPN)', 'transistor'],
      ['PDarlingtonElm', 'Darlington Pair (PNP)', 'transistor'],
      ['VaractorElm', 'Varactor/Varicap', 'diode capacitance'],
      ['TunnelDiodeElm', 'Tunnel Diode', ''],
      ['TriodeElm', 'Triode', 'tube valve'],
      ['UnijunctionElm', 'Unijunction Transistor', 'ujt'],
    ],
  ],
  [
    'Active Building Blocks',
    [
      ['OpAmpElm', 'Op Amp (ideal, - on top)', 'opamp amplifier'],
      ['OpAmpSwapElm', 'Op Amp (ideal, + on top)', 'opamp amplifier'],
      ['OpAmpRealElm', 'Op Amp (real)', 'opamp amplifier lm741 lm324'],
      ['AnalogSwitchElm', 'Analog Switch (SPST)', 'cmos'],
      ['AnalogSwitch2Elm', 'Analog Switch (SPDT)', 'cmos'],
      ['AnalogMuxElm', 'Analog Multiplexer', 'mux'],
      ['TriStateElm', 'Tristate Buffer', 'three state'],
      ['SchmittElm', 'Schmitt Trigger', 'hysteresis'],
      ['InvertingSchmittElm', 'Schmitt Trigger (Inverting)', 'hysteresis'],
      ['DelayBufferElm', 'Delay Buffer', ''],
      ['CC2Elm', 'CCII+', 'current conveyor'],
      ['CC2NegElm', 'CCII-', 'current conveyor'],
      ['ComparatorElm', 'Comparator (Hi-Z/GND output)', 'open collector'],
      ['OTAElm', 'OTA (LM13700 style)', 'transconductance'],
      ['NortonAmpElm', 'Norton Amp (LM3900)', ''],
      ['VCVSElm', 'Voltage-Controlled Voltage Source (VCVS)', 'dependent expression'],
      ['VCCSElm', 'Voltage-Controlled Current Source (VCCS)', 'dependent expression'],
      ['CCVSElm', 'Current-Controlled Voltage Source (CCVS)', 'dependent expression'],
      ['CCCSElm', 'Current-Controlled Current Source (CCCS)', 'dependent expression'],
      ['OptocouplerElm', 'Optocoupler', 'opto isolator'],
      ['TimeDelayRelayElm', 'Time Delay Relay', 'timer'],
      ['CustomCompositeElm:~LM317-v2', 'LM317', 'regulator'],
      ['CustomCompositeElm:~TL431', 'TL431', 'shunt reference'],
      ['MotorProtectionSwitchElm', 'Motor Protection Switch', 'breaker'],
      ['CustomCompositeElm', 'Subcircuit Instance', 'subcircuit'],
    ],
  ],
  [
    'Logic Gates, Input and Output',
    [
      ['LogicInputElm', 'Logic Input', 'switch high low'],
      ['LogicOutputElm', 'Logic Output', 'indicator'],
      ['BusLogicInputElm', 'Bus Input', 'binary'],
      ['InverterElm', 'Inverter', 'not gate'],
      ['NandGateElm', 'NAND Gate', ''],
      ['NorGateElm', 'NOR Gate', ''],
      ['AndGateElm', 'AND Gate', ''],
      ['OrGateElm', 'OR Gate', ''],
      ['XorGateElm', 'XOR Gate', 'exclusive'],
      ['XnorGateElm', 'XNOR Gate', 'exclusive'],
    ],
  ],
  [
    'Digital Chips',
    [
      ['DFlipFlopElm', 'D Flip-Flop', 'latch'],
      ['JKFlipFlopElm', 'JK Flip-Flop', ''],
      ['TFlipFlopElm', 'T Flip-Flop', 'toggle'],
      ['SevenSegElm', '7 Segment LED', 'display'],
      ['SevenSegDecoderElm', '7 Segment Decoder', 'bcd'],
      ['MultiplexerElm', 'Multiplexer', 'mux'],
      ['DeMultiplexerElm', 'Demultiplexer', 'demux'],
      ['SipoShiftElm', 'SIPO shift register', ''],
      ['PisoShiftElm', 'PISO shift register', ''],
      ['CounterElm', 'Counter', 'binary'],
      ['Counter2Elm', 'Counter w/ Load', 'binary'],
      ['DecadeElm', 'Ring Counter', 'decade johnson'],
      ['LatchElm', 'Latch/Register', ''],
      ['SeqGenElm', 'Sequence generator', ''],
      ['FullAdderElm', 'Adder', 'full'],
      ['HalfAdderElm', 'Half Adder', ''],
      ['UserDefinedLogicElm', 'Custom Logic', 'truth table'],
      ['SRAMElm', 'Static RAM', 'memory'],
      ['ROMElm', 'ROM', 'memory'],
      ['BusTransceiverElm', 'Bus Transceiver', ''],
      ['BusSplitterElm', 'Bus Splitter', ''],
    ],
  ],
  [
    'Analog and Hybrid Chips',
    [
      ['TimerElm', '555 Timer', 'ne555'],
      ['PhaseCompElm', 'Phase Comparator', 'pll'],
      ['DACElm', 'DAC', 'digital analog converter'],
      ['ADCElm', 'ADC', 'analog digital converter'],
      ['VCOElm', 'VCO', 'oscillator'],
      ['MonostableElm', 'Monostable', 'one shot'],
    ],
  ],
];

let groups: PaletteGroup[] | null = null;

/** The palette, with each element's upstream shortcut key. */
export function paletteGroups(): PaletteGroup[] {
  if (groups !== null) return groups;
  const sim = new Simulation();
  groups = GROUPS.map(([title, items]) => ({
    title,
    items: items.flatMap(([className, label, keywords]) => {
      const sample = constructElement(className, 0, 0, sim);
      if (sample === null) return [];
      const code = sample.getShortcut();
      return [
        {
          className,
          label,
          keywords: keywords ?? '',
          shortcut: code > 0 ? String.fromCharCode(code) : null,
        },
      ];
    }),
  })).filter((g) => g.items.length > 0);
  return groups;
}

export function paletteItem(className: string): PaletteItem | undefined {
  for (const g of paletteGroups())
    for (const it of g.items) if (it.className === className) return it;
  return undefined;
}

/** Shortcut key (case sensitive, as upstream) to class name. */
export function shortcutMap(): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of paletteGroups())
    for (const it of g.items)
      if (it.shortcut !== null && !m.has(it.shortcut)) m.set(it.shortcut, it.className);
  return m;
}

/** Items whose name or keywords contain every word of the query. */
export function searchPalette(query: string): PaletteGroup[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return paletteGroups();
  return paletteGroups()
    .map((g) => ({
      title: g.title,
      items: g.items.filter((it) => {
        // English and the shown language both match
        const hay = `${it.label} ${tItem(it.label)} ${it.keywords} ${it.className}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      }),
    }))
    .filter((g) => g.items.length > 0);
}
