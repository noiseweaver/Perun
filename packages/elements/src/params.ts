// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors

/**
 * Parameters (PLAN.md Phase 16). Not in upstream (DEVIATIONS.md). A circuit, and so a subcircuit
 * model made from it, has a list of named parameters with default values. Any number field of a
 * part can be bound to an expression of them, written `{R*2}` in the property panel, and each
 * placed subcircuit can give its parameters its own values.
 *
 * Saved as extra XML attributes upstream ignores, and only when used: `prm` on the circuit and on
 * a subcircuit model (the list), `px` on a part (its bindings) and `pv` on a placed subcircuit (its
 * values). A bound field also keeps its value at the defaults in its usual attribute, so upstream
 * opens the file with every subcircuit at its default values.
 */

export interface ParamDef {
  name: string;
  value: number;
}

export type ParamEnv = ReadonlyMap<string, number>;

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log,
  log10: Math.log10,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI };

/** SI prefixes a number can end with, as the property panel reads them. */
const SUFFIXES: Record<string, number> = {
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  μ: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

/** A parameter name: a letter or underscore, then letters, digits and underscores. */
export function isParamName(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !(s in FUNCTIONS) && !(s in CONSTANTS);
}

export class ParamError extends Error {}

/**
 * Evaluate an expression of numbers (with SI prefixes, like 4.7k), parameters, + - * / ^,
 * parentheses and the functions above. Throws ParamError with a message for the user.
 */
export function evaluateExpression(text: string, env: ParamEnv): number {
  let pos = 0;
  const s = text;
  const skip = (): void => {
    while (pos < s.length && /\s/.test(s[pos] ?? '')) pos++;
  };
  const peek = (): string => {
    skip();
    return s[pos] ?? '';
  };
  const fail = (msg: string): never => {
    throw new ParamError(msg);
  };

  const primary = (): number => {
    const c = peek();
    if (c === '(') {
      pos++;
      const v = sum();
      if (peek() !== ')') fail('missing )');
      pos++;
      return v;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(s.slice(pos));
    if (num !== null) {
      pos += num[0].length;
      let v = Number(num[0]);
      const suffix = s[pos] ?? '';
      if (suffix in SUFFIXES) {
        v *= SUFFIXES[suffix] ?? 1;
        pos++;
      }
      if (/[A-Za-z0-9_]/.test(s[pos] ?? '')) fail(`can't read "${num[0]}${suffix}${s[pos]}"`);
      return v;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(pos));
    if (id === null) return fail(c === '' ? 'expression ends early' : `unexpected "${c}"`);
    const name = id[0];
    pos += name.length;
    if (peek() === '(') {
      const fn = FUNCTIONS[name];
      if (fn === undefined) fail(`unknown function ${name}`);
      pos++;
      const args: number[] = [];
      if (peek() !== ')') {
        args.push(sum());
        while (peek() === ',') {
          pos++;
          args.push(sum());
        }
      }
      if (peek() !== ')') fail('missing )');
      pos++;
      return (fn as (...a: number[]) => number)(...args);
    }
    const v = env.get(name) ?? CONSTANTS[name];
    if (v === undefined) fail(`unknown parameter ${name}`);
    return v as number;
  };
  const power = (): number => {
    const base = primary();
    if (peek() === '^') {
      pos++;
      return Math.pow(base, unary());
    }
    return base;
  };
  const unary = (): number => {
    const c = peek();
    if (c === '-' || c === '+') {
      pos++;
      const v = unary();
      return c === '-' ? -v : v;
    }
    return power();
  };
  const product = (): number => {
    let v = unary();
    for (;;) {
      const c = peek();
      if (c !== '*' && c !== '/') return v;
      pos++;
      const r = unary();
      v = c === '*' ? v * r : v / r;
    }
  };
  const sum = (): number => {
    let v = product();
    for (;;) {
      const c = peek();
      if (c !== '+' && c !== '-') return v;
      pos++;
      const r = product();
      v = c === '+' ? v + r : v - r;
    }
  };

  const v = sum();
  if (peek() !== '') fail(`unexpected "${peek()}"`);
  if (!Number.isFinite(v)) fail('result is not a finite number');
  return v;
}

/** The text in braces when a field holds a binding (`{R*2}`), else null. */
export function bindingText(fieldText: string): string | null {
  const m = /^\s*\{(.*)\}\s*$/s.exec(fieldText);
  return m === null ? null : (m[1] ?? '').trim();
}

/** The parameters as an environment: defaults, then the overrides that name one of them. */
export function paramEnv(
  defs: readonly ParamDef[],
  values?: ReadonlyMap<string, number>,
): ParamEnv {
  const env = new Map<string, number>();
  for (const d of defs) env.set(d.name, values?.get(d.name) ?? d.value);
  return env;
}

/** `prm`: "R=10000 C=1e-7". Entries that don't parse are dropped. */
export function parseParamList(s: string | null): ParamDef[] {
  if (s === null) return [];
  const out: ParamDef[] = [];
  for (const tok of s.trim().split(/\s+/)) {
    const eq = tok.indexOf('=');
    if (eq <= 0) continue;
    const name = tok.slice(0, eq);
    const value = Number(tok.slice(eq + 1));
    if (isParamName(name) && Number.isFinite(value) && !out.some((d) => d.name === name))
      out.push({ name, value });
  }
  return out;
}

export function formatParamList(defs: readonly ParamDef[]): string {
  return defs.map((d) => `${d.name}=${String(d.value)}`).join(' ');
}

/** `pv`: a placed subcircuit's own values, the same form as `prm`. */
export function parseParamValues(s: string | null): Map<string, number> {
  return new Map(parseParamList(s).map((d) => [d.name, d.value]));
}

export function formatParamValues(values: ReadonlyMap<string, number>): string {
  return formatParamList([...values].map(([name, value]) => ({ name, value })));
}

/** `px`: a part's bindings, edit item number to expression: "0=R*2;1=C". */
export function parseBindings(s: string | null): Map<number, string> | null {
  if (s === null || s.length === 0) return null;
  const out = new Map<number, string>();
  for (const part of s.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const n = Number(part.slice(0, eq));
    const expr = part.slice(eq + 1).trim();
    if (Number.isInteger(n) && n >= 0 && expr.length > 0) out.set(n, expr);
  }
  return out.size > 0 ? out : null;
}

export function formatBindings(m: ReadonlyMap<number, string>): string {
  return [...m]
    .sort((a, b) => a[0] - b[0])
    .map(([n, e]) => `${n}=${e}`)
    .join(';');
}

/** What `applyBindings` needs of a part (CircuitElm, kept structural to avoid an import cycle). */
interface Bindable {
  paramExprs: Map<number, string> | null;
  getEditInfo(n: number): { value: number; isNumeric(): boolean } | null;
  setEditValue(n: number, ei: never): void;
}

/**
 * Set every bound field of a part from its expression. Fields whose expression can't be
 * evaluated keep their value; their messages are returned.
 */
export function applyBindings(ce: Bindable, env: ParamEnv): string[] {
  const errors: string[] = [];
  if (ce.paramExprs === null) return errors;
  for (const [n, expr] of ce.paramExprs) {
    const ei = ce.getEditInfo(n);
    if (ei === null || !ei.isNumeric()) continue;
    let v: number;
    try {
      v = evaluateExpression(expr, env);
    } catch (e) {
      errors.push(`{${expr}}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (v === ei.value) continue;
    ei.value = v;
    ce.setEditValue(n, ei as never);
  }
  return errors;
}
