import { describe, expect, it } from 'vitest';
import { ExprParser, ExprState } from './Expr.ts';

function ev(s: string, values: number[] = [], t = 0): number {
  const p = new ExprParser(s);
  const e = p.parseExpression();
  expect(p.gotError()).toBe(null);
  const es = new ExprState(0, () => 1e-3);
  values.forEach((v, i) => (es.values[i] = v));
  es.t = t;
  return e.eval(es);
}

describe('Expr', () => {
  it('follows precedence and associativity', () => {
    expect(ev('1+2*3')).toBe(7);
    expect(ev('2^3^2')).toBe(64); // left to right, as upstream
    expect(ev('-2^2')).toBe(-4);
    expect(ev('10-4-3')).toBe(3);
    expect(ev('1 < 2 ? 5 : 6')).toBe(5);
    expect(ev('!0 && 1 || 0')).toBe(1);
  });

  it('reads inputs, time and e', () => {
    expect(ev('.1*(a-b)', [5, 3])).toBeCloseTo(0.2, 15);
    expect(ev('e')).toBe(Math.E);
    expect(ev('t*2', [], 3)).toBe(6);
    expect(ev('timestep')).toBe(1e-3);
  });

  it('evaluates the functions', () => {
    expect(ev('max(1,5,3)')).toBe(5);
    expect(ev('clamp(7,0,5)')).toBe(5);
    expect(ev('pwl(a,0,0,1,10,2,0)', [1.5])).toBe(5);
    expect(ev('step(a)', [-1])).toBe(0);
    expect(ev('select(a,1,2)', [1])).toBe(2);
    expect(ev('pwrs(a,2)', [-3])).toBe(-9);
    expect(ev('mod(7,3)')).toBe(1);
    expect(ev('5 & 3 | 8')).toBe(9);
    expect(ev('16 >> 2')).toBe(4);
  });

  it('reports parse errors', () => {
    expect(new ExprParser('1+').gotError()).toBe(null); // only found while parsing
    const p = new ExprParser('sin(1');
    p.parseExpression();
    expect(p.gotError()).toBe('expected ), got ');
    const q = new ExprParser('foo(1)');
    q.parseExpression();
    expect(q.gotError()).toBe('unrecognized token: foo');
  });
});
