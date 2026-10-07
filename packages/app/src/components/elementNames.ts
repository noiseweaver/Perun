// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { LabeledNodeElm, type CircuitElm } from '@circuitjs-next/elements';
import { t } from '../i18n.ts';

/** "Resistor 2", "Labeled Node "out"": a name to pick an element by in a list. */
export function elementNames(els: readonly CircuitElm[]): Map<CircuitElm, string> {
  const kinds = new Map<string, CircuitElm[]>();
  for (const e of els) {
    const k = t(e.getDialogTitle().replace(/^Edit /, ''));
    const list = kinds.get(k) ?? [];
    list.push(e);
    kinds.set(k, list);
  }
  const names = new Map<CircuitElm, string>();
  for (const [k, list] of kinds) {
    list.forEach((e, i) => {
      if (e instanceof LabeledNodeElm) names.set(e, `${k} "${e.text}"`);
      else names.set(e, list.length > 1 ? `${k} ${i + 1}` : k);
    });
  }
  return names;
}
