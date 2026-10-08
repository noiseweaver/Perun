// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

/**
 * `java.util.Random`, bit for bit: the 48-bit linear congruential generator documented in the
 * JDK (seed scrambled with 0x5DEECE66D, multiplier 0x5DEECE66D, increment 0xB). Upstream draws
 * noise, op-amp escapes and gate tie-breaks from it, so golden traces depend on the exact
 * sequence (PLAN.md section 8).
 */
export class JavaRandom {
  private static readonly MULTIPLIER = 0x5deece66dn;
  private static readonly ADDEND = 0xbn;
  private static readonly MASK = (1n << 48n) - 1n;

  private seed = 0n;

  constructor(seed: number | bigint = 0) {
    this.setSeed(seed);
  }

  setSeed(seed: number | bigint): void {
    this.seed = (BigInt.asIntN(64, BigInt(seed)) ^ JavaRandom.MULTIPLIER) & JavaRandom.MASK;
  }

  /** The next `bits` random bits as a signed 32-bit int, like Java's `next(bits)`. */
  next(bits: number): number {
    this.seed = (this.seed * JavaRandom.MULTIPLIER + JavaRandom.ADDEND) & JavaRandom.MASK;
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
  }

  nextInt(): number {
    return this.next(32);
  }

  nextDouble(): number {
    // ((long) next(26) << 27) + next(27), scaled by 2^-53
    const hi = this.next(26);
    const lo = this.next(27);
    return (hi * 134217728 + lo) / 9007199254740992;
  }
}
