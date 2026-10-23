// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Perun contributors

import { TextElm, type CircuitElm } from '@perun/elements';
import type { SvgNode } from './mathjax.ts';

/**
 * LaTeX for formula boxes (TextElm in math mode). MathJax typesets each formula to SVG, which is
 * flattened here into a list of filled paths, rectangles, lines and text runs in em/1000 units
 * with y down and the baseline at 0, so the canvas and SVG painters draw it as vectors at any
 * zoom. MathJax is a separate chunk loaded the first time a formula is drawn; until then
 * `layoutMath` returns null and the box shows its source.
 */

/** A 2D affine transform [a, b, c, d, e, f], as in SVG `matrix()`. */
export type Matrix = readonly [number, number, number, number, number, number];

export type MathOp =
  | { readonly kind: 'path'; readonly d: string; readonly m: Matrix }
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly m: Matrix;
    }
  | {
      readonly kind: 'line';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly width: number;
      readonly m: Matrix;
    }
  | {
      readonly kind: 'text';
      readonly s: string;
      readonly size: number;
      readonly italic: boolean;
      readonly bold: boolean;
      readonly m: Matrix;
    };

export interface MathLayout {
  /** Width, height above the baseline and depth below it, in em/1000. */
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly ops: readonly MathOp[];
  /** MathJax's message when the TeX doesn't parse; nothing is drawn then. */
  readonly error: string | null;
}

/** MathJax's typesetter: a TeX formula to its SVG tree. */
export type Typeset = (tex: string) => SvgNode;

let typesetFn: Typeset | null = null;
let loading: Promise<void> | null = null;
let failed = false;
const listeners = new Set<() => void>();
const cache = new Map<string, MathLayout>();
const CACHE_SIZE = 400;

/** Load MathJax (once). Resolves when formulas can be laid out. */
export function loadMath(): Promise<void> {
  loading ??= import('./mathjax.ts')
    // the Obsidian plugin's editor frame borrows the plugin's MathJax, which may still be loading
    .then(async (m) => {
      await m.ready;
      return m;
    })
    .then(
      (m) => {
        typesetFn = m.typeset;
        for (const l of listeners) l();
        listeners.clear();
      },
      (err: unknown) => {
        // offline before the chunk was ever cached: formulas keep showing their source
        failed = true;
        loading = null;
        console.warn('Perun: could not load MathJax', err);
      },
    );
  return loading;
}

/**
 * MathJax's typesetter, loaded if need be. The Obsidian plugin hands it to its editor frames, whose
 * build leaves MathJax out (packages/app/src/embedMathjax.ts).
 */
export async function loadTypeset(): Promise<Typeset> {
  await loadMath();
  if (typesetFn === null) throw new Error('MathJax did not load');
  return typesetFn;
}

/** Start loading MathJax when these elements include a formula box, before it is first drawn. */
export function preloadMathFor(elements: readonly CircuitElm[]): void {
  if (typesetFn === null && elements.some((e) => e instanceof TextElm && e.math)) void loadMath();
}

/** Call `l` once, when MathJax has loaded, to redraw what showed formula sources until then. */
export function onMathReady(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Whether a formula can be laid out now. */
export function mathReady(): boolean {
  return typesetFn !== null;
}

/** The layout of a formula, or null while MathJax loads (this starts the load). */
export function layoutMath(tex: string): MathLayout | null {
  const hit = cache.get(tex);
  if (hit !== undefined) {
    // most recently used last
    cache.delete(tex);
    cache.set(tex, hit);
    return hit;
  }
  if (typesetFn === null) {
    if (!failed) void loadMath();
    return null;
  }
  let layout: MathLayout;
  try {
    layout = flatten(typesetFn(tex));
  } catch (err) {
    layout = { width: 0, height: 0, depth: 0, ops: [], error: String(err) };
  }
  cache.set(tex, layout);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return layout;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function mul(p: Matrix, q: Matrix): Matrix {
  return [
    p[0] * q[0] + p[2] * q[1],
    p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3],
    p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4],
    p[1] * q[4] + p[3] * q[5] + p[5],
  ];
}

/** An SVG `transform` attribute (MathJax writes translate, scale, matrix and rotate). */
export function parseTransform(s: string | undefined): Matrix {
  let m = IDENTITY;
  if (s === undefined) return m;
  for (const [, fn, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = (args ?? '')
      .split(/[\s,]+/)
      .filter((x) => x !== '')
      .map(Number);
    const n = (i: number, d: number): number => a[i] ?? d;
    let t: Matrix = IDENTITY;
    if (fn === 'translate') t = [1, 0, 0, 1, n(0, 0), n(1, 0)];
    else if (fn === 'scale') t = [n(0, 1), 0, 0, n(1, n(0, 1)), 0, 0];
    else if (fn === 'matrix') t = [n(0, 1), n(1, 0), n(2, 0), n(3, 1), n(4, 0), n(5, 0)];
    else if (fn === 'rotate') {
      const r = (n(0, 0) * Math.PI) / 180;
      const cx = n(1, 0);
      const cy = n(2, 0);
      t = mul(
        mul([1, 0, 0, 1, cx, cy], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]),
        [1, 0, 0, 1, -cx, -cy],
      );
    }
    m = mul(m, t);
  }
  return m;
}

const num = (v: string | undefined, d = 0): number => {
  const x = v === undefined ? NaN : parseFloat(v);
  return Number.isFinite(x) ? x : d;
};

function textOf(n: SvgNode): string {
  return n.kind === '#text' ? n.text : n.children.map(textOf).join('');
}

function findSvg(n: SvgNode): SvgNode | null {
  if (n.kind === 'svg') return n;
  for (const c of n.children) {
    const s = findSvg(c);
    if (s !== null) return s;
  }
  return null;
}

/** MathJax's output tree as draw operations. */
export function flatten(root: SvgNode): MathLayout {
  const svg = findSvg(root);
  if (svg === null) return { width: 0, height: 0, depth: 0, ops: [], error: 'no output' };
  const vb = (svg.attrs['viewBox'] ?? '0 0 0 0').split(/\s+/).map(Number);
  const [minX = 0, minY = 0, w = 0, h = 0] = vb;
  const ops: MathOp[] = [];
  let error: string | null = null;
  const walk = (n: SvgNode, m: Matrix): void => {
    if (n.kind === '#text' || n.kind === 'title' || n.kind === 'defs') return;
    const a = n.attrs;
    if (a['data-mjx-error'] !== undefined && error === null) error = a['data-mjx-error'];
    let mm = m;
    if (n.kind === 'svg' && n !== svg) mm = mul(mm, [1, 0, 0, 1, num(a['x']), num(a['y'])]);
    if (a['transform'] !== undefined) mm = mul(mm, parseTransform(a['transform']));
    switch (n.kind) {
      case 'path':
        if (a['d'] !== undefined && a['d'] !== '') ops.push({ kind: 'path', d: a['d'], m: mm });
        return;
      case 'rect':
        // merror's background
        if (a['data-background'] !== undefined) return;
        ops.push({
          kind: 'rect',
          x: num(a['x']),
          y: num(a['y']),
          w: num(a['width']),
          h: num(a['height']),
          m: mm,
        });
        return;
      case 'line':
        ops.push({
          kind: 'line',
          x1: num(a['x1']),
          y1: num(a['y1']),
          x2: num(a['x2']),
          y2: num(a['y2']),
          width: num(a['stroke-width'], 40),
          m: mm,
        });
        return;
      case 'text': {
        const variant = a['data-variant'] ?? '';
        ops.push({
          kind: 'text',
          s: textOf(n),
          size: num(a['font-size'], 1000),
          italic: variant.includes('italic') || a['font-style'] === 'italic',
          bold: variant.includes('bold') || a['font-weight'] === 'bold',
          m: mm,
        });
        return;
      }
    }
    for (const c of n.children) walk(c, mm);
  };
  // the viewBox's origin becomes (0, 0): left edge, top of the formula
  walk(svg, [1, 0, 0, 1, -minX, 0]);
  return { width: w, height: -minY, depth: h + minY, ops, error };
}
