// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/Scope.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032: the value and unit constants.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

/**
 * What a scope plot shows of an element (`getScopeValue`). Transistors reuse the low numbers for
 * their own values, as upstream does.
 */
export const VAL_POWER = 7;
export const VAL_POWER_OLD = 1;
export const VAL_VOLTAGE = 0;
export const VAL_CURRENT = 3;
export const VAL_IB = 1;
export const VAL_IC = 2;
export const VAL_IE = 3;
export const VAL_VBE = 4;
export const VAL_VBC = 5;
export const VAL_VCE = 6;
export const VAL_R = 2;
export const VAL_CHARGE = 8;

/** Units of a plot; each scope keeps one auto scale per unit. */
export const UNITS_V = 0;
export const UNITS_A = 1;
export const UNITS_W = 2;
export const UNITS_OHMS = 3;
export const UNITS_C = 4;
export const UNITS_COUNT = 5;
