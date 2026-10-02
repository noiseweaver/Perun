// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

import { describe, expect, it } from 'vitest';
import { JavaRandom } from './JavaRandom.ts';
import { invertMatrix, luFactorDense, luSolveDense } from './lu.ts';
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
