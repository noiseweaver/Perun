// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/CustomLogicModel.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { EditInfo } from '../edit/EditInfo.ts';
import { escapeToken, unescapeToken } from '../escape.ts';
import { javaSplit, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import type { XmlAttrReader, XmlDocWriter } from '../xml.ts';

/** A custom logic chip's definition: pin names and a truth table of rules. */
export class CustomLogicModel {
  static readonly FLAG_SCHMITT = 1;

  flags = 0;
  name = '';
  inputs: string[] = listToArray('A,B');
  outputs: string[] = listToArray('C,D');
  infoText = '';
  rules = '';
  rulesLeft: string[] = [];
  rulesRight: string[] = [];
  dumped = false;
  triState = false;

  static copyOf(copy: CustomLogicModel): CustomLogicModel {
    const m = new CustomLogicModel();
    m.flags = copy.flags;
    m.inputs = copy.inputs;
    m.outputs = copy.outputs;
    m.infoText = copy.infoText;
    m.rules = copy.rules;
    m.rulesLeft = copy.rulesLeft;
    m.rulesRight = copy.rulesRight;
    return m;
  }

  undump(st: StringTokenizer): void {
    this.flags = parseJavaInt(st.nextToken());
    this.inputs = listToArray(unescapeToken(st.nextToken()));
    this.outputs = listToArray(unescapeToken(st.nextToken()));
    this.infoText = unescapeToken(st.nextToken());
    this.rules = unescapeToken(st.nextToken());
    this.parseRules(null);
  }

  undumpXml(r: XmlAttrReader): void {
    this.flags = r.parseIntAttr('f', this.flags);
    this.inputs = listToArray(r.parseStringAttr('in', null) ?? '');
    this.outputs = listToArray(r.parseStringAttr('o', null) ?? '');
    this.infoText = r.parseStringAttr('if', null) ?? '';
    this.rules = (r.parseContents() ?? '').trim();
    this.parseRules(null);
  }

  /** The text-format line (upstream's dump(), for old-format saves). */
  dump(): string {
    return [
      '!',
      escapeToken(this.name),
      this.flags,
      escapeToken(arrayToList(this.inputs)),
      escapeToken(arrayToList(this.outputs)),
      escapeToken(this.infoText),
      escapeToken(this.rules),
    ].join(' ');
  }

  dumpXml(doc: XmlDocWriter): void {
    this.dumped = true;
    const w = doc.addElement('clm');
    w.dumpAttr('nm', this.name);
    w.dumpAttr('f', this.flags);
    w.dumpAttr('in', arrayToList(this.inputs));
    w.dumpAttr('o', arrayToList(this.outputs));
    w.dumpAttr('if', this.infoText);
    w.appendText(this.rules);
  }

  getDialogTitle(): string {
    return 'Edit Custom Logic Model';
  }

  getEditInfo(n: number): EditInfo | null {
    if (n === 0) return EditInfo.text('Inputs', arrayToList(this.inputs));
    if (n === 1) return EditInfo.text('Outputs', arrayToList(this.outputs));
    if (n === 2) return EditInfo.text('Info Text', this.infoText);
    if (n === 3) {
      const ei = EditInfo.text(EditInfo.makeLink('customlogic.html', 'Definition'), this.rules);
      ei.setErrorFieldName('Definition');
      ei.multiline = true;
      return ei;
    }
    // upstream's Schmitt checkbox is not implemented there either
    return null;
  }

  /** Set a field; the caller then rebuilds every element using this model (updateModels). */
  setEditValue(n: number, ei: EditInfo): void {
    if (n === 0) this.inputs = listToArray(ei.text ?? '');
    if (n === 1) this.outputs = listToArray(ei.text ?? '');
    if (n === 2) this.infoText = ei.text ?? '';
    if (n === 3) {
      this.rules = ei.text ?? '';
      this.parseRules(ei);
    }
  }

  parseRules(ei: EditInfo | null): void {
    const lines = javaSplit(this.rules, '\n');
    this.rulesLeft = [];
    this.rulesRight = [];
    this.triState = false;
    for (let i = 0; i !== lines.length; i++) {
      const s = lines[i].toLowerCase().trim();
      if (s.length === 0 || s.startsWith('#')) continue;
      const s0 = javaSplit(s.replace(/ /g, ''), '=');
      if (s0.length !== 2) {
        ei?.setError('error on line ' + (i + 1));
        return;
      }
      if (s0[0].length < this.inputs.length) {
        ei?.setError(
          'must have >= ' + this.inputs.length + ' digits on left side (line ' + (i + 1) + ')',
        );
        return;
      }
      if (s0[0].length > this.inputs.length + this.outputs.length) {
        ei?.setError(
          'must have <= ' +
            (this.inputs.length + this.outputs.length) +
            ' digits on left side (line ' +
            (i + 1) +
            ')',
        );
        return;
      }
      if (s0[1].length !== this.outputs.length) {
        ei?.setError(
          'must have ' + this.outputs.length + ' digits on right side (line ' + (i + 1) + ')',
        );
        return;
      }
      const rl = s0[0];
      const used = new Array<boolean>(26).fill(false);
      let newRl = '';
      for (const x of rl) {
        if (x === '?' || x === '+' || x === '-' || x === '0' || x === '1') {
          newRl += x;
          continue;
        }
        if (x < 'a' || x > 'z') {
          ei?.setError('error on line ' + (i + 1));
          return;
        }
        // a letter seen before is capitalized, so the two can be compared
        const k = x.charCodeAt(0) - 97;
        if (used[k]) {
          newRl += x.toUpperCase();
          continue;
        }
        used[k] = true;
        newRl += x;
      }
      if (s0[1].includes('_')) this.triState = true;
      this.rulesLeft.push(newRl);
      this.rulesRight.push(s0[1]);
    }
  }
}

function arrayToList(arr: string[]): string {
  return arr.join(',');
}

function listToArray(s: string): string[] {
  return javaSplit(s, ',');
}

/** The custom logic models a circuit can use (upstream's static modelMap). */
export class CustomLogicModels {
  readonly modelMap = new Map<string, CustomLogicModel>();
  /** Upstream `CustomLogicElm.lastModelName`: the model for new chips. */
  lastModelName = 'default';

  getModelWithName(name: string): CustomLogicModel {
    let lm = this.modelMap.get(name);
    if (lm !== undefined) return lm;
    lm = new CustomLogicModel();
    lm.name = name;
    lm.infoText = name === 'default' ? 'custom logic' : name;
    this.modelMap.set(name, lm);
    return lm;
  }

  getModelWithNameOrCopy(name: string, oldmodel: CustomLogicModel | null): CustomLogicModel {
    let lm = this.modelMap.get(name);
    if (lm !== undefined) return lm;
    // upstream throws here (a null copy): the element fails to load
    if (oldmodel === null) throw new Error('custom logic model not found: ' + name);
    lm = CustomLogicModel.copyOf(oldmodel);
    lm.name = name;
    lm.infoText = name;
    this.modelMap.set(name, lm);
    return lm;
  }

  clearDumpedFlags(): void {
    for (const m of this.modelMap.values()) m.dumped = false;
  }

  /** A text-format `!` line, after the `!`. */
  undumpModel(st: StringTokenizer): void {
    const name = unescapeToken(st.nextToken());
    this.getModelWithName(name).undump(st);
  }

  undumpModelXml(r: XmlAttrReader): void {
    const name = r.parseStringAttr('nm', null) ?? 'null';
    this.getModelWithName(name).undumpXml(r);
  }
}
