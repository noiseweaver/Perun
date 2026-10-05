// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/AudioInputElm.java and
// DataInputElm.java (master) at 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { elementType } from '../CircuitElm.ts';
import { EditInfo } from '../edit/EditInfo.ts';
import { parseJavaDouble, parseJavaInt } from '../java.ts';
import type { StringTokenizer } from '../StringTokenizer.ts';
import { getUnitText, getVoltageText } from '../view/units.ts';
import type { XmlAttrReader, XmlAttrWriter } from '../xml.ts';
import { RailElm } from './RailElm.ts';
import { VoltageElm } from './VoltageElm.ts';

interface AudioFileEntry {
  fileName: string | null;
  data: ArrayLike<number>;
  samplingRate: number;
}

interface DataFileEntry {
  fileName: string | null;
  data: number[];
}

/**
 * File contents are not saved in the circuit (they would be huge); a file number in the save
 * finds them again after cut and paste or undo. Upstream keeps these maps static too.
 */
const audioFileMap = new Map<number, AudioFileEntry>();
let audioFileNumCounter = 1;
const dataFileMap = new Map<number, DataFileEntry>();
let dataFileNumCounter = 1;
/** Upstream `AudioInputElm.lastSamplingRate`: the rate of the last file loaded. */
let lastSamplingRate = 0;

/** Plays the first channel of an audio file as a voltage. */
export class AudioInputElm extends RailElm {
  data: ArrayLike<number> | null = null;
  timeOffset = 0;
  samplingRate = 0;
  fileNum = 0;
  fileName: string | null = null;
  /** Upstream declares its own `maxVoltage`, hiding VoltageElm's; this is that field. */
  audioMaxVoltage = 5;
  startPosition = 0;

  override getClassName(): string {
    return 'AudioInputElm';
  }
  override getDumpType(): number {
    return 411;
  }
  override getXmlDumpType(): string {
    return 'ain';
  }

  override initNew(): void {
    this.initWaveform(VoltageElm.WF_AC);
    this.audioMaxVoltage = 5;
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.waveform = VoltageElm.WF_AC;
    this.audioMaxVoltage = parseJavaDouble(st.nextToken());
    this.startPosition = parseJavaDouble(st.nextToken());
    this.fileNum = parseJavaInt(st.nextToken());
    this.lookupFileNumber();
    this.samplingRate = lastSamplingRate;
  }

  private genFileNumber(): void {
    if (this.data === null) return;
    if (this.fileNum === 0) this.fileNum = audioFileNumCounter++;
    audioFileMap.set(this.fileNum, {
      fileName: this.fileName,
      data: this.data,
      samplingRate: this.samplingRate,
    });
  }

  private lookupFileNumber(): void {
    const ent = audioFileMap.get(this.fileNum);
    if (ent !== undefined) {
      this.fileName = ent.fileName;
      this.data = ent.data;
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('ma', this.audioMaxVoltage);
    w.dumpAttr('st', this.startPosition);
    this.genFileNumber();
    w.dumpAttr('fi', this.fileNum);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.audioMaxVoltage = r.parseDoubleAttr('ma', this.audioMaxVoltage);
    this.startPosition = r.parseDoubleAttr('st', this.startPosition);
    this.fileNum = r.parseIntAttr('fi', this.fileNum);
    this.lookupFileNumber();
    this.samplingRate = lastSamplingRate;
  }

  override reset(): void {
    super.reset();
    this.timeOffset = this.startPosition;
  }

  override getRailText(): string {
    return this.fileName ?? 'No file';
  }
  override railLabel(): string {
    return this.getRailText();
  }

  override getVoltage(): number {
    const data = this.data;
    if (data === null) return 0;
    if (this.timeOffset < this.startPosition) this.timeOffset = this.startPosition;
    const dptr = this.timeOffset * this.samplingRate;
    const iptr = Math.trunc(dptr);
    const frac = dptr - iptr;
    if (iptr >= data.length) return 0;
    const value1 = data[iptr] ?? 0;
    const value2 = iptr + 1 < data.length ? (data[iptr + 1] ?? 0) : 0;
    return (value1 * (1 - frac) + value2 * frac) * this.audioMaxVoltage;
  }

  override stepFinished(): void {
    this.timeOffset += this.sim.timeStep;
  }

  /** A decoded file arrived (upstream `gotAudioData`). */
  setAudioData(fileName: string, data: ArrayLike<number>, samplingRate: number): void {
    this.fileName = fileName;
    this.samplingRate = samplingRate;
    this.data = data;
    lastSamplingRate = samplingRate;
  }

  override getShortcut(): number {
    return 0;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0)
      return EditInfo.createFile({
        kind: 'audio',
        accept: 'audio/*',
        onLoad: (name, samples, rate) =>
          this.setAudioData(name.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, ''), samples, rate),
      });
    if (n === 1) return new EditInfo('Max Voltage', this.audioMaxVoltage).setUnitStep();
    if (n === 2) return new EditInfo('Start Position (s)', this.startPosition);
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 1) this.audioMaxVoltage = ei.value;
    if (n === 2) this.startPosition = ei.value;
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'audio input';
    const data = this.data;
    if (data === null) {
      arr[1] = 'no file loaded';
      return;
    }
    arr[1] = 'V = ' + getVoltageText(this.volts[0]);
    arr[2] = 'pos = ' + getUnitText(this.timeOffset, 's');
    arr[3] = 'dur = ' + getUnitText(data.length / this.samplingRate, 's');
  }
}

/** Plays a text file of voltages, one per line, each held for the sample length. */
export class DataInputElm extends RailElm {
  static readonly FLAG_REPEAT = 1 << 8;

  data: number[] | null = null;
  sampleLength = 1e-3;
  scaleFactor = 1;
  timeOffset = 0;
  fileNum = 0;
  fileName: string | null = null;
  /** The last file's parse problem, for the UI to show (upstream alerts). */
  loadError: string | null = null;

  override getClassName(): string {
    return 'DataInputElm';
  }
  override getDumpType(): number {
    return 424;
  }

  override initNew(): void {
    this.initWaveform(VoltageElm.WF_AC);
    this.scaleFactor = 1;
    this.sampleLength = 1e-3;
  }

  override undump(st: StringTokenizer): void {
    super.undump(st);
    this.waveform = VoltageElm.WF_AC;
    this.sampleLength = parseJavaDouble(st.nextToken());
    this.scaleFactor = parseJavaDouble(st.nextToken());
    this.fileNum = parseJavaInt(st.nextToken());
    this.lookupFileNumber();
  }

  private lookupFileNumber(): void {
    const ent = dataFileMap.get(this.fileNum);
    if (ent !== undefined) {
      this.fileName = ent.fileName;
      this.data = ent.data;
    }
  }

  override dumpXml(w: XmlAttrWriter): void {
    super.dumpXml(w);
    w.dumpAttr('sl', this.sampleLength);
    w.dumpAttr('sf', this.scaleFactor);
  }

  override dumpXmlState(w: XmlAttrWriter): void {
    if (this.data === null) return;
    if (this.fileNum === 0) this.fileNum = dataFileNumCounter++;
    dataFileMap.set(this.fileNum, { fileName: this.fileName, data: this.data });
    w.dumpAttr('fn', this.fileNum);
  }

  override undumpXml(r: XmlAttrReader): void {
    super.undumpXml(r);
    this.sampleLength = r.parseDoubleAttr('sl', this.sampleLength);
    this.scaleFactor = r.parseDoubleAttr('sf', this.scaleFactor);
    this.fileNum = r.parseIntAttr('fn', 0);
    this.lookupFileNumber();
  }

  override reset(): void {
    super.reset();
    this.timeOffset = 0;
  }

  override getRailText(): string {
    return this.fileName ?? 'No file';
  }
  override railLabel(): string {
    return this.getRailText();
  }

  doesRepeat(): boolean {
    return (this.flags & DataInputElm.FLAG_REPEAT) !== 0;
  }

  override getVoltage(): number {
    const data = this.data;
    if (data === null || data.length === 0) return 0;
    let ptr = Math.trunc(this.timeOffset / this.sampleLength);
    if (ptr < 0) ptr = 0;
    if (ptr >= data.length) {
      if (this.doesRepeat()) {
        ptr = 0;
        this.timeOffset = 0;
      } else ptr = data.length - 1;
    }
    return (data[ptr] ?? 0) * this.scaleFactor;
  }

  override stepFinished(): void {
    this.timeOffset += this.sim.timeStep;
  }

  /** Parse a data file: one voltage per line, blank lines and # comments skipped. */
  loadText(fileName: string, s: string): void {
    this.fileName = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
    const data: number[] = [];
    let parseError = false;
    for (const line of s.split(/\r*\n/)) {
      if (line.length === 0 || line.startsWith('#')) continue;
      try {
        data.push(parseJavaDouble(line));
      } catch {
        parseError = true;
      }
    }
    this.data = data;
    this.loadError =
      data.length === 0 || parseError
        ? (parseError ? 'Error parsing data file.' : 'No data found in file.') +
          ' Expected one numeric voltage value per line; lines starting with # are comments.'
        : null;
  }

  override getShortcut(): number {
    return 0;
  }

  override getEditInfo(n: number): EditInfo | null {
    if (n === 0)
      return EditInfo.createFile({
        kind: 'text',
        accept: '.txt,.csv,.dat,text/plain',
        onLoad: (name, text) => this.loadText(name, text),
      });
    if (n === 1) return new EditInfo('Scale Factor', this.scaleFactor);
    if (n === 2) return new EditInfo('Sample Length (s)', this.sampleLength);
    if (n === 3) return EditInfo.createCheckbox('Repeat', this.doesRepeat());
    return null;
  }

  override setEditValue(n: number, ei: EditInfo): void {
    if (n === 1) this.scaleFactor = ei.value;
    if (n === 2) this.sampleLength = ei.value;
    if (n === 3) this.flags = ei.changeFlag(this.flags, DataInputElm.FLAG_REPEAT);
  }

  override getInfo(arr: string[]): void {
    arr[0] = 'data input';
    const data = this.data;
    if (data === null) {
      arr[1] = 'no file loaded';
      return;
    }
    arr[1] = 'V = ' + getVoltageText(this.volts[0]);
    arr[2] = 'pos = ' + getUnitText(this.timeOffset, 's');
    arr[3] = 'dur = ' + getUnitText(data.length * this.sampleLength, 's');
  }
}

export const AudioInputElmType = elementType('AudioInputElm', AudioInputElm);
export const DataInputElmType = elementType('DataInputElm', DataInputElm);
