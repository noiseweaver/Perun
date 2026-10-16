// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import { JavaRandom } from './JavaRandom.ts';
import { invertMatrix, luFactorDense, luFactorDenseFull, luSolveDense } from './lu.ts';
import { DMatrixSparseCSC } from './sparse/DMatrixSparseCSC.ts';
import { SparseLU } from './sparse/SparseLU.ts';

describe('JavaRandom', () => {
  it('matches java.util.Random', () => {
    // Values printed by OpenJDK: new Random(42).nextInt(), then .nextDouble() on a fresh one.
    expect(new JavaRandom(42).nextInt()).toBe(-1170105035);
    expect(new JavaRandom(42).nextDouble()).toBe(0.7275636800328681);
    expect(new JavaRandom(0).nextInt()).toBe(-1155484576);
  });
});

describe('dense LU', () => {
  it('solves a pivoting system', () => {
    const a = [
      [0, 2, 1],
      [1, 1, 0],
      [2, 0, 3],
    ];
    const ipvt = [0, 0, 0];
    expect(luFactorDense(a, 3, ipvt)).toBe(true);
    const b = [7, 3, 11];
    luSolveDense(a, 3, ipvt, b);
    expect(b[0]).toBeCloseTo(1, 12);
    expect(b[1]).toBeCloseTo(2, 12);
    expect(b[2]).toBeCloseTo(3, 12);
  });

  it('reports a singular matrix', () => {
    expect(
      luFactorDense(
        [
          [1, 2],
          [2, 4],
        ],
        2,
        [0, 0],
      ),
    ).toBe(false);
    expect(
      luFactorDense(
        [
          [0, 0],
          [1, 1],
        ],
        2,
        [0, 0],
      ),
    ).toBe(false);
  });

  it('inverts', () => {
    const a = [
      [4, 7],
      [2, 6],
    ];
    invertMatrix(a, 2);
    expect(a[0][0]).toBeCloseTo(0.6, 12);
    expect(a[0][1]).toBeCloseTo(-0.7, 12);
    expect(a[1][0]).toBeCloseTo(-0.2, 12);
    expect(a[1][1]).toBeCloseTo(0.4, 12);
  });
});

describe('dense LU skipping zeros', () => {
  /** A random matrix shaped like a circuit's: a few nonzeros per row, some exact 0 and -0. */
  function randomMatrix(rnd: JavaRandom, n: number, perRow: number): number[][] {
    const a = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i !== n; i++) {
      a[i][i] = rnd.nextDouble() < 0.1 ? 0 : rnd.nextDouble() * 2 - 1;
      for (let k = 0; k !== perRow; k++) {
        const j = Math.floor(rnd.nextDouble() * n);
        const r = rnd.nextDouble();
        a[i][j] = r < 0.05 ? -0 : r < 0.1 ? 1 : (rnd.nextDouble() - 0.5) * 10 ** (8 * r - 4);
      }
    }
    return a;
  }

  /** Same value, counting 0 and -0 as equal and NaN as equal to NaN. */
  function same(x: number, y: number): boolean {
    return x === y || (Number.isNaN(x) && Number.isNaN(y));
  }

  function expectSameFactor(a: number[][]): void {
    const n = a.length;
    const fast = a.map((r) => r.slice());
    const full = a.map((r) => r.slice());
    const ipFast = new Array<number>(n).fill(0);
    const ipFull = new Array<number>(n).fill(0);
    const okFast = luFactorDense(fast, n, ipFast);
    const okFull = luFactorDenseFull(full, n, ipFull);
    expect(okFast).toBe(okFull);
    if (!okFull) return;
    expect(ipFast).toEqual(ipFull);
    for (let i = 0; i !== n; i++)
      for (let j = 0; j !== n; j++)
        if (!same(fast[i][j], full[i][j]))
          throw new Error(`entry ${i},${j}: ${fast[i][j]} vs upstream ${full[i][j]}`);
  }

  it('gives upstream values on sparse matrices', () => {
    const rnd = new JavaRandom(7);
    for (let t = 0; t !== 300; t++) {
      const n = 1 + Math.floor(rnd.nextDouble() * 70);
      expectSameFactor(randomMatrix(rnd, n, 1 + Math.floor(rnd.nextDouble() * 4)));
    }
  });

  it('gives upstream values when a NaN or an infinity is in the matrix or appears', () => {
    const rnd = new JavaRandom(11);
    for (let t = 0; t !== 200; t++) {
      const n = 2 + Math.floor(rnd.nextDouble() * 30);
      const a = randomMatrix(rnd, n, 3);
      const i = Math.floor(rnd.nextDouble() * n);
      const j = Math.floor(rnd.nextDouble() * n);
      const r = t % 4;
      // NaN, infinity, or values large or small enough to overflow while factoring
      a[i][j] = r === 0 ? NaN : r === 1 ? -Infinity : r === 2 ? 1e300 : 1e-300;
      if (r >= 2) a[j][i] = 1e300;
      expectSameFactor(a);
    }
  });
});

describe('sparse LU', () => {
  it('agrees with dense LU', () => {
    const m = [
      [0, 2, 1],
      [1, 1, 0],
      [2, 0, 3],
    ];
    const lu = new SparseLU();
    expect(lu.setA(DMatrixSparseCSC.convert(m, DMatrixSparseCSC.EPS))).toBe(true);
    const x = [0, 0, 0];
    lu.solve([7, 3, 11], x);
    expect(x[0]).toBeCloseTo(1, 12);
    expect(x[1]).toBeCloseTo(2, 12);
    expect(x[2]).toBeCloseTo(3, 12);
  });
});
