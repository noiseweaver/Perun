// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 ts/SimulationManager.ts (dev-ts) at
// 7ec858d662d8be1d76d54241ba3a5c1d1c524f51: lu_factor_dense, lu_solve_dense, invertMatrix.
// Checked against src/com/lushprojects/circuitjs1/client/SimulationManager.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) Perun contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

/**
 * Factor `a[0..n-1][0..n-1]` in place into lower and upper triangular parts (Crout's method with
 * partial pivoting, no scaling). `ipvt` receives the row interchanges for `luSolveDense`.
 * Returns false for a singular matrix. The operation order matches upstream exactly, so results
 * are bit-identical (docs/ENGINE-NOTES.md section 6).
 */
export function luFactorDense(a: number[][], n: number, ipvt: number[]): boolean {
  let i: number, j: number, k: number;

  // check for a possible singular matrix by scanning for rows that are all zeroes
  for (i = 0; i !== n; i++) {
    let rowAllZeros = true;
    for (j = 0; j !== n; j++) {
      if (a[i][j] !== 0) {
        rowAllZeros = false;
        break;
      }
    }
    if (rowAllZeros) return false;
  }

  // use Crout's method; loop through the columns
  for (j = 0; j !== n; j++) {
    // calculate upper triangular elements for this column
    for (i = 0; i !== j; i++) {
      let q = a[i][j];
      for (k = 0; k !== i; k++) q -= a[i][k] * a[k][j];
      a[i][j] = q;
    }

    // calculate lower triangular elements for this column
    let largest = 0;
    let largestRow = -1;
    for (i = j; i !== n; i++) {
      let q = a[i][j];
      for (k = 0; k !== j; k++) q -= a[i][k] * a[k][j];
      a[i][j] = q;
      const x = Math.abs(q);
      if (x >= largest) {
        largest = x;
        largestRow = i;
      }
    }

    // pivoting
    if (j !== largestRow) {
      if (largestRow === -1) return false;
      const rowA = a[largestRow];
      const rowB = a[j];
      for (k = 0; k !== n; k++) {
        const x = rowA[k];
        rowA[k] = rowB[k];
        rowB[k] = x;
      }
    }

    // keep track of row interchanges
    ipvt[j] = largestRow;

    // an exact zero pivot means a singular matrix (upstream no longer nudges it)
    if (a[j][j] === 0.0) return false;

    if (j !== n - 1) {
      const mult = 1.0 / a[j][j];
      for (i = j + 1; i !== n; i++) a[i][j] *= mult;
    }
  }
  return true;
}

/**
 * Solve with a factorization from `luFactorDense`. On entry `b` is the right-hand side; on exit
 * it holds the solution. Keeps upstream's skip-leading-zeros shortcut for identical rounding.
 */
export function luSolveDense(a: number[][], n: number, ipvt: number[], b: number[]): void {
  let i: number;

  // find first nonzero b element
  for (i = 0; i !== n; i++) {
    const row = ipvt[i];
    const swap = b[row];
    b[row] = b[i];
    b[i] = swap;
    if (swap !== 0) break;
  }

  const bi = i++;
  for (; i < n; i++) {
    const row = ipvt[i];
    let tot = b[row];
    b[row] = b[i];
    // forward substitution using the lower triangular matrix
    for (let j = bi; j < i; j++) tot -= a[i][j] * b[j];
    b[i] = tot;
  }
  for (i = n - 1; i >= 0; i--) {
    let tot = b[i];
    // back-substitution using the upper triangular matrix
    for (let j = i + 1; j !== n; j++) tot -= a[i][j] * b[j];
    b[i] = tot / a[i][i];
  }
}

/** Invert `a` in place (dense, regardless of the solver in use), as upstream `invertMatrix`. */
export function invertMatrix(a: number[][], n: number): void {
  const ipvt = new Array<number>(n).fill(0);
  luFactorDense(a, n, ipvt);
  const b = new Array<number>(n).fill(0);
  const inva = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  // solve for each column of identity matrix
  for (let i = 0; i !== n; i++) {
    for (let j = 0; j !== n; j++) b[j] = 0;
    b[i] = 1;
    luSolveDense(a, n, ipvt, b);
    for (let j = 0; j !== n; j++) inva[j][i] = b[j];
  }

  for (let i = 0; i !== n; i++) for (let j = 0; j !== n; j++) a[i][j] = inva[i][j];
}
