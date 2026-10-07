// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 circuitjs-next contributors
// Rewind and scrub (PLAN.md Phase 20, not in upstream): the last seconds of a run, kept frame by
// frame so the timeline can show any of them again. The engine is untouched: a frame is a copy
// of the numbers the elements and scopes hold, written back into them to show it.

import { CircuitNode, Point, Simulation, VoltageSource } from '@circuitjs-next/engine';

/** How a slot reads and writes its value. */
const enum Kind {
  NUM,
  BOOL,
  ARR,
}

interface Slot {
  obj: Record<string, unknown>;
  key: string;
  kind: Kind;
  /** Values in the slot (1, or the array's length). */
  len: number;
  /** Where its values start in a state vector. */
  offset: number;
  /** A change between frames counts, not only one made by a simulation step (see `History`). */
  frameDiff: boolean;
}

/** Element fields the editor owns, never shown again from the past. */
const UI_KEYS = new Set(['selected', 'lastHandleGrabbed', 'creating', 'noDiagonal']);
/** Arrays longer than this are not state (nothing the elements keep is near it). */
const MAX_ARRAY = 1 << 16;

function isNumberArray(v: unknown): v is ArrayLike<number> {
  if (ArrayBuffer.isView(v)) return !(v instanceof DataView) && !(v instanceof BigInt64Array);
  if (!Array.isArray(v)) return false;
  for (const x of v) if (typeof x !== 'number') return false;
  // an empty array counts too, so that filling it (the first analysis) shows the layout is stale
  return true;
}

/** Objects that are not a part's own state: the engine, its nodes, geometry, browser things. */
function skipObject(o: object): boolean {
  if (
    o instanceof Simulation ||
    o instanceof CircuitNode ||
    o instanceof VoltageSource ||
    o instanceof Point ||
    o instanceof Map ||
    o instanceof Set ||
    o instanceof WeakMap ||
    o instanceof WeakSet ||
    o instanceof Promise ||
    typeof o === 'function'
  )
    return true;
  // canvases, images and contexts (X-Y plots draw into an image)
  const r = o as Record<string, unknown>;
  return typeof r['getContext'] === 'function' || typeof r['drawImage'] === 'function';
}

export interface StateRoots {
  /** The parts: changes between frames count too (a switch flipped while running). */
  elements: readonly object[];
  /** Scopes: only what the simulation changes counts (zooming lays their rectangles out). */
  others: readonly object[];
  /** Objects whose listed number fields are read, and nothing below them. */
  shallow: readonly { obj: object; keys: readonly string[] }[];
  /** Objects never entered (the scope manager, the circuit). */
  skip?: (o: object) => boolean;
  /** Objects whose changes between frames do not count (scopes reached through a part). */
  noFrameDiff?: (o: object) => boolean;
}

/** Every number the parts and scopes hold, as slots of one flat state vector. */
export class StateLayout {
  readonly slots: Slot[] = [];
  size = 0;
  private readonly visited = new Set<object>();

  constructor(roots: StateRoots) {
    const skip = roots.skip ?? (() => false);
    const noDiff = roots.noFrameDiff ?? (() => false);
    const visit = (o: object, frameDiff: boolean): void => {
      if (this.visited.has(o) || skipObject(o) || skip(o) || Object.isFrozen(o)) return;
      this.visited.add(o);
      if (noDiff(o)) frameDiff = false;
      if (Array.isArray(o)) {
        for (const v of o as unknown[])
          if (typeof v === 'object' && v !== null) visit(v, frameDiff);
        return;
      }
      const rec = o as Record<string, unknown>;
      for (const key of Object.keys(rec)) {
        const d = Object.getOwnPropertyDescriptor(rec, key);
        if (d === undefined || !('value' in d) || d.writable !== true) continue;
        const v = d.value as unknown;
        const diff = frameDiff && !UI_KEYS.has(key);
        if (typeof v === 'number') this.add(rec, key, Kind.NUM, 1, diff);
        else if (typeof v === 'boolean') this.add(rec, key, Kind.BOOL, 1, diff);
        else if (typeof v === 'object' && v !== null) {
          if (isNumberArray(v)) {
            if (v.length <= MAX_ARRAY) this.add(rec, key, Kind.ARR, v.length, diff);
          } else visit(v, frameDiff);
        }
      }
    };
    for (const s of roots.shallow)
      for (const key of s.keys)
        if (typeof (s.obj as Record<string, unknown>)[key] === 'number')
          this.add(s.obj as Record<string, unknown>, key, Kind.NUM, 1, false);
    for (const e of roots.elements) visit(e, true);
    for (const o of roots.others) visit(o, false);
    this.visited.clear();
  }

  private add(obj: Record<string, unknown>, key: string, kind: Kind, len: number, d: boolean) {
    this.slots.push({ obj, key, kind, len, offset: this.size, frameDiff: d });
    this.size += len;
  }

  /** Copy the state into `out`. False when an array changed length: the layout is stale. */
  read(out: Float64Array): boolean {
    for (const s of this.slots) {
      const v = s.obj[s.key];
      if (s.kind === Kind.NUM) out[s.offset] = v as number;
      else if (s.kind === Kind.BOOL) out[s.offset] = v === true ? 1 : 0;
      else {
        const a = v as ArrayLike<number> | null;
        if (a === null || typeof a !== 'object' || a.length !== s.len) return false;
        for (let i = 0, o = s.offset; i < s.len; i++, o++) out[o] = a[i] as number;
      }
    }
    return true;
  }

  /** Write back the values whose `mask` entry is set. */
  write(from: Float64Array, mask: Uint8Array): void {
    for (const s of this.slots) {
      const o = s.offset;
      if (s.kind === Kind.ARR) {
        const a = s.obj[s.key] as Record<number, number> & { length: number };
        if (typeof a !== 'object' || a === null || a.length !== s.len) continue;
        for (let i = 0; i < s.len; i++) if (mask[o + i] === 1) a[i] = from[o + i] as number;
      } else if (mask[o] === 1) {
        s.obj[s.key] = s.kind === Kind.BOOL ? from[o] !== 0 : from[o];
      }
    }
  }

  /** One flag per value: may a change between frames (not just in a step) count? */
  frameDiffMask(): Uint8Array {
    const m = new Uint8Array(this.size);
    for (const s of this.slots) if (s.frameDiff) m.fill(1, s.offset, s.offset + s.len);
    return m;
  }
}

/** One recorded frame: a full copy now and then, otherwise only what changed. */
interface Frame {
  /** Running time in ms when it was recorded (time spent paused does not count). */
  clock: number;
  /** Simulated time. */
  t: number;
  key: Float64Array | null;
  idx: Int32Array | null;
  vals: Float64Array | null;
  bytes: number;
}

export interface HistoryOptions {
  /** How much running time to keep, in ms. */
  windowMs: number;
  /** Most memory the frames may take. */
  maxBytes: number;
  /** A full copy every this many frames. */
  keyEvery: number;
}

export const DEFAULT_HISTORY: HistoryOptions = {
  windowMs: 10_000,
  maxBytes: 48 * 1024 * 1024,
  keyEvery: 60,
};

/**
 * The frames of the last seconds of a run. Call `beforeStep` and `afterStep` around each frame's
 * simulation steps; `seek` shows a frame and `restoreLive` returns to where the run is.
 *
 * Only values that move as the circuit runs are written back: those a simulation step changed, and
 * a part's values that changed between frames (a switch flipped while running). Values the editor
 * or the layout own (the selection, a scope's place on screen) are left as they are.
 */
export class History {
  private layout: StateLayout | null = null;
  private frames: Frame[] = [];
  /** First frame still kept, as an index into `frames` (dropped ones are spliced off in bulk). */
  private head = 0;
  private pre = new Float64Array(0);
  private cur = new Float64Array(0);
  private work = new Float64Array(0);
  /** Frame the `work` vector holds, or -1. */
  private workFrame = -1;
  private live: Float64Array | null = null;
  private mask: Uint8Array = new Uint8Array(0);
  private diffOk: Uint8Array = new Uint8Array(0);
  private sinceKey = 0;
  private clock = 0;
  bytes = 0;
  /** Times the layout was built, for tests. */
  rebuilds = 0;

  constructor(
    private readonly roots: () => StateRoots,
    readonly options: HistoryOptions = DEFAULT_HISTORY,
  ) {}

  /** Frames kept. */
  get length(): number {
    return this.frames.length - this.head;
  }

  /** Simulated time of a kept frame. */
  timeAt(i: number): number {
    return this.frames[this.head + i]?.t ?? 0;
  }

  /** Running time of a kept frame, in ms. */
  clockAt(i: number): number {
    return this.frames[this.head + i]?.clock ?? 0;
  }

  /** The kept frame shown at a running time (the last one at or before it). */
  indexAtClock(clock: number): number {
    let lo = 0;
    let hi = this.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.clockAt(mid) <= clock) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Forget every frame (a reset, a load or a structural edit). */
  clear(): void {
    this.layout = null;
    this.frames = [];
    this.head = 0;
    this.live = null;
    this.workFrame = -1;
    this.bytes = 0;
    this.clock = 0;
  }

  private rebuild(): void {
    this.clear();
    this.rebuilds++;
    const l = new StateLayout(this.roots());
    this.layout = l;
    this.pre = new Float64Array(l.size);
    this.cur = new Float64Array(l.size);
    this.work = new Float64Array(l.size);
    this.mask = new Uint8Array(l.size);
    this.diffOk = l.frameDiffMask();
  }

  /** Read the state before this frame's steps (to see what the steps change). */
  beforeStep(): void {
    if (this.layout === null || !this.layout.read(this.pre)) {
      this.rebuild();
      this.layout?.read(this.pre);
    }
  }

  /** Record the state after this frame's steps, `elapsedMs` of running time after the last. */
  afterStep(elapsedMs: number, t: number): void {
    let l = this.layout;
    if (l === null) return;
    this.workFrame = -1;
    if (!l.read(this.work)) {
      // the steps reshaped the parts' arrays (the first analysis fills them): start again here,
      // with nothing known yet about what moves
      this.rebuild();
      l = this.layout as StateLayout | null;
      if (l === null || !l.read(this.work)) return;
      this.pre.set(this.work);
    }
    const post = this.work;
    const { pre, cur, mask, diffOk } = this;
    const n = l.size;
    const first = this.length === 0;
    const changed: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = post[i] as number;
      if (v !== pre[i]) mask[i] = 1;
      if (!first && v !== cur[i]) {
        changed.push(i);
        if (diffOk[i] === 1) mask[i] = 1;
      }
    }
    this.clock += elapsedMs;
    const frame: Frame = { clock: this.clock, t, key: null, idx: null, vals: null, bytes: 0 };
    if (first || this.sinceKey >= this.options.keyEvery) {
      frame.key = post.slice();
      frame.bytes = n * 8;
      this.sinceKey = 0;
    } else {
      frame.idx = Int32Array.from(changed);
      const vals = new Float64Array(changed.length);
      for (let j = 0; j < changed.length; j++) vals[j] = post[changed[j] as number] as number;
      frame.vals = vals;
      frame.bytes = changed.length * 12 + 64;
      this.sinceKey++;
    }
    cur.set(post);
    this.frames.push(frame);
    this.bytes += frame.bytes;
    this.trim();
  }

  /** Drop the oldest key frame's group while it is out of the window or over the memory cap. */
  private trim(): void {
    const { windowMs, maxBytes } = this.options;
    for (;;) {
      const f = this.frames;
      let next = this.head + 1;
      while (next < f.length && f[next]?.key === null) next++;
      // never drop the group the newest frame is in
      if (next >= f.length) break;
      const lastOfGroup = f[next - 1] as Frame;
      if (!(this.clock - lastOfGroup.clock > windowMs || this.bytes > maxBytes)) break;
      for (let i = this.head; i < next; i++) this.bytes -= (f[i] as Frame).bytes;
      this.head = next;
      this.workFrame = -1;
    }
    if (this.head > 1024) {
      this.frames = this.frames.slice(this.head);
      this.head = 0;
    }
  }

  /** Before the first `seek`: remember the state now, to return to. */
  enter(): void {
    const l = this.layout;
    if (l === null) return;
    const live = new Float64Array(l.size);
    if (l.read(live)) this.live = live;
  }

  /** Put kept frame `i` into the parts and scopes. */
  seek(i: number): void {
    const l = this.layout;
    if (l === null || this.length === 0) return;
    i = Math.max(0, Math.min(this.length - 1, Math.trunc(i)));
    const target = this.head + i;
    const f = this.frames;
    let from: number;
    if (this.workFrame >= this.head && this.workFrame <= target) {
      from = this.workFrame + 1;
    } else {
      let k = target;
      while ((f[k] as Frame).key === null) k--;
      this.work.set((f[k] as Frame).key as Float64Array);
      from = k + 1;
    }
    for (let j = from; j <= target; j++) {
      const fr = f[j] as Frame;
      if (fr.key !== null) this.work.set(fr.key);
      else {
        const idx = fr.idx as Int32Array;
        const vals = fr.vals as Float64Array;
        for (let m = 0; m < idx.length; m++) this.work[idx[m] as number] = vals[m] as number;
      }
    }
    this.workFrame = target;
    l.write(this.work, this.mask);
  }

  /** Put the state from `enter` back. */
  restoreLive(): void {
    if (this.layout !== null && this.live !== null) this.layout.write(this.live, this.mask);
    this.live = null;
    this.workFrame = -1;
  }
}
