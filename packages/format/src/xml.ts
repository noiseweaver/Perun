// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

// The XML document model lives in @perun/elements (subcircuit models need it there).
export {
  XmlElement,
  XmlParseError,
  escapeXml,
  parseXml,
  prettyPrint,
  type XmlText,
} from '@perun/elements';
