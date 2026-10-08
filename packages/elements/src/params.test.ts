// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { describe, expect, it } from 'vitest';
import {
  bindingText,
  evaluateExpression,
  formatBindings,
  formatParamList,
  isParamName,
  paramEnv,
  parseBindings,
  parseParamList,
} from './params.ts';

const env = new Map([
  ['R', 10e3],
  ['C', 100e-9],
  ['gain_2', 2],
]);

describe('evaluateExpression', () => {
  it('reads numbers with SI prefixes, parameters and operators', () => {
    expect(evaluateExpression('4.7k', env)).toBe(4700);
    expect(evaluateExpression('R*2', env)).toBe(20e3);
    expect(evaluateExpression('1/(2*pi*R*C)', env)).toBeCloseTo(159.155, 3);
    expect(evaluateExpression('-R + 1M', env)).toBe(990e3);
    expect(evaluateExpression('2^3^2', env)).toBe(512);
    expect(evaluateExpression('-2^2', env)).toBe(-4);
    expect(evaluateExpression('sqrt(R) * gain_2', env)).toBe(200);
    expect(evaluateExpression('max(1, R, 3m)', env)).toBe(10e3);
    expect(evaluateExpression('1e-3 * 10u', env)).toBeCloseTo(1e-8, 20);
  });

  it('says what is wrong', () => {
    expect(() => evaluateExpression('R*', env)).toThrow('expression ends early');
    expect(() => evaluateExpression('Rx', env)).toThrow('unknown parameter Rx');
    expect(() => evaluateExpression('foo(1)', env)).toThrow('unknown function foo');
    expect(() => evaluateExpression('(R', env)).toThrow('missing )');
    expect(() => evaluateExpression('10kohm', env)).toThrow("can't read");
    expect(() => evaluateExpression('1/0', env)).toThrow('not a finite number');
    expect(() => evaluateExpression('R R', env)).toThrow('unexpected "R"');
  });
});

describe('parameter lists and bindings', () => {
  it('round-trips the saved forms', () => {
    const defs = [
      { name: 'R', value: 10000 },
      { name: 'C', value: 1e-7 },
    ];
    expect(formatParamList(defs)).toBe('R=10000 C=1e-7');
    expect(parseParamList('R=10000 C=1e-7 bad 2x=1 R=5')).toEqual(defs);
    const b = new Map([
      [3, 'R/2'],
      [0, 'C'],
    ]);
    expect(formatBindings(b)).toBe('0=C;3=R/2');
    expect(parseBindings('0=C;3=R/2')).toEqual(new Map([...b].sort((x, y) => x[0] - y[0])));
    expect(parseBindings('')).toBeNull();
  });

  it('takes a copy value over the default only for parameters the model has', () => {
    const e = paramEnv(
      [{ name: 'R', value: 1 }],
      new Map([
        ['R', 2],
        ['X', 3],
      ]),
    );
    expect([...e]).toEqual([['R', 2]]);
  });

  it('knows names and braces', () => {
    expect(isParamName('R1')).toBe(true);
    expect(isParamName('1R')).toBe(false);
    expect(isParamName('sqrt')).toBe(false);
    expect(bindingText(' {R * 2} ')).toBe('R * 2');
    expect(bindingText('4.7k')).toBeNull();
  });
});
