// SPDX-License-Identifier: GPL-2.0-or-later
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import rule, { findColorLiteral } from './no-color-literals.js';

describe('findColorLiteral', () => {
  it.each([
    ['#fff', '#fff'],
    ['#1e222a', '#1e222a'],
    ['#1E222AFF', '#1E222AFF'],
    ['rgb(1, 2, 3)', 'rgb('],
    ['rgba(0,0,0,0.5)', 'rgba('],
    ['hsl(120 50% 50%)', 'hsl('],
    ['red', 'red'],
    ['  White ', 'white'],
    ['color: red;', 'red'],
    ['1px solid black', 'black'],
    ['border:2px dashed navy', 'navy'],
  ])('flags %j', (input, expected) => {
    expect(findColorLiteral(input)).toBe(expected);
  });

  it.each([
    'red resistor value is too high',
    'Ω',
    'component',
    'issue #12',
    'see #section-2',
    'a#bad',
    'ColorRole',
    'reddish',
    '',
  ])('allows %j', (input) => {
    expect(findColorLiteral(input)).toBeNull();
  });
});

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

new RuleTester().run('no-color-literals', rule, {
  valid: ["painter.stroke({ role: 'component' });", 'const s = `label ${x}`;'],
  invalid: [
    { code: "ctx.fillStyle = '#ff0000';", errors: [{ messageId: 'color' }] },
    { code: 'ctx.strokeStyle = `rgb(${r}, 0, 0)`;', errors: [{ messageId: 'color' }] },
    { code: "el.style.color = 'red';", errors: [{ messageId: 'color' }] },
  ],
});
