// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

export { AttrReader, AttrWriter } from './attrs.ts';
export { JavaRandom } from '@circuitjs-next/elements';
export {
  Circuit,
  OptionFlag,
  getCircuitAsComposite,
  isSupportedElementTag,
  readCircuit,
  type CircuitOptions,
  type CompositeResult,
  type Hint,
} from './circuit.ts';
export {
  runCircuit,
  type RunElementInfo,
  type RunElementSample,
  type RunResult,
  type RunSample,
  type RunSettings,
} from './runner.ts';
export {
  XmlElement,
  XmlParseError,
  escapeXml,
  parseXml,
  prettyPrint,
  type XmlText,
} from './xml.ts';
export {
  compressCircuit,
  decompressCircuit,
  parseQuery,
  queryBoolean,
  startCircuitFromQuery,
  type StartCircuit,
} from './url.ts';
