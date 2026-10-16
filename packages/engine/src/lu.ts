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
 *
 * Circuit matrices are mostly zeros (a transistor-level op-amp's 69 rows hold about 4 nonzeros
 * each, and stay that sparse after factoring), so this skips the products with a zero factor,
 * which are almost all of upstream's work. Skipping `q -= 0 * y` leaves every value as it was
 * for finite `y` (at most the sign of an exact zero differs), so as long as nothing turns
 * infinite or NaN the result is upstream's. If something does, the factorization starts over
 * from a copy of the input with upstream's full loops, so the NaN spreads as it does upstream.
 */
export function luFactorDense(a: number[][], n: number, ipvt: number[]): boolean {
  if (hasZeroRow(a, n)) return false;
  const copy = scratchCopy(n * n);
  for (let i = 0; i !== n; i++) copy.set(a[i], i * n);
  const ok = factorSkippingZeros(a, n, ipvt);
  // let go of the row arrays (the matrix may be dropped on the next stamp)
  lRows.fill(EMPTY_ROW, 0, lCount);
  if (ok !== NOT_FINITE) return ok;
  for (let i = 0; i !== n; i++) {
    const row = a[i];
    for (let j = 0; j !== n; j++) row[j] = copy[i * n + j];
  }
  return factorFull(a, n, ipvt);
}

const NOT_FINITE = 2;
let copyBuf = new Float64Array(0);
/** Column k of L as (row, value) pairs, k = 0, 1, ...: rows from lStart[k] to lStart[k + 1]. */
const lRows: number[][] = [];
let lCount = 0;
const EMPTY_ROW: number[] = [];
let lVals = new Float64Array(0);
let lStart = new Int32Array(0);

function scratchCopy(size: number): Float64Array {
  if (copyBuf.length < size) copyBuf = new Float64Array(size);
  return copyBuf;
}

/**
 * Upstream's Crout factorization computed column by column from the nonzeros only. Upstream finds
 * entry (i, j) as `a[i][j] - sum over k of a[i][k] * a[k][j]` with k rising; here, for each
 * k in rising order whose a[k][j] is nonzero, the product is taken off every row with a nonzero
 * a[i][k] (column k of L, kept as a list). Each entry gets the same subtractions in the same order.
 * Rows are swapped by reference, so the lists of rows stay valid.
 *
 * Returns NOT_FINITE as soon as any value turns infinite or NaN (then `a` is half done and must be
 * restored).
 */
function factorSkippingZeros(
  a: number[][],
  n: number,
  ipvt: number[],
): boolean | typeof NOT_FINITE {
  if (lStart.length < n + 1) lStart = new Int32Array(n + 1);
  const start = lStart;
  let count = 0;
  lCount = 0;
  start[0] = 0;
  for (let j = 0; j !== n; j++) {
    // upper part (i < j) and the sums of the lower part (i >= j); the upper entry of row k is
    // final once every column of L before k has been taken off it
    for (let k = 0; k !== j; k++) {
      const ukj = a[k][j];
      if (ukj - ukj !== 0) return NOT_FINITE;
      if (ukj === 0) continue;
      const rows = lRows;
      const vals = lVals;
      for (let t = start[k], end = start[k + 1]; t !== end; t++) rows[t][j] -= vals[t] * ukj;
    }

    // find the pivot
    let largest = 0;
    let largestRow = -1;
    for (let i = j; i !== n; i++) {
      const q = a[i][j];
      if (q - q !== 0) return NOT_FINITE;
      const x = Math.abs(q);
      if (x >= largest) {
        largest = x;
        largestRow = i;
      }
    }

    // pivoting: swapping the row arrays swaps every column, as upstream's loop does
    if (j !== largestRow) {
      if (largestRow === -1) return false;
      const row = a[largestRow];
      a[largestRow] = a[j];
      a[j] = row;
    }

    // keep track of row interchanges
    ipvt[j] = largestRow;

    // an exact zero pivot means a singular matrix (upstream no longer nudges it)
    if (a[j][j] === 0.0) return false;

    if (j !== n - 1) {
      const mult = 1.0 / a[j][j];
      if (lVals.length < count + n) {
        const grown = new Float64Array(Math.max(2 * lVals.length, count + n));
        grown.set(lVals);
        lVals = grown;
      }
      for (let i = j + 1; i !== n; i++) {
        const row = a[i];
        const x = row[j] * mult;
        if (x - x !== 0) return NOT_FINITE;
        row[j] = x;
        if (x !== 0) {
          lRows[count] = row;
          lVals[count] = x;
          lCount = ++count;
        }
      }
    }
    start[j + 1] = count;
  }
  return true;
}

/** Upstream's `lu_factor_dense` as it is, with every product (for tests and the NaN case). */
export function luFactorDenseFull(a: number[][], n: number, ipvt: number[]): boolean {
  return !hasZeroRow(a, n) && factorFull(a, n, ipvt);
}

/** Check for a possible singular matrix by scanning for rows that are all zeroes. */
function hasZeroRow(a: number[][], n: number): boolean {
  for (let i = 0; i !== n; i++) {
    let rowAllZeros = true;
    for (let j = 0; j !== n; j++) {
      if (a[i][j] !== 0) {
        rowAllZeros = false;
        break;
      }
    }
    if (rowAllZeros) return true;
  }
  return false;
}

/** Upstream's Crout loops, after the singular row check. */
function factorFull(a: number[][], n: number, ipvt: number[]): boolean {
  let i: number, j: number, k: number;

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
