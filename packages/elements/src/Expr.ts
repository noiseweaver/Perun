// SPDX-License-Identifier: GPL-2.0-or-later
// Ported from CircuitJS1 src/com/lushprojects/circuitjs1/client/Expr.java (master) at
// 5a707168778216bb6ed01bfdd62e8bbf7ae0a032.
// Copyright (C) Paul Falstad and Iain Sharp; port Copyright (C) circuitjs-next contributors.
// This program is free software: you can redistribute it and/or modify it under the terms of the
// GNU General Public License as published by the Free Software Foundation, either version 2 of the
// License, or (at your option) any later version. See LICENSE.

import { javaDoubleToInt, parseJavaDouble } from './java.ts';

/** The inputs and history an expression reads (upstream `ExprState`). */
export class ExprState {
  values = new Float64Array(9);
  lastValues = new Float64Array(9);
  lastOutput = 0;
  t = 0;
  /** Upstream reads `SimulationManager.theSim.timeStep`; the owner supplies it here. */
  timeStep: () => number;

  constructor(_n: number, timeStep: () => number = () => 0) {
    this.values[4] = Math.E;
    this.timeStep = timeStep;
  }

  updateLastValues(lastOut: number): void {
    this.lastOutput = lastOut;
    for (let i = 0; i !== this.values.length; i++) this.lastValues[i] = this.values[i];
  }

  reset(): void {
    for (let i = 0; i !== this.values.length; i++) this.lastValues[i] = 0;
    this.lastOutput = 0;
  }
}

function posmod(x: number, y: number): number {
  x %= y;
  return x >= 0 ? x : x + y;
}

/** A parsed expression tree node. */
export class Expr {
  static readonly E_ADD = 1;
  static readonly E_SUB = 2;
  static readonly E_T = 3;
  static readonly E_VAL = 6;
  static readonly E_MUL = 7;
  static readonly E_DIV = 8;
  static readonly E_POW = 9;
  static readonly E_UMINUS = 10;
  static readonly E_SIN = 11;
  static readonly E_COS = 12;
  static readonly E_ABS = 13;
  static readonly E_EXP = 14;
  static readonly E_LOG = 15;
  static readonly E_SQRT = 16;
  static readonly E_TAN = 17;
  static readonly E_R = 18;
  static readonly E_MAX = 19;
  static readonly E_MIN = 20;
  static readonly E_CLAMP = 21;
  static readonly E_PWL = 22;
  static readonly E_TRIANGLE = 23;
  static readonly E_SAWTOOTH = 24;
  static readonly E_MOD = 25;
  static readonly E_STEP = 26;
  static readonly E_SELECT = 27;
  static readonly E_PWR = 28;
  static readonly E_PWRS = 29;
  static readonly E_LASTOUTPUT = 30;
  static readonly E_TIMESTEP = 31;
  static readonly E_TERNARY = 32;
  static readonly E_OR = 33;
  static readonly E_AND = 34;
  static readonly E_EQUALS = 35;
  static readonly E_LEQ = 36;
  static readonly E_GEQ = 37;
  static readonly E_LESS = 38;
  static readonly E_GREATER = 39;
  static readonly E_NEQ = 40;
  static readonly E_NOT = 41;
  static readonly E_FLOOR = 42;
  static readonly E_CEIL = 43;
  static readonly E_ASIN = 44;
  static readonly E_ACOS = 45;
  static readonly E_ATAN = 46;
  static readonly E_SINH = 47;
  static readonly E_COSH = 48;
  static readonly E_TANH = 49;
  static readonly E_BITAND = 50;
  static readonly E_BITOR = 51;
  static readonly E_RSHIFT = 52;
  static readonly E_A = 53;
  static readonly E_DADT = Expr.E_A + 10; // must be E_A+10
  static readonly E_LASTA = Expr.E_DADT + 10; // should be at end and equal to E_DADT+10

  children: Expr[] | null = null;
  value = 0;
  type: number;

  constructor(type: number, value = 0) {
    this.type = type;
    this.value = value;
  }

  /** Upstream `Expr(e1, e2, v)`. */
  static op(e1: Expr, e2: Expr | null, type: number): Expr {
    const e = new Expr(type);
    e.children = [e1];
    if (e2 !== null) e.children.push(e2);
    return e;
  }

  private child(i: number): Expr {
    return (this.children as Expr[])[i];
  }

  eval(es: ExprState): number {
    const ch = this.children;
    // a leaf never reads `left`
    const left = (ch !== null && ch.length > 0 ? ch[0] : null) as Expr;
    const right = ch !== null && ch.length === 2 ? ch[1] : null;
    switch (this.type) {
      case Expr.E_ADD:
        return left.eval(es) + (right as Expr).eval(es);
      case Expr.E_SUB:
        return left.eval(es) - (right as Expr).eval(es);
      case Expr.E_MUL:
        return left.eval(es) * (right as Expr).eval(es);
      case Expr.E_DIV:
        return left.eval(es) / (right as Expr).eval(es);
      case Expr.E_POW:
        return Math.pow(left.eval(es), (right as Expr).eval(es));
      case Expr.E_OR:
        return left.eval(es) !== 0 || (right as Expr).eval(es) !== 0 ? 1 : 0;
      case Expr.E_AND:
        return left.eval(es) !== 0 && (right as Expr).eval(es) !== 0 ? 1 : 0;
      case Expr.E_EQUALS:
        return left.eval(es) === (right as Expr).eval(es) ? 1 : 0;
      case Expr.E_NEQ:
        return left.eval(es) !== (right as Expr).eval(es) ? 1 : 0;
      case Expr.E_LEQ:
        return left.eval(es) <= (right as Expr).eval(es) ? 1 : 0;
      case Expr.E_GEQ:
        return left.eval(es) >= (right as Expr).eval(es) ? 1 : 0;
      case Expr.E_LESS:
        return left.eval(es) < (right as Expr).eval(es) ? 1 : 0;
      case Expr.E_GREATER:
        return left.eval(es) > (right as Expr).eval(es) ? 1 : 0;
      case Expr.E_TERNARY:
        return this.child(left.eval(es) !== 0 ? 1 : 2).eval(es);
      case Expr.E_UMINUS:
        return -left.eval(es);
      case Expr.E_NOT:
        return left.eval(es) === 0 ? 1 : 0;
      case Expr.E_VAL:
        return this.value;
      case Expr.E_T:
        return es.t;
      case Expr.E_SIN:
        return Math.sin(left.eval(es));
      case Expr.E_COS:
        return Math.cos(left.eval(es));
      case Expr.E_ABS:
        return Math.abs(left.eval(es));
      case Expr.E_EXP:
        return Math.exp(left.eval(es));
      case Expr.E_LOG:
        return Math.log(left.eval(es));
      case Expr.E_SQRT:
        return Math.sqrt(left.eval(es));
      case Expr.E_TAN:
        return Math.tan(left.eval(es));
      case Expr.E_ASIN:
        return Math.asin(left.eval(es));
      case Expr.E_ACOS:
        return Math.acos(left.eval(es));
      case Expr.E_ATAN:
        return Math.atan(left.eval(es));
      case Expr.E_SINH:
        return Math.sinh(left.eval(es));
      case Expr.E_COSH:
        return Math.cosh(left.eval(es));
      case Expr.E_TANH:
        return Math.tanh(left.eval(es));
      case Expr.E_BITAND:
        return javaDoubleToInt(left.eval(es)) & javaDoubleToInt((right as Expr).eval(es));
      case Expr.E_BITOR:
        return javaDoubleToInt(left.eval(es)) | javaDoubleToInt((right as Expr).eval(es));
      case Expr.E_RSHIFT:
        return javaDoubleToInt(left.eval(es)) >> javaDoubleToInt((right as Expr).eval(es));
      case Expr.E_FLOOR:
        return Math.floor(left.eval(es));
      case Expr.E_CEIL:
        return Math.ceil(left.eval(es));
      case Expr.E_MIN: {
        let x = left.eval(es);
        for (let i = 1; i < (ch as Expr[]).length; i++) x = Math.min(x, this.child(i).eval(es));
        return x;
      }
      case Expr.E_MAX: {
        let x = left.eval(es);
        for (let i = 1; i < (ch as Expr[]).length; i++) x = Math.max(x, this.child(i).eval(es));
        return x;
      }
      case Expr.E_CLAMP:
        return Math.min(Math.max(left.eval(es), this.child(1).eval(es)), this.child(2).eval(es));
      case Expr.E_STEP: {
        const x = left.eval(es);
        if (right === null) return x < 0 ? 0 : 1;
        return x > right.eval(es) ? 0 : x < 0 ? 0 : 1;
      }
      case Expr.E_SELECT: {
        const x = left.eval(es);
        return this.child(x > 0 ? 2 : 1).eval(es);
      }
      case Expr.E_TRIANGLE: {
        const x = posmod(left.eval(es), Math.PI * 2) / Math.PI;
        return x < 1 ? -1 + x * 2 : 3 - x * 2;
      }
      case Expr.E_SAWTOOTH: {
        const x = posmod(left.eval(es), Math.PI * 2) / Math.PI;
        return x - 1;
      }
      case Expr.E_MOD:
        return left.eval(es) % (right as Expr).eval(es);
      case Expr.E_PWL:
        return this.pwl(es, ch as Expr[]);
      case Expr.E_PWR:
        return Math.pow(Math.abs(left.eval(es)), (right as Expr).eval(es));
      case Expr.E_PWRS: {
        const x = left.eval(es);
        if (x < 0) return -Math.pow(-x, (right as Expr).eval(es));
        return Math.pow(x, (right as Expr).eval(es));
      }
      case Expr.E_LASTOUTPUT:
        return es.lastOutput;
      case Expr.E_TIMESTEP:
        return es.timeStep();
      default: {
        const t = this.type;
        if (t >= Expr.E_LASTA) return es.lastValues[t - Expr.E_LASTA];
        if (t >= Expr.E_DADT)
          return (es.values[t - Expr.E_DADT] - es.lastValues[t - Expr.E_DADT]) / es.timeStep();
        if (t >= Expr.E_A) return es.values[t - Expr.E_A];
      }
    }
    return 0;
  }

  private pwl(es: ExprState, args: Expr[]): number {
    const x = args[0].eval(es);
    let x0 = args[1].eval(es);
    let y0 = args[2].eval(es);
    if (x < x0) return y0;
    let x1 = args[3].eval(es);
    let y1 = args[4].eval(es);
    let i = 5;
    for (;;) {
      if (x < x1) return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
      if (i + 1 >= args.length) break;
      x0 = x1;
      y0 = y1;
      x1 = args[i].eval(es);
      y1 = args[i + 1].eval(es);
      i += 2;
    }
    return y1;
  }
}

const isDigit = (c: string): boolean => c >= '0' && c <= '9';

/** Upstream `ExprParser`: a recursive-descent parser for the controlled sources' functions. */
export class ExprParser {
  private text: string;
  private token = '';
  private pos = 0;
  private tlen: number;
  private err: string | null = null;

  constructor(s: string) {
    this.text = s.toLowerCase();
    this.tlen = this.text.length;
    this.getToken();
  }

  gotError(): string | null {
    return this.err;
  }

  private getToken(): void {
    const text = this.text;
    while (this.pos < this.tlen && text.charAt(this.pos) === ' ') this.pos++;
    if (this.pos === this.tlen) {
      this.token = '';
      return;
    }
    let i = this.pos;
    const c = text.charAt(i);
    if (isDigit(c) || c === '.') {
      for (i = this.pos; i !== this.tlen; i++) {
        if (text.charAt(i) === 'e' || text.charAt(i) === 'E') {
          i++;
          if (i < this.tlen && (text.charAt(i) === '+' || text.charAt(i) === '-')) i++;
        }
        // upstream throws past the end ("1e"); stop there instead
        if (i >= this.tlen) break;
        if (!(isDigit(text.charAt(i)) || text.charAt(i) === '.')) break;
      }
    } else if (c >= 'a' && c <= 'z') {
      for (i = this.pos; i !== this.tlen; i++) {
        const d = text.charAt(i);
        if (!(d >= 'a' && d <= 'z')) break;
      }
    } else {
      i++;
      if (i < this.tlen) {
        const d = text.charAt(i);
        // ||, &&, <<, >>, ==
        if (d === c && (c === '|' || c === '&' || c === '<' || c === '>' || c === '=')) i++;
        // <=, >=
        else if ((c === '<' || c === '>' || c === '!') && d === '=') i++;
      }
    }
    this.token = text.substring(this.pos, i);
    this.pos = i;
  }

  private skip(s: string): boolean {
    if (this.token !== s) return false;
    this.getToken();
    return true;
  }

  private setError(s: string): void {
    this.err ??= s;
  }

  private skipOrError(s: string): void {
    if (!this.skip(s)) this.setError('expected ' + s + ', got ' + this.token);
  }

  parseExpression(): Expr {
    if (this.token.length === 0) return new Expr(Expr.E_VAL, 0);
    const e = this.parse();
    if (this.token.length > 0) this.setError('unexpected token: ' + this.token);
    return e;
  }

  private parse(): Expr {
    const e = this.parseOr();
    if (this.skip('?')) {
      const e2 = this.parseOr();
      this.skipOrError(':');
      const e3 = this.parse();
      const ret = Expr.op(e, e2, Expr.E_TERNARY);
      (ret.children as Expr[]).push(e3);
      return ret;
    }
    return e;
  }

  private parseOr(): Expr {
    let e = this.parseAnd();
    while (this.skip('||')) e = Expr.op(e, this.parseAnd(), Expr.E_OR);
    return e;
  }

  private parseAnd(): Expr {
    let e = this.parseBitOr();
    while (this.skip('&&')) e = Expr.op(e, this.parseBitOr(), Expr.E_AND);
    return e;
  }

  private parseBitOr(): Expr {
    let e = this.parseBitAnd();
    while (this.skip('|')) e = Expr.op(e, this.parseBitAnd(), Expr.E_BITOR);
    return e;
  }

  private parseBitAnd(): Expr {
    let e = this.parseEquals();
    while (this.skip('&')) e = Expr.op(e, this.parseEquals(), Expr.E_BITAND);
    return e;
  }

  private parseEquals(): Expr {
    const e = this.parseCompare();
    if (this.skip('==')) return Expr.op(e, this.parseCompare(), Expr.E_EQUALS);
    return e;
  }

  private parseCompare(): Expr {
    const e = this.parseShift();
    if (this.skip('<=')) return Expr.op(e, this.parseShift(), Expr.E_LEQ);
    if (this.skip('>=')) return Expr.op(e, this.parseShift(), Expr.E_GEQ);
    if (this.skip('!=')) return Expr.op(e, this.parseShift(), Expr.E_NEQ);
    if (this.skip('<')) return Expr.op(e, this.parseShift(), Expr.E_LESS);
    if (this.skip('>')) return Expr.op(e, this.parseShift(), Expr.E_GREATER);
    return e;
  }

  private parseShift(): Expr {
    let e = this.parseAdd();
    while (this.skip('>>')) e = Expr.op(e, this.parseAdd(), Expr.E_RSHIFT);
    return e;
  }

  private parseAdd(): Expr {
    let e = this.parseMult();
    for (;;) {
      if (this.skip('+')) e = Expr.op(e, this.parseMult(), Expr.E_ADD);
      else if (this.skip('-')) e = Expr.op(e, this.parseMult(), Expr.E_SUB);
      else break;
    }
    return e;
  }

  private parseMult(): Expr {
    let e = this.parseUminus();
    for (;;) {
      if (this.skip('*')) e = Expr.op(e, this.parseUminus(), Expr.E_MUL);
      else if (this.skip('/')) e = Expr.op(e, this.parseUminus(), Expr.E_DIV);
      else break;
    }
    return e;
  }

  private parseUminus(): Expr {
    this.skip('+');
    if (this.skip('!')) return Expr.op(this.parseUminus(), null, Expr.E_NOT);
    if (this.skip('-')) return Expr.op(this.parseUminus(), null, Expr.E_UMINUS);
    return this.parsePow();
  }

  private parsePow(): Expr {
    let e = this.parseTerm();
    while (this.skip('^')) e = Expr.op(e, this.parseTerm(), Expr.E_POW);
    return e;
  }

  private parseFunc(t: number): Expr {
    this.skipOrError('(');
    const e = this.parse();
    this.skipOrError(')');
    return Expr.op(e, null, t);
  }

  private parseFuncMulti(t: number, minArgs: number, maxArgs: number): Expr {
    let args = 1;
    this.skipOrError('(');
    const e1 = this.parse();
    const e = Expr.op(e1, null, t);
    while (this.skip(',')) {
      (e.children as Expr[]).push(this.parse());
      args++;
    }
    this.skipOrError(')');
    if (args < minArgs || args > maxArgs) this.setError('bad number of function args: ' + args);
    return e;
  }

  private static readonly FUNCS: Record<string, number> = {
    sin: Expr.E_SIN,
    cos: Expr.E_COS,
    asin: Expr.E_ASIN,
    acos: Expr.E_ACOS,
    atan: Expr.E_ATAN,
    sinh: Expr.E_SINH,
    cosh: Expr.E_COSH,
    tanh: Expr.E_TANH,
    abs: Expr.E_ABS,
    exp: Expr.E_EXP,
    log: Expr.E_LOG,
    sqrt: Expr.E_SQRT,
    tan: Expr.E_TAN,
    tri: Expr.E_TRIANGLE,
    saw: Expr.E_SAWTOOTH,
    floor: Expr.E_FLOOR,
    ceil: Expr.E_CEIL,
  };

  /** name: [type, min args, max args] */
  private static readonly MULTI: Record<string, [number, number, number]> = {
    min: [Expr.E_MIN, 2, 1000],
    max: [Expr.E_MAX, 2, 1000],
    pwl: [Expr.E_PWL, 2, 1000],
    mod: [Expr.E_MOD, 2, 2],
    step: [Expr.E_STEP, 1, 2],
    select: [Expr.E_SELECT, 3, 3],
    clamp: [Expr.E_CLAMP, 3, 3],
    pwr: [Expr.E_PWR, 2, 2],
    pwrs: [Expr.E_PWRS, 2, 2],
  };

  private parseTerm(): Expr {
    if (this.skip('(')) {
      const e = this.parse();
      this.skipOrError(')');
      return e;
    }
    if (this.skip('t')) return new Expr(Expr.E_T);
    const token = this.token;
    if (token.length === 1) {
      const c = token.charCodeAt(0);
      if (c >= 97 && c <= 105) {
        this.getToken();
        return new Expr(Expr.E_A + (c - 97));
      }
    }
    if (token.startsWith('last') && token.length === 5) {
      const c = token.charCodeAt(4);
      if (c >= 97 && c <= 105) {
        this.getToken();
        return new Expr(Expr.E_LASTA + (c - 97));
      }
    }
    if (token.endsWith('dt') && token.startsWith('d') && token.length === 4) {
      const c = token.charCodeAt(1);
      if (c >= 97 && c <= 105) {
        this.getToken();
        return new Expr(Expr.E_DADT + (c - 97));
      }
    }
    if (this.skip('lastoutput')) return new Expr(Expr.E_LASTOUTPUT);
    if (this.skip('timestep')) return new Expr(Expr.E_TIMESTEP);
    if (this.skip('pi')) return new Expr(Expr.E_VAL, Math.PI);
    const f = Object.hasOwn(ExprParser.FUNCS, token) ? ExprParser.FUNCS[token] : undefined;
    if (f !== undefined) {
      this.getToken();
      return this.parseFunc(f);
    }
    const m = Object.hasOwn(ExprParser.MULTI, token) ? ExprParser.MULTI[token] : undefined;
    if (m !== undefined) {
      this.getToken();
      return this.parseFuncMulti(m[0], m[1], m[2]);
    }
    try {
      const e = new Expr(Expr.E_VAL, parseJavaDouble(token));
      this.getToken();
      return e;
    } catch {
      if (token.length === 0) this.setError('unexpected end of input');
      else this.setError('unrecognized token: ' + token);
      return new Expr(Expr.E_VAL, 0);
    }
  }
}
