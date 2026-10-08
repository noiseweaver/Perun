// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/FFT.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

/**
 * Radix-2 decimation-in-time FFT with an optional sine window. Based on Douglas L. Jones's
 * (University of Illinois at Urbana-Champaign, 1992) algorithm, as upstream.
 */
export class FFT {
  private readonly size: number;
  private readonly bits: number;
  private readonly cosTable: Float64Array;
  private readonly sinTable: Float64Array;
  private readonly winTable: Float64Array;

  constructor(n: number) {
    this.size = n;
    this.bits = Math.trunc(Math.log(n) / Math.log(2));
    this.cosTable = new Float64Array(Math.trunc(n / 2));
    this.sinTable = new Float64Array(Math.trunc(n / 2));
    const dtheta = (-2 * Math.PI) / n;
    for (let i = 0; i < this.cosTable.length; i++) {
      this.cosTable[i] = Math.cos(dtheta * i);
      this.sinTable[i] = Math.sin(dtheta * i);
    }
    // scale the sine window up for unity gain
    const gainCompensation = 1.5707963267961471;
    this.winTable = new Float64Array(n);
    for (let i = 0; i < n; i++) this.winTable[i] = Math.sin((i * Math.PI) / n) * gainCompensation;
  }

  fft(real: Float64Array, imag: Float64Array, windowed: boolean): void {
    if (windowed) {
      for (let i = 0; i < real.length; i++) {
        real[i] *= this.winTable[i];
        imag[i] *= this.winTable[i];
      }
    }
    let j = 0;
    let n2 = Math.trunc(real.length / 2);
    for (let i = 1; i < real.length - 1; i++) {
      let n1 = n2;
      while (j >= n1) {
        j -= n1;
        n1 = Math.trunc(n1 / 2);
      }
      j += n1;
      if (i < j) {
        let t1 = real[i];
        real[i] = real[j];
        real[j] = t1;
        t1 = imag[i];
        imag[i] = imag[j];
        imag[j] = t1;
      }
    }
    n2 = 1;
    for (let i = 0; i < this.bits; i++) {
      const n1 = n2;
      n2 <<= 1;
      let a = 0;
      for (j = 0; j < n1; j++) {
        const c = this.cosTable[a];
        const s = this.sinTable[a];
        a += 1 << (this.bits - i - 1);
        for (let k = j; k < real.length; k += n2) {
          const t = k + n1;
          const t1 = c * real[t] - s * imag[t];
          const t2 = s * real[t] + c * imag[t];
          real[k + n1] = real[k] - t1;
          imag[k + n1] = imag[k] - t2;
          real[k] += t1;
          imag[k] += t2;
        }
      }
    }
  }

  getSize(): number {
    return this.size;
  }

  magnitude(real: number, imag: number): number {
    return Math.sqrt(real * real + imag * imag) / this.size;
  }
}
